// Building blocks for the Zatoshi pages: nav, ticker, payout clock, holder
// grid, cycle history, live feed and the "do I earn?" check.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import SegClock from '../segclock.jsx';
import { brand, caOf, rewardLabel } from '../brand.js';
import { api, fmtNum, rawToUi, short, solscanAcct, solscanTx } from '../api.js';
import { useAuth, AccountButton } from '../auth.jsx';
import { Link } from '../nav.jsx';
import { Icon, Logo, Mark } from './icons.jsx';
import { SAMPLE, holdFor, hhmm } from './data.js';

export const TICK = '$' + brand.ticker;
const int = (v) => Math.round(Number(v) || 0).toLocaleString('en-US');
export const rewardSym = (cfg) => rewardLabel(cfg, TICK);
const split = (cfg) => ({ hold: Math.round((cfg?.rewardShareBps ?? 8000) / 100), burn: Math.round((cfg?.burnBps ?? 2000) / 100) });

export const PAGES = [
  { key: 'home', to: '/', label: 'Home', icon: 'home' },
  { key: 'live', to: '/live', label: 'Live', icon: 'live' },
  { key: 'swap', to: '/swap', label: 'Swap', icon: 'swap' },
  { key: 'how', to: '/how', label: 'How it works', short: 'How', icon: 'how' },
  { key: 'boards', to: '/boards', label: 'Leaderboards', short: 'Boards', icon: 'boards' },
];

// The project's X account, as the X mark.
export function XLink({ size = 15 }) {
  return (
    <a className="zb zb-line zb-sm zn-x" href={`https://x.com/${brand.xHandle}`} target="_blank" rel="noreferrer" aria-label={`${brand.name} on X (@${brand.xHandle})`} title={`@${brand.xHandle} on X`}>
      <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
      </svg>
    </a>
  );
}

// ---------- nav: logo, glass tab bar, buy + account ----------
export function ZNav({ page, cfg }) {
  const pill = useRef(null);
  const bar = useRef(null);
  useLayoutEffect(() => {
    const on = bar.current?.querySelector('.on');
    if (!on || !pill.current) return;
    pill.current.style.setProperty('--x', on.offsetLeft + 'px');
    pill.current.style.setProperty('--w', on.offsetWidth + 'px');
    pill.current.style.opacity = 1;
  }, [page]);
  return (
    <>
      <header className="zn">
        <Link to="/" className="zn-logo" aria-label={`${brand.name} home`}>
          <Logo name={brand.name} />
        </Link>
        <nav className="zn-tabs zx-glass" ref={bar} aria-label="Pages">
          <i className="zn-pill" ref={pill} aria-hidden="true" />
          {PAGES.map((p) => (
            <Link key={p.key} to={p.to} className={page === p.key ? 'on' : ''} aria-current={page === p.key ? 'page' : undefined}>
              <Icon name={p.icon} size={16} />
              <span>{p.label}</span>
            </Link>
          ))}
        </nav>
        <div className="zn-right">
          <Link to="/swap" className="zb zb-gold zb-sm hide-sm">
            Buy {TICK}
          </Link>
          <XLink />
          <Link to={page === 'app' ? '/' : '/app'} className="zb zb-line zb-sm hide-xs">
            {page === 'app' ? 'Home' : 'My vault'}
          </Link>
          <AccountButton />
        </div>
      </header>
      <nav className="zn-dock zx-glass" aria-label="Pages">
        {PAGES.map((p) => (
          <Link key={p.key} to={p.to} className={page === p.key ? 'on' : ''} aria-current={page === p.key ? 'page' : undefined}>
            <Icon name={p.icon} size={19} />
            <span>{p.short || p.label}</span>
          </Link>
        ))}
      </nav>
    </>
  );
}

