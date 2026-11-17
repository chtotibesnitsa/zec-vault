// The page scenes (Live, Swap, Leaderboards), built from DOM, SVG and the
// pre-rendered 3D icons, with vector coins. Plain CSS motion, no WebGL.
import { useEffect, useRef, useState } from 'react';
import { fmtNum, rawToUi, usePoll } from './api.js';
import { Coin } from './coin.jsx';
import { brand } from './brand.js';


function useNarrow() {
  const q = '(max-width: 760px)';
  const [n, setN] = useState(() => window.matchMedia(q).matches);
  useEffect(() => {
    const m = window.matchMedia(q);
    const on = () => setN(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return n;
}

export default function StillScene({ kind, events }) {
  const narrow = useNarrow();
  if (kind === 'reactor') return <LivePipeline events={events} narrow={narrow} />;
  if (kind === 'exchange') return <SwapStage />;
  return <BoardsChart narrow={narrow} />;
}

const sym = '$' + brand.ticker;
const amt = (e) => fmtNum(rawToUi(e.amountRaw || '0', 6), 1);
const who = (e) => (e.name?.u ? '@' + e.name.u : 'a holder');
const sol = (e) => (e.lamports ? (Number(e.lamports) / 1e9).toFixed(2) : '0');

// What each event looks like: which coin flies from where to where, and the
// callout it leaves.
function route(e, a, n) {
  const h = 'h' + (n % 7);
  switch (e.kind) {
    case 'buy':
      return { coin: 'sol', from: a.marketOut, to: a.vaultIn, at: a.trades, text: `Buy, ${sol(e)} SOL fee in`, tone: 'trade' };
    case 'sell':
      return { coin: 'sol', from: a.marketOut, to: a.vaultIn, at: a.trades, text: `Sell, ${sol(e)} SOL fee in`, tone: 'sell' };
    case 'claim':
      return { coin: 'sol', from: a.marketOut, to: a.vaultIn, at: a.vault, text: `+${sol(e)} SOL in fees`, tone: 'vault' };
    case 'payout':
      return { coin: 'zats', from: a.vaultOut, to: a[h], at: a[h], text: `+${amt(e)} ${sym} to ${who(e)}`, tone: 'pay' };
    case 'burn':
      return { coin: 'zats', from: a.vaultOut, to: a.furnIn, at: a.burn, text: `Burned ${amt(e)} ${sym}`, tone: 'burn' };
    case 'buyback':
      return { coin: 'zats', from: a.vaultOut, to: a.furnIn, at: a.burn, text: `Bought back with ${sol(e)} SOL`, tone: 'burn' };
    case 'join':
      return { coin: null, at: a[h], text: `${who(e)} joined`, tone: 'people' };
    default:
      return null;
  }
}

const IDLE = ['buy', 'payout', 'sell', 'payout', 'burn', 'payout'];

// Live page: the fee pipeline built from the same 3D icons as the rest of
// the site (candlesticks, the safe, the holders, the fire bowl), laid out
// in the page so it fits any screen. Curved paths carry moving dashes;
// coins fly along them for every event.
const LAYOUT = {
  wide: { trades: [13, 70], vault: [40, 62], burn: [64, 28], holders: [86, 66] },
  tall: { trades: [26, 38], vault: [55, 56], burn: [82, 36], holders: [42, 84] },
};
const ICONS = { trades: 'candles', vault: 'safe', burn: 'brazier', holders: 'person' };
const NAMES = {
  trades: ['trade', 'Trades', 'every buy and sell pays a fee'],
  vault: ['vault', 'Vault', 'fees collect here'],
  burn: ['burn', 'Burn', `20% buys ${'$' + brand.ticker} and burns it`],
  holders: ['people', 'Holders', `80% paid out in ${'$' + brand.ticker}`],
};

function curve([x0, y0], [x1, y1], bend) {
  const mx = (x0 + x1) / 2;
  const my = (y0 + y1) / 2 - bend;
  return `M${x0} ${y0} Q${mx} ${my} ${x1} ${y1}`;
}

function LivePipeline({ events, narrow }) {
  const L = narrow ? LAYOUT.tall : LAYOUT.wide;
  const up = (p, d) => [p[0], p[1] - d];
  const a = {
    trades: up(L.trades, narrow ? 7 : 12),
    vault: up(L.vault, narrow ? 8 : 15),
    burn: up(L.burn, narrow ? 6 : 11),
    holders: up(L.holders, narrow ? 7 : 12),
    marketOut: L.trades,
    vaultIn: L.vault,
    vaultOut: L.vault,
    furnIn: L.burn,
  };
  for (let i = 0; i < 7; i++) a['h' + i] = [L.holders[0] + ((i % 3) - 1) * 3, L.holders[1] + ((i % 2) - 0.5) * 3];
  return (
    <div className={`still still-reactor lp-scene ${narrow ? 'tall' : 'wide'}`}>
      <svg className="lp-paths" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        {[
          ['trade', curve(L.trades, L.vault, 10)],
          ['pay', curve(L.vault, L.holders, 10)],
          ['burn', curve(L.vault, L.burn, -6)],
        ].map(([tone, d]) => (
          <g key={tone} className={`lp-path tone-${tone}`}>
            <path d={d} className="lp-base" vectorEffect="non-scaling-stroke" />
            <path d={d} className="lp-flow" vectorEffect="non-scaling-stroke" />
          </g>
        ))}
      </svg>
      {Object.keys(L).map((k) => {
        const [tone, title, sub] = NAMES[k];
        return (
          <div key={k} className={`lp-st st-${k} tone-${tone}`} style={{ left: L[k][0] + '%', top: L[k][1] + '%' }}>
            <span className="lp-glow" />
            <img src={`/renders/${ICONS[k]}.webp`} alt="" draggable="false" />
            {k === 'burn' && <Fire />}
            <span className="still-tag lp-tag">
              <b>{title}</b>
              <small>{sub}</small>
            </span>
          </div>
        );
      })}
      <LiveLayer a={a} events={events} tags={false} />
    </div>
  );
}

function LiveLayer({ a, events, tags = true }) {
  const [items, setItems] = useState([]);
  const seq = useRef(0);
  const seen = useRef(new Set());
  const lastReal = useRef(0);

  const fire = (e, quiet) => {
    const n = seq.current++;
    const r = route(e, a, n);
    if (!r) return;
    const id = n;
    setItems((xs) => [...xs.slice(-14), { id, ...r, quiet }]);
    setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), 3400);
  };

  // real (or sample) feed events
  useEffect(() => {
    if (!events?.length) return;
    const fresh = events.filter((e) => !seen.current.has(e.id));
    const first = seen.current.size === 0;
    fresh.forEach((e) => seen.current.add(e.id));
    if (first) return; // don't replay history on load
    fresh.slice(0, 4).forEach((e, i) => setTimeout(() => fire(e, false), i * 450));
    if (fresh.length) lastReal.current = Date.now();
  }, [events]); // eslint-disable-line react-hooks/exhaustive-deps

  // keep coins moving gently when the feed is quiet (no callouts for these)
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let k = 0;
    const iv = setInterval(() => {
      if (document.hidden || Date.now() - lastReal.current < 2500) return;
      fire({ kind: IDLE[k++ % IDLE.length] }, true);
    }, 2200);
    return () => clearInterval(iv);
  }, [a]); // eslint-disable-line react-hooks/exhaustive-deps

  const pin = (p) => ({ left: p[0] + '%', top: p[1] + '%' });
  return (
    <div className="still-layer">
      {tags && (
        <>
          <Tag at={a.trades && [a.trades[0], a.trades[1] + 9]} tone="trade" title="Trades" sub="every buy and sell pays a fee" />
          <Tag at={a.vault} tone="vault" title="Vault" sub="fees collect here" />
          <Tag at={a.holders} tone="people" title="Holders" sub={`80% paid out in ${sym}`} />
          <Tag at={a.burn} tone="burn" title="Burn" sub={`20% buys ${sym} and burns it`} />
        </>
      )}
      {items.map((it) => (
        <span key={it.id}>
          {it.coin && (
            <i
              className={`flyer coin-${it.coin}`}
              style={{ '--x0': it.from[0] + '%', '--y0': it.from[1] + '%', '--x1': it.to[0] + '%', '--y1': it.to[1] + '%' }}
            >
              <Coin kind={it.coin} size={40} />
            </i>
          )}
          {!it.quiet && (
            <b className={`callout tone-${it.tone}`} style={pin(it.at)}>
              {it.text}
            </b>
          )}
        </span>
      ))}
    </div>
  );
}

