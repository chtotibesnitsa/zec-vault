// Social proof building blocks for the front page. Everything renders from
// real feed events and stats; preview items are badged SAMPLE and unlinked.
import { useEffect, useState } from 'react';
import { brand } from './brand.js';
import { ago, fmtNum } from './api.js';
import { Countdown, Counter, eventText, txLink } from './components.jsx';
import { Px } from './pixel.jsx';

function h32(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

// 5x5 mirrored pixel avatar from a wallet or name.
export function Identicon({ seed = '', size = 32 }) {
  const h = h32(seed || 'anon');
  const cells = [];
  for (let y = 0; y < 5; y++)
    for (let x = 0; x < 3; x++) {
      if ((h >> (y * 3 + x)) & 1) {
        cells.push([x, y]);
        if (x < 2) cells.push([4 - x, y]);
      }
    }
  const hue = h % 3;
  const fill = hue === 0 ? 'var(--accent)' : hue === 1 ? 'var(--accent2)' : 'var(--term-ink)';
  return (
    <svg className="idc" width={size} height={size} viewBox="-1 -1 7 7" shapeRendering="crispEdges" aria-hidden="true">
      <rect x="-1" y="-1" width="7" height="7" fill="var(--term)" />
      {cells.map(([x, y], i) => (
        <rect key={i} x={x} y={y} width="1.02" height="1.02" fill={fill} />
      ))}
    </svg>
  );
}

const seedOf = (e) => e.name?.u || e.wallet || e.kind + e.id;

export function AvatarStack({ events, total, label }) {
  const seen = [];
  for (const e of events) {
    const s = e.name?.u || e.wallet;
    if (s && !seen.includes(s)) seen.push(s);
    if (seen.length >= 6) break;
  }
  return (
    <div className="avstack">
      <span className="avs">
        {seen.map((s) => (
          <Identicon key={s} seed={s} size={34} />
        ))}
      </span>
      <span>
        <b>
          <Counter value={total || 0} format={(v) => Math.round(v).toLocaleString()} />
        </b>{' '}
        {label}
      </span>
    </div>
  );
}

// Cards that pop in over the 3D viewport, one per new event.
export function FloatingProof({ events, cfg }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (!events.length) return;
    const iv = setInterval(() => setI((x) => x + 1), 2600);
    return () => clearInterval(iv);
  }, [events.length]);
  if (!events.length) return null;
  const show = [0, 1, 2].map((k) => events[(i + k) % events.length]).filter(Boolean);
  return (
    <div className="floaters" aria-hidden="true">
      {show.map((e, k) => {
        const t = eventText(e, cfg);
        return (
          <a key={e.id + '-' + i} className={`floater f${k} k-${e.kind}`} {...txLink(e)} tabIndex={-1}>
            <Identicon seed={seedOf(e)} size={30} />
            <span className="fl-body">
              <b className="pixel">{t.tag}</b>
              <span>{t.text}</span>
            </span>
            <span className="fl-meta pixel">{e.sample ? 'sample' : ago(e.ts)}</span>
          </a>
        );
      })}
    </div>
  );
}

// The heartbeat: next payout ring + what the last cycles paid.
export function PayoutPulse({ s, sample }) {
  const live = s?.config?.live;
  const cm = s?.config?.cycleMinutes || 5;
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(iv);
  }, []);
  const left = live && s?.nextCycleAt ? Math.max(0, s.nextCycleAt - now) : (cm * 60000 - (now % (cm * 60000)));
  const p = 1 - left / (cm * 60000);
  const R = 46;
  const C = 2 * Math.PI * R;
  return (
    <div className="pulse card">
      <svg viewBox="0 0 120 120" className="pulse-ring" aria-hidden="true">
        <circle cx="60" cy="60" r={R} className="pr-bg" />
        <circle cx="60" cy="60" r={R} className="pr-fg" style={{ strokeDasharray: C, strokeDashoffset: C * (1 - p) }} />
      </svg>
      <div className="pulse-in">
        <span className="pixel muted">next payout</span>
        <b className="mono">{live ? <Countdown to={s?.nextCycleAt} /> : `${String(Math.floor(left / 60000)).padStart(2, '0')}:${String(Math.floor(left / 1000) % 60).padStart(2, '0')}`}</b>
        <span className="small muted">{live ? `to every holder, automatic` : sample ? 'sample timer · starts at launch' : 'starts at launch'}</span>
      </div>
    </div>
  );
}

// Live numbers for every feature, not just money.
export function UsageStrip({ s, sample }) {
  const c = s?.community || {};
  const rs = '$' + brand.ticker;
  const items = [
    ['coins', 'paid to holders', <Counter key="a" value={s?.rewardsPaid || 0} />, rs],
    ['swap', 'trades in 24h', <Counter key="b" value={s?.trades24h || 0} format={(v) => Math.round(v).toLocaleString()} />, 'on-chain'],
    ['users', 'wallets earning', <Counter key="c" value={s?.holders || 0} format={(v) => Math.round(v).toLocaleString()} />, 'right now'],
    ['eye', 'names claimed', <Counter key="d" value={c.named || 0} format={(v) => Math.round(v).toLocaleString()} />, 'signed in by wallet'],
    ['bolt', 'X accounts linked', <Counter key="e" value={c.xLinked || 0} format={(v) => Math.round(v).toLocaleString()} />, 'public profiles'],
    ['flame', 'joined by invite', <Counter key="f" value={c.invited || 0} format={(v) => Math.round(v).toLocaleString()} />, 'referral links'],
  ];
  return (
    <div className={`usage ${sample ? 'is-sample' : ''}`}>
      {items.map(([ic, label, v, hint]) => (
        <div key={label} className="usage-item">
          <Px name={ic} size={22} />
          <b className="mono">{v}</b>
          <span className="pixel muted">{label}</span>
          <span className="small muted">{hint}</span>
        </div>
      ))}
      {sample && <span className="usage-note pixel">sample numbers · real counts replace these at launch</span>}
    </div>
  );
}

// Masonry of activity cards.
export function ActivityWall({ events, cfg }) {
  const list = events.slice(0, 12);
  return (
    <div className="wall">
      {list.map((e, i) => {
        const t = eventText(e, cfg);
        return (
          <a key={e.id} className={`wall-card k-${e.kind} ${i === 0 ? 'fresh' : ''}`} {...txLink(e)} style={{ '--i': i }}>
            <div className="wc-top">
              <Identicon seed={seedOf(e)} size={36} />
              <span className="wc-who">
                <b>{e.name?.u ? '@' + e.name.u : e.kind === 'claim' || e.kind === 'buyback' ? `${brand.name} vault` : 'holder'}</b>
                {e.name?.x && <span className="xbadge">𝕏</span>}
                <span className="small muted">{ago(e.ts)}</span>
              </span>
              <span className="wc-tag pixel">{t.tag}</span>
            </div>
            <p>{t.text}</p>
            <span className="wc-proof pixel">{e.sample ? 'sample · no transaction' : e.sig ? 'view on solscan ↗' : 'off-chain profile'}</span>
          </a>
        );
      })}
    </div>
  );
}

// Big outlined wordmark sliding across the page.
export function WordBand() {
  const words = Array.from({ length: 8 }, () => brand.name);
  return (
    <div className="wordband" aria-hidden="true">
      <div className="wb-track">
        {[...words, ...words].map((w, i) => (
          <span key={i} className={i % 2 ? 'wb-solid' : ''}>
            {w} <i>✦</i>
          </span>
        ))}
      </div>
    </div>
  );
}