// ---------- dot-matrix ticker, Bloomberg style ----------
export function Ticker({ s, cfg }) {
  const m = s?.market;
  const sp = split(cfg);
  const items = [
    [TICK, m?.priceUsd ? '$' + m.priceUsd.toPrecision(3) : 'PRE-LAUNCH', m ? (m.change24h >= 0 ? 'up' : 'dn') : ''],
    ['24H', m ? (m.change24h >= 0 ? '+' : '') + m.change24h.toFixed(1) + '%' : '—', m ? (m.change24h >= 0 ? 'up' : 'dn') : ''],
    ['MCAP', m?.marketCap ? '$' + fmtNum(m.marketCap) : '—'],
    ['VOL 24H', m?.volume24h ? '$' + fmtNum(m.volume24h) : '—'],
    ['HOLDERS', s ? int(s.holders) : '—'],
    ['PAID OUT', s ? fmtNum(s.rewardsPaid) + ' ' + rewardSym(cfg) : '—'],
    ['BURNED', s ? fmtNum(s.burned) + ' ' + TICK : '—'],
    ['FEES', s ? s.feesTotalSol.toFixed(2) + ' SOL' : '—'],
    ['SPLIT', `${sp.hold}/${sp.burn}`],
    ['CYCLE', `${cfg?.cycleMinutes || 5}:00`],
    ['SWAP FEE', '0%'],
    ['KYC', 'NONE'],
  ];
  const row = items.map(([k, v, t], i) => (
    <span className="zt-item" key={i}>
      <b>{k}</b>
      <span className={t ? 'zt-' + t : ''}>{v}</span>
      <i aria-hidden="true">■</i>
    </span>
  ));
  return (
    <div className="zt" role="marquee" aria-label="Vault numbers">
      <div className="zt-track">
        {row}
        {row.map((r, i) => (
          <span key={'d' + i} aria-hidden="true" className="zt-dup">
            {r}
          </span>
        ))}
      </div>
    </div>
  );
}

// ---------- the payout clock (Evan's alarm clock, ring now tracks the countdown) ----------
const C0 = 300;
const RR = 200;
export function ZClock({ s, cfg }) {
  const cm = cfg?.cycleMinutes || 5;
  const span = cm * 60000;
  const next = cfg?.live && s?.nextCycleAt ? s.nextCycleAt : null;
  const [now, setNow] = useState(Date.now());
  const ring = useRef(null);
  const head = useRef(null);
  const nextRef = useRef(next);
  nextRef.current = next;
  const leftAt = (t) => (nextRef.current ? Math.max(0, nextRef.current - t) : span - (t % span));
  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), 250);
    let raf = 0;
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const frame = () => {
      const p = 1 - leftAt(Date.now()) / span;
      ring.current?.setAttribute('stroke-dashoffset', String(100 * (1 - p)));
      if (head.current) head.current.style.transform = `rotate(${p * 360}deg)`;
      if (!still) raf = requestAnimationFrame(frame);
    };
    frame();
    const iv2 = still ? setInterval(frame, 1000) : 0;
    return () => {
      clearInterval(iv);
      clearInterval(iv2);
      cancelAnimationFrame(raf);
    };
  }, [span]); // eslint-disable-line react-hooks/exhaustive-deps
  const left = leftAt(now);
  const p = 1 - left / span;
  const paying = next && left === 0;
  const mm = String(Math.floor(left / 60000)).padStart(2, '0');
  const ss = String(Math.floor(left / 1000) % 60).padStart(2, '0');
  return (
    <div className="pclock zclock">
      <svg viewBox="0 0 600 600" className="pc-svg" aria-hidden="true">
        <circle cx={C0} cy={C0} r={RR + 34} className="pc-outer" />
        <g className="pc-ticks">
          {Array.from({ length: 60 }, (_, i) => {
            const a = (i / 60) * Math.PI * 2 - Math.PI / 2;
            const big = i % 5 === 0;
            const r0 = RR + (big ? 6 : 10);
            const r1 = RR + 20;
            return <line key={i} x1={C0 + Math.cos(a) * r0} y1={C0 + Math.sin(a) * r0} x2={C0 + Math.cos(a) * r1} y2={C0 + Math.sin(a) * r1} className={`${big ? 'big' : ''} ${i / 60 <= p ? 'on' : ''}`} />;
          })}
        </g>
        <circle cx={C0} cy={C0} r={RR} className="pc-ring-bg" />
        <circle ref={ring} cx={C0} cy={C0} r={RR} className="pc-ring zc-ring" pathLength="100" strokeDasharray="100" strokeDashoffset="100" style={{ transform: 'rotate(-90deg)' }} />
        <g ref={head} className="zc-head">
          <circle cx={C0} cy={C0 - RR} r="9" className="zc-head-halo" />
          <circle cx={C0} cy={C0 - RR} r="4.5" className="zc-head-dot" />
        </g>
      </svg>
      <div className="pc-center">
        <span className="ct-label zx-pixel">{paying ? 'paying holders' : 'next payout'}</span>
        <div className="pc-lcd">
          <SegClock mm={mm} ss={ss} />
        </div>
        <span className="ct-foot">{next ? `${fmtNum(s?.rewardsPaid || 0)} ${rewardSym(cfg)} paid · ${int(s?.holders)} holders` : 'preview · goes live at launch'}</span>
      </div>
    </div>
  );
}

