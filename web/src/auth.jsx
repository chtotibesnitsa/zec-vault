import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { brand } from './brand.js';
import { apiSend, short } from './api.js';
import { connect, deepLinks, isMobile, listWallets, onWalletsChange } from './wallet.js';
import { Px } from './pixel.jsx';

const Ctx = createContext(null);
export const useAuth = () => useContext(Ctx);

const store = {
  get: (k) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set: (k, v) => {
    try {
      if (v == null) localStorage.removeItem(k);
      else localStorage.setItem(k, v);
    } catch {
      /* private mode */
    }
  },
};

// Remember who invited this visitor (?r=username) until they sign in.
if (typeof window !== 'undefined') {
  const r = new URLSearchParams(window.location.search).get('r');
  if (r && /^[A-Za-z0-9_]{3,20}$/.test(r) && !store.get('vault:ref')) store.set('vault:ref', r);
}

export function inviteLink(username) {
  return `${window.location.origin}/?r=${encodeURIComponent(username)}`;
}

export function shareOnX(text, url) {
  const q = new URLSearchParams({ text, ...(url ? { url } : {}) });
  window.open(`https://x.com/intent/tweet?${q}`, '_blank', 'noopener,noreferrer');
}

export function AuthProvider({ children, notify }) {
  const [token, setToken] = useState(() => store.get('vault:session'));
  const [me, setMe] = useState(null);
  const [open, setOpen] = useState(false);
  // The live wallet connection (for swaps). Survives only this page load.
  const [conn, setConn] = useState(null);

  const refresh = useCallback(async (t = token) => {
    if (!t) return setMe(null);
    try {
      setMe(await apiSend('/api/me', { method: 'GET', token: t }));
    } catch (e) {
      if (/sign in/.test(e.message)) {
        store.set('vault:session', null);
        setToken(null);
      }
      setMe(null);
    }
  }, [token]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Back from X: /app?x=linked
  useEffect(() => {
    const u = new URL(window.location.href);
    const x = u.searchParams.get('x');
    if (!x) return;
    notify?.(x === 'linked' ? 'X account linked.' : x === 'cancelled' ? 'X link cancelled.' : 'X link failed, try again.');
    u.searchParams.delete('x');
    window.history.replaceState({}, '', u.pathname + u.search);
  }, [notify]);

  const signIn = useCallback(async (wallet) => {
    const w = await connect(wallet);
    setConn(w);
    store.set('vault:addr', w.address);
    if (!brand.apiUrl) {
      // Pre-launch: no backend yet, so the wallet is connected without a session.
      setOpen(false);
      return null;
    }
    const { nonce, message } = await apiSend('/api/auth/nonce', { body: { wallet: w.address } });
    const signature = await w.signMessage(message);
    const r = await apiSend('/api/auth/verify', { body: { wallet: w.address, nonce, signature } });
    store.set('vault:session', r.token);
    store.set('vault:addr', w.address);
    setToken(r.token);
    let prof = r.profile;
    const ref = store.get('vault:ref');
    if (ref && !prof.refBy) {
      try {
        prof = await apiSend('/api/profile', { body: { ref }, token: r.token });
      } catch {
        /* unknown inviter: ignore */
      }
    }
    setMe(prof);
    return prof;
  }, []);

  const saveName = useCallback(async (username) => {
    const p = await apiSend('/api/profile', { body: { username }, token });
    setMe(p);
    return p;
  }, [token]);

  const linkX = useCallback(async () => {
    const { url } = await apiSend('/api/auth/x/start', { token });
    window.location.href = url;
  }, [token]);

  const unlinkX = useCallback(async () => setMe(await apiSend('/api/auth/x/unlink', { token })), [token]);

  const logout = useCallback(async () => {
    try {
      await apiSend('/api/auth/logout', { token });
    } catch {
      /* already gone */
    }
    store.set('vault:session', null);
    setToken(null);
    setMe(null);
    try {
      await conn?.disconnect?.();
    } catch {
      /* wallet already gone */
    }
    setConn(null);
  }, [token, conn]);

  return (
    <Ctx.Provider value={{ token, me, conn, address: conn?.address || me?.wallet || null, signIn, saveName, linkX, unlinkX, logout, open, setOpen }}>
      {children}
      {open && <ConnectModal onClose={() => setOpen(false)} />}
    </Ctx.Provider>
  );
}

export function AccountButton() {
  const { me, conn, setOpen } = useAuth();
  if (!me && conn) {
    return (
      <button className="acct" onClick={() => setOpen(true)} title={conn.address}>
        <Px name="wallet" size={16} />
        <span>{short(conn.address)}</span>
      </button>
    );
  }
  if (me) {
    return (
      <button className="acct" onClick={() => setOpen(true)} title={me.wallet}>
        {me.x?.avatar ? <img src={me.x.avatar} alt="" /> : <Px name="eye" size={16} />}
        <span>{me.username ? '@' + me.username : short(me.wallet)}</span>
      </button>
    );
  }
  return (
    <button className="btn btn-sm btn-ghost" onClick={() => setOpen(true)}>
      Connect
    </button>
  );
}

function ConnectModal({ onClose }) {
  const { me, conn, signIn, saveName, linkX, unlinkX, logout } = useAuth();
  const [wallets, setWallets] = useState(listWallets);
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [name, setName] = useState(me?.username || '');

  useEffect(() => {
    const off = onWalletsChange(() => setWallets(listWallets()));
    const t = setTimeout(() => setWallets(listWallets()), 400);
    const esc = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', esc);
    return () => {
      off();
      clearTimeout(t);
      window.removeEventListener('keydown', esc);
    };
  }, [onClose]);
  useEffect(() => setName(me?.username || ''), [me?.username]);

  const run = async (label, fn) => {
    setErr('');
    setBusy(label);
    try {
      await fn();
    } catch (e) {
      setErr(/reject|denied|cancel/i.test(e.message) ? 'Request cancelled in your wallet.' : e.message);
    }
    setBusy('');
  };

  return (
    <div className="modal-bg" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal win" role="dialog" aria-modal="true" aria-label="Your vault account">
        <div className="win-bar">
          <span className="win-dots" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <span className="win-title">{brand.key}-vault — {me ? 'account' : 'connect'}</span>
          <button className="modal-x pixel" onClick={onClose} aria-label="Close">
            esc
          </button>
        </div>
        <div className="modal-body">
          {!me && conn ? (
            <>
              <h3>Wallet connected</h3>
              <div className="mono small muted">{conn.address}</div>
              <p className="muted small">Names, X linking and invite links open when the vault goes live. Your wallet is already set for swaps and the holder check.</p>
              <button className="linkbtn" onClick={() => run('out', logout)}>
                Disconnect
              </button>
            </>
          ) : !me ? (
            <>
              <h3>Connect a Solana wallet</h3>
              <p className="muted small">You sign one message to prove the wallet is yours. It's free, sends no transaction and can't move funds. No email, no KYC.</p>
              <div className="wallet-list">
                {wallets.map((w) => (
                  <button key={w.name} className="wallet-btn" disabled={!!busy} onClick={() => run(w.name, () => signIn(w))}>
                    {w.icon ? <img src={w.icon} alt="" /> : <Px name="wallet" size={22} />}
                    <span>{w.name}</span>
                    <span className="pixel muted">{busy === w.name ? 'check wallet…' : 'sign in'}</span>
                  </button>
                ))}
              </div>
              {!wallets.length && (
                <div className="nowallet">
                  <p className="small">No Solana wallet found in this browser.</p>
                  {isMobile() ? (
                    <div className="wallet-list">
                      {deepLinks().map((d) => (
                        <a key={d.name} className="wallet-btn" href={d.url}>
                          <Px name="wallet" size={22} />
                          <span>Open in {d.name}</span>
                          <span className="pixel muted">↗</span>
                        </a>
                      ))}
                    </div>
                  ) : (
                    <p className="small muted">
                      Install <a href="https://phantom.com/download" target="_blank" rel="noreferrer">Phantom</a>, Solflare, Backpack, or MetaMask with its Solana account turned on, then reload.
                    </p>
                  )}
                </div>
              )}
            </>
          ) : (
            <>
              <div className="acct-head">
                {me.x?.avatar ? <img src={me.x.avatar} alt="" /> : <Px name="eye" size={34} />}
                <div>
                  <b>{me.username ? '@' + me.username : 'No name yet'}</b>
                  <div className="mono small muted">{me.wallet}</div>
                </div>
              </div>
              <label className="pixel muted" htmlFor="uname">
                your public name
              </label>
              <div className="lookup">
                <input id="uname" value={name} maxLength={20} onChange={(e) => setName(e.target.value.replace(/[^A-Za-z0-9_]/g, ''))} placeholder="pick_a_name" spellCheck="false" />
                <button className="btn" disabled={!!busy || !name || name === me.username} onClick={() => run('name', () => saveName(name))}>
                  {busy === 'name' ? 'Saving…' : 'Save'}
                </button>
              </div>
              <p className="muted small">Shown instead of your address on trades, payouts and leaderboards.</p>
              <div className="acct-row">
                <span className="pixel">x account</span>
                {me.x ? (
                  <span>
                    <a href={`https://x.com/${me.x.handle}`} target="_blank" rel="noreferrer">
                      @{me.x.handle}
                    </a>{' '}
                    <button className="linkbtn" onClick={() => run('x', unlinkX)}>
                      unlink
                    </button>
                  </span>
                ) : me.xEnabled ? (
                  <button className="btn btn-sm" disabled={!!busy} onClick={() => run('x', linkX)}>
                    Link X
                  </button>
                ) : (
                  <span className="muted small">X sign-in opens at launch</span>
                )}
              </div>
              {me.username && (
                <div className="acct-row">
                  <span className="pixel">invite link</span>
                  <InviteCopy username={me.username} recruits={me.recruits} />
                </div>
              )}
              <button className="linkbtn" onClick={() => run('out', logout)}>
                Sign out
              </button>
            </>
          )}
          {err && <div className="err">{err}</div>}
        </div>
      </div>
    </div>
  );
}

export function InviteCopy({ username, recruits }) {
  const [ok, setOk] = useState(false);
  const link = inviteLink(username);
  return (
    <span className="invite">
      <button
        className="chip"
        onClick={() => {
          navigator.clipboard?.writeText(link);
          setOk(true);
          setTimeout(() => setOk(false), 1400);
        }}
      >
        <span className="mono">{link.replace(/^https?:\/\//, '')}</span>
        <span className="chip-act">{ok ? 'copied' : 'copy'}</span>
      </button>
      <span className="muted small">{recruits || 0} holders joined with your link</span>
    </span>
  );
}
