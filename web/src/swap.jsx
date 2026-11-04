// Swap at 0% platform fee. Quotes and routes come from Jupiter; the user's
// own wallet signs and sends. We add no fee and never touch the funds.
import { useEffect, useMemo, useRef, useState } from 'react';
import { brand } from './brand.js';
import { fmtNum, solscanTx } from './api.js';
import { shareOnX, useAuth } from './auth.jsx';
import { Px } from './pixel.jsx';

const JUP = 'https://lite-api.jup.ag/swap/v1';
// Falls back to the vault's own pass-through if the browser can't reach Jupiter directly.
async function jup(path, init) {
  try {
    return await fetch(JUP + path, init);
  } catch (e) {
    if (!brand.apiUrl) throw e;
    return fetch(brand.apiUrl + '/api/jup' + path, init);
  }
}
const SOL = { sym: 'SOL', mint: 'So11111111111111111111111111111111111111112', dec: 9 };
const USDC = { sym: 'USDC', mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', dec: 6 };

export function swapTokens(cfg) {
  const own = { sym: brand.ticker, mint: cfg?.tokenMint || null, dec: cfg?.decimals ?? 6, own: true };
  const list = [own, SOL, USDC];
  if (cfg && !cfg.rewardIsOwnToken && cfg.rewardMint) list.push({ sym: cfg.rewardSymbol, mint: cfg.rewardMint, dec: cfg.rewardDecimals ?? 8 });
  return list;
}

const toRaw = (v, dec) => {
  const [w, f = ''] = String(v).split('.');
  return BigInt(w || '0') * 10n ** BigInt(dec) + BigInt((f + '0'.repeat(dec)).slice(0, dec) || '0');
};
const fromRaw = (raw, dec) => Number(raw) / 10 ** dec;
const b64ToBytes = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

function TokenPick({ value, options, onChange }) {
  return (
    <div className="tk-pick">
      {options.map((t) => (
        <button key={t.sym} className={`tk ${t.sym === value.sym ? 'on' : ''}`} disabled={!t.mint} onClick={() => onChange(t)} title={t.mint ? t.sym : `$${t.sym} opens at launch`}>
          {t.own ? '$' : ''}
          {t.sym}
          {!t.mint && <i className="pixel">soon</i>}
        </button>
      ))}
    </div>
  );
}

export function SwapCard({ cfg, compact = false }) {
  const { conn, setOpen } = useAuth();
  const tokens = useMemo(() => swapTokens(cfg), [cfg]);
  const ownLive = Boolean(cfg?.tokenMint);
  const [from, setFrom] = useState(SOL);
  const [to, setTo] = useState(() => (ownLive ? tokens[0] : USDC));
  useEffect(() => {
    if (ownLive) setTo((t) => (t.sym === USDC.sym && from.sym === SOL.sym ? tokens[0] : t));
  }, [ownLive]); // eslint-disable-line react-hooks/exhaustive-deps
  const [amt, setAmt] = useState('0.5');
  const [slip, setSlip] = useState(100);
  const [quote, setQuote] = useState(null);
  const [state, setState] = useState({ busy: false, err: '', sig: '' });
  const seq = useRef(0);

  useEffect(() => {
    setQuote(null);
    const n = Number(amt);
    if (!from.mint || !to.mint || from.mint === to.mint || !(n > 0)) return;
    const id = ++seq.current;
    const t = setTimeout(async () => {
      try {
        const q = new URLSearchParams({ inputMint: from.mint, outputMint: to.mint, amount: toRaw(amt, from.dec).toString(), slippageBps: String(slip) });
        const r = await jup('/quote?' + q);
        const j = await r.json();
        if (id !== seq.current) return;
        if (!r.ok || j.error) throw new Error(j.error || 'No route right now');
        setQuote(j);
        setState((s) => ({ ...s, err: '' }));
      } catch (e) {
        if (id === seq.current) setState((s) => ({ ...s, err: e.message === 'Failed to fetch' ? 'Quote service unreachable' : e.message }));
      }
    }, 380);
    return () => clearTimeout(t);
  }, [amt, from, to, slip]);

  const out = quote ? fromRaw(quote.outAmount, to.dec) : null;
  const minOut = quote ? fromRaw(quote.otherAmountThreshold, to.dec) : null;
  const impact = quote ? Number(quote.priceImpactPct || 0) * 100 : null;
  const route = quote?.routePlan?.map((r) => r.swapInfo?.label).filter(Boolean) || [];

  const flip = () => {
    if (!to.mint) return;
    setFrom(to);
    setTo(from);
    if (out) setAmt(String(+out.toFixed(Math.min(6, to.dec))));
  };

  const swap = async () => {
    if (!conn) return setOpen(true);
    setState({ busy: true, err: '', sig: '' });
    try {
      const r = await jup('/swap', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ userPublicKey: conn.address, quoteResponse: quote, wrapAndUnwrapSol: true, dynamicComputeUnitLimit: true, dynamicSlippage: false, prioritizationFeeLamports: 'auto' }),
      });
      const j = await r.json();
      if (!r.ok || !j.swapTransaction) throw new Error(j.error || 'Could not build the swap');
      const sig = await conn.signAndSend(b64ToBytes(j.swapTransaction));
      setState({ busy: false, err: '', sig });
    } catch (e) {
      setState({ busy: false, err: /reject|denied|cancel/i.test(e.message) ? 'Cancelled in your wallet.' : e.message, sig: '' });
    }
  };

  const label = !conn ? 'Connect wallet' : state.busy ? 'Confirm in wallet…' : !quote ? 'Enter an amount' : `Swap to ${to.own ? '$' : ''}${to.sym}`;

  return (
    <div className={`swap ${compact ? 'swap-compact' : ''}`}>
      <div className="swap-head">
        <b>Swap</b>
        <span className="fee0 pixel">0% platform fee</span>
        <div className="slip">
          {[50, 100, 300].map((b) => (
            <button key={b} className={slip === b ? 'on' : ''} onClick={() => setSlip(b)}>
              {b / 100}%
            </button>
          ))}
        </div>
      </div>
      <div className="swap-box">
        <span className="pixel muted">you pay</span>
        <div className="swap-row">
          <input inputMode="decimal" value={amt} onChange={(e) => setAmt(e.target.value.replace(/[^0-9.]/g, ''))} aria-label="Amount to pay" />
          <TokenPick value={from} options={tokens.filter((t) => t.sym !== to.sym)} onChange={setFrom} />
        </div>
      </div>
      <button className="swap-flip" onClick={flip} aria-label="Flip tokens">
        <Px name="swap" size={18} />
      </button>
      <div className="swap-box">
        <span className="pixel muted">you get</span>
        <div className="swap-row">
          <output className={quote ? 'got' : 'got dim'}>{out != null ? fmtNum(out, out < 1 ? 6 : 2) : '—'}</output>
          <TokenPick value={to} options={tokens.filter((t) => t.sym !== from.sym)} onChange={setTo} />
        </div>
      </div>
      <dl className="swap-meta">
        <div>
          <dt>platform fee</dt>
          <dd className="ok">0%</dd>
        </div>
        <div>
          <dt>min received</dt>
          <dd>{minOut != null ? fmtNum(minOut, minOut < 1 ? 6 : 2) : '—'}</dd>
        </div>
        <div>
          <dt>price impact</dt>
          <dd className={impact > 3 ? 'warn' : ''}>{impact != null ? impact.toFixed(2) + '%' : '—'}</dd>
        </div>
        <div>
          <dt>route</dt>
          <dd>{route.length ? route.slice(0, 3).join(' → ') : '—'}</dd>
        </div>
      </dl>
      <button className="btn swap-go" disabled={state.busy || (conn && !quote)} onClick={swap}>
        {label}
      </button>
      {!ownLive && <p className="swap-note small muted">${brand.ticker} swaps switch on the minute the contract is live. Every other pair works now, at 0% from us.</p>}
      {state.err && (
        <div className="err">
          {state.err}.{' '}
          {from.mint && to.mint && (
            <a href={`https://jup.ag/swap/${from.mint}-${to.mint}`} target="_blank" rel="noreferrer">
              Open this pair on Jupiter ↗
            </a>
          )}
        </div>
      )}
      {state.sig && (
        <div className="swap-ok">
          <span>Swap sent.</span>
          <a href={solscanTx(state.sig)} target="_blank" rel="noreferrer">
            view on solscan ↗
          </a>
          {to.own && (
            <button className="linkbtn" onClick={() => shareOnX(`Just bought $${brand.ticker} at 0% fee. Holders get paid every ${cfg?.cycleMinutes || 5} minutes from real trading fees.`, window.location.origin)}>
              share on X
            </button>
          )}
        </div>
      )}
      <p className="swap-fine small muted">Routed by Jupiter. Your wallet signs and sends; funds never pass through us.</p>
    </div>
  );
}
