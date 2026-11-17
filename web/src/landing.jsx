// Front page v5 sections. Every number and row comes from the live API and
// feed; before launch they come from labelled sample data and never link to
// a transaction.
import { useEffect, useRef, useState } from 'react';
import SegClock from './segclock.jsx';
import { BurnBlock, CoinStack, FeePrism, Furnace, HolderGrid, ShieldGem, TimerRing, TradeBars, WalletKey } from './obj3d.jsx';
import { brand, fill } from './brand.js';
import { api, ago, fmtNum, rawToUi, short, solscanAcct } from './api.js';
import { Counter, eventText, txLink } from './components.jsx';
import { Identicon } from './proof.jsx';
import { Px } from './pixel.jsx';
import { useAuth } from './auth.jsx';
import { SwapCard } from './swap.jsx';
import { Link, KIND_TONE } from './nav.jsx';

const SUPPLY = 1_000_000_000;
const int = (v) => Math.round(v).toLocaleString();
const who = (e) => (e.name?.u ? '@' + e.name.u : e.wallet ? short(e.wallet) : 'holder');

// ---------- hero ----------
// Copy on the left; on the right a real preview of the vault (next payout,
// totals, the latest payouts) with one rendered $ZATS coin resting on it.
// No live 3D here: the coin is a path-traced image, so the page stays light.
export function Hero5({ cfg, s, preview, events = [] }) {
  const cm = cfg?.cycleMinutes || 5;
  const stage = useRef(null);
  // the stage leans toward the pointer: one listener, one CSS variable pair
  useEffect(() => {
    const el = stage.current;
    if (!el || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let f = 0;
    const on = (e) => {
      if (f) return;
      f = requestAnimationFrame(() => {
        f = 0;
        el.style.setProperty('--px', ((e.clientX / window.innerWidth - 0.5) * 2).toFixed(3));
        el.style.setProperty('--py', ((e.clientY / window.innerHeight - 0.5) * 2).toFixed(3));
      });
    };
    window.addEventListener('pointermove', on, { passive: true });
    return () => {
      window.removeEventListener('pointermove', on);
      cancelAnimationFrame(f);
    };
  }, []);
  return (
    <section className={`h5 h5-${brand.key} h10`}>
      <div className="h10-bg" aria-hidden="true">
        <i className="f1" />
        <i className="f2" />
        <i className="f3" />
      </div>
      <div className="h5-copy">
        <div className="h5-kicker">
          <span>{brand.kicker}</span>
          <span className="h5-state">{cfg?.live ? 'Live' : 'Pre-launch'}</span>
        </div>
        <h1 className="h5-title">
          <span className="h5-l1">
            Hold <em>${brand.ticker}.</em>
          </span>
          <span className="h5-l2">
            Get <span className="w-trade">paid</span> every <span className="w-vault">{cm} minutes</span>.
          </span>
        </h1>
        <p className="h5-sub">
          Every trade pays a creator fee. <span className="w-pay">80%</span> goes back to holders in ${brand.ticker}, <span className="w-burn">20%</span> buys ${brand.ticker} and burns it. Hold in any wallet. No staking, no KYC.
        </p>
        <div className="h5-cta">
          <Link className="btn" to="/swap">
            Buy ${brand.ticker}, 0% fee
          </Link>
          <Link className="btn btn-ghost" to="/how">
            How payouts work
          </Link>
        </div>
        <ul className="h10-trust">
          <li className="tone-vault">
            <Px name="lock" size={16} /> No custody
          </li>
          <li className="tone-people">
            <Px name="eye" size={16} /> No KYC
          </li>
          <li className="tone-trade">
            <Px name="shield" size={16} /> Every payout on Solscan
          </li>
        </ul>
      </div>
      <div className="h5-visual h10-stage" ref={stage} aria-hidden="true">
        <PayoutClock s={s} cfg={cfg} />
        <LatestChip events={events} preview={preview} />
      </div>
    </section>
  );
}

// The hero: a payout clock drawn in code. The ring fills toward the next
// payout; holders circle it; gold dashes stream from the center to every
// holder; trades fly in from outside to feed it; a burn node takes its cut;
// the ring pulses when a payout lands. SVG + CSS transforms only.
const C0 = 300; // center of the 600x600 drawing
const R_RING = 200;

// The payout timer: a plain dial that fills over the cycle, a dot that
// sweeps the seconds, and an alarm-clock readout in the middle.
function PayoutClock({ s, cfg }) {
  const live = cfg?.live;
  const cm = cfg?.cycleMinutes || 5;
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(iv);
  }, []);
  const next = live && s?.nextCycleAt ? s.nextCycleAt : null;
  const left = next ? Math.max(0, next - now) : cm * 60000 - (now % (cm * 60000));
  const p = 1 - left / (cm * 60000);
  const mm = String(Math.floor(left / 60000)).padStart(2, '0');
  const ss = String(Math.floor(left / 1000) % 60).padStart(2, '0');
  const sec = Math.floor(now / 1000) % 60;
  return (
    <div className="pclock">
      <svg viewBox="0 0 600 600" className="pc-svg" aria-hidden="true">
        <circle cx={C0} cy={C0} r={R_RING + 34} className="pc-outer" />
        <g className="pc-ticks">
          {Array.from({ length: 60 }, (_, i) => {
            const a = (i / 60) * Math.PI * 2 - Math.PI / 2;
            const big = i % 5 === 0;
            const r0 = R_RING + (big ? 6 : 10);
            const r1 = R_RING + 20;
            return <line key={i} x1={C0 + Math.cos(a) * r0} y1={C0 + Math.sin(a) * r0} x2={C0 + Math.cos(a) * r1} y2={C0 + Math.sin(a) * r1} className={`${big ? 'big' : ''} ${i / 60 <= p ? 'on' : ''}`} />;
          })}
        </g>
        <circle cx={C0} cy={C0} r={R_RING} className="pc-ring-bg" />
        <circle cx={C0} cy={C0} r={R_RING} className="pc-ring" pathLength="100" strokeDasharray="100" strokeDashoffset={100 * (1 - p)} style={{ transform: 'rotate(-90deg)' }} />
        <g className="pc-sweep" style={{ transform: `rotate(${sec * 6}deg)` }}>
          <circle cx={C0} cy={C0 - R_RING - 34} r="4" />
        </g>
      </svg>
      <div className="pc-center">
        <span className="ct-label">Next payout</span>
        <div className="pc-lcd">
          <SegClock mm={mm} ss={ss} />
        </div>
        <span className="ct-foot">
          {fmtNum(s?.rewardsPaid || 0)} paid · {int(s?.holders || 0)} holders
        </span>
      </div>
    </div>
  );
}

