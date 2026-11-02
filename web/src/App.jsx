import { useCallback, useEffect, useMemo, useState } from 'react';
import { brand, fill } from './brand.js';
import { api, fmtNum, fmtUsd, short, solscanAcct, solscanTx, ago, useFeed, usePoll } from './api.js';
import { CopyChip, Countdown, Counter, Emblem, FeedTable, Marquee, Reveal, Scramble, Toasts, WalletLink } from './components.jsx';

function useRoute() {
  const [path, setPath] = useState(window.location.pathname);
  useEffect(() => {
    const on = () => setPath(window.location.pathname);
    window.addEventListener('popstate', on);
    return () => window.removeEventListener('popstate', on);
  }, []);
  const go = useCallback((p) => {
    window.history.pushState({}, '', p);
    setPath(p);
    window.scrollTo({ top: 0 });
  }, []);
  return [path, go];
}

export default function App() {
  const [path, go] = useRoute();
  const stats = usePoll('/api/stats', 15000);
  const [toasts, setToasts] = useState([]);
  const pushToast = useCallback((e) => {
    setToasts((t) => [e, ...t].slice(0, 3));
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== e.id)), 6500);
  }, []);
  const events = useFeed(pushToast);
  const cfg = stats.data?.config || null;
  const isApp = path.startsWith('/app');
  const isAdmin = path.startsWith('/admin');

  useEffect(() => {
    document.documentElement.style.setProperty('--accent', brand.accent);
    document.documentElement.style.setProperty('--accent2', brand.accent2);
    document.documentElement.style.setProperty('--glow', brand.glow);
    document.title = isApp ? `${brand.name} · vault` : `${brand.name} · ${brand.headline}`;
  }, [isApp]);

  return (
    <div className={`site v-${brand.key}`}>
      <div className="grain" aria-hidden="true" />
      <Nav go={go} isApp={isApp} cfg={cfg} />
      <Marquee events={events} cfg={cfg} />
      {isAdmin ? <Admin /> : isApp ? <VaultApp stats={stats} events={events} cfg={cfg} /> : <Landing go={go} stats={stats} events={events} cfg={cfg} />}
      <Footer />
      <Toasts items={toasts} cfg={cfg} />
    </div>
  );
}

function Nav({ go, isApp, cfg }) {
  const link = (e, p) => {
    e.preventDefault();
    go(p);
  };
  return (
    <header className="nav">
      <a href="/" className="logo" onClick={(e) => link(e, '/')}>
        <span className="logo-mark" aria-hidden="true" />
        <span>{brand.name}</span>
      </a>
      <nav className="nav-links">
        {!isApp && (
          <>
            <a href="#how">How it works</a>
            <a href="#live">Live</a>
            <a href="#token">Token</a>
            <a href="#faq">FAQ</a>
          </>
        )}
        {cfg?.tokenMint && (
          <a className="hide-sm" href={`https://pump.fun/coin/${cfg.tokenMint}`} target="_blank" rel="noreferrer">
            Buy ${brand.ticker}
          </a>
        )}
        <a href={isApp ? '/' : '/app'} className="btn btn-sm" onClick={(e) => link(e, isApp ? '/' : '/app')}>
          {isApp ? 'Home' : 'Open vault'}
        </a>
      </nav>
    </header>
  );
}

function StatTile({ label, children, hint }) {
  return (
    <div className="tile">
      <div className="tile-label">{label}</div>
      <div className="tile-value">{children}</div>
      {hint && <div className="tile-hint">{hint}</div>}
    </div>
  );
}

function rewardSym(cfg) {
  return cfg && !cfg.rewardIsOwnToken && cfg.rewardSymbol ? cfg.rewardSymbol : '$' + brand.ticker;
}

