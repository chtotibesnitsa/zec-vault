// Launch trailer, built from the site's own components and styles.
// Every frame is a pure function of time t, so it can be captured
// frame by frame at 60fps (?capture=1) or previewed live in a browser.
// Activity shown here is a redacted UI demo, never real or fake wallets.

import { useLayoutEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/anybody/standard.css';
import '@fontsource-variable/instrument-sans/standard.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import '@fontsource/ibm-plex-mono/600.css';
import '@fontsource/vt323/400.css';
import './styles.css';
import './v5.css';
import './trailer.css';
import { HYPE, hypeMusic } from './hype.jsx';
import { brand, fill } from './brand.js';
import { Wordmark } from './components.jsx';
import { Px } from './pixel.jsx';
import Hero3D from './Hero3D.jsx';

const W = 1920;
const H = 1080;
const G = 'abcdefghkmnoprsuvwxz0123456789#%@$&*+=';
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const seg = (t, a, b) => clamp((t - a) / (b - a));
const easeOut = (p) => 1 - Math.pow(1 - p, 3);
const easeIO = (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
const stepped = (p, n) => Math.floor(p * n) / n;
const hash = (i) => {
  const x = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
};
// Text decrypting left to right, deterministic per frame.
function scr(text, p, seed, t) {
  const f = Math.floor(t * 30);
  const done = Math.floor(clamp(p) * text.length);
  let s = '';
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    s += c === ' ' || i < done ? c : G[Math.floor(hash(i * 31 + seed * 7 + f) * G.length)];
  }
  return s;
}
const RED = (n) => '█'.repeat(n);
const tk = '$' + brand.ticker;

// ---------- scenes ----------
// Each scene: dur in seconds, render(lp, d, t), cues(d) -> [[time, kind]]

function AsciiBg({ t, opacity = 0.5, density = 18 }) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    if (cv.width !== W) {
      cv.width = W;
      cv.height = H;
    }
    ctx.clearRect(0, 0, W, H);
    ctx.font = `${density}px "IBM Plex Mono", monospace`;
    ctx.fillStyle = getComputedStyle(cv).color;
    const cw = density * 0.62;
    const cols = Math.ceil(W / cw);
    const rows = Math.ceil(H / density);
    const f = Math.floor(t * 10);
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const a = Math.max(0, Math.sin(x * 0.11 + t * 1.3) * Math.cos(y * 0.17 - t * 0.9)) * 0.95;
        if (a < 0.1) continue;
        ctx.globalAlpha = a;
        ctx.fillText(G[Math.floor(hash(x * 131 + y * 17 + Math.floor(f / (1 + ((x + y) % 3)))) * G.length)], x * cw, (y + 1) * density);
      }
    }
    ctx.globalAlpha = 1;
  }, [t, density]);
  return <canvas ref={ref} className="tr-ascii" style={{ opacity }} />;
}