function LatestChip({ events, preview }) {
  const pays = events.filter((e) => e.kind === 'payout' || e.kind === 'burn' || e.kind === 'buy');
  const [i, setI] = useState(0);
  useEffect(() => {
    if (!pays.length) return;
    const iv = setInterval(() => setI((x) => x + 1), 3200);
    return () => clearInterval(iv);
  }, [pays.length]);
  if (!pays.length) return null;
  const e = pays[i % pays.length];
  const sym = '$' + brand.ticker;
  const tone = KIND_TONE[e.kind] || 'pay';
  const text = e.kind === 'payout' ? `+${fmtNum(rawToUi(e.amountRaw, 6), 1)} ${sym}` : e.kind === 'burn' ? `${fmtNum(rawToUi(e.amountRaw, 6), 1)} ${sym} burned` : `bought ${fmtNum(rawToUi(e.amountRaw, 6), 1)} ${sym}`;
  return (
    <div className={`chip-card h10-latest tone-${tone}`} key={e.id + i}>
      <span className="lc-ic">
        <Px name={e.kind === 'burn' ? 'flame' : e.kind === 'buy' ? 'swap' : 'coins'} size={16} />
      </span>
      <span className="lc-body">
        <b>{text}</b>
        <small>
          {e.kind === 'burn' ? 'by the vault' : who(e)} · {preview || e.sample ? 'sample' : ago(e.ts)}
        </small>
      </span>
    </div>
  );
}