// ---------- do I earn? ----------
export function EarnCheck({ cfg }) {
  const { address, setOpen } = useAuth();
  const [paste, setPaste] = useState('');
  const [h, setH] = useState(null);
  const [err, setErr] = useState('');
  const target = address || (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(paste) ? paste : '');
  useEffect(() => {
    setH(null);
    setErr('');
    if (!target || !brand.apiUrl) return;
    api(`/api/holder/${target}`)
      .then((r) => (r.error ? setErr(r.error) : setH(r)))
      .catch(() => setErr('Vault unreachable, try again'));
  }, [target]);
  const min = cfg?.minHoldTokens || 100000;
  const rs = rewardSym(cfg);
  const cells = h
    ? [
        ['status', h.eligible ? 'EARNING' : 'NOT YET', h.eligible ? 'ok' : 'no'],
        ['holding', fmtNum(h.balance) + ' ' + TICK],
        ['share of payouts', h.sharePct.toFixed(h.sharePct < 0.1 ? 4 : 2) + '%'],
        ['paid so far', fmtNum(h.paid, 4) + ' ' + rs],
        ['payouts', int(h.payoutCount)],
      ]
    : [
        ['status', target ? (brand.apiUrl ? (err ? 'ERROR' : 'CHECKING') : 'READY') : '—', target && !err ? 'ok' : ''],
        ['min. hold', fmtNum(min) + ' ' + TICK],
        ['paid in', rs],
        ['every', `${cfg?.cycleMinutes || 5} min`],
        ['to claim', 'nothing'],
      ];
  return (
    <section className="ze" aria-label="Do I earn?">
      <div className="ze-head">
        <span className="ze-q zx-pixel">do i earn?</span>
        <span className="ze-hint">Paste any Solana wallet or connect one. Read-only, no signature, no transaction.</span>
      </div>
      <div className="ze-bar">
        <label className="ze-in">
          <span className="ze-prompt" aria-hidden="true">
            wallet&gt;
          </span>
          <input value={address || paste} onChange={(e) => setPaste(e.target.value.trim())} readOnly={Boolean(address)} placeholder="paste a wallet address" spellCheck="false" aria-label="Wallet address" />
          {!target && <span className="ze-caret" aria-hidden="true" />}
        </label>
        <button className="zb zb-gold" onClick={() => setOpen(true)}>
          <Icon name="wallet" size={17} />
          {address ? short(address) : 'Connect wallet'}
        </button>
      </div>
      <dl className="ze-out">
        {cells.map(([k, v, t]) => (
          <div key={k} className={t ? 'ze-' + t : ''}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      {(err || (target && !cfg?.live)) && <p className="ze-note">{err ? err + '.' : `${short(target)} is set. Hold ${fmtNum(min)}+ ${TICK} after launch and it is paid ${rs} every ${cfg?.cycleMinutes || 5} minutes, with nothing to click.`}</p>}
      {h && !h.eligible && <p className="ze-note">This wallet needs {fmtNum(min)}+ {TICK} at the next snapshot to start earning.</p>}
    </section>
  );
}

// ---------- big numbers strip ----------
export function StatStrip({ s, cfg }) {
  const items = [
    ['paid to holders', s ? fmtNum(s.rewardsPaid) : '0', rewardSym(cfg)],
    ['burned forever', s ? fmtNum(s.burned) : '0', TICK],
    ['wallets earning', s ? int(s.holders) : '0', 'right now'],
    ['swaps 24h', s ? int(s.trades24h) : '0', 'on-chain'],
    ['fees collected', s ? s.feesTotalSol.toFixed(2) : '0.00', 'SOL'],
  ];
  return (
    <section className="zs">
      {items.map(([k, v, u]) => (
        <div key={k} className="zs-cell">
          <span className="zs-k zx-pixel">{k}</span>
          <span className="zs-v zx-dot">{v}</span>
          <span className="zs-u">{u}</span>
        </div>
      ))}
    </section>
  );
}

// ---------- holders: one dot per wallet ----------
const TOP_CLASS = ['t1', 't2', 't3', 't4', 't5'];
const level = (h) => (h.rank <= 5 ? TOP_CLASS[h.rank - 1] : h.pct >= 1 ? 'l4' : h.pct >= 0.25 ? 'l3' : h.pct >= 0.05 ? 'l2' : 'l1');

export function HolderGrid({ data, big = false, cfg }) {
  const { holders, sample } = data;
  const wrap = useRef(null);
  const [w, setW] = useState(900);
  const [hover, setHover] = useState(null);
  useEffect(() => {
    const el = wrap.current;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  const cell = w < 520 ? 11 : big ? 15 : 13;
  const gap = w < 520 ? 3 : 4;
  const pitch = cell + gap;
  const cols = Math.max(8, Math.floor((w + gap) / pitch));
  const rows = Math.max(big ? 10 : 7, Math.ceil(holders.length / cols));
  const empty = cols * rows;
  const H = rows * pitch - gap;
  const live = holders.length > 0;
  const hv = hover != null ? holders.find((x) => x.wallet === hover) : null;
  const hi = hv ? hv.rank - 1 : 0;
  return (
    <div className="zg" ref={wrap}>
      <div className="zg-field" style={{ height: H, '--cell': cell + 'px', '--pitch': pitch + 'px', '--cols': cols }}>
        <div className="zg-empty" style={{ gridTemplateColumns: `repeat(${cols}, ${cell}px)`, gap }} aria-hidden="true">
          {Array.from({ length: empty }, (_, i) => (
            <i key={i} />
          ))}
        </div>
        {holders.map((h, i) => (
          <b
            key={h.wallet}
            className={`zg-dot ${level(h)}`}
            style={{ transform: `translate(${(i % cols) * pitch}px, ${Math.floor(i / cols) * pitch}px)` }}
            onPointerEnter={() => setHover(h.wallet)}
            onPointerLeave={() => setHover((x) => (x === h.wallet ? null : x))}
            onClick={() => !sample && window.open(solscanAcct(h.wallet), '_blank', 'noopener')}
            aria-label={`Rank ${h.rank}, ${fmtNum(h.amount)} ${TICK}`}
          >
            {h.rank <= 5 && cell >= 13 && <em>{h.rank}</em>}
          </b>
        ))}
        {hv && (
          <div className={`zg-tip ${(hi % cols) > cols * 0.6 ? 'left' : ''}`} style={{ transform: `translate(${(hi % cols) * pitch}px, ${Math.floor(hi / cols) * pitch}px)` }}>
            <div className="zg-tip-in">
              <b>
                #{hv.rank} <RankMove h={hv} />
              </b>
              <span className="mono">{data.profiles?.[hv.wallet]?.u ? '@' + data.profiles[hv.wallet].u : short(hv.wallet)}</span>
              <span>
                {fmtNum(hv.amount)} {TICK} · {hv.pct.toFixed(2)}%
              </span>
              <span>held {holdFor(hv.since)}</span>
              <span>
                paid {fmtNum(hv.paid, 4)} {rewardSym(cfg)}
              </span>
            </div>
          </div>
        )}
        {!live && (
          <div className="zg-wait">
            <span className="zx-pixel">watching for holders</span>
            <p>Every wallet holding {fmtNum(cfg?.minHoldTokens || 100000)}+ {TICK} lands here as a dot within {cfg?.cycleMinutes || 5} minutes of launch. Bigger bags glow brighter, the top five get their own colors, and dots move as ranks change.</p>
          </div>
        )}
        {sample && <span className="zx-sample">sample data · pre-launch preview</span>}
      </div>
      <div className="zg-legend">
        <span>
          less <i className="l1" />
          <i className="l2" />
          <i className="l3" />
          <i className="l4" /> more
        </span>
        <span>
          top five <i className="t1" />
          <i className="t2" />
          <i className="t3" />
          <i className="t4" />
          <i className="t5" />
        </span>
        <span>{live ? `${int(data.count)} holders · +${data.joined} joined · −${data.left} left this cycle` : 'snapshot every cycle'}</span>
      </div>
    </div>
  );
}

function RankMove({ h }) {
  if (!h.prevRank || h.prevRank === h.rank) return <span className="rk rk-0">–</span>;
  const up = h.prevRank > h.rank;
  return (
    <span className={`rk ${up ? 'rk-up' : 'rk-dn'}`}>
      {up ? '▲' : '▼'}
      {Math.abs(h.prevRank - h.rank)}
    </span>
  );
}

export function TopHolders({ data, n = 5, cfg }) {
  const rows = data.holders.slice(0, n);
  return (
    <ol className="zth">
      {Array.from({ length: n }, (_, i) => {
        const h = rows[i];
        return (
          <li key={h ? h.wallet : 'e' + i} className={h ? '' : 'zth-empty'}>
            <span className={`zth-r ${TOP_CLASS[i] || 'l3'}`}>{String(i + 1).padStart(2, '0')}</span>
            {h ? (
              <>
                <span className="zth-w">
                  {h.wallet && !data.sample ? (
                    <a href={solscanAcct(h.wallet)} target="_blank" rel="noreferrer">
                      {data.profiles?.[h.wallet]?.u ? '@' + data.profiles[h.wallet].u : short(h.wallet)}
                    </a>
                  ) : (
                    short(h.wallet)
                  )}
                  <small>held {holdFor(h.since)}</small>
                </span>
                <span className="zth-a">
                  {fmtNum(h.amount)}
                  <small>{h.pct.toFixed(2)}%</small>
                </span>
                <RankMove h={h} />
              </>
            ) : (
              <span className="zth-w">open seat</span>
            )}
          </li>
        );
      })}
      {cfg && <li className="zth-foot">paid {rewardSym(cfg)} pro rata every {cfg.cycleMinutes || 5} min</li>}
    </ol>
  );
}

export function HoldersTable({ data, cfg, n = 100 }) {
  const rows = data.holders.slice(0, n);
  if (!rows.length) return <Terminal lines={[['..', 'holder table', 'fills from the chain at launch']]} wait="waiting for the contract address" />;
  return (
    <div className="ztab-wrap">
      <table className="ztab">
        <thead>
          <tr>
            <th>#</th>
            <th>move</th>
            <th>wallet</th>
            <th className="r">holding</th>
            <th className="r">share</th>
            <th className="r">held for</th>
            <th className="r">paid</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((h) => (
            <tr key={h.wallet}>
              <td>
                <span className={`zth-dot ${level(h)}`} />
                {h.rank}
              </td>
              <td>
                <RankMove h={h} />
              </td>
              <td className="mono">{data.sample ? short(h.wallet) : <a href={solscanAcct(h.wallet)} target="_blank" rel="noreferrer">{data.profiles?.[h.wallet]?.u ? '@' + data.profiles[h.wallet].u : short(h.wallet)}</a>}</td>
              <td className="r">{fmtNum(h.amount)}</td>
              <td className="r">{h.pct.toFixed(2)}%</td>
              <td className="r">{holdFor(h.since)}</td>
              <td className="r">
                {fmtNum(h.paid, 4)} <small>{rewardSym(cfg)}</small>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {data.sample && <span className="zx-sample">sample data · pre-launch preview</span>}
    </div>
  );
}

// ---------- payout history: one row per 5-minute cycle ----------
export function CycleHistory({ data, cfg, rows = 12 }) {
  const { cycles, sample } = data;
  const sym = data.rewardSymbol ? (data.rewardSymbol.startsWith('$') || data.rewardSymbol.length > 6 ? data.rewardSymbol : '$' + data.rewardSymbol) : rewardSym(cfg);
  const chart = useMemo(() => [...cycles].slice(0, 48).reverse(), [cycles]);
  const max = Math.max(1e-9, ...chart.map((c) => Number(c.paid) || 0));
  if (!cycles.length) {
    return (
      <div className="zc">
        <DotBars values={[]} />
        <Terminal
          lines={[
            ['..', 'cycle #1', `runs ${cfg?.cycleMinutes || 5} min after the vault goes live`],
            ['..', 'each row', 'paid out, wallets paid, holders in and out, burned, tx'],
          ]}
          wait="no payout cycles yet"
        />
      </div>
    );
  }
  return (
    <div className="zc">
      <DotBars values={chart.map((c) => (Number(c.paid) || 0) / max)} />
      <div className="ztab-wrap">
        <table className="ztab zc-tab">
          <thead>
            <tr>
              <th>cycle</th>
              <th>time</th>
              <th className="r">paid out</th>
              <th className="r">vs last</th>
              <th className="r">wallets paid</th>
              <th className="r">holders</th>
              <th className="r">burned</th>
              <th className="r">tx</th>
            </tr>
          </thead>
          <tbody>
            {cycles.slice(0, rows).map((c, i) => {
              const prev = cycles[i + 1];
              const d = prev && Number(prev.paid) > 0 ? ((Number(c.paid) - Number(prev.paid)) / Number(prev.paid)) * 100 : null;
              return (
                <tr key={c.id}>
                  <td className="mono">#{c.id}</td>
                  <td className="mono">{hhmm(c.ts)}</td>
                  <td className="r">
                    <b>{fmtNum(c.paid)}</b> <small>{sym}</small>
                  </td>
                  <td className={`r ${d == null ? '' : d >= 0 ? 'up' : 'dn'}`}>{d == null ? '—' : `${d >= 0 ? '▲' : '▼'} ${Math.abs(d).toFixed(1)}%`}</td>
                  <td className="r">{int(c.recipients)}</td>
                  <td className="r">
                    {int(c.holders)} <span className="up">+{c.joined}</span> <span className="dn">−{c.left}</span>
                  </td>
                  <td className="r">
                    {fmtNum(c.burned)} <small>{TICK}</small>
                  </td>
                  <td className="r">
                    {c.sigs?.[0] && !sample ? (
                      <a href={solscanTx(c.sigs[0])} target="_blank" rel="noreferrer" aria-label="View on Solscan">
                        <Icon name="ext" size={14} />
                      </a>
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {sample && <span className="zx-sample">sample data · pre-launch preview</span>}
      </div>
    </div>
  );
}

// A dot-matrix bar chart: one column per cycle, eight dots tall.
function DotBars({ values }) {
  const N = 48;
  const cols = Array.from({ length: N }, (_, i) => values[i - (N - values.length)] ?? null);
  return (
    <div className="zdb" aria-hidden="true">
      {cols.map((v, i) => (
        <span key={i} className="zdb-col">
          {Array.from({ length: 8 }, (_, k) => (
            <i key={k} className={v != null && 7 - k < Math.max(1, Math.round(v * 8)) ? (i === N - 1 ? 'hot' : 'on') : ''} />
          ))}
        </span>
      ))}
    </div>
  );
}

// ---------- terminal block for empty states ----------
export function Terminal({ lines, wait }) {
  return (
    <div className="zterm">
      {lines.map(([st, k, v], i) => (
        <div key={i} className="zterm-l">
          <span className={`zterm-s s-${st === 'ok' ? 'ok' : st === 'test' ? 'test' : st === '!!' ? 'bad' : 'wait'}`}>[{st === 'ok' ? ' OK ' : st === 'test' ? 'TEST' : st === '!!' ? ' !! ' : ' .. '}]</span>
          <span className="zterm-k">{k}</span>
          <span className="zterm-v">{v}</span>
        </div>
      ))}
      {wait && (
        <div className="zterm-l zterm-wait">
          <span>&gt; {wait}</span>
          <span className="ze-caret" />
        </div>
      )}
    </div>
  );
}

// ---------- happening right now ----------
const TAG = { buy: 'BUY', sell: 'SELL', claim: 'FEES IN', topup: 'TOP-UP', buyback: 'SWAP', burn: 'BURN', payout: 'PAID', join: 'JOINED' };
function evLine(e, cfg) {
  const d = cfg?.decimals ?? 6;
  const rd = cfg?.rewardDecimals ?? d;
  const sol = e.lamports ? (Number(e.lamports) / 1e9).toFixed(3) + ' SOL' : '';
  const nm = e.name?.u ? '@' + e.name.u : short(e.wallet || '');
  switch (e.kind) {
    case 'buy':
      return [nm, `bought ${fmtNum(rawToUi(e.amountRaw, d))} ${TICK}`, sol];
    case 'sell':
      return [nm, `sold ${fmtNum(rawToUi(e.amountRaw, d))} ${TICK}`, sol];
    case 'claim':
      return ['vault', 'claimed creator fees', sol];
    case 'topup':
      return ['vault', `added a team top-up to the ${e.meta?.to === 'burn' ? 'burn' : 'holder rewards'}`, sol];
    case 'buyback':
      return ['vault', `swapped fees into ${fmtNum(rawToUi(e.amountRaw, rd))} ${rewardSym(cfg)}`, sol];
    case 'burn':
      return ['vault', `bought and burned ${fmtNum(rawToUi(e.amountRaw, d))} ${TICK}`, sol];
    case 'payout':
      return [nm, `got ${fmtNum(rawToUi(e.amountRaw, rd), 4)} ${rewardSym(cfg)}`, ''];
    default:
      return [nm, e.kind, ''];
  }
}

export function LiveFeed({ events, cfg, s, rows = 10, kinds }) {
  const list = (kinds ? events.filter((e) => kinds.includes(e.kind)) : events).slice(0, rows);
  if (!list.length) return <StatusBoard cfg={cfg} s={s} />;
  return (
    <ul className="zf">
      {list.map((e) => {
        const [who, what, sol] = evLine(e, cfg);
        const t = new Date(e.ts);
        return (
          <li key={e.id} className={`zf-${e.kind}`}>
            <span className="zf-t mono">{[t.getHours(), t.getMinutes(), t.getSeconds()].map((n) => String(n).padStart(2, '0')).join(':')}</span>
            <span className="zf-tag">{TAG[e.kind] || e.kind}</span>
            <span className="zf-who mono">{who}</span>
            <span className="zf-what">{what}</span>
            <span className="zf-sol mono">{sol}</span>
            {e.sig ? (
              <a className="zf-tx" href={solscanTx(e.sig)} target="_blank" rel="noreferrer" aria-label="View on Solscan">
                <Icon name="ext" size={14} />
              </a>
            ) : (
              <span />
            )}
          </li>
        );
      })}
    </ul>
  );
}

// What the vault is doing before anything has happened on-chain. Every line
// is read from the API; nothing here is invented.
export function StatusBoard({ cfg, s }) {
  const api = Boolean(s);
  const lines = [
    ['ok', 'site', 'online'],
    [api ? 'ok' : '..', 'vault api', api ? 'online' : brand.apiUrl ? 'unreachable, retrying' : 'connects at launch'],
    [cfg?.tokenMint ? 'ok' : '..', 'contract', cfg?.tokenMint ? short(cfg.tokenMint) : caOf(cfg) ? `${short(caOf(cfg))} · launching on Pump.fun` : 'waiting for the CA'],
    [s?.snapshotAt ? 'ok' : '..', 'holder watcher', s?.snapshotAt ? `last snapshot ${Math.max(0, Math.round((Date.now() - s.snapshotAt) / 60000))}m ago` : `armed, snapshots every ${cfg?.cycleMinutes || 5} min once the CA is set`],
    [cfg?.live ? 'ok' : '..', 'payouts', cfg?.live ? (cfg.paused ? 'paused by the team' : `every ${cfg.cycleMinutes} min`) : 'first cycle 5 min after launch'],
    ['test', 'buyback + burn', 'passes in tests on SPL and Token-2022, live with the first fees'],
  ];
  return <Terminal lines={lines} wait="waiting for the first transactions" />;
}

// ---------- fee split band: gold surface, black type ----------
export function FeeBand({ cfg }) {
  const sp = split(cfg);
  const ops = Math.max(0, 100 - sp.hold - sp.burn);
  const rs = rewardSym(cfg);
  return (
    <section className="zfee" id="split">
      <div className="zfee-in">
        <div className="zfee-num zx-dot">
          {sp.hold}
          <span>/</span>
          {sp.burn}
        </div>
        <div className="zfee-dots" aria-hidden="true">
          {Array.from({ length: 100 }, (_, i) => (
            <i key={i} className={i < sp.hold ? 'h' : i < sp.hold + sp.burn ? 'b' : 'o'} />
          ))}
        </div>
        <ol className="zfee-list">
          <li>
            <b>Fees in.</b> Every buy and sell of {TICK}, on any app, pays a Pump.fun creator fee in SOL to the vault wallet. The vault claims it every {cfg?.cycleMinutes || 5} minutes.
          </li>
          <li>
            <b>{sp.hold}% to holders.</b> Swapped into {rs} and sent to every wallet holding {fmtNum(cfg?.minHoldTokens || 100000)}+ {TICK}, split by balance. It lands in your wallet. Nothing to claim.
          </li>
          <li>
            <b>{sp.burn}% bought and burned.</b> Buys {TICK} on the open market and burns exactly what it bought. Supply only goes down.
          </li>
          <li>
            <b>{ops ? `${ops}% to the project.` : '0% to the team.'}</b> {ops ? 'Covers RPC and transaction costs.' : 'No team cut from fees. Network costs come out of the SOL each cycle uses.'}
          </li>
        </ol>
      </div>
    </section>
  );
}

// ---------- page header ----------
export function PageHead({ path, title, children, meta }) {
  return (
    <header className="zph">
      <div className="zph-l">
        <span className="zph-path zx-pixel">~/{brand.name.toLowerCase()}/{path}</span>
        <h1 className="zph-t">{title}</h1>
        {children && <p className="zph-p">{children}</p>}
      </div>
      {meta && (
        <dl className="zph-meta">
          {meta.map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      )}
    </header>
  );
}

export function SecHead({ k, title, right }) {
  return (
    <div className="zsh">
      <span className="zsh-k zx-pixel">{k}</span>
      <h2 className="zsh-t">{title}</h2>
      {right && <span className="zsh-r">{right}</span>}
    </div>
  );
}

export function CopyCA({ mint }) {
  const [ok, setOk] = useState(false);
  if (!mint)
    return (
      <span className="zca">
        <b>CA</b>
        <span>announced at launch on X</span>
      </span>
    );
  return (
    <button
      className="zca"
      onClick={() => {
        navigator.clipboard?.writeText(mint);
        setOk(true);
        setTimeout(() => setOk(false), 1400);
      }}
    >
      <b>CA</b>
      <span className="mono zca-v">{mint}</span>
      <Icon name={ok ? 'check' : 'copy'} size={14} />
    </button>
  );
}

export function ZFooter() {
  return (
    <footer className="zfo">
      <div className="zfo-top">
        <div className="zfo-brand">
          <Mark size={44} />
          <p>
            {brand.name} is a hold-to-earn vault on Solana with a Zcash theme. Not affiliated with the Zcash project or Electric Coin Co. Memecoins are volatile and can go to zero. Payouts depend on trading volume and are not guaranteed. Not financial advice.
          </p>
        </div>
        <nav className="zfo-links">
          {PAGES.map((p) => (
            <Link key={p.key} to={p.to}>
              {p.label}
            </Link>
          ))}
          <Link to="/app">My vault</Link>
          <a href={`https://x.com/${brand.xHandle}`} target="_blank" rel="noreferrer">
            X @{brand.xHandle}
          </a>
        </nav>
      </div>
      <div className="zfo-wm zx-dot" aria-hidden="true">
        {brand.name.toLowerCase()}
      </div>
      {SAMPLE && <div className="zfo-sample zx-pixel">sample mode is on · numbers on this page are a preview, not on-chain data</div>}
    </footer>
  );
}