const Boot = {
  dur: 2.6,
  cues(d) {
    const c = [[0, 'drone']];
    const n = brand.trailer.cmd.length + 2;
    for (let i = 0; i < n; i++) c.push([0.15 + i / 20, 'type']);
    for (let i = 0; i < 10; i++) c.push([1.25 + i * 0.09, 'tick']);
    c.push([d - 0.45, 'riser']);
    return c;
  },
  render(lp, d, t) {
    const cmd = '$ ' + brand.trailer.cmd;
    const typed = cmd.slice(0, Math.floor(clamp((lp - 0.15) * 20, 0, cmd.length)));
    const blocks = Math.floor(seg(lp, 1.25, 2.15) * 10);
    return (
      <div className="tr-scene tr-dark">
        <AsciiBg t={t} opacity={0.18 + 0.25 * seg(lp, 0, 2)} />
        <div className="tr-boot win" style={{ transform: `scale(${1 + 0.04 * easeIO(seg(lp, 0, d))})` }}>
          <div className="win-bar">
            <span className="win-dots">
              <i />
              <i />
              <i />
            </span>
            <span className="win-title">{brand.key}-vault — zsh</span>
          </div>
          <div className="tr-boot-body">
            <div>
              {typed}
              {lp < 1.1 && <span className="cursor">▮</span>}
            </div>
            {lp > 1.1 && <div className="muted">&gt; opening vault ……… {blocks >= 10 ? 'ok' : ''}</div>}
            {lp > 1.2 && (
              <div className="tr-blocks">
                {Array.from({ length: 10 }).map((_, i) => (
                  <i key={i} className={i < blocks ? 'on' : ''} />
                ))}
              </div>
            )}
            {lp > 2.15 && (
              <div className="tr-accent">
                &gt; {scr('ACCESS GRANTED. DECRYPTING', seg(lp, 2.15, 2.5), 3, t)}
                <span className="cursor">▮</span>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  },
};

const HeroScene = {
  dur: 4.4,
  cues: (d) => [
    [0, 'whoosh'],
    [0.6, 'glitch'],
    [1.2, 'glitch'],
    [d - 0.35, 'riser'],
  ],
  render(lp, d, t) {
    const z = 1 + 0.06 * easeIO(seg(lp, 0, d));
    const [a, b] = brand.trailer.hook;
    return (
      <div className="tr-scene tr-dark">
        <div className="viewport tr-vp" style={{ transform: `scale(${z})` }}>
          <span className="vp-corner tl" />
          <span className="vp-corner tr" />
          <span className="vp-corner bl" />
          <span className="vp-corner br" />
          <div className="vp-hud pixel">
            {brand.hud.map((h) => (
              <span key={h}>{h}</span>
            ))}
          </div>
          <div className="vp-hud vp-hud-r pixel">
            <span>render  ascii/webgl</span>
            <span>
              state  <b>{brand.statusWord}</b>
            </span>
          </div>
          <Hero3D kind={brand.emblem} accent={brand.accent} accent2={brand.accent2} manual hint={false} />
          <div className="vp-scan" />
        </div>
        <div className="tr-hook">
          {lp > 0.6 && <div>{scr(a, seg(lp, 0.6, 1.0), 1, t)}</div>}
          {lp > 1.2 && <div className="tr-accent">{scr(b, seg(lp, 1.2, 1.6), 2, t)}</div>}
        </div>
      </div>
    );
  },
};

const WordScene = {
  dur: 3.4,
  cues: () => [
    [0.22, 'hit'],
    [0.5, 'type'],
    [0.62, 'type'],
    [0.74, 'type'],
    [0.86, 'type'],
  ],
  render(lp, d, t) {
    const p = stepped(easeOut(seg(lp, 0, 0.24)), 6);
    const shake = lp > 0.22 && lp < 0.42 ? Math.sin(lp * 140) * 10 * (1 - seg(lp, 0.22, 0.42)) : 0;
    return (
      <div className="tr-scene">
        <div className="bg-grid tr-grid" />
        <div className="tr-center">
          <div className="kicker pixel" style={{ opacity: seg(lp, 0.3, 0.5) }}>
            <span className="rec" /> {brand.kicker}
          </div>
          <div className="tr-wm" style={{ transform: `translate(${shake}px, ${shake * 0.4}px) scale(${1.7 - 0.7 * p})`, opacity: p }}>
            <Wordmark text={brand.name} />
          </div>
          <div className="tr-headline">{scr(brand.headline, seg(lp, 0.5, 1.6), 4, t)}</div>
        </div>
      </div>
    );
  },
};

const rowKinds = ['buy', 'sell', 'claim', 'buy', 'buyback', 'buy', 'sell', 'buy', 'claim', 'buy'];
function demoRow(kind, i) {
  const tag = { buy: 'BUY', sell: 'SELL', claim: 'FEES', buyback: 'BUYBACK', payout: 'PAID' }[kind];
  const w = `${RED(4)}…${RED(4)}`;
  const text = {
    buy: `${w} bought ${RED(5)} ${tk}`,
    sell: `${w} sold ${RED(5)} ${tk}`,
    claim: `vault claimed ${RED(3)} SOL in creator fees`,
    buyback: `vault bought ${RED(5)} ${tk}`,
    payout: `${w} received ${RED(4)} ${tk}`,
  }[kind];
  const ts = `00:0${Math.floor(i / 6)}:${String((i * 7) % 60).padStart(2, '0')}`;
  return { tag, text, ts };
}

function LogDemo({ n, kinds, enterT }) {
  return (
    <ul className="log tr-log">
      {Array.from({ length: n }).map((_, i) => {
        const k = kinds[i % kinds.length];
        const r = demoRow(k, i);
        const age = enterT(i);
        return (
          <li key={i} className={`log-row k-${k}`} style={{ transform: `translateX(${(1 - easeOut(clamp(age / 0.25))) * 60}px)`, opacity: clamp(age / 0.12), background: age < 0.4 ? 'color-mix(in srgb, var(--accent) 16%, transparent)' : undefined }}>
            <span className="log-ts">{r.ts}</span>
            <span className="log-tag pixel">{r.tag}</span>
            <span className="log-text">{r.text}</span>
            <span className="log-link">↗ solscan</span>
          </li>
        );
      })}
    </ul>
  );
}

function Win2({ title, children, tabs, tab, className = '', style }) {
  return (
    <div className={`win ${className}`} style={style}>
      <div className="win-bar">
        <span className="win-dots">
          <i />
          <i />
          <i />
        </span>
        <span className="win-title">{title}</span>
        {tabs && (
          <span className="win-tabs">
            {tabs.map((x) => (
              <button key={x} className={x === tab ? 'on' : ''}>
                {x}
              </button>
            ))}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

const FeesScene = {
  dur: 4.4,
  cues(d) {
    const c = [[0, 'whoosh'], [0.05, 'glitch'], [d / 2, 'glitch']];
    for (let i = 0; i < 9; i++) c.push([0.3 + i * 0.32, 'tick']);
    return c;
  },
  render(lp, d, t) {
    const n = clamp(Math.floor((lp - 0.3) / 0.32) + 1, 0, 9);
    const fillP = easeOut(seg(lp, d * 0.5, d * 0.9));
    const on = Math.round(fillP * 32);
    const [b0, b1] = brand.trailer.beats;
    return (
      <div className="tr-scene">
        <div className="bg-grid tr-grid" />
        <div className="tr-split">
          <div className="tr-titles">
            <span className="pixel tr-step">[01] trading</span>
            <div className={lp < d / 2 ? '' : 'dim'}>{scr(b0, seg(lp, 0.05, 0.6), 5, t)}</div>
            {lp > d / 2 && <div className="tr-accent">{scr(b1, seg(lp, d / 2, d / 2 + 0.5), 6, t)}</div>}
            <div className="feeblocks tr-fee" style={{ opacity: seg(lp, d * 0.45, d * 0.55) }}>
              {Array.from({ length: 40 }).map((_, i) => (
                <i key={i} className={i < on ? 'on' : ''} />
              ))}
            </div>
            {lp > d * 0.6 && <div className="tr-sub mono">80% of every fee buys {tk} for holders</div>}
          </div>
          <Win2 title={`${brand.key}-vault — tail -f`} tabs={['all', 'trades', 'payouts', 'vault']} tab="all" className="tr-win">
            <LogDemo n={n} kinds={rowKinds} enterT={(i) => lp - (0.3 + i * 0.32)} />
            <div className="tr-demo pixel">ui preview · wallets redacted</div>
          </Win2>
        </div>
      </div>
    );
  },
};

const PayoutScene = {
  dur: 3.6,
  cues(d) {
    const c = [[0, 'whoosh']];
    for (let i = 0; i < 14; i++) c.push([Math.pow(i / 14, 0.8) * d * 0.62, 'tick']);
    c.push([d * 0.64, 'hit'], [d * 0.66, 'chime']);
    for (let i = 0; i < 8; i++) c.push([d * 0.68 + i * 0.1, 'type']);
    return c;
  },
  render(lp, d, t) {
    const p = easeIO(seg(lp, 0, d * 0.64));
    const secs = Math.round(300 * (1 - p));
    const paying = lp >= d * 0.64;
    const [, , b2, b3] = brand.trailer.beats;
    const rows = clamp(Math.floor((lp - d * 0.68) / 0.1) + 1, 0, 8);
    return (
      <div className="tr-scene tr-dark">
        <AsciiBg t={t} opacity={paying ? 0.35 : 0.12} density={16} />
        <div className="tr-pay">
          <div className="tr-titles tr-titles-c">
            <div>{scr(b2, seg(lp, 0, 0.4), 7, t)}</div>
            <div className="tr-accent">{scr(b3, seg(lp, 0.3, 0.8), 8, t)}</div>
          </div>
          <div className={`tr-count mono ${paying ? 'paying' : ''}`}>
            {paying ? (Math.floor(lp * 6) % 2 ? 'PAYING NOW' : 'PAYING NOW') : `${String(Math.floor(secs / 60)).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`}
          </div>
          <div className="tr-paid">
            {Array.from({ length: rows }).map((_, i) => (
              <span key={i} className="tr-paid-chip" style={{ opacity: clamp((lp - d * 0.68 - i * 0.1) / 0.1) }}>
                <b className="pixel">PAID</b> {RED(4)}…{RED(4)} <span className="muted">+{RED(3)} {tk}</span>
              </span>
            ))}
          </div>
        </div>
      </div>
    );
  },
};

const wallets = ['Phantom', 'Solflare', 'Backpack', 'MetaMask'];
const FeaturesScene = {
  dur: 3.6,
  cues(d) {
    const a = d / 3;
    const c = [[0, 'whoosh'], [a * 0.62, 'click'], [a, 'whoosh'], [2 * a, 'whoosh'], [2 * a + a * 0.4, 'click'], [2 * a + a * 0.75, 'click']];
    for (let i = 0; i < 9; i++) c.push([a + 0.15 + i * 0.07, 'type']);
    return c;
  },
  render(lp, d, t) {
    const a = d / 3;
    const k = Math.min(2, Math.floor(lp / a));
    const q = (lp - k * a) / a;
    const titles = ['SIGN IN WITH YOUR WALLET', 'PICK A NAME. NO EMAIL. NO KYC.', 'CLIMB THE BOARDS. SHARE ON X.'];
    const name = 'night_owl'.slice(0, Math.floor(clamp((q * a - 0.15) / 0.07, 0, 9)));
    const tab = ['earners', 'diamond hands', 'recruiters'][Math.min(2, Math.floor(q * 3))];
    const cursor = k === 0 ? { x: 760 - 260 * easeIO(clamp(q / 0.6)), y: 720 - 300 * easeIO(clamp(q / 0.6)) } : null;
    return (
      <div className="tr-scene">
        <div className="bg-grid tr-grid" />
        <div className="tr-feat">
          <div className="tr-titles tr-titles-c">
            <span className="pixel tr-step">[0{k + 2}] {['identity', 'profile', 'social'][k]}</span>
            <div>{scr(titles[k], seg(q, 0, 0.35), 9 + k, t)}</div>
          </div>
          <div className="tr-feat-ui" style={{ transform: `translateY(${(1 - easeOut(clamp(q / 0.2))) * 40}px)`, opacity: clamp(q / 0.12) }}>
            {k === 0 && (
              <Win2 title={`${brand.key}-vault — connect`} className="tr-modal">
                <div className="modal-body">
                  <h3>Connect a Solana wallet</h3>
                  <p className="muted small">You sign one message. Free, no transaction, can't move funds.</p>
                  <div className="wallet-list">
                    {wallets.map((w, i) => (
                      <div key={w} className={`wallet-btn ${i === 0 && q > 0.62 ? 'hot' : ''}`}>
                        <Px name="wallet" size={22} />
                        <span>{w}</span>
                        <span className="pixel muted">{i === 0 && q > 0.62 ? 'check wallet…' : 'sign in'}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </Win2>
            )}
            {k === 1 && (
              <Win2 title={`${brand.key}-vault — account`} className="tr-modal">
                <div className="modal-body">
                  <span className="pixel muted">your public name</span>
                  <div className="lookup">
                    <input readOnly value={name} />
                    <span className="btn">Save</span>
                  </div>
                  <div className="acct-row">
                    <span className="pixel">shown as</span>
                    <span className="who">{name.length === 9 ? '@night_owl' : ''}</span>
                  </div>
                  <div className="acct-row">
                    <span className="pixel">x account</span>
                    <span className="btn btn-sm">Link X</span>
                  </div>
                </div>
              </Win2>
            )}
            {k === 2 && (
              <Win2 title={`${brand.key}-vault — boards`} tabs={['earners', 'diamond hands', 'recruiters']} tab={tab} className="tr-modal tr-board">
                <ol className="earners">
                  {['night_owl', 'ghost_01', 'no_kyc', 'quiet_one', 'cipher'].map((u, i) => (
                    <li key={u}>
                      <span className={`rank pixel r${i + 1}`}>#0{i + 1}</span>
                      <span className="who">@{u}</span>
                      <span className="mono earn-amt">{RED(5)}</span>
                      <span className="muted small">{tab === 'diamond hands' ? 'never sold' : tab === 'recruiters' ? 'invites' : 'payouts'}</span>
                    </li>
                  ))}
                </ol>
                <div className="tr-demo pixel">ui preview · sample names</div>
              </Win2>
            )}
          </div>
          {cursor && (
            <div className="tr-cursor" style={{ left: cursor.x, top: cursor.y }}>
              <svg width="34" height="34" viewBox="0 0 24 24">
                <path d="M4 2l16 10-7 1.5L9.5 21z" fill="#fff" stroke="#000" strokeWidth="1.4" />
              </svg>
              {q > 0.62 && <span className="tr-click" style={{ transform: `scale(${0.4 + seg(q, 0.62, 0.8) * 1.4})`, opacity: 1 - seg(q, 0.62, 0.85) }} />}
            </div>
          )}
        </div>
      </div>
    );
  },
};

const StepsScene = {
  dur: 7.5,
  cues: (d) => [[0, 'whoosh'], [0.2, 'glitch'], [d * 0.2, 'tick'], [d * 0.45, 'tick'], [d * 0.7, 'tick']],
  render(lp, d, t) {
    const icons = ['swap', 'flame', 'coins'];
    return (
      <div className="tr-scene">
        <div className="bg-grid tr-grid" />
        <div className="tr-steps">
          <div className="tr-titles tr-titles-c">
            <div>{scr('HOW IT WORKS', seg(lp, 0.2, 0.6), 12, t)}</div>
          </div>
          <ol className="steps">
            {brand.steps.map(([ti, de], i) => {
              const a = clamp((lp - d * (0.2 + i * 0.25)) / 0.35);
              return (
                <li key={i} className="step" style={{ opacity: a, transform: `translateY(${(1 - easeOut(a)) * 60}px)` }}>
                  <div className="step-art">
                    <Px name={icons[i]} size={64} />
                    <span className="pixel step-n">step 0{i + 1}</span>
                  </div>
                  <h3>{fill(ti, null)}</h3>
                  <p>{fill(de, null)}</p>
                </li>
              );
            })}
          </ol>
        </div>
      </div>
    );
  },
};

const ProofScene = {
  dur: 4.0,
  cues: () => [[0, 'whoosh'], [0.3, 'glitch'], [1.6, 'hit']],
  render(lp, d, t) {
    const z = 1 + 0.1 * easeIO(seg(lp, 1.2, 2.2));
    return (
      <div className="tr-scene tr-dark">
        <AsciiBg t={t} opacity={0.15} />
        <div className="tr-proof">
          <div className="tr-titles tr-titles-c">
            <div>{scr("DON'T TRUST.", seg(lp, 0.3, 0.7), 13, t)}</div>
            {lp > 1.4 && <div className="tr-accent">{scr('VERIFY.', seg(lp, 1.4, 1.7), 14, t)}</div>}
          </div>
          <div style={{ transform: `scale(${z})` }}>
            <Win2 title={`${brand.key}-vault — tail -f`} className="tr-win tr-win-c">
              <LogDemo n={4} kinds={['payout', 'buyback', 'claim', 'buy']} enterT={(i) => lp - i * 0.15} />
            </Win2>
          </div>
          {lp > 2.0 && <div className="tr-sub mono">every claim, buyback and payout links to its Solana transaction</div>}
        </div>
      </div>
    );
  },
};

const EndScene = {
  dur: 3.4,
  cues: (d) => [[0.05, 'hit'], [0.6, 'glitch'], [d - 1.2, 'chime']],
  render(lp, d, t) {
    const blink = Math.floor(lp * 4) % 2 === 0 || lp > 2.2;
    return (
      <div className="tr-scene">
        <div className="bg-grid tr-grid" />
        <div className="tr-center tr-end" style={{ opacity: 1 - seg(lp, d - 0.35, d) }}>
          <div className="tr-wm tr-wm-sm" style={{ transform: `scale(${1.15 - 0.15 * easeOut(seg(lp, 0, 0.3))})` }}>
            <Wordmark text={brand.name} />
          </div>
          <div className="tr-soon" style={{ opacity: lp > 0.5 ? (blink ? 1 : 0.15) : 0 }}>
            {scr('COMING SOON', seg(lp, 0.5, 0.9), 15, t)}
          </div>
          <div className="tr-url mono" style={{ opacity: seg(lp, 0.9, 1.2) }}>
            {brand.site} <span className="muted">·</span> @{brand.xHandle}
          </div>
          <ul className="hero-facts pixel tr-facts" style={{ opacity: seg(lp, 1.1, 1.4) }}>
            <li>
              <Px name="lock" size={18} /> no custody
            </li>
            <li>
              <Px name="eye" size={18} /> no kyc
            </li>
            <li>
              <Px name="clock" size={18} /> paid every 5 min
            </li>
          </ul>
        </div>
      </div>
    );
  },
};

const CUTS = {
  hype: HYPE,
  teaser: [Boot, HeroScene, WordScene, FeesScene, PayoutScene, FeaturesScene, EndScene],
  explainer: [Boot, { ...HeroScene, dur: 4.6 }, { ...WordScene, dur: 3.6 }, StepsScene, { ...FeesScene, dur: 5.5 }, { ...PayoutScene, dur: 4.8 }, ProofScene, { ...FeaturesScene, dur: 6.6 }, { ...EndScene, dur: 4.0 }],
};

const q = new URLSearchParams(window.location.search);
const cutName = CUTS[q.get('cut')] ? q.get('cut') : 'teaser';
const cut = CUTS[cutName];
const starts = [];
let total = 0;
for (const s of cut) {
  starts.push(total);
  total += s.dur;
}
const cues = cut.flatMap((s, i) => [...s.cues(s.dur).map(([ct, k]) => [+(starts[i] + ct).toFixed(3), k]), ...(i && !s.hard ? [[+(starts[i] - 0.18).toFixed(3), 'wipe']] : [])]).concat(cutName === 'hype' ? hypeMusic() : []).sort((a, b) => a[0] - b[0]);

const CELLS = Array.from({ length: 16 * 9 }, (_, i) => hash(i * 3.7));
function Wipe({ t }) {
  // pixel dissolve around each scene boundary
  let p = 0;
  for (const [k, b] of starts.entries()) {
    if (!k || cut[k].hard) continue;
    const x = (t - (b - 0.22)) / 0.44;
    if (x > 0 && x < 1) p = x;
  }
  if (!p) return null;
  return (
    <div className="tr-wipe">
      {CELLS.map((r, i) => {
        const on = p < 0.5 ? p * 2 > r : (p - 0.5) * 2 < r;
        return <i key={i} style={{ opacity: on ? 1 : 0 }} />;
      })}
    </div>
  );
}

function Trailer({ t }) {
  let idx = cut.length - 1;
  for (let i = 0; i < cut.length; i++) if (t < starts[i] + cut[i].dur) {
    idx = i;
    break;
  }
  const s = cut[idx];
  const lp = clamp(t - starts[idx], 0, s.dur);
  return (
    <div className={`stage v-${brand.key}`} style={{ '--n': brand.name.length }}>
      {s.render(lp, s.dur, t)}
      <Wipe t={t} />
      <div className="tr-grain" />
    </div>
  );
}

function App() {
  const [t, setT] = useState(0);
  const capture = q.get('capture') === '1';
  useLayoutEffect(() => {
    const r = document.documentElement;
    r.dataset.theme = brand.theme;
    r.dataset.vault = brand.key;
    r.style.setProperty('--accent', brand.accent);
    r.style.setProperty('--accent2', brand.accent2);
    r.style.setProperty('--accent-deep', brand.accentDeep);
    r.style.setProperty('--accent-text', brand.accentText);
    const fit = () => {
      const k = Math.min(window.innerWidth / W, window.innerHeight / H);
      document.documentElement.style.setProperty('--fit', capture ? 1 : k);
    };
    fit();
    window.addEventListener('resize', fit);
    window.__trailer = { duration: total, cues, fps: 60 };
    window.__seek = (time) => {
      flushSync(() => setT(time));
      document.querySelectorAll('.hero3d').forEach((el) => el.__seek?.(time));
      return true;
    };
    if (capture) return;
    let raf;
    const t0 = performance.now();
    const loop = (now) => {
      const time = ((now - t0) / 1000) % total;
      setT(time);
      document.querySelectorAll('.hero3d').forEach((el) => el.__seek?.(time));
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [capture]);
  return <Trailer t={t} />;
}

createRoot(document.getElementById('root')).render(<App />);