function Tag({ at, tone, title, sub }) {
  if (!at) return null;
  return (
    <span className={`still-tag tone-${tone}`} style={{ left: at[0] + '%', top: at[1] + '%' }}>
      <b>{title}</b>
      {sub && <small>{sub}</small>}
    </span>
  );
}


// Fire that is actually burning: layered flame tongues that flicker at
// different speeds, embers rising, and $ZATS coins dropping in that char,
// shrink and throw sparks.
export function Fire() {
  return (
    <span className="fire" aria-hidden="true">
      <span className="fire-coins">
        <span className="burning b1">
          <Coin kind="zats" size={40} />
        </span>
        <span className="burning b2">
          <Coin kind="zats" size={40} />
        </span>
      </span>
      <span className="flames">
        <i className="fl f1" />
        <i className="fl f2" />
        <i className="fl f3" />
        <i className="fl f4" />
        <i className="fl f5" />
        <i className="fl core" />
      </span>
      {Array.from({ length: 9 }, (_, i) => (
        <i key={i} className="ember" style={{ '--i': i, '--x': `${((i * 37) % 70) - 35}%` }} />
      ))}
    </span>
  );
}

// Swap page: SOL in, through the 0% ring, $ZATS out. Vector coins, centered
// in the frame under the title, with a glowing track between them.
function SwapStage() {
  return (
    <div className="still swap-stage" aria-hidden="true">
      <div className="ss-glow g-sol" />
      <div className="ss-glow g-zats" />
      <svg className="ss-track" viewBox="0 0 1000 200" preserveAspectRatio="none">
        <path d="M100 100 Q 300 -50, 500 100 Q 700 -50, 900 100" className="sst-base" vectorEffect="non-scaling-stroke" />
        <path d="M100 100 Q 300 -50, 500 100 Q 700 -50, 900 100" className="sst-flow" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="ss-row">
        <span className="ss-node">
          <span className="ss-big sol">
            <Coin kind="sol" size={200} spin />
          </span>
          <span className="ss-cap"><b>You pay</b> SOL</span>
        </span>
        <span className="ss-ring">
          <svg viewBox="0 0 200 200">
            <circle cx="100" cy="100" r="88" className="ssr-track" />
            <circle cx="100" cy="100" r="88" className="ssr-spin" />
            <circle cx="100" cy="100" r="74" className="ssr-inner" />
          </svg>
          <b>0%</b>
          <small>platform fee</small>
        </span>
        <span className="ss-node">
          <span className="ss-big zats">
            <Coin kind="zats" size={200} spin />
          </span>
          <span className="ss-cap"><b>You get</b> ${brand.ticker}</span>
        </span>
      </div>
      <div className="ss-stream">
        {Array.from({ length: 5 }, (_, i) => (
          <span key={i} className="ss-c in" style={{ '--d': `${(-i * 2.6) / 5}s` }}>
            <Coin kind="sol" size={30} />
          </span>
        ))}
        {Array.from({ length: 5 }, (_, i) => (
          <span key={'o' + i} className="ss-c out" style={{ '--d': `${(-i * 2.6) / 5 - 1.3}s` }}>
            <Coin kind="zats" size={30} />
          </span>
        ))}
      </div>
    </div>
  );
}