// One-click "do I earn?": connect (or paste) and see balance, eligibility, earnings.
export function HoldCheck({ cfg, preview }) {
  const { address, setOpen } = useAuth();
  const [paste, setPaste] = useState('');
  const [h, setH] = useState(null);
  const [err, setErr] = useState('');
  const target = address || (paste.length >= 32 ? paste : '');
  useEffect(() => {
    setH(null);
    setErr('');
    if (!target || !brand.apiUrl) return;
    api(`/api/holder/${target}`)
      .then((r) => (r.error ? setErr(r.error) : setH(r)))
      .catch(() => setErr('Vault unreachable, try again'));
  }, [target]);
  const min = fmtNum(cfg?.minHoldTokens || 100000);
  const rs = cfg && !cfg.rewardIsOwnToken && cfg.rewardSymbol ? cfg.rewardSymbol : '$' + brand.ticker;
  let body;
  if (!target) {
    body = (
      <>
        <button className="btn btn-sm" onClick={() => setOpen(true)}>
          Connect wallet
        </button>
        <span className="hc-or muted">or</span>
        <input className="hc-in mono" value={paste} onChange={(e) => setPaste(e.target.value.trim())} placeholder="paste any wallet" spellCheck="false" aria-label="Wallet address" />
      </>
    );
  } else if (!brand.apiUrl || !cfg?.live) {
    body = (
      <span className="hc-res">
        <b className="mono">{short(target)}</b> is ready. Hold {min}+ ${brand.ticker} after launch and it earns {rs} every {cfg?.cycleMinutes || 5} min automatically.
      </span>
    );
  } else if (err) {
    body = <span className="hc-res err-t">{err}</span>;
  } else if (!h) {
    body = <span className="hc-res muted">checking {short(target)}…</span>;
  } else {
    body = (
      <span className="hc-res">
        <span className={`hc-pill ${h.eligible ? 'ok' : 'no'}`}>{h.eligible ? 'earning' : 'not earning yet'}</span>
        <span>
          holds <b className="mono">{fmtNum(h.balance)}</b>
        </span>
        <span>
          earned <b className="mono">{fmtNum(h.paid, 4)}</b> {rs}
        </span>
        {!h.eligible && <span className="muted">needs {min}+</span>}
      </span>
    );
  }
  return (
    <div className="holdcheck">
      <span className="hc-label pixel">do i earn?</span>
      <div className="hc-body">{body}</div>
      {preview && !target && <span className="hc-hint small muted">free, one message signature, no transaction</span>}
    </div>
  );
}

// ---------- proof numbers ----------
const PROOF_OBJ = [<CoinStack key="a" />, <BurnBlock key="b" />, <HolderGrid key="c" />, <TradeBars key="d" />, <FeePrism key="e" />];
export function ProofBar({ s, preview }) {
  const burned = Number(s?.burned || 0);
  const items = [
    ['coins', 'paid to holders', s?.rewardsPaid || 0, (v) => fmtNum(v), '$' + brand.ticker + ' value', 'pay'],
    ['flame', 'burned forever', burned, (v) => fmtNum(v), `${((burned / SUPPLY) * 100).toFixed(2)}% of supply`, 'burn'],
    ['users', 'wallets earning', s?.holders || 0, int, 'right now', 'people'],
    ['swap', 'swaps in 24h', s?.trades24h || 0, int, 'on-chain', 'trade'],
    ['bolt', 'fees collected', s?.feesTotalSol || 0, (v) => v.toFixed(2) + ' SOL', 'all time', 'vault'],
  ];
  return (
    <section className={`proofbar ${preview ? 'is-sample' : ''}`} aria-label="Vault numbers">
      {items.map(([ic, label, v, f, hint, tone], i) => (
        <div key={label} className={`pb-item tone-${tone}`} style={{ '--i': i }}>
          <span className="pb-label pixel">
            {PROOF_OBJ[i]}
            {label}
          </span>
          <b className="pb-num mono">
            <Counter value={v} format={f} />
          </b>
          <span className="pb-hint small muted">{hint}</span>
          <span className="pb-spark" aria-hidden="true">
            {Array.from({ length: 14 }).map((_, k) => (
              <i key={k} style={{ '--k': k }} />
            ))}
          </span>
        </div>
      ))}
      {preview && <span className="pb-note pixel">sample numbers until launch · real totals replace them automatically</span>}
    </section>
  );
}

