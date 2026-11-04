// Hype cut: 48 beats at 128 BPM (22.5 s). Every cut, slam and count lands on
// the beat grid, and the soundtrack is generated from the same grid.
// Numbers and rows are a labelled UI preview, never real or fake proof.
import { brand } from './brand.js';
import { Wordmark } from './components.jsx';
import { Px } from './pixel.jsx';
import Hero3D from './Hero3D.jsx';

export const BPM = 128;
export const B = 60 / BPM;
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const seg = (t, a, b) => clamp((t - a) / (b - a));
const easeOut = (p) => 1 - Math.pow(1 - p, 3);
const easeOut5 = (p) => 1 - Math.pow(1 - p, 5);
const hash = (i) => {
  const x = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
};
const G = 'abcdefghkmnoprsuvwxz0123456789#%@$&*+=';
function scr(text, p, seed, t) {
  const f = Math.floor(t * 30);
  const done = Math.floor(clamp(p) * text.length);
  let s = '';
  for (let i = 0; i < text.length; i++) s += text[i] === ' ' || i < done ? text[i] : G[Math.floor(hash(i * 31 + seed * 7 + f) * G.length)];
  return s;
}
const tk = '$' + brand.ticker;
const fmt = (v) => Math.round(v).toLocaleString('en-US');
// 0..1 punch that peaks on each beat and decays over it
const pulse = (lp) => Math.exp(-((lp / B) % 1) * 5);
const beatOf = (lp) => Math.floor(lp / B + 1e-6);
const fit = (text, max) => Math.min(max, 1640 / (text.length * 1.02));
const Flash = ({ lp, strong = 0.85 }) => <div className="hy-flash" style={{ opacity: strong * (1 - seg(lp, 0, 0.12)) }} />;
const Preview = () => <div className="hy-preview pixel">ui preview · sample numbers</div>;

const Intro = {
  dur: 4 * B,
  hard: true,
  cues: () => [[0, 'glitch'], [B, 'type'], [B * 1.25, 'type'], [B * 1.5, 'type'], [B * 1.75, 'type'], [B * 2, 'type'], [B * 2.5, 'type'], [B * 3, 'glitch']],
  render(lp, d, t) {
    const cmd = brand.trailer.cmd;
    const n = Math.floor(seg(lp, B, 3 * B) * cmd.length);
    const blocks = Math.floor(seg(lp, 2.5 * B, 4 * B) * 24);
    return (
      <div className="tr-scene hy-black">
        <div className="hy-cmd mono">
          <div>
            <span className="tr-accent">$</span> {cmd.slice(0, n)}
            <span className="hy-caret" style={{ opacity: Math.floor(t * 4) % 2 ? 1 : 0 }}>▮</span>
          </div>
          <div className="hy-blocks">
            {Array.from({ length: 24 }, (_, i) => (
              <i key={i} className={i < blocks ? 'on' : ''} />
            ))}
          </div>
          <div className="hy-status pixel">{lp > 3 * B ? scr('ACCESS GRANTED', seg(lp, 3 * B, 3.6 * B), 4, t) : 'decrypting…'}</div>
        </div>
      </div>
    );
  },
};

const Hook = {
  dur: 4 * B,
  hard: true,
  cues: () => [0, 1, 2, 3].map((i) => [i * B, i === 3 ? 'hit' : 'slam']),
  render(lp) {
    const words = [...brand.trailer.hook[0].split(' '), brand.trailer.hook[1]];
    const i = Math.min(3, beatOf(lp));
    const p = pulse(lp);
    const inv = i === 3;
    return (
      <div className={`tr-scene hy-word ${inv ? 'inv' : ''}`}>
        <div className="hy-big" style={{ fontSize: fit(words[i], 300), transform: `scale(${1 + 0.18 * p}) rotate(${(i % 2 ? -1 : 1) * 1.5 * p}deg)` }}>
          {words[i]}
        </div>
        <Flash lp={lp % B} strong={0.5} />
      </div>
    );
  },
};