function StatsGrid({ s }) {
  const live = s?.config?.live;
  const m = s?.market;
  const rs = rewardSym(s?.config);
  return (
    <div className="grid-tiles">
      <StatTile label={`Paid to holders`} hint={rs}>
        <Counter value={s?.rewardsPaid || 0} />
      </StatTile>
      <StatTile label="Paid last 24h" hint={rs}>
        <Counter value={s?.rewardsPaid24h || 0} />
      </StatTile>
      <StatTile label="Wallets earning" hint={s?.config ? `hold ${fmtNum(s.config.minHoldTokens)}+ to qualify` : 'every holder above the minimum'}>
        <Counter value={s?.holders || 0} format={(v) => Math.round(v).toLocaleString()} />
      </StatTile>
      <StatTile label="Fees collected" hint="SOL, all time">
        <Counter value={s?.feesTotalSol || 0} format={(v) => v.toFixed(3)} />
      </StatTile>
      <StatTile label="Price" hint={m ? `${m.change24h >= 0 ? '+' : ''}${m.change24h}% 24h` : 'from DexScreener'}>
        {fmtUsd(m?.priceUsd)}
      </StatTile>
      <StatTile label="Market cap" hint={m ? `vol 24h ${fmtUsd(m.volume24h)}` : ''}>
        {fmtUsd(m?.marketCap)}
      </StatTile>
      <StatTile label="Next payout" hint={live ? `every ${s.config.cycleMinutes} min` : 'starts at launch'}>
        {live ? <Countdown to={s?.nextCycleAt} /> : '—'}
      </StatTile>
      <StatTile label="Trades 24h" hint="real swaps, on-chain">
        <Counter value={s?.trades24h || 0} format={(v) => Math.round(v).toLocaleString()} />
      </StatTile>
    </div>
  );
}

function Landing({ go, stats, events, cfg }) {
  const s = stats.data;
  const shareBps = cfg?.rewardShareBps ?? 8000;
  const faq = useMemo(
    () => [
      ['Do I need to stake or claim?', 'No. Hold ${ticker} in any Solana wallet. The vault finds you in its snapshot and sends your share. Nothing to sign, nothing to lock.'],
      ['Where does the money come from?', 'Only from real trading. Pump.fun pays the coin creator a fee on every trade. The vault wallet is the creator, so those fees land there and get spent on rewards. Nothing is minted.'],
      ['How is my share worked out?', 'Your balance divided by the total held by all eligible wallets at each snapshot. Pools, bonding curves and the vault itself are excluded, so only people get paid.'],
      ['Can the team take the fees?', `${(shareBps / 100).toFixed(0)}% of every fee claimed is booked for holders and can only be spent buying rewards. The other ${(100 - shareBps / 100).toFixed(0)}% runs the project. Every claim, buy and payout is a public Solana transaction linked in the feed.`],
      ['Why no KYC?', 'Because there is nothing to sign up for. We never hold your coins and never ask who you are. You hold a token in your own wallet; the vault sends rewards to that address.'],
      ...brand.faqExtra,
      ['Is this safe?', 'Memecoins are volatile and can go to zero. Rewards depend on trading volume and are never guaranteed. Not financial advice.'],
    ],
    [shareBps],
  );

  return (
    <main>
      <section className="hero">
        <div className="hero-copy">
          <div className="kicker">
            <span className="dot" /> {brand.kicker}
          </div>
          <Scramble as="h1" text={brand.headline} className="h1" />
          <p className="lede">{fill(brand.sub, cfg)}</p>
          <div className="hero-cta">
            <a href="/app" className="btn" onClick={(e) => (e.preventDefault(), go('/app'))}>
              Check my rewards
            </a>
            {cfg?.tokenMint ? (
              <a className="btn btn-ghost" href={`https://pump.fun/coin/${cfg.tokenMint}`} target="_blank" rel="noreferrer">
                Buy ${brand.ticker}
              </a>
            ) : (
              <a className="btn btn-ghost" href={`https://x.com/${brand.xHandle}`} target="_blank" rel="noreferrer">
                Follow for launch
              </a>
            )}
          </div>
          <CopyChip value={cfg?.tokenMint} />
        </div>
        <Emblem kind={brand.emblem} />
      </section>

      <Reveal>
        <section className="section" id="stats">
          <div className="section-head">
            <h2>Vault, live</h2>
            <span className="muted">{s ? <><span className="dot" />live, refreshes every 15s</> : brand.apiUrl ? 'connecting…' : 'opens at launch'}</span>
          </div>
          <StatsGrid s={s} />
        </section>
      </Reveal>

      <Reveal>
        <section className="section" id="how">
          <div className="section-head">
            <h2>How it works</h2>
          </div>
          <ol className="steps">
            {brand.steps.map(([t, d], i) => (
              <li key={i} className="step">
                <span className="step-n mono">0{i + 1}</span>
                <h3>{fill(t, cfg)}</h3>
                <p>{fill(d, cfg)}</p>
              </li>
            ))}
          </ol>
        </section>
      </Reveal>

      <Reveal>
        <section className="section split" id="fees">
          <div>
            <h2>Where every fee goes</h2>
            <p className="muted">Set in the open and shown on-chain. The holders’ share can only be spent on rewards.</p>
          </div>
          <div className="feebar" style={{ '--p': `${shareBps / 100}%` }}>
            <div className="feebar-fill">
              <b>{(shareBps / 100).toFixed(0)}%</b> to holders as {rewardSym(cfg)}
            </div>
            <div className="feebar-rest">
              <b>{(100 - shareBps / 100).toFixed(0)}%</b> ops
            </div>
          </div>
        </section>
      </Reveal>

      <Reveal>
        <section className="section" id="live">
          <div className="section-head">
            <h2>Every move, verifiable</h2>
            <span className="muted">Each line links to its Solana transaction</span>
          </div>
          <FeedTable events={events} cfg={cfg} empty="No activity yet. The first trade after launch shows up here within a minute." />
        </section>
      </Reveal>

      <Reveal>
        <TopEarners />
      </Reveal>

      <Reveal>
        <section className="section" id="token">
          <div className="section-head">
            <h2>The token</h2>
          </div>
          <dl className="token-rows">
            <Row k="Ticker" v={`$${brand.ticker}`} />
            <Row k="Launch" v="Fair launch on Pump.fun, no presale" />
            <Row k="Supply" v="1,000,000,000" />
            <Row k="Reward paid" v={rewardSym(cfg)} />
            <Row k="Payout timer" v={`every ${cfg?.cycleMinutes || 5} minutes`} />
            <Row k="Contract" v={cfg?.tokenMint ? <a className="mono" href={solscanAcct(cfg.tokenMint)} target="_blank" rel="noreferrer">{cfg.tokenMint}</a> : 'revealed at launch'} />
            <Row k="Vault wallet" v={cfg?.treasury ? <a className="mono" href={solscanAcct(cfg.treasury)} target="_blank" rel="noreferrer">{cfg.treasury}</a> : 'revealed at launch'} />
          </dl>
        </section>
      </Reveal>

      <Reveal>
        <section className="section" id="faq">
          <div className="section-head">
            <h2>FAQ</h2>
          </div>
          <div className="faq">
            {faq.map(([q, a], i) => (
              <details key={i}>
                <summary>{fill(q, cfg)}</summary>
                <p>{fill(a, cfg)}</p>
              </details>
            ))}
          </div>
        </section>
      </Reveal>

      <section className="closer">
        <Scramble as="h2" text={brand.closer} className="h2-big" />
        <a href="/app" className="btn" onClick={(e) => (e.preventDefault(), go('/app'))}>
          Open the vault
        </a>
      </section>
    </main>
  );
}