// ---------- live board ----------
function SwapRow({ e, cfg }) {
  const d = cfg?.decimals ?? 6;
  const amt = rawToUi(e.amountRaw, d);
  const sol = e.lamports ? Number(e.lamports) / 1e9 : 0;
  return (
    <a className={`lrow k-${e.kind} tone-${KIND_TONE[e.kind]}`} {...txLink(e)}>
      <span className={`side ${e.kind}`}>{e.kind === 'buy' ? 'BUY' : 'SELL'}</span>
      <Identicon seed={e.name?.u || e.wallet || String(e.id)} size={26} />
      <span className="lr-who">
        {who(e)}
        {e.name?.x && <span className="xbadge">𝕏</span>}
      </span>
      <span className="lr-amt mono">{fmtNum(amt)}</span>
      <span className="lr-sol mono">{sol.toFixed(3)} SOL</span>
      <span className="lr-t muted">{e.sample ? <i className="sample-tag pixel">sample</i> : ago(e.ts)}</span>
      <span className="lr-go" aria-hidden="true">{e.sample ? '' : '↗'}</span>
    </a>
  );
}

function MoveRow({ e, cfg }) {
  const t = eventText(e, cfg);
  const ic = { payout: 'coins', burn: 'flame', buyback: 'swap', claim: 'bolt', join: 'users' }[e.kind] || 'bolt';
  return (
    <a className={`lrow move k-${e.kind} tone-${KIND_TONE[e.kind] || 'vault'}`} {...txLink(e)}>
      <span className={`mv-ic k-${e.kind}`}>
        <Px name={ic} size={18} />
      </span>
      <span className="mv-tag pixel">{t.tag}</span>
      <span className="mv-text">{t.text}</span>
      <span className="lr-t muted">{e.sample ? <i className="sample-tag pixel">sample</i> : ago(e.ts)}</span>
      <span className="lr-go" aria-hidden="true">{e.sample ? '' : '↗'}</span>
    </a>
  );
}

export function LiveBoard({ events, cfg, preview, ticker }) {
  const swaps = events.filter((e) => e.kind === 'buy' || e.kind === 'sell').slice(0, 9);
  const moves = events.filter((e) => e.kind !== 'buy' && e.kind !== 'sell').slice(0, 9);
  const buys = swaps.filter((e) => e.kind === 'buy').length;
  return (
    <section className="section live5" id="live">
      <div className="s5-head">
        <span className="s5-eyebrow pixel">
          <span className="rec" /> {preview ? 'sample feed · real transactions replace it at launch' : 'live from solana · every row opens its transaction'}
        </span>
        <h2>Happening <span className="w-trade">right now</span></h2>
      </div>
      {ticker}
      <div className="live-grid">
        <div className="lpanel tone-trade">
          <div className="lp-head">
            <b>Live swaps</b>
            <span className="lp-ratio" title="buys vs sells in this list">
              <i style={{ '--p': swaps.length ? buys / swaps.length : 0.5 }} />
              <span className="pixel">
                {buys} buy · {swaps.length - buys} sell
              </span>
            </span>
          </div>
          <div className="lp-cols pixel">
            <span>side</span>
            <span />
            <span>trader</span>
            <span>${brand.ticker}</span>
            <span>sol</span>
            <span>when</span>
            <span />
          </div>
          <div className="lp-list">
            {swaps.map((e) => (
              <SwapRow key={e.id} e={e} cfg={cfg} />
            ))}
            {!swaps.length && <div className="lp-empty muted">The first trade after launch lands here within a minute.</div>}
          </div>
        </div>
        <div className="lpanel tone-vault">
          <div className="lp-head">
            <b>Vault moves</b>
            <span className="pixel muted">payouts · burns · buybacks</span>
          </div>
          <div className="lp-list">
            {moves.map((e) => (
              <MoveRow key={e.id} e={e} cfg={cfg} />
            ))}
            {!moves.length && <div className="lp-empty muted">Payouts start with the first cycle after launch.</div>}
          </div>
        </div>
      </div>
    </section>
  );
}