const Coin = {
  dur: 4 * B,
  hard: true,
  cues: () => [[0, 'hit'], [2 * B, 'slam'], [3 * B, 'slam'], [4 * B, 'riser']],
  render(lp) {
    const z = 1.04 + 0.05 * easeOut(seg(lp, 0, 4 * B)) + 0.02 * pulse(lp);
    return (
      <div className="tr-scene hy-black">
        <div className="viewport tr-vp hy-vp" style={{ transform: `scale(${z})` }}>
          <Hero3D kind={brand.emblem} accent={brand.accent} accent2={brand.accent2} manual hint={false} />
          <div className="vp-scan" />
        </div>
        <div className="hy-coin-title">
          {lp > 2 * B && <div style={{ transform: `scale(${1 + 0.12 * pulse(lp - 2 * B)})` }}>HOLD <span className="tr-accent">{tk}</span></div>}
          {lp > 3 * B && <div className="hy-sub">GET PAID EVERY 5 MIN</div>}
        </div>
        <Flash lp={lp} />
      </div>
    );
  },
};

const Money = {
  dur: 8 * B,
  hard: true,
  cues: () => [[0, 'hit'], ...Array.from({ length: 28 }, (_, i) => [0.2 + i * (B / 4), 'tick']), [6 * B, 'slam'], [7 * B, 'slam'], [8 * B, 'riser']],
  render(lp, d, t) {
    const p = easeOut5(seg(lp, 0.1, 6 * B));
    const v = 4210000 * p;
    const usd = 126300 * p;
    const shake = pulse(lp) * 6;
    return (
      <div className="tr-scene hy-gold">
        <div className="hy-rays" style={{ transform: `rotate(${t * 18}deg)` }} />
        <div className="hy-coins">
          {Array.from({ length: 26 }, (_, i) => {
            const y = ((hash(i) * 1200 + lp * (380 + hash(i + 3) * 500)) % 1300) - 120;
            return <i key={i} style={{ left: `${hash(i + 9) * 100}%`, transform: `translateY(${y}px) rotate(${lp * 200 * (hash(i) - 0.5)}deg)`, opacity: 0.25 + hash(i + 1) * 0.5 }} />;
          })}
        </div>
        <div className="hy-money">
          <div className="pixel hy-label">paid to holders</div>
          <div className="hy-num mono" style={{ transform: `translate(${(hash(beatOf(lp)) - 0.5) * shake}px, ${(hash(beatOf(lp) + 5) - 0.5) * shake}px)` }}>
            {fmt(v)}
            <span className="hy-tk"> {tk}</span>
          </div>
          <div className="hy-usd mono">≈ ${fmt(usd)}</div>
          {lp > 6 * B && <div className="hy-stamp" style={{ transform: `rotate(-6deg) scale(${1 + 0.3 * pulse(lp - 6 * B)})` }}>EVERY 5 MIN</div>}
          {lp > 7 * B && <div className="hy-stamp s2" style={{ transform: `rotate(4deg) scale(${1 + 0.3 * pulse(lp - 7 * B)})` }}>TO EVERY HOLDER</div>}
        </div>
        <Preview />
        <Flash lp={lp} />
      </div>
    );
  },
};

const Split = {
  dur: 4 * B,
  hard: true,
  cues: () => [[0, 'hit'], [B, 'slam'], [2 * B, 'slam'], [3 * B, 'slam']],
  render(lp) {
    const i = Math.min(3, beatOf(lp));
    const R = 300;
    const C = 2 * Math.PI * R;
    const segs = [
      [80, 'var(--accent)'],
      [10, '#ff3d2e'],
      [10, 'rgba(255,255,255,0.25)'],
    ];
    let acc = 0;
    const labels = [
      ['80%', 'TO HOLDERS'],
      ['10%', 'BOUGHT + BURNED'],
      ['10%', 'RUNS THE PROJECT'],
      ['100%', 'ON-CHAIN'],
    ];
    return (
      <div className="tr-scene hy-black">
        <svg viewBox="0 0 800 800" className="hy-ring">
          <circle cx="400" cy="400" r={R} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="70" />
          {segs.map(([pct, col], k) => {
            const len = (pct / 100) * C;
            const shown = k < i + 1 ? easeOut(seg(lp - k * B, 0, 0.3)) : 0;
            const el = <circle key={k} cx="400" cy="400" r={R} fill="none" stroke={col} strokeWidth={k === i ? 92 : 70} strokeDasharray={`${Math.max(0, len * shown - 6)} ${C}`} strokeDashoffset={-acc} transform="rotate(-90 400 400)" />;
            acc += len;
            return el;
          })}
        </svg>
        <div className="hy-split" style={{ transform: `scale(${1 + 0.1 * pulse(lp)})` }}>
          <b className="mono" style={{ color: i === 1 ? '#ff3d2e' : i === 2 ? '#ddd' : 'var(--accent)' }}>{labels[i][0]}</b>
          <span>{labels[i][1]}</span>
        </div>
        <Flash lp={lp % B} strong={0.35} />
      </div>
    );
  },
};