function Row({ k, v }) {
  return (
    <div className="token-row">
      <dt>{k}</dt>
      <dd>{v}</dd>
    </div>
  );
}

function TopEarners() {
  const { data } = usePoll('/api/leaderboard', 30000);
  const cfgState = usePoll('/api/config', 60000);
  const d = cfgState.data?.rewardDecimals ?? 6;
  const top = data?.top || [];
  return (
    <section className="section" id="earners">
      <div className="section-head">
        <h2>Top earners</h2>
        <span className="muted">all-time payouts</span>
      </div>
      {top.length ? (
        <ol className="earners">
          {top.slice(0, 10).map((r, i) => (
            <li key={r.wallet}>
              <span className="mono rank">#{i + 1}</span>
              <WalletLink address={r.wallet} />
              <span className="mono">{fmtNum(Number(BigInt(r.paid_raw)) / 10 ** d, 4)}</span>
              <span className="muted">{r.payouts} payouts</span>
            </li>
          ))}
        </ol>
      ) : (
        <div className="empty">Fills in after the first payout.</div>
      )}
    </section>
  );
}

function VaultApp({ stats, events, cfg }) {
  const [tab, setTab] = useState('overview');
  const s = stats.data;
  return (
    <main className="app">
      <div className="tabs" role="tablist">
        {['overview', 'my vault', 'buy'].map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} className={`tab ${tab === t ? 'on' : ''}`} onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
      </div>
      {tab === 'overview' && (
        <>
          <section className="section">
            <div className="section-head">
              <h2>Overview</h2>
              <span className="muted">{s?.config?.paused ? 'payouts paused' : s?.config?.live ? 'vault running' : 'opens at launch'}</span>
            </div>
            <StatsGrid s={s} />
          </section>
          <section className="section">
            <div className="section-head">
              <h2>Last vault actions</h2>
            </div>
            <FeedTable events={events.filter((e) => ['claim', 'buyback', 'payout'].includes(e.kind))} cfg={cfg} empty="The vault’s first claim, buyback and payout will show here." />
          </section>
        </>
      )}
      {tab === 'my vault' && <MyVault cfg={cfg} />}
      {tab === 'buy' && <Buy cfg={cfg} />}
    </main>
  );
}

