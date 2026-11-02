import { useEffect, useRef, useState } from 'react';
import { ago, fmtNum, rawToUi, short, solscanAcct, solscanTx } from './api.js';

const GLYPHS = 'abcdefghkmnoprsuvwxz0123456789';
const reduced = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

// Text that decrypts itself: random glyphs settle into the real string.
export function Scramble({ text, as: Tag = 'span', className, delay = 0, speed = 32 }) {
  const [out, setOut] = useState(reduced() ? text : text.replace(/\S/g, 'x'));
  useEffect(() => {
    if (reduced()) return setOut(text);
    let frame = 0;
    let iv;
    const t0 = setTimeout(() => {
      iv = setInterval(() => {
        frame++;
        const done = Math.floor(frame / 2);
        let s = '';
        for (let i = 0; i < text.length; i++) {
          const ch = text[i];
          s += ch === ' ' || i < done ? ch : GLYPHS[(Math.random() * GLYPHS.length) | 0];
        }
        setOut(s);
        if (done >= text.length) clearInterval(iv);
      }, speed);
    }, delay);
    return () => {
      clearTimeout(t0);
      clearInterval(iv);
    };
  }, [text, delay, speed]);
  return (
    <Tag className={className} aria-label={text}>
      <span aria-hidden="true">{out}</span>
    </Tag>
  );
}