// Leaderboards: a bar chart of the top earners from the real leaderboard.
// Before the first payout it shows empty outlined slots, never made-up names.
const GHOST = [100, 62, 46, 38, 32, 27, 23, 20, 17, 14, 12, 10];
function BoardsChart({ narrow }) {
  const lb = usePoll('/api/leaderboard', 60000).data;
  const top = (lb?.top || []).slice(0, 12);
  const real = top.length > 0;
  const n = narrow ? 8 : 12;
  const vals = real ? top.map((r) => Number(BigInt(r.paid_raw)) / 1e6) : GHOST;
  const names = real ? top.map((r) => lb.profiles?.[r.wallet]?.u || r.wallet.slice(0, 4) + '…') : [];
  const cols = vals.slice(0, n);
  const max = Math.max(...cols, 1);
  return (
    <div className={`still boards-chart ${real ? '' : 'is-empty'}`} aria-label="Top earners">
      <div className="bc-plot">
        <div className="bc-bars">
          {Array.from({ length: n }, (_, i) => {
            const v = cols[i];
            const has = v != null;
            return (
              <div key={i} className={`bc-col r${i + 1} ${has ? '' : 'none'}`} style={{ '--h': has ? (v / max) * 100 : 0, '--i': i }}>
                <span className="bc-val">{real && has ? fmtNum(v, 1) : ''}</span>
                <span className="bc-bar">
                  <i />
                </span>
              </div>
            );
          })}
        </div>
        <div className="bc-axis">
          {Array.from({ length: n }, (_, i) => (
            <div key={i} className={`bc-lab r${i + 1}`}>
              <span className="bc-rank">{i + 1}</span>
              <span className="bc-who">{real && names[i] ? '@' + names[i] : '—'}</span>
            </div>
          ))}
        </div>
      </div>
      {!real && <span className="bc-empty">The top earners show up here after the first payout.</span>}
      {real && <span className="bc-note">${brand.ticker} paid, top {Math.min(n, cols.length)}</span>}
    </div>
  );
}