function MyVault({ cfg }) {
  const [addr, setAddr] = useState(() => {
    try {
      return localStorage.getItem('vault:addr') || '';
    } catch {
      return '';
    }
  });
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const look = useCallback(async (a) => {
    setErr('');
    if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(a)) return setErr('That doesn’t look like a Solana address.');
    try {
      localStorage.setItem('vault:addr', a);
    } catch {
      /* private mode */
    }
    try {
      setData(await api(`/api/holder/${a}`));
    } catch {
      setErr('Vault API is not reachable yet. It opens at launch.');
    }
  }, []);
  useEffect(() => {
    if (addr) look(addr);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const connect = async () => {
    const p = window.phantom?.solana || window.solana || window.solflare;
    if (!p) return setErr('No Solana wallet found. Paste your address instead.');
    try {
      const r = await p.connect();
      const a = (r?.publicKey || p.publicKey).toString();
      setAddr(a);
      look(a);
    } catch {
      setErr('Wallet connection was cancelled.');
    }
  };
  const rs = rewardSym(cfg);
  return (
    <section className="section">
      <div className="section-head">
        <h2>My vault</h2>
        <span className="muted">read-only, we never ask you to sign anything</span>
      </div>
      <div className="lookup">
        <input value={addr} onChange={(e) => setAddr(e.target.value.trim())} placeholder="Paste your Solana wallet address" spellCheck="false" />
        <button className="btn" onClick={() => look(addr)}>
          Check
        </button>
        <button className="btn btn-ghost" onClick={connect}>
          Use my wallet
        </button>
      </div>
      {err && <div className="err">{err}</div>}
      {data && !data.error && (
        <>
          <div className="grid-tiles">
            <StatTile label="Holding" hint={`$${brand.ticker}`}>
              {fmtNum(data.balance)}
            </StatTile>
            <StatTile label="Share of vault" hint={data.eligible ? 'eligible' : 'not in last snapshot'}>
              {data.sharePct.toFixed(4)}%
            </StatTile>
            <StatTile label="Received" hint={rs}>
              {fmtNum(data.paid, 4)}
            </StatTile>
            <StatTile label="Pending" hint="sent in the next payouts">
              {fmtNum(data.owed, 4)}
            </StatTile>
          </div>
          {data.payouts.length ? (
            <ul className="feed">
              {data.payouts.map((p) => (
                <li key={p.sig} className="feed-row k-payout">
                  <span className="feed-tag">PAID</span>
                  <span className="feed-text">
                    {fmtNum(p.amount, 4)} {rs}
                  </span>
                  <a className="feed-link mono" href={solscanTx(p.sig)} target="_blank" rel="noreferrer">
                    {ago(p.ts)} {'↗'}
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <div className="empty">
              {data.eligible ? 'You’re in. Your first payout lands with the next cycle that has rewards.' : `Hold at least ${fmtNum(cfg?.minHoldTokens || 0)} $${brand.ticker} to be included in the next snapshot.`}
            </div>
          )}
        </>
      )}
    </section>
  );
}

function Buy({ cfg }) {
  const mint = cfg?.tokenMint;
  return (
    <section className="section">
      <div className="section-head">
        <h2>Buy ${brand.ticker}</h2>
      </div>
      {mint ? (
        <div className="buy-grid">
          <a className="buy-card" href={`https://pump.fun/coin/${mint}`} target="_blank" rel="noreferrer">
            <b>Pump.fun</b>
            <span>Bonding curve or PumpSwap</span>
          </a>
          <a className="buy-card" href={`https://jup.ag/swap/SOL-${mint}`} target="_blank" rel="noreferrer">
            <b>Jupiter</b>
            <span>Best route across Solana</span>
          </a>
          <a className="buy-card" href={`https://dexscreener.com/solana/${mint}`} target="_blank" rel="noreferrer">
            <b>DexScreener</b>
            <span>Chart and pairs</span>
          </a>
        </div>
      ) : (
        <div className="empty">The contract address goes live here at launch. Follow <a href={`https://x.com/${brand.xHandle}`}>@{brand.xHandle}</a> so you don’t miss it.</div>
      )}
      <p className="muted small">Then just hold. Your wallet is picked up in the next snapshot. {short(mint || '')}</p>
    </section>
  );
}

function Footer() {
  return (
    <footer className="footer">
      <div>
        <b>{brand.name}</b> · a hold-to-earn vault on Solana. Not affiliated with the {brand.key === 'zec' ? 'Zcash' : 'Monero'} project.
      </div>
      <div className="muted small">Memecoins are volatile and can go to zero. Rewards depend on volume and are not guaranteed. Not financial advice.</div>
      <div className="foot-links">
        <a href={`https://x.com/${brand.xHandle}`} target="_blank" rel="noreferrer">
          X
        </a>
      </div>
    </footer>
  );
}

// Operator panel. The key is kept only in this tab's session storage and sent
// as a header, never in the URL.
function Admin() {
  const [key, setKey] = useState(() => {
    try {
      return sessionStorage.getItem('vault:admin') || '';
    } catch {
      return '';
    }
  });
  const [status, setStatus] = useState(null);
  const [msg, setMsg] = useState('');
  const call = useCallback(
    async (path, body) => {
      setMsg('');
      try {
        sessionStorage.setItem('vault:admin', key);
      } catch {
        /* ignore */
      }
      const res = await fetch(brand.apiUrl + path, {
        method: body ? 'POST' : 'GET',
        headers: { 'x-admin-key': key, 'content-type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || 'HTTP ' + res.status);
      return j;
    },
    [key],
  );
  const load = async () => {
    try {
      setStatus(await call('/api/admin/status'));
    } catch (e) {
      setMsg(e.message);
    }
  };
  const act = async (path, body, label) => {
    try {
      setMsg(label + '…');
      const r = await call(path, body);
      setMsg(label + ' done' + (r.lastError ? ': ' + r.lastError : ''));
      load();
    } catch (e) {
      setMsg(e.message);
    }
  };
  const st = status?.stats;
  return (
    <main className="app">
      <section className="section">
        <div className="section-head">
          <h2>Operator</h2>
          <span className="muted">needs the ADMIN_KEY you set in Cloudflare</span>
        </div>
        <div className="lookup">
          <input type="password" value={key} onChange={(e) => setKey(e.target.value)} placeholder="Admin key" />
          <button className="btn" onClick={load}>
            Load status
          </button>
        </div>
        {msg && <div className="err">{msg}</div>}
        {st && (
          <>
            <div className="lookup">
              <button className="btn" onClick={() => act('/api/admin/run', {}, 'Run cycle now')}>
                Run cycle now
              </button>
              <button className="btn btn-ghost" onClick={() => act('/api/admin/pause', { paused: !st.config.paused }, st.config.paused ? 'Resume' : 'Pause')}>
                {st.config.paused ? 'Resume payouts' : 'Pause payouts'}
              </button>
            </div>
            <dl className="token-rows">
              <Row k="Live" v={st.config.live ? 'yes' : 'no (check TOKEN_MINT, TREASURY_SECRET_KEY, SOLANA_RPC_URL)'} />
              <Row k="Vault wallet" v={st.config.treasury || 'not set'} />
              <Row k="Token" v={st.config.tokenMint || 'not set'} />
              <Row k="Reward" v={st.config.rewardIsOwnToken ? 'buyback of own token' : st.config.rewardMint} />
              <Row k="Fees claimed" v={`${st.feesTotalSol} SOL`} />
              <Row k="Holders budget" v={`${st.pendingBudgetSol} SOL waiting to be spent`} />
              <Row k="Ops share" v={`${st.opsSol} SOL booked for ops (yours to withdraw)`} />
              <Row k="Rewards paid" v={`${st.rewardsPaid} (${st.paidWallets} wallets)`} />
              <Row k="Undistributed" v={st.rewardPool} />
              <Row k="Last cycle" v={st.lastCycleAt ? new Date(st.lastCycleAt).toLocaleString() : 'never'} />
              <Row k="Last error" v={status.lastError || 'none'} />
              <Row k="Last claim note" v={status.lastClaimError || 'none'} />
              <Row k="Last feed error" v={status.lastFeedError || 'none'} />
            </dl>
          </>
        )}
      </section>
    </main>
  );
}