// Number that eases toward its new value.
export function Counter({ value, format = (v) => fmtNum(v), className }) {
  const [shown, setShown] = useState(Number(value) || 0);
  const from = useRef(shown);
  useEffect(() => {
    const target = Number(value) || 0;
    if (reduced()) return setShown(target);
    const start = performance.now();
    const a = from.current;
    let raf;
    const step = (t) => {
      const k = Math.min(1, (t - start) / 900);
      const e = 1 - Math.pow(1 - k, 3);
      const v = a + (target - a) * e;
      setShown(v);
      if (k < 1) raf = requestAnimationFrame(step);
      else from.current = target;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <span className={className}>{format(shown)}</span>;
}

export function Countdown({ to }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  if (!to) return <span>{'—'}</span>;
  const s = Math.max(0, Math.floor((to - now) / 1000));
  if (s === 0) return <span className="pulse-text">paying now</span>;
  return (
    <span className="mono">
      {String(Math.floor(s / 60)).padStart(2, '0')}:{String(s % 60).padStart(2, '0')}
    </span>
  );
}

export function CopyChip({ value, label = 'CA' }) {
  const [ok, setOk] = useState(false);
  if (!value) return <div className="chip chip-muted">{label}: revealed at launch</div>;
  return (
    <button
      className="chip"
      onClick={() => {
        navigator.clipboard?.writeText(value);
        setOk(true);
        setTimeout(() => setOk(false), 1400);
      }}
    >
      <span className="chip-label">{label}</span>
      <span className="mono">{short(value)}</span>
      <span className="chip-act">{ok ? 'copied' : 'copy'}</span>
    </button>
  );
}

// Monero-style ring signature: many decoy rings, one real signer that keeps moving.
function Rings() {
  const n = 11;
  return (
    <svg viewBox="-200 -200 400 400" className="emblem-svg" aria-hidden="true">
      <defs>
        <radialGradient id="core" r="1">
          <stop offset="0" stopColor="var(--accent)" stopOpacity="0.9" />
          <stop offset="1" stopColor="var(--accent)" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle r="70" fill="url(#core)" className="breathe" />
      {Array.from({ length: n }).map((_, i) => {
        const a = (i / n) * Math.PI * 2;
        return (
          <g key={i} className="orbit" style={{ '--d': `${40 + i * 3}s`, '--i': i }}>
            <circle cx={Math.cos(a) * 130} cy={Math.sin(a) * 130} r={22} className="ring-node" style={{ animationDelay: `${(i * 0.9) % 9.9}s` }} />
          </g>
        );
      })}
      <circle r="130" className="ring-path" />
      <circle r="168" className="ring-path faint" />
      <circle r="92" className="ring-path dashed" />
    </svg>
  );
}

// Zcash-style shielded pool: particles fall in, a shield seals them, nothing comes out traceable.
function Shield() {
  return (
    <svg viewBox="-200 -200 400 400" className="emblem-svg" aria-hidden="true">
      <defs>
        <linearGradient id="sg" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="var(--accent2)" stopOpacity="0.95" />
          <stop offset="1" stopColor="var(--accent)" stopOpacity="0.55" />
        </linearGradient>
        <pattern id="hex" width="24" height="41.6" patternUnits="userSpaceOnUse" patternTransform="scale(0.8)">
          <path d="M12 0 L24 6.9 L24 20.8 L12 27.7 L0 20.8 L0 6.9 Z M12 27.7 L12 41.6" fill="none" stroke="var(--accent)" strokeOpacity="0.25" strokeWidth="1" />
        </pattern>
        <clipPath id="sc">
          <path d="M0 -150 L120 -105 L120 10 C120 85 60 130 0 155 C-60 130 -120 85 -120 10 L-120 -105 Z" />
        </clipPath>
      </defs>
      <g clipPath="url(#sc)">
        <rect x="-200" y="-200" width="400" height="400" fill="url(#hex)" className="hex-drift" />
      </g>
      <path d="M0 -150 L120 -105 L120 10 C120 85 60 130 0 155 C-60 130 -120 85 -120 10 L-120 -105 Z" fill="none" stroke="url(#sg)" strokeWidth="3" className="shield-edge" />
      {Array.from({ length: 14 }).map((_, i) => (
        <circle key={i} r="3.2" cx={-110 + (i * 17) % 220} cy="-190" className="particle" style={{ animationDelay: `${(i * 0.37) % 5}s` }} />
      ))}
      <text y="22" textAnchor="middle" className="shield-z">
        Z
      </text>
    </svg>
  );
}

export function Emblem({ kind }) {
  return <div className="emblem">{kind === 'shield' ? <Shield /> : <Rings />}</div>;
}

export function eventText(e, cfg) {
  const d = cfg?.decimals ?? 6;
  const rd = cfg?.rewardDecimals ?? d;
  const sym = '$' + (cfg?.tokenSymbol || '');
  const rsym = cfg && !cfg.rewardIsOwnToken ? cfg.rewardSymbol : sym;
  const sol = e.lamports ? (Number(e.lamports) / 1e9).toFixed(3) : null;
  switch (e.kind) {
    case 'buy':
      return { tag: 'BUY', text: `${short(e.wallet)} bought ${fmtNum(rawToUi(e.amountRaw, d))} ${sym} for ${sol} SOL` };
    case 'sell':
      return { tag: 'SELL', text: `${short(e.wallet)} sold ${fmtNum(rawToUi(e.amountRaw, d))} ${sym} for ${sol} SOL` };
    case 'claim':
      return { tag: 'FEES', text: `Vault claimed ${sol} SOL in creator fees` };
    case 'buyback':
      return { tag: 'BUYBACK', text: `Vault bought ${fmtNum(rawToUi(e.amountRaw, rd))} ${rsym} with ${sol} SOL` };
    case 'payout':
      return { tag: 'PAID', text: `${short(e.wallet)} received ${fmtNum(rawToUi(e.amountRaw, rd), 4)} ${rsym}` };
    default:
      return { tag: e.kind.toUpperCase(), text: '' };
  }
}

export function Marquee({ events, cfg }) {
  if (!events.length) {
    return (
      <div className="marquee marquee-empty">
        <span className="dot" /> Live feed starts with the first on-chain trade. Every line will link to its Solana transaction.
      </div>
    );
  }
  const items = events.slice(0, 24);
  const row = items.map((e) => {
    const t = eventText(e, cfg);
    return (
      <a key={e.id} href={solscanTx(e.sig)} target="_blank" rel="noreferrer" className={`mq-item k-${e.kind}`}>
        <b>{t.tag}</b> {t.text}
      </a>
    );
  });
  return (
    <div className="marquee" role="marquee" aria-label="Recent on-chain activity">
      <div className="mq-track" style={{ '--n': items.length }}>
        {row}
        {row.map((r) => ({ ...r, key: r.key + '-dup' }))}
      </div>
    </div>
  );
}

export function Toasts({ items, cfg }) {
  return (
    <div className="toasts" aria-live="polite">
      {items.map((e) => {
        const t = eventText(e, cfg);
        return (
          <a key={e.id} className={`toast k-${e.kind}`} href={solscanTx(e.sig)} target="_blank" rel="noreferrer">
            <b>{t.tag}</b>
            <span>{t.text}</span>
            <small>verified on Solana ↗</small>
          </a>
        );
      })}
    </div>
  );
}

export function FeedTable({ events, cfg, empty }) {
  if (!events.length) return <div className="empty">{empty}</div>;
  return (
    <ul className="feed">
      {events.slice(0, 30).map((e) => {
        const t = eventText(e, cfg);
        return (
          <li key={e.id} className={`feed-row k-${e.kind} enter`}>
            <span className="feed-tag">{t.tag}</span>
            <span className="feed-text">{t.text}</span>
            <a className="feed-link mono" href={solscanTx(e.sig)} target="_blank" rel="noreferrer">
              {ago(e.ts)} ↗
            </a>
          </li>
        );
      })}
    </ul>
  );
}

export function WalletLink({ address }) {
  return (
    <a className="mono" href={solscanAcct(address)} target="_blank" rel="noreferrer">
      {short(address)}
    </a>
  );
}

// Reveals children with a sliding redaction bar when scrolled into view.
export function Reveal({ children, className = '' }) {
  const ref = useRef(null);
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (reduced()) return setOn(true);
    const io = new IntersectionObserver(
      ([en]) => {
        if (en.isIntersecting) {
          setOn(true);
          io.disconnect();
        }
      },
      { threshold: 0.01, rootMargin: '0px 0px -8% 0px' },
    );
    if (ref.current) io.observe(ref.current);
    // Never leave content hidden if the observer doesn't fire.
    const safety = setTimeout(() => setOn(true), 4000);
    return () => {
      io.disconnect();
      clearTimeout(safety);
    };
  }, []);
  return (
    <div ref={ref} className={`reveal ${on ? 'on' : ''} ${className}`}>
      {children}
    </div>
  );
}