const Swap = {
  dur: 6 * B,
  hard: true,
  cues: () => [[0, 'hit'], [0.5 * B, 'type'], [0.75 * B, 'type'], [1 * B, 'type'], ...Array.from({ length: 8 }, (_, i) => [1.25 * B + i * (B / 4), 'tick']), [3 * B, 'slam'], [4.5 * B, 'click'], [5 * B, 'chime']],
  render(lp) {
    const typed = '2.5'.slice(0, Math.floor(seg(lp, 0.5 * B, 1.25 * B) * 3.01));
    const out = 1284551 * easeOut(seg(lp, 1.25 * B, 3 * B));
    const pressed = lp > 4.5 * B && lp < 4.8 * B;
    const sent = lp > 5 * B;
    return (
      <div className="tr-scene hy-black">
        <div className="hy-swap-title">
          BUY <span className="tr-accent">{tk}</span> AT <span className="hy-zero">0%</span> FEE
        </div>
        <div className="swap hy-swap" style={{ transform: `scale(${1.5 + 0.03 * pulse(lp)})` }}>
          <div className="swap-head">
            <b>Swap</b>
            <span className="fee0 pixel">0% platform fee</span>
          </div>
          <div className="swap-box">
            <span className="pixel muted">you pay</span>
            <div className="swap-row">
              <output className="got">{typed || '0'}</output>
              <span className="tk on">SOL</span>
            </div>
          </div>
          <div className="swap-box">
            <span className="pixel muted">you get</span>
            <div className="swap-row">
              <output className="got">{out ? fmt(out) : '—'}</output>
              <span className="tk on">{tk}</span>
            </div>
          </div>
          <button className="btn swap-go" style={{ transform: pressed ? 'translateY(4px)' : undefined }}>
            {sent ? 'Sent ✓' : 'Swap'}
          </button>
          {sent && <div className="swap-ok">Swap sent. view on solscan ↗</div>}
        </div>
        {lp > 3 * B && (
          <div className="hy-stamp hy-stamp-fee" style={{ transform: `rotate(-8deg) scale(${1 + 0.4 * pulse(lp - 3 * B)})` }}>
            0% FEE
          </div>
        )}
        <Preview />
        <Flash lp={lp} />
      </div>
    );
  },
};