// ---------- swap ----------
export function SwapSection({ cfg }) {
  return (
    <section className="section swap5 tone-trade" id="swap">
      <div className="swap5-copy">
        <span className="s5-eyebrow pixel">swap</span>
        <h2>
          Buy <span className="w-pay">${brand.ticker}</span> here.
          <br />
          We take <span className="w-trade">0%</span>.
        </h2>
        <p className="muted">Best route across Solana through Jupiter, signed in your own wallet. We add no fee on top, so you get the most ${brand.ticker} for your SOL. The only fee is the token&apos;s own creator fee, and that is what pays holders and burns supply.</p>
        <ul className="ticks">
          <li className="tone-trade">
            <WalletKey /> One signature, no account
          </li>
          <li className="tone-pay">
            <TimerRing /> Earning starts at the next snapshot
          </li>
          <li className="tone-vault">
            <ShieldGem /> Funds go wallet to pool, never through us
          </li>
        </ul>
      </div>
      <SwapCard cfg={cfg} />
    </section>
  );
}

// ---------- fee flow story (sticky, scroll driven) ----------
export function FlowStory({ cfg, s }) {
  const share = (cfg?.rewardShareBps ?? 8000) / 100;
  const burn = (cfg?.burnBps ?? 1000) / 100;
  const ops = Math.max(0, 100 - share - burn);
  const rs = cfg && !cfg.rewardIsOwnToken && cfg.rewardSymbol ? cfg.rewardSymbol : '$' + brand.ticker;
  const steps = [
    { k: 'trade', tone: 'trade', t: `Someone trades $${brand.ticker}`, d: 'On Pump.fun, Jupiter, any app. Every buy and sell pays a small creator fee, and the vault wallet is the creator.' },
    { k: 'split', tone: 'vault', t: 'The vault splits the fee', d: `${share}% is set aside for holders, ${burn}% buys $${brand.ticker} and burns it, ${ops}% runs the project. The vault's code does the split, and every step is a public transaction you can check.` },
    { k: 'burn', tone: 'burn', t: 'Supply goes down', d: `The burn share buys $${brand.ticker} on the open market and destroys exactly what it bought. Every burn is a public transaction.` },
    { k: 'pay', tone: 'pay', t: 'Holders get paid', d: `Every ${cfg?.cycleMinutes || 5} minutes the vault snapshots every wallet above the minimum and sends ${rs} pro rata. You never click anything.` },
  ];
  const [active, setActive] = useState(0);
  const refs = useRef([]);
  useEffect(() => {
    const io = new IntersectionObserver(
      (ents) => ents.forEach((en) => en.isIntersecting && setActive(Number(en.target.dataset.i))),
      { rootMargin: '-45% 0px -45% 0px' },
    );
    refs.current.forEach((el) => el && io.observe(el));
    return () => io.disconnect();
  }, []);
  const segs = [
    ['holders', share, 'var(--c-pay)'],
    ['burn', burn, 'var(--c-burn)'],
    ['ops', ops, 'var(--c-vault)'],
  ];
  return (
    <section className="section flow5" id="flow">
      <div className="s5-head">
        <span className="s5-eyebrow pixel">where every fee goes</span>
        <h2>One trade, <span className="w-pay">four things</span> happen</h2>
      </div>
      <div className="flow-grid">
        <div className="flow-sticky">
          <div className={`flow-viz has-3d a${active} tone-${steps[active].tone}`}>
            <div className="split-stills" aria-hidden="true">
              {[0, 1, 2, 3].map((k) => (
                <img key={k} src={`/renders/split-${k}.webp`} alt="" className={k === Math.min(active, 3) ? 'on' : ''} decoding="async" />
              ))}
            </div>
            <div className="flow-center">
              {active === 0 && (
                <>
                  <span className="pixel muted">creator fee</span>
                  <b className="mono">on every trade</b>
                </>
              )}
              {active === 1 && (
                <>
                  <b className="mono big">{share}%</b>
                  <span className="pixel muted">to holders</span>
                </>
              )}
              {active === 2 && (
                <>
                  <b className="mono big">
                    <Counter value={Number(s?.burned || 0)} />
                  </b>
                  <span className="pixel muted">burned so far</span>
                </>
              )}
              {active === 3 && (
                <>
                  <b className="mono big">{cfg?.cycleMinutes || 5}:00</b>
                  <span className="pixel muted">payout timer</span>
                </>
              )}
            </div>
            <div className="flow-legend">
              {segs.map(([k, pct, col]) => (
                <span key={k} className={active === (k === 'holders' ? 3 : k === 'burn' ? 2 : 1) ? 'on' : ''}>
                  <i style={{ background: col }} /> {pct}% {k}
                </span>
              ))}
            </div>
          </div>
        </div>
        <ol className="flow-steps">
          {steps.map((st, i) => (
            <li key={st.k} ref={(el) => (refs.current[i] = el)} data-i={i} className={`tone-${st.tone} ${active === i ? 'on' : active > i ? 'past' : ''}`}>
              <span className="fs-n mono">0{i + 1}</span>
              <h3>{st.t}</h3>
              <p className="muted">{st.d}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

// ---------- burn tracker ----------
export function BurnTracker({ s, events, cfg, preview }) {
  const burned = Number(s?.burned || 0);
  const pct = (burned / SUPPLY) * 100;
  const burns = events.filter((e) => e.kind === 'burn').slice(0, 5);
  const d = cfg?.decimals ?? 6;
  return (
    <section className="section burn5" id="burn">
      <div className="burn-card tone-burn">
        <Furnace />
        <div className="burn-top">
          <span className="s5-eyebrow pixel">
            <Px name="flame" size={16} /> buyback and burn {preview && <i className="sample-tag pixel">sample</i>}
          </span>
          <b className="burn-num mono">
            <Counter value={burned} format={(v) => int(v)} />
          </b>
          <span className="muted">${brand.ticker} destroyed, {pct.toFixed(3)}% of the supply, bought with {Number(s?.burnSol || 0).toFixed(2)} SOL of fees</span>
          <div className="burn-bar" aria-hidden="true">
            <i style={{ width: `${Math.min(100, Math.max(0.6, pct * 10))}%` }} />
          </div>
          <span className="small muted">bar scaled to 10% of supply</span>
        </div>
        <div className="burn-list">
          {burns.map((e) => (
            <a key={e.id} className="burn-row" {...txLink(e)}>
              <Px name="flame" size={16} />
              <span className="mono">{fmtNum(rawToUi(e.amountRaw, d))}</span>
              <span className="muted">for {(Number(e.lamports || 0) / 1e9).toFixed(3)} SOL</span>
              <span className="muted small">{e.sample ? 'sample' : ago(e.ts) + ' ↗'}</span>
            </a>
          ))}
          {!burns.length && <span className="muted small">The first burn happens in the first cycle after fees arrive.</span>}
          {cfg?.tokenMint && (
            <a className="small linkbtn" href={solscanAcct(cfg.tokenMint)} target="_blank" rel="noreferrer">
              check the supply on solscan ↗
            </a>
          )}
        </div>
      </div>
    </section>
  );
}