const NAMES = ['night_owl', 'ghost_01', 'cipher', 'quiet_one', 'zero_trace', 'shade', 'umbra', 'veil', 'stealthy', 'no_kyc', 'mixer_mike', 'driftwood'];
const KINDS = ['buy', 'paid', 'buy', 'burn', 'paid', 'sell', 'buy', 'paid', 'burn', 'buy', 'paid', 'buy'];
const Flood = {
  dur: 6 * B,
  hard: true,
  cues: () => [[0, 'hit'], ...Array.from({ length: 12 }, (_, i) => [i * (B / 2), i % 2 ? 'tick' : 'click']), [6 * B, 'riser']],
  render(lp) {
    const n = Math.min(12, Math.floor(lp / (B / 2)) + 1);
    const burned = 18400000 * easeOut(seg(lp, 0, 6 * B));
    const rows = Array.from({ length: n }, (_, i) => n - 1 - i);
    return (
      <div className="tr-scene hy-black">
        <div className="hy-flood">
          <div className="lpanel hy-panel">
            <div className="lp-head">
              <b>Happening right now</b>
              <span className="pixel muted">sample feed</span>
            </div>
            <div className="lp-list">
              {rows.slice(0, 8).map((k) => {
                const kind = KINDS[k];
                const amt = fmt(20000 + hash(k) * 900000);
                return (
                  <div key={k} className={`lrow move k-${kind}`} style={{ opacity: k === n - 1 ? seg(lp % (B / 2), 0, 0.06) : 1 }}>
                    <span className={`mv-ic k-${kind === 'paid' ? 'payout' : kind}`}>
                      <Px name={kind === 'burn' ? 'flame' : kind === 'paid' ? 'coins' : 'swap'} size={22} />
                    </span>
                    <span className={`mv-tag pixel hy-k-${kind}`}>{kind.toUpperCase()}</span>
                    <span className="mv-text">
                      {kind === 'burn' ? `Vault burned ${amt} ${tk}` : kind === 'paid' ? `@${NAMES[k]} received ${fmt(800 + hash(k + 2) * 9000)} ${tk}` : `@${NAMES[k]} ${kind === 'buy' ? 'bought' : 'sold'} ${amt} ${tk}`}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="hy-burn">
            <span className="pixel">
              <Px name="flame" size={28} /> burned forever
            </span>
            <b className="mono" style={{ transform: `scale(${1 + 0.06 * pulse(lp)})` }}>{fmt(burned)}</b>
            <span className="mono">{tk}</span>
          </div>
        </div>
        <Preview />
        <Flash lp={lp} />
      </div>
    );
  },
};

const Bullets = {
  dur: 4 * B,
  hard: true,
  cues: () => [0, 1, 2, 3].map((i) => [i * B, 'slam']),
  render(lp) {
    const words = ['EVERY 5 MINUTES', 'NO STAKING', 'NO KYC', 'PROOF ON SOLSCAN'];
    const i = Math.min(3, beatOf(lp));
    return (
      <div className={`tr-scene hy-word ${i % 2 ? 'inv' : ''}`}>
        <div className="hy-big" style={{ fontSize: fit(words[i], 300), transform: `scale(${1 + 0.15 * pulse(lp)})` }}>
          {words[i]}
        </div>
        <Flash lp={lp % B} strong={0.4} />
      </div>
    );
  },
};

const End = {
  dur: 8 * B,
  hard: true,
  cues: () => [[0, 'hit'], [B, 'glitch'], [2 * B, 'slam'], [4 * B, 'chime'], [6 * B, 'slam']],
  render(lp, d, t) {
    const blink = lp < 4 * B ? Math.floor(lp / (B / 2)) % 2 === 0 : true;
    return (
      <div className="tr-scene hy-black">
        <div className="hy-rays dim" style={{ transform: `rotate(${t * 10}deg)` }} />
        <div className="tr-center tr-end" style={{ opacity: 1 - seg(lp, d - 0.4, d) }}>
          <div className="tr-wm tr-wm-sm" style={{ transform: `scale(${1.25 - 0.25 * easeOut(seg(lp, 0, 0.3)) + 0.03 * pulse(lp)})` }}>
            <Wordmark text={brand.name} />
          </div>
          <div className="hy-soon" style={{ fontSize: fit('LAUNCHING SOON', 150) * 0.9, opacity: lp > B ? (blink ? 1 : 0.2) : 0 }}>
            {scr('LAUNCHING SOON', seg(lp, B, 2 * B), 15, t)}
          </div>
          <div className="tr-url mono" style={{ opacity: seg(lp, 2 * B, 2.4 * B) }}>
            {brand.site} <span className="muted">·</span> @{brand.xHandle}
          </div>
          <div className="hy-end-facts pixel" style={{ opacity: seg(lp, 3 * B, 3.4 * B) }}>
            80% to holders · 10% burned · 0% swap fee
          </div>
        </div>
        <Flash lp={lp} />
      </div>
    );
  },
};

export const HYPE = [Intro, Hook, Coin, Money, Split, Swap, Flood, Bullets, End];

// Music grid for the soundtrack: four-on-the-floor kick, claps on 2 and 4,
// offbeat hats and a sub line, with a drop at beat 8 and a break at 40.
export function hypeMusic() {
  const cues = [[0, 'nodrone']];
  const roots = ['bass:0', 'bass:0', 'bass:-2', 'bass:-4'];
  for (let b = 0; b < 48; b++) {
    const t = +(b * B).toFixed(4);
    const drop = b >= 8 && b < 46;
    if (b >= 4 && b !== 11 && b !== 35) cues.push([t, 'kick']);
    if (drop && b % 2 === 1) cues.push([t, 'clap']);
    if (drop) cues.push([+(t + B / 2).toFixed(4), 'hat']);
    if (b >= 12 && b < 46 && b % 2 === 0) cues.push([t, 'hat2']);
    if (drop) cues.push([+(t + B / 2).toFixed(4), roots[Math.floor((b - 8) / 4) % 4]]);
  }
  cues.push([8 * B, 'crash'], [24 * B, 'crash'], [40 * B, 'crash']);
  return cues;
}
