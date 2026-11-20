// Zatoshi ($ZATS) ad 2: fast-cut product trailer. Glass UI cards in CSS 3D,
// kinetic slams, color floods, logos, a shader background and the 3D coin
// for the two hero moments. One timeline; window.__seek(t) renders any frame.
//
// URL params: ?cut=main (16:9) | ?cut=vertical (9:16)  ?capture=1  ?t=12
import '@fontsource-variable/archivo/wdth.css';
import '@fontsource/geist-sans/400.css';
import '@fontsource/geist-sans/500.css';
import '@fontsource/geist-sans/700.css';
import '@fontsource/geist-sans/800.css';
import '@fontsource/geist-pixel/400.css';
import '@fontsource/geist-mono/400.css';
import '@fontsource/geist-mono/500.css';
import '@fontsource/geist-mono/600.css';
import './ad2.css';
import * as THREE from 'three';
import { clamp, lin, ease, mix, makeEnv, makeCoin, TONE } from '../ad/world.js';
import { el, txt, show, typeText } from '../ad/text.js';
import { makeBG, bgDefaults, hex, PAL } from './bg.js';
import * as L from './logos.js';

const X_HANDLE = '@zatoshi_sol';

const params = new URLSearchParams(location.search);
const CUT = params.get('cut') || 'main';
const P = CUT === 'vertical';
const W = P ? 1080 : 1920;
const H = P ? 1920 : 1080;
const DPR = Number(params.get('dpr') || window.devicePixelRatio || 1);
const lay = (a, b) => (P ? b : a);

// ---------- stage ----------
const root = document.getElementById('root');
const stage = el('div', 'stage' + (P ? ' portrait' : ''), null, root);
stage.style.width = W + 'px';
stage.style.height = H + 'px';
const fit = () => stage.style.setProperty('--fit', Math.min(innerWidth / W, innerHeight / H));
fit();
addEventListener('resize', fit);

const bgCanvas = el('canvas', 'bg', null, stage);
bgCanvas.width = W * DPR;
bgCanvas.height = H * DPR;
const bg = makeBG(bgCanvas);
let BG = bgDefaults();

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(DPR);
renderer.setSize(W, H, false);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.setClearColor(0x000000, 0);
renderer.domElement.className = 'gl';
stage.appendChild(renderer.domElement);
const scene3 = new THREE.Scene();
const cam3 = new THREE.PerspectiveCamera(30, W / H, 0.1, 100);
cam3.position.set(0, 0, 12);
const coin = makeCoin();
const coinPivot = new THREE.Group();
coinPivot.add(coin);
scene3.add(coinPivot);
const key = new THREE.DirectionalLight(0xfff0d8, 3.2);
key.position.set(4, 5, 6);
const rim = new THREE.PointLight(TONE.gold, 80, 30);
rim.position.set(-4, 1, -4);
scene3.add(key, rim, new THREE.AmbientLight(0xffffff, 0.1));
let COIN = null;

const ov = el('div', 'ov', null, stage);
const flashEl = el('div', 'flash', null, stage);
const wipeEl = el('div', 'wipe', '<i></i><i></i>', stage);
const grain = el('div', 'grain', null, stage);
{
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const x = c.getContext('2d');
  const d = x.createImageData(256, 256);
  for (let i = 0; i < d.data.length; i += 4) {
    const v = Math.random() * 255;
    d.data[i] = d.data[i + 1] = d.data[i + 2] = v;
    d.data[i + 3] = 255;
  }
  x.putImageData(d, 0, 0);
  grain.style.backgroundImage = `url(${c.toDataURL()})`;
}

// ---------- helpers ----------
const hsh = (a) => {
  const v = Math.sin(a * 91.7 + 13.1) * 43758.5453;
  return v - Math.floor(v);
};
const fmt = (n, d = 0) => n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });

function layer() {
  const ly = el('div', 'scene', null, ov);
  const persp = el('div', 'persp', null, ly);
  const space = el('div', 'space', null, persp);
  return { ly, space };
}
// camera on a scene's 3D space
function cam(space, { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0 } = {}) {
  const k = P ? 1.0 : 1.4;
  space.style.transform = `translate3d(${-x}px, ${-y + (P ? 120 : 0)}px, ${z}px) scale(${k}) rotateX(${rx}deg) rotateY(${ry}deg) rotateZ(${rz}deg)`;
}
function card(parent, cls, html) {
  const n = el('div', 'card ' + (cls || ''), html, parent);
  n.style.visibility = 'hidden';
  return n;
}
// Place a card: base pose b, entering from b+from over dur, leaving at t1.
function fly(n, t, t0, t1, b, o = {}) {
  const { from = { z: -500, y: 60 }, dur = 0.7, out = 0.35, to = { z: 300 }, focus = 0, dof = 0.014, spin = 0 } = o;
  if (t < t0 || t > t1 + out) {
    n.style.visibility = 'hidden';
    return 0;
  }
  const p = ease.out5(lin(t, t0, t0 + dur));
  const q = ease.in(lin(t, t1, t1 + out));
  const g = (k, d = 0) => (b[k] ?? d) + (from[k] ?? 0) * (1 - p) + (to[k] ?? 0) * q;
  const x = g('x');
  const y = g('y');
  const z = g('z');
  const rx = g('rx');
  const ry = g('ry') + spin * (1 - p);
  const rz = g('rz');
  const s = (b.s ?? 1) * (from.s != null ? mix(from.s, 1, p) : 1);
  n.style.visibility = 'visible';
  n.style.opacity = String(clamp(p * 1.6) * (1 - q));
  n.style.transform = `translate(-50%, -50%) translate3d(${x}px, ${y}px, ${z}px) rotateX(${rx}deg) rotateY(${ry}deg) rotateZ(${rz}deg) scale(${s})`;
  const blur = Math.min(16, Math.abs(z - focus) * dof + (1 - p) * 10 + q * 10);
  n.style.filter = blur > 0.4 ? `blur(${blur.toFixed(1)}px)` : '';
  return p;
}
// headline (2D, top-left)
function head(ly, html, cls = '') {
  return txt(ly, 'hl ' + cls, html);
}
function sub(ly, html, cls = '') {
  return txt(ly, 'sub ' + cls, html);
}
// a slam word: big, blurred in, chromatic, hard cut out
function slamEl(ly, html, cls = '') {
  const n = el('div', 'slam ' + cls, `<div class="ghost">${(html.replace(/<[^>]+>/g, '') + ' ').repeat(4)}</div><div class="ghost g2">${(html.replace(/<[^>]+>/g, '') + ' ').repeat(4)}</div><div class="sw">${html}</div>`, ly);
  n.style.display = 'none';
  return n;
}
function slam(n, t, t0, t1, o = {}) {
  const { from = 1.6, skew = -10, dir = 1 } = o;
  if (t < t0 || t >= t1) {
    n.style.display = 'none';
    return 0;
  }
  n.style.display = '';
  const p = ease.out5(lin(t, t0, t0 + 0.32));
  const drift = (t - t0) * 0.04;
  const w = n.lastChild;
  w.style.transform = `scale(${mix(from, 1, p) + drift}) skewX(${skew * (1 - p)}deg) translateX(${(1 - p) * 80 * dir}px)`;
  w.style.filter = p < 1 ? `blur(${((1 - p) * 26).toFixed(1)}px)` : '';
  const ab = (1 - p) * 22 + 3;
  w.style.textShadow = `${ab}px 0 0 rgba(255,40,80,${0.55 * (1 - p) + 0.2}), ${-ab}px 0 0 rgba(40,220,255,${0.55 * (1 - p) + 0.2})`;
  const gs = n.querySelectorAll('.ghost');
  gs[0].style.transform = `translateX(${-200 - (t - t0) * 260 * dir}px)`;
  gs[1].style.transform = `translateX(${-600 + (t - t0) * 260 * dir}px)`;
  gs[0].style.opacity = gs[1].style.opacity = String(0.9 * p);
  return p;
}
function hold(n, t, t0, t1) {
  n.style.visibility = t >= t0 && t < t1 ? 'visible' : 'hidden';
}
const tag = (ly, text = 'UI preview · sample numbers') => el('div', 'tagline', text, ly);

// ---------- reusable UI ----------
// Candlestick chart as inline SVG: n candles, a drifting walk with a trend.
function candles(n, seed, w, h, trend = 0.8) {
  let v = 0;
  const pts = [];
  for (let i = 0; i < n; i++) {
    const o = v;
    const step = (hsh(seed * 31 + i) - 0.42) * 2.6 + trend;
    const c = o + step;
    const hi = Math.max(o, c) + hsh(seed * 7 + i * 3) * 0.9;
    const lo = Math.min(o, c) - hsh(seed * 5 + i * 11) * 0.9;
    pts.push([o, c, hi, lo]);
    v = c;
  }
  const mn = Math.min(...pts.map((q) => q[3]));
  const mx = Math.max(...pts.map((q) => q[2]));
  const Y = (x) => h - 6 - ((x - mn) / (mx - mn)) * (h - 12);
  const cw = w / n;
  let g = '';
  pts.forEach(([o, c, hi, lo], i) => {
    const up = c >= o;
    const x = i * cw + cw / 2;
    const y0 = Y(Math.max(o, c));
    const y1 = Y(Math.min(o, c));
    g += `<g class="cd ${up ? 'up' : 'dn'}"><line x1="${x}" x2="${x}" y1="${Y(hi)}" y2="${Y(lo)}"/><rect x="${x - cw * 0.32}" y="${y0}" width="${cw * 0.64}" height="${Math.max(2, y1 - y0)}" rx="1.5"/></g>`;
  });
  return `<svg class="cds" viewBox="0 0 ${w} ${h}" width="100%" preserveAspectRatio="none">${g}</svg>`;
}
function revealCandles(svg, p) {
  const gs = svg.children;
  const k = p * gs.length;
  for (let i = 0; i < gs.length; i++) gs[i].style.opacity = String(clamp(k - i));
}
const coinDot = () => L.zec(34);
function feedRow(kind, who, what, extra = '') {
  const map = { buy: ['trade', 'BUY', '⇄'], sell: ['sell', 'SELL', '⇄'], paid: ['pay', 'PAID', '◆'], burn: ['burn', 'BURN', '▲'], join: ['people', 'JOINED', '●'] };
  const [tone, lab, ic] = map[kind];
  return `<div class="frow tone-${tone}"><span class="fic">${ic}</span><span class="flab">${lab}</span><span class="fwho">${who}</span><span class="fwhat">${what}</span>${extra}<span class="fsam">SAMPLE</span></div>`;
}

// ---------- scenes ----------
const SHOTS = {};

// 1. Hook: notifications while you do nothing
SHOTS.hook = {
  dur: 6,
  music: 'intro',
  cues: [[0.25, 'type'], [1.1, 'tick'], [2.0, 'chime'], [2.6, 'tick'], [3.5, 'chime'], [4.4, 'tick'], [5.0, 'coins'], [5.85, 'whoosh']],
  build() {
    const { ly, space } = layer();
    const phone = card(space, 'phone', `
      <div class="ph-top">${L.phantom(34)}<b>Main wallet</b><span class="ph-net">${L.solana(20)} Solana</span></div>
      <div class="ph-bal">${L.zec(52)}<span class="mono" data-k="bal">0.4812</span><em>ZEC</em></div><div class="ph-hold">holding <b class="mono">1,250,000 $ZATS</b></div>
      <div class="ph-label">Activity</div>
      <div class="ph-list"></div>`);
    const list = phone.querySelector('.ph-list');
    const bal = phone.querySelector('[data-k=bal]');
    const amts = [0.0142, 0.0131, 0.0156, 0.0138, 0.0129, 0.0149];
    const rows = amts.map((a, i) =>
      el('div', 'ph-row', `${coinDot()}<div><b>Received</b><small>from Zatoshi vault</small></div><span class="mono">+${fmt(a, 4)} ZEC</span><i>${(i + 1) * 5}m ago</i>`, list),
    );
    const toasts = [0, 1, 2].map((i) =>
      card(space, `toast tone-${['pay', 'trade', 'people'][i]}`, `<span class="tic">${L.zec(30)}</span><div><small>PAID · just now</small><b>@you received ${fmt(amts[i], 4)} ZEC</b></div><span class="fsam">SAMPLE</span>`),
    );
    const h1 = head(ly, "you didn't <em class=\"c-muted\">stake.</em>", 'l1');
    const h2 = head(ly, "you didn't <em class=\"c-muted\">claim.</em>", 'l2');
    const h3 = head(ly, 'you still got paid<br>in <em>ZEC.</em>', 'l3');
    const zc = card(space, 'chip big', `${L.zec(34)}<span>paid in ZEC · wrapped on Solana</span>`);
    tag(ly);
    return (t) => {
      cam(space, { z: mix(-220, 40, ease.inOut(lin(t, 0, 6))), ry: mix(-16, -6, ease.inOut(lin(t, 0, 6))), rx: 4 });
      fly(phone, t, 0, 9, { x: lay(390, 0), y: lay(60, 330), z: 0, ry: -4 }, { from: { z: -400, y: 120, rx: 20 }, dur: 1.1 });
      // rows arrive newest-first
      const shown = Math.floor(clamp((t - 0.9) / 0.9, 0, 6));
      rows.forEach((r, i) => {
        const k = shown - 1 - i;
        const age = t - (0.9 + (shown - 1 - i) * 0.9);
        r.style.display = k >= 0 && k < 5 ? '' : 'none';
        r.style.order = String(k);
        r.style.opacity = k === 0 ? String(clamp(age * 5)) : '1';
        r.classList.toggle('fresh', k === 0 && age < 0.6);
      });
      const got = amts.slice(0, shown).reduce((a, b) => a + b, 0);
      bal.textContent = fmt(0.4812 + got, 4);
      toasts.forEach((n, i) => {
        const t0 = 1.0 + i * 1.5;
        fly(n, t, t0, t0 + 1.3, { x: lay(-360 + i * 30, -40 + i * 30), y: lay(70 + i * 90, -560 + i * 110), z: 160 + i * 30, ry: 8 }, { from: { z: -700, x: -120 }, dur: 0.6, focus: 60 });
      });
      show(h1, t, 0.25, 1.75, { stagger: 0.03, out: 0.15 });
      show(h2, t, 1.8, 3.35, { stagger: 0.03, out: 0.15 });
      show(h3, t, 3.4, 6, { stagger: 0.03, out: 0.15 });
      fly(zc, t, 3.6, 9, { x: lay(-380, 0), y: lay(150, 640), z: 60 }, { from: { z: -300, y: 40 }, focus: 60 });
    };
  },
};

// 2. Logo reveal on the drop
SHOTS.logo = {
  dur: 4,
  music: 'drop',
  cues: [[0, 'whoosh'], [0.7, 'stab'], [1.35, 'stab_hi'], [2, 'riser:2'], [2, 'drop'], [2.2, 'shimmer']],
  build() {
    const { ly } = layer();
    const s1 = slamEl(ly, 'WHAT IF', 'white');
    const s2 = slamEl(ly, 'YOU JUST', 'white');
    const s3 = slamEl(ly, '<span class="gold">HELD?</span>', 'white');
    const lockup = el('div', 'lockup', `<div class="lk-row">${L.zatoshi(lay(176, 136))}<div class="wm">zatoshi</div></div>
      <div class="lk-sub"><span class="pill gold">$ZATS</span><span>HOLD IT. EARN</span>${L.zec(34)}<span>ZEC ON</span>${L.solana(30)}<span>SOLANA</span></div>`, ly);
    return (t) => {
      BG.tun = t < 2 ? 0.4 + lin(t, 0, 2) * 0.9 : 1.1 * Math.exp(-(t - 2) * 0.8) + 0.25;
      BG.tunSpeed = t < 2 ? 0.6 + t * 0.6 : 0.25;
      BG.ring = t < 2 ? 0 : Math.exp(-(t - 2) * 1.5);
      BG.ringR = 0.1 + (t - 2) * 0.5;
      BG.dots = t > 2 ? 0.7 : 0;
      BG.stars = 1;
      slam(s1, t, 0, 0.7);
      slam(s2, t, 0.7, 1.35, { dir: -1 });
      slam(s3, t, 1.35, 2);
      const on = t >= 2;
      lockup.style.display = on ? '' : 'none';
      if (on) {
        const p = ease.out5(lin(t, 2, 2.5));
        lockup.style.transform = `translate(-50%, -50%) scale(${mix(1.4, 1, p) + (t - 2) * 0.02})`;
        lockup.style.filter = p < 1 ? `blur(${(1 - p) * 20}px)` : '';
        lockup.querySelector('.wm').style.letterSpacing = `${mix(0.3, 0.06, ease.out(lin(t, 2, 4)))}em`;
        lockup.querySelector('.lk-sub').style.opacity = String(lin(t, 2.5, 3));
      }
    };
  },
};

// 3. No staking / no claiming / no sign-up / just hold
SHOTS.nots = {
  dur: 6,
  music: 'stops',
  cues: [[0, 'impact'], [1.5, 'impact'], [1.5, 'glitch'], [3, 'impact'], [4.5, 'drop'], [4.5, 'glitch']],
  build() {
    const { ly } = layer();
    const a = slamEl(ly, 'NO STAKING.', 'dark');
    const b = slamEl(ly, 'NO CLAIMING.', 'dark');
    const c = slamEl(ly, 'NO SIGN-UP.', 'white');
    const d = slamEl(ly, 'JUST <span class="gold">HOLD.</span>', 'white huge');
    return (t) => {
      if (t < 1.5) BG.flood = [...hex(PAL.cream), 1];
      else if (t < 3) BG.flood = [...hex(PAL.sage), 1];
      else if (t < 4.5) BG.flood = [...hex('#3F566E'), 1];
      else {
        BG.tun = 0.9;
        BG.tunSpeed = 0.5;
        BG.ring = Math.exp(-(t - 4.5) * 2);
        BG.ringR = 0.2 + (t - 4.5) * 0.4;
      }
      slam(a, t, 0, 1.5);
      slam(b, t, 1.5, 3, { dir: -1 });
      slam(c, t, 3, 4.5);
      slam(d, t, 4.5, 6, { from: 2 });
    };
  },
};

// 4. Every trade pays the vault
SHOTS.fees = {
  dur: 6,
  music: 'verse',
  cues: [[0.5, 'blips'], [1.4, 'click'], [2.2, 'tick'], [3.0, 'tick'], [3.8, 'tick'], [4.6, 'tick'], [5.85, 'whoosh']],
  build() {
    const { ly, space } = layer();
    const board = card(space, 'board', `<div class="win-top"><i></i><i></i><i></i><span>zatoshi — live</span><span class="live">● LIVE</span></div><div class="fl"></div>`);
    const fl = board.querySelector('.fl');
    const data = [
      ['buy', '@ghost_01', 'bought 824.9K $ZATS for 1.302 SOL'],
      ['sell', '@lowkey_lu', 'sold 210.4K $ZATS for 0.331 SOL'],
      ['buy', '@mixer_mike', 'bought 316.3K $ZATS for 0.511 SOL'],
      ['buy', '@night_owl', 'bought 1.2M $ZATS for 1.94 SOL'],
      ['sell', '@veil', 'sold 98.1K $ZATS for 0.152 SOL'],
      ['buy', '@cipher', 'bought 440.0K $ZATS for 0.701 SOL'],
      ['buy', '@umbra', 'bought 612.7K $ZATS for 0.97 SOL'],
      ['sell', '@shade', 'sold 150.2K $ZATS for 0.24 SOL'],
    ];
    const rows = data.map(([k, w, s]) => el('div', 'frw', feedRow(k, w, s, '<span class="fee">fee → vault</span>'), fl));
    const pump = card(space, 'mini tone-trade', `${L.pumpfun(56)}<div><small>TRADES ON</small><b>Pump.fun</b><p>Every buy and sell pays a creator fee into the vault wallet.</p></div>`);
    const fees = card(space, 'stat tone-vault', `<small>CREATOR FEES TO THE VAULT</small><div class="big mono"><span data-k="f">0.00</span> <em>SOL</em></div><div class="spark">${candles(18, 3, 380, 110, 0.35)}</div><div class="cap">$ZATS · 5m candles</div>`);
    const fv = fees.querySelector('[data-k=f]');
    const sp = fees.querySelector('.cds');
    const sol = card(space, 'chip big', `${L.solana(30)}<span>Solana</span>`);
    const h1 = head(ly, 'every trade');
    const h2 = head(ly, '<em class="c-trade">pays the vault.</em>', 'l2');
    tag(ly);
    return (t) => {
      cam(space, { z: mix(-120, 80, ease.inOut(lin(t, 0, 6))), ry: mix(14, 6, lin(t, 0, 6)), rx: 6, x: mix(-40, 40, lin(t, 0, 6)) });
      const b = fly(board, t, 0, 9, { x: lay(330, 0), y: lay(150, 120), z: 0, ry: -12, s: lay(0.88, 1) }, { from: { z: -600, ry: 30 }, dur: 1 });
      void b;
      const scroll = (t * 1.25) % data.length;
      rows.forEach((r, i) => {
        const k = (i - scroll + data.length * 4) % data.length;
        r.style.transform = `translateY(${k * 74}px)`;
        r.style.opacity = String(clamp(1 - Math.abs(k - 2.5) / 3.8) * clamp(lin(t, 0.3 + i * 0.12, 0.6 + i * 0.12)));
      });
      fly(pump, t, 1.2, 9, { x: lay(-330, -230), y: lay(255, -330), z: lay(20, 180), ry: 12 }, { from: { z: -500, x: -200 }, focus: 120 });
      fly(fees, t, 1.9, 9, { x: lay(-350, 210), y: lay(60, 640), z: lay(0, 90), ry: 10 }, { from: { z: -500, y: 120 }, focus: 120 });
      fly(sol, t, 2.6, 9, { x: lay(640, 300), y: lay(-300, -620), z: 260, ry: -10 }, { from: { z: -400 }, focus: 120 });
      fv.textContent = (38.4 * ease.out(lin(t, 1.9, 5.5))).toFixed(2);
      revealCandles(sp, ease.out(lin(t, 2, 5)));
      show(h1, t, 0.2, 9, { stagger: 0.03 });
      show(h2, t, 1.0, 9, { stagger: 0.025 });
    };
  },
};

// 5. The split
SHOTS.split = {
  dur: 6,
  music: 'verse',
  cues: [[0.4, 'split'], [1.3, 'impact_soft'], [2.0, 'impact_soft'], [2.7, 'impact_soft'], [5.85, 'whoosh']],
  build() {
    const { ly, space } = layer();
    const C = 2 * Math.PI * 120;
    const donut = card(space, 'donut', `<svg viewBox="0 0 300 300"><circle cx="150" cy="150" r="120" class="dtrack"/>
      <circle cx="150" cy="150" r="120" class="dseg s1" stroke-dasharray="0 ${C}"/>
      <circle cx="150" cy="150" r="120" class="dseg s2" stroke-dasharray="0 ${C}"/>
      <circle cx="150" cy="150" r="120" class="dseg s3" stroke-dasharray="0 ${C}"/></svg>
      <div class="dmid"><small>EVERY FEE</small><b class="mono" data-k="p">0%</b><span>split by code</span></div>`);
    const segs = [...donut.querySelectorAll('.dseg')];
    const pv = donut.querySelector('[data-k=p]');
    const cards = [
      ['pay', '80%', 'to holders in ZEC', 'swapped into ZEC, paid every 5 min'],
      ['burn', '20%', 'buyback + burn', 'buys $ZATS and burns it'],
      ['vault', '0%', 'to the team', 'no team cut, ever'],
    ].map(([tone, p, a, b]) => card(space, `scard tone-${tone}`, `<div class="sp mono">${p}</div><div><b>${a}</b><small>${b}</small></div>`));
    const h1 = head(ly, 'the vault <em class="c-vault">splits it.</em>');
    const s1 = sub(ly, 'on-chain, every claim. no one decides by hand.');
    tag(ly);
    return (t) => {
      cam(space, { z: mix(-80, 120, ease.inOut(lin(t, 0, 6))), ry: mix(-14, 10, ease.inOut(lin(t, 0, 6))), rx: 5 });
      fly(donut, t, 0, 9, { x: lay(30, 0), y: lay(50, -220), z: 0, s: lay(0.72, 0.9) }, { from: { z: -700, s: 0.6 }, spin: 90, dur: 1 });
      const fill = ease.out(lin(t, 0.4, 2.8));
      const parts = [0.8, 0.2, 0];
      let off = 0;
      segs.forEach((s, i) => {
        const k = parts[i] > 0 ? clamp((fill - off) / parts[i]) : 0;
        const len = C * parts[i] * k - (k > 0 ? 6 : 0);
        s.setAttribute('stroke-dasharray', `${Math.max(0, len)} ${C}`);
        s.setAttribute('stroke-dashoffset', String(-C * off));
        off += parts[i];
      });
      pv.textContent = Math.round(fill * 100) + '%';
      const pos = lay(
        [{ x: -285, y: 250 }, { x: 420, y: -100 }, { x: 420, y: 140 }],
        [{ x: -40, y: 250 }, { x: -40, y: 400 }, { x: -40, y: 550 }],
      );
      cards.forEach((n, i) => fly(n, t, 1.3 + i * 0.7, 9, { ...pos[i], z: 140, ry: lay(i ? -14 : 14, 0) }, { from: { z: -500, x: lay(i ? 300 : -300, 0) }, focus: 100 }));
      show(h1, t, 0.2, 9, { stagger: 0.03 });
      show(s1, t, 0.9, 9, { mode: 'fade', stagger: 0.012 });
    };
  },
};

// 6. Payout every five minutes
SHOTS.payout = {
  dur: 8,
  music: 'chorus',
  cues: [[0.5, 'tick'], [1.0, 'tick'], [1.5, 'tick'], [2.0, 'tick'], [2.5, 'tick'], [3.2, 'snapshot'], [3.25, 'impact_soft'], [3.7, 'coins'], [4.6, 'blips'], [7.85, 'whoosh']],
  build() {
    const { ly, space } = layer();
    const C = 2 * Math.PI * 92;
    const timer = card(space, 'timer', `<svg viewBox="0 0 220 220"><circle cx="110" cy="110" r="92" class="ttrack"/><circle cx="110" cy="110" r="92" class="tprog" stroke-dasharray="${C} ${C}"/></svg>
      <div class="tmid">${L.zec(46)}<small>NEXT ZEC PAYOUT</small><b class="mono" data-k="c">05:00</b><span data-k="s">counting down</span></div>`);
    const cv = timer.querySelector('[data-k=c]');
    const cs = timer.querySelector('[data-k=s]');
    const tp = timer.querySelector('.tprog');
    const snap = card(space, 'chip big tone-vault', `<span class="pulse"></span><span>SNAPSHOT · <b class="mono">1,284</b> holders</span>`);
    const people = [['@night_owl', 0.0881], ['@no_kyc', 0.0332], ['@ghost_01', 0.0659], ['@quiet_one', 0.0221], ['@cipher', 0.044], ['@hodl_sage', 0.0198]];
    const prow = people.map(([n, a]) =>
      card(space, 'prow tone-pay', `<span class="avatar" style="--h:${Math.floor(hsh(a) * 360)}"></span><b>${n}</b>${L.zec(26)}<span class="mono amt">+${fmt(a, 4)} ZEC</span><span class="scan">${L.solscan(18)} Solscan ↗</span><span class="stamp">PAID</span>`),
    );
    const min = card(space, 'chip tone-pay', `<span>hold</span><b class="mono">100K+ $ZATS</b><span>· any wallet</span>`);
    const h1 = head(ly, 'every <em>5 minutes.</em>');
    const h2 = head(ly, 'every holder <em>gets paid.</em>');
    const h3 = head(ly, 'by balance. <em>automatically.</em>');
    tag(ly);
    return (t) => {
      const k = ease.inOut(lin(t, 0, 8));
      cam(space, { z: t < 3.2 ? mix(-200, 160, ease.in(lin(t, 0, 3.2))) : mix(-60, 60, lin(t, 3.2, 8)), ry: t < 3.2 ? -6 : mix(16, 6, k), rx: 6 });
      fly(timer, t, 0, 3.25, { x: 0, y: lay(0, -80), z: 0 }, { from: { z: -600, s: 0.7 }, to: { z: 900 }, out: 0.25 });
      const left = 300 * (1 - ease.in(lin(t, 0.3, 3.2)));
      const mm = Math.floor(left / 60);
      const ss = Math.floor(left % 60);
      cv.textContent = `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
      tp.setAttribute('stroke-dashoffset', String(C * (1 - left / 300)));
      cs.textContent = left < 1 ? 'paying now' : 'counting down';
      fly(snap, t, 3.2, 9, { x: lay(-380, 0), y: lay(-40, -560), z: 120 }, { from: { z: -300, s: 1.4 }, dur: 0.4, focus: 60 });
      prow.forEach((n, i) => {
        const t0 = 3.5 + i * 0.32;
        fly(n, t, t0, 9, { x: lay(220 + (i % 2) * 30, 0), y: lay(-170 + i * 88, -380 + i * 112), z: 40 - i * 10, ry: lay(-10, 0) }, { from: { z: -500, x: 260 }, dur: 0.55, focus: 0 });
        n.classList.toggle('stamped', t > t0 + 0.35);
      });
      fly(min, t, 5.2, 9, { x: lay(-330, 0), y: lay(260, 380), z: 200 }, { from: { z: -300 }, focus: 60 });
      show(h1, t, 0.15, 3.15, { stagger: 0.03, out: 0.15 });
      show(h2, t, 3.3, 5.9, { stagger: 0.025, out: 0.15 });
      show(h3, t, 6.0, 9, { stagger: 0.025 });
    };
  },
};

// 7. Buyback and burn
SHOTS.burn = {
  dur: 6,
  music: 'half',
  cues: [[0.2, 'thud'], [1.8, 'impact_soft'], [3.4, 'impact'], [3.4, 'glitch'], [4.6, 'whoosh'], [5.85, 'whoosh']],
  build() {
    const { ly, space } = layer();
    const ctr = card(space, 'stat burnc tone-burn', `<small>$ZATS BOUGHT BACK AND BURNED</small><div class="big mono"><span data-k="b">0</span></div>
      <div class="chart">${candles(24, 11, 700, 170, 0.3)}</div><div class="cap">$ZATS · buybacks · 5m candles</div>`);
    const bv = ctr.querySelector('[data-k=b]');
    const cl = ctr.querySelector('.cds');
    const tx = card(space, 'mini tone-burn', `<span class="fic big">▲</span><div><small>BURN TX · PUBLIC</small><b>bought 1.84M $ZATS · burned 1.84M</b><p>The burn sends exactly what it bought, in a second transaction.</p></div>`);
    const h1 = head(ly, '20% buys <em class="c-burn">$ZATS</em>');
    const h2 = head(ly, 'and <em class="c-burn">burns it.</em>', 'l2');
    const big = slamEl(ly, 'BURN.', 'dark huge');
    const h3 = head(ly, 'less supply. <em class="c-burn">every claim.</em>');
    tag(ly);
    return (t) => {
      BG.ember = 1;
      if (t >= 3.4 && t < 4.6) BG.flood = [...hex(PAL.terracotta), 1];
      cam(space, { z: mix(-160, 120, ease.inOut(lin(t, 0, 6))), ry: mix(12, -8, lin(t, 0, 6)), rx: 8 });
      const vis = t < 3.4 || t >= 4.6;
      fly(ctr, vis ? t : -1, 0, 9, { x: lay(260, 0), y: lay(20, 160), z: 0, ry: -10 }, { from: { z: -600, y: 100 } });
      bv.textContent = fmt(Math.round(18400000 * ease.out(lin(t, 0.3, 3.2))));
      revealCandles(cl, ease.out(lin(t, 0.4, 3.2)));
      fly(tx, vis ? t : -1, 1.6, 9, { x: lay(-330, 0), y: lay(230, 620), z: 160, ry: 12 }, { from: { z: -500, x: -200 }, focus: 80 });
      show(h1, t, 0.2, 3.35, { stagger: 0.03, out: 0.1 });
      show(h2, t, 1.6, 3.35, { stagger: 0.03, out: 0.1 });
      slam(big, t, 3.4, 4.6, { from: 2.2 });
      show(h3, t, 4.65, 9, { stagger: 0.025 });
    };
  },
};

// 8. Swap at 0%
SHOTS.swap = {
  dur: 6,
  music: 'verse2',
  cues: [[0.3, 'blips'], [2.5, 'click'], [2.9, 'whoosh'], [4.1, 'chime'], [5.85, 'whoosh']],
  build() {
    const { ly, space } = layer();
    const sw = card(space, 'swapc', `<div class="sw-h"><b>Swap</b><span class="chip sm tone-trade">0% platform fee</span></div>
      <div class="sw-box"><small>You pay</small><div class="sw-r"><span class="mono big2">1.50</span><span class="tok">${L.solana(22)} SOL</span></div></div>
      <div class="sw-arrow">↓</div>
      <div class="sw-box"><small>You get</small><div class="sw-r"><span class="mono big2" data-k="o">0</span><span class="tok">${L.zatoshi(26)} $ZATS</span></div></div>
      <div class="sw-line"><span>Platform fee</span><b class="zero">0%</b></div>
      <div class="sw-line"><span>Route</span><b>${L.jupiter(20)} Jupiter · best route</b></div>
      <div class="sw-btn">Swap</div>`);
    const out = sw.querySelector('[data-k=o]');
    const btn = sw.querySelector('.sw-btn');
    const ph = card(space, 'phpop', `<div class="pp-h">${L.phantom(30)}<b>Phantom</b></div><div class="pp-t">Approve transaction</div><div class="pp-r"><span>Swap</span><b>1.50 SOL → $ZATS</b></div><div class="pp-r"><span>Network fee</span><b>&lt; 0.0001 SOL</b></div><div class="pp-b"><span>Cancel</span><span class="ok">Confirm</span></div>`);
    const done = card(space, 'toast tone-trade', `<span class="tic">✓</span><div><small>SWAPPED</small><b>received $ZATS · view on Solscan ↗</b></div>`);
    const jup = card(space, 'chip big', `${L.jupiter(30)}<span>Routed by Jupiter</span>`);
    const h1 = head(ly, 'swap at <em class="c-trade">0%.</em>');
    const s1 = sub(ly, 'signed in your own wallet. funds never pass through us.');
    tag(ly);
    return (t) => {
      cam(space, { z: mix(-100, 140, ease.inOut(lin(t, 0, 6))), ry: mix(-12, 4, lin(t, 0, 6)), rx: 5 });
      fly(sw, t, 0, 9, { x: lay(340, 0), y: lay(60, 40), z: 0, ry: -8 }, { from: { z: -700, ry: -40 }, dur: 0.9 });
      out.textContent = fmt(Math.round(1148203 * ease.out(lin(t, 0.6, 2.0))));
      btn.classList.toggle('press', t > 2.5 && t < 2.75);
      sw.querySelector('.zero').classList.toggle('glow', t > 1.2);
      fly(ph, t, 2.9, 4.0, { x: lay(330, 160), y: lay(150, -120), z: lay(180, 260), ry: -16 }, { from: { z: -300, x: 300 }, dur: 0.45, to: { z: 400 }, out: 0.25, focus: 200 });
      fly(done, t, 4.1, 9, { x: lay(540, 60), y: lay(250, 520), z: 220, ry: -12 }, { from: { z: -400, y: 80 }, focus: 120 });
      fly(jup, t, 1.4, 9, { x: lay(-420, -120), y: lay(250, -560), z: 180, ry: 12 }, { from: { z: -400 }, focus: 120 });
      show(h1, t, 0.15, 9, { stagger: 0.03 });
      show(s1, t, 0.8, 9, { mode: 'fade', stagger: 0.012 });
    };
  },
};

// 9. Wallets, names, X, invites
SHOTS.wallets = {
  dur: 6,
  music: 'verse2',
  cues: [[0.4, 'click'], [0.65, 'click'], [0.9, 'click'], [1.15, 'click'], [2.0, 'impact_soft'], [3.4, 'type'], [4.5, 'chime'], [5.85, 'whoosh']],
  build() {
    const { ly, space } = layer();
    const ws = [
      [L.phantom(56), "Phantom"],
      [L.solflare(56), "Solflare"],
      [L.backpack(56), "Backpack"],
      [L.metamask(56), "MetaMask"],
    ].map(([ic, n]) => card(space, 'wpill', `${ic}<span>${n}</span>`));
    const sign = card(space, 'mini tone-people', `<span class="fic big">✎</span><div><small>SIGN ONE MESSAGE</small><b>free · no transaction</b><p>It can't move funds. Then pick a public name.</p></div>`);
    const prof = card(space, 'prof', `<div class="pf-top"><span class="avatar big" style="--h:42"></span><div><small>PUBLIC NAME</small><b class="mono" data-k="n"></b></div></div>
      <div class="pf-x">${L.x(22)}<span>Link X</span><b class="ok">linked ✓</b></div>
      <div class="pf-inv"><small>YOUR INVITE LINK</small><span class="mono">?ref=your_name</span></div>`);
    const nm = prof.querySelector('[data-k=n]');
    const xl = prof.querySelector('.pf-x');
    const h1 = head(ly, 'connect <em class="c-people">any wallet.</em>');
    const h2 = head(ly, 'pick a name. <em class="c-people">link your X.</em>');
    tag(ly, 'UI preview');
    return (t) => {
      cam(space, { z: mix(-120, 120, ease.inOut(lin(t, 0, 6))), ry: mix(10, -8, lin(t, 0, 6)), rx: 5 });
      ws.forEach((n, i) => {
                fly(n, t, 0.4 + i * 0.25, 3.0, lay({ x: (i - 1.5) * 330, y: -10 + Math.abs(i - 1.5) * 30 + (i % 2) * 60, z: -Math.abs(i - 1.5) * 120, ry: -(i - 1.5) * 10 }, { x: 0, y: -300 + i * 150, z: 0 }), {
          from: { z: -600, y: -100 },
          to: { z: 500, y: -200 },
          dur: 0.5,
          focus: 0,
        });
      });
      fly(sign, t, 1.9, 3.0, { x: 0, y: lay(230, 380), z: 120 }, { from: { z: -400, y: 100 }, to: { z: 500 }, focus: 60 });
      fly(prof, t, 3.1, 9, { x: lay(240, 0), y: lay(40, 120), z: 0, ry: -10 }, { from: { z: -600, ry: 30 } });
      typeText(nm, '@your_name', t, 3.4, 14);
      xl.classList.toggle('on', t > 4.5);
      show(h1, t, 0.15, 3.0, { stagger: 0.03, out: 0.15 });
      show(h2, t, 3.1, 9, { stagger: 0.025 });
    };
  },
};

// 10. Leaderboards
SHOTS.boards = {
  dur: 6,
  music: 'chorus',
  cues: [[0.3, "blips"], [2.0, "click"], [4.0, "click"], [5.85, "whoosh"]],
  build() {
    const { ly, space } = layer();
    const win = card(space, 'board lb', `<div class="win-top"><i></i><i></i><i></i><span>zatoshi — boards</span><span class="tabs"><b>EARNERS</b><b>DIAMOND HANDS</b><b>RECRUITERS</b></span></div><div class="lbl"></div>`);
    const tabs = [...win.querySelectorAll('.tabs b')];
    const lbl = win.querySelector('.lbl');
    const sets = [
      [['@night_owl', '1.42 ZEC', 1, 1], ['@ghost_01', '0.81 ZEC', 0.57, 0], ['@no_kyc', '0.57 ZEC', 0.4, 1], ['@quiet_one', '0.43 ZEC', 0.3, 0], ['@cipher', '0.35 ZEC', 0.25, 1]],
      [['@hodl_sage', 'held 41 days', 1, 1], ['@driftwood', 'held 38 days', 0.92, 0], ['@night_owl', 'held 35 days', 0.85, 1], ['@veil', 'held 30 days', 0.73, 0], ['@umbra', 'held 27 days', 0.66, 1]],
      [['@cipher', '14 invites', 1, 1], ['@shade', '11 invites', 0.79, 1], ['@stealthy', '9 invites', 0.64, 0], ['@ghost_01', '7 invites', 0.5, 0], ['@lowkey_lu', '5 invites', 0.36, 1]],
    ];
    const rows = [0, 1, 2, 3, 4].map(() => el('div', 'lrow', '', lbl));
    const tones = ['pay', 'trade', 'people'];
    const heads = [head(ly, 'top <em>earners.</em>'), head(ly, '<em class="c-trade">diamond</em> hands.'), head(ly, 'top <em class="c-people">recruiters.</em>')];
    const s1 = sub(ly, 'your name, not your address, on every board.');
    tag(ly);
    let lastSet = -1;
    return (t) => {
      const si = Math.min(2, Math.floor(t / 2));
      cam(space, { z: mix(-100, 140, ease.inOut(lin(t, 0, 6))), ry: mix(-10, 8, lin(t, 0, 6)), rx: 8 });
      fly(win, t, 0, 9, { x: lay(240, 0), y: lay(110, 160), z: 0, ry: -8 }, { from: { z: -700, rx: 30 }, dur: 0.9 });
      win.className = 'card board lb tone-' + tones[si];
      tabs.forEach((b, i) => b.classList.toggle('on', i === si));
      if (si !== lastSet) {
        sets[si].forEach(([n, v, w, x], i) => {
          rows[i].innerHTML = `<span class="rk mono">#0${i + 1}</span><span class="avatar" style="--h:${Math.floor(hsh(i + si * 7) * 360)}"></span><b>${n}</b>${x ? `<span class="xb">${L.x(14, '#111')}</span>` : ''}<span class="bar" style="--w:${w}"></span><span class="mono v">${v}</span><span class="fsam">SAMPLE</span>`;
        });
        lastSet = si;
      }
      const lt = t - si * 2;
      rows.forEach((r, i) => {
        const p = ease.out5(lin(lt, 0.05 + i * 0.07, 0.5 + i * 0.07));
        r.style.opacity = String(p);
        r.style.transform = `translateX(${(1 - p) * 120}px)`;
        r.style.setProperty('--g', String(p));
      });
      heads.forEach((h, i) => show(h, t, i * 2 + 0.05, i * 2 + 1.95, { stagger: 0.025, out: i === 2 ? 0.3 : 0.05 }));
      show(s1, t, 0.6, 9, { mode: 'fade', stagger: 0.012 });
    };
  },
};

// 11. Proof
SHOTS.proof = {
  dur: 4,
  music: 'break',
  cues: [[0, 'glitch'], [0.4, 'tick'], [0.8, 'tick'], [1.2, 'tick'], [1.6, 'tick'], [2.0, 'impact_soft']],
  build() {
    const { ly, space } = layer();
    const kinds = [['claim', 'vault', 'CLAIM', 'fees claimed · 1.62 SOL'], ['buy', 'trade', 'SWAP', 'swapped SOL into ZEC for holders'], ['burn', 'burn', 'BURN', 'burned 1.84M $ZATS'], ['paid', 'pay', 'PAYOUT', '60 wallets paid in ZEC']];
    const rows = Array.from({ length: 12 }, (_, i) => {
      const [, tone, lab, s] = kinds[i % 4];
      return card(space, `txr tone-${tone}`, `<span class="flab">${lab}</span><span>${s}</span><span class="mono sig">5K••••${'9fQx3aL7'.slice(i % 5, (i % 5) + 3)}</span><span class="scan">${L.solscan(18)} Solscan ↗</span>`);
    });
    const h1 = head(ly, "don't trust. <em class=\"c-vault\">check.</em>");
    const s1 = sub(ly, 'every claim, buy, burn and payout is a public Solana transaction.');
    tag(ly, 'UI preview · signatures redacted');
    return (t) => {
      BG.tun = 0.35;
      BG.tunC = hex('#c9d8e8');
      cam(space, { z: 0, rx: 0, ry: lay(-18, 0) });
      rows.forEach((n, i) => {
        const z = -2600 + ((t * 900 + i * 300) % 3600);
        const side = i % 2 ? 1 : -1;
        fly(n, t, 0, 9, { x: lay(side * 380 + 120, side * 60), y: lay(((i * 137) % 5) * 55 + 40, ((i * 137) % 7) * 120 - 200), z, ry: -side * 14 }, { from: { z: 0 }, dur: 0.01, focus: 0, dof: 0.006 });
        n.style.opacity = String(clamp((z + 2600) / 900) * clamp((700 - z) / 400));
      });
      show(h1, t, 0.1, 9, { mode: 'decrypt', stagger: 0.03, dur: 0.5 });
      show(s1, t, 0.9, 9, { mode: 'fade', stagger: 0.01 });
    };
  },
};

// 12. Trust montage
SHOTS.trust = {
  dur: 4,
  music: 'build',
  cues: [[0, 'stab'], [0.5, 'stab'], [1, 'stab_hi'], [1.5, 'stab'], [2, 'stab_hi'], [2.5, 'stab'], [3, 'glitch'], [4, 'riser:2']],
  build() {
    const { ly } = layer();
    const words = [
      ['NO CUSTODY.', 'dark', PAL.cream],
      ['NO KYC.', 'white', '#3F566E'],
      ['NO PRESALE.', 'dark', PAL.rose],
      ['FAIR LAUNCH.', 'dark', PAL.sage],
      [`${L.pumpfun(lay(150, 110))} PUMP.FUN`, 'dark', '#F3EEE4'],
      [`${L.solana(lay(130, 96))} SOLANA`, 'white', '#1B1824'],
      [`${L.zec(lay(150, 110), '#16130F')} PAID IN ZEC.`, 'dark', PAL.zec],
      ['HOLD IT.', 'white huge', '#0b0a0c'],
    ].map(([w, c, f]) => [slamEl(ly, w, c), f]);
    return (t) => {
      const i = Math.min(words.length - 1, Math.floor(t / 0.5));
      BG.flood = [...hex(words[i][1]), 1];
      if (i === words.length - 1) {
        BG.flood[3] = 0;
        BG.tun = 1.2;
        BG.tunSpeed = 1.5;
      }
      words.forEach(([n], k) => slam(n, t, k * 0.5, k === words.length - 1 ? 4 : (k + 1) * 0.5, { from: 1.4, dir: k % 2 ? -1 : 1 }));
    };
  },
};

// 13. Finale
SHOTS.finale = {
  dur: 10,
  music: 'outro',
  cues: [[0, 'final'], [0.9, 'shimmer'], [3.0, 'chime']],
  build() {
    const { ly } = layer();
    const lock = el('div', 'fin', `<div class="lk-row">${L.zatoshi(lay(126, 104))}<div class="wm">zatoshi</div></div>
      <div class="fin-tag">Hold $ZATS. Get paid in <em>ZEC</em> every five minutes.</div>
      <div class="fin-ca"><span class="pill gold">$ZATS</span><span class="ca-t">LAUNCHING ON</span>${L.pumpfun(30)}<span class="ca-t">PUMP.FUN</span></div>
      <div class="fin-cta"><span class="xh">${L.x(24)}<span class="mono">${X_HANDLE.slice(1)}</span></span></div>
      <div class="fin-logos"><span>${L.zec(26)} Zcash</span><span>${L.solana(26)} Solana</span><span>${L.pumpfun(26)} Pump.fun</span><span>${L.jupiter(26)} Jupiter</span><span>${L.phantom(26)} Phantom</span></div>
      <div class="legal">Payouts come only from real trading fees. If volume stops, payouts stop. Not affiliated with the Zcash project. Not financial advice.</div>`, ly);
    const parts = [...lock.children];
    return (t) => {
      BG.dots = 0.9;
      BG.ring = 0.6 * Math.exp(-t * 0.8) + 0.12;
      BG.ringR = lay(0.2, 0.15) + ease.out(lin(t, 0, 1.5)) * 0.06;
      BG.center = [0, lay(0.242, 0.164)];
      BG.tun = Math.exp(-t * 1.2) * 1.2;
      BG.stars = 1;
      // coin
      const p = ease.out5(lin(t, 0, 1.4));
      COIN = { x: 0, y: lay(1.55, 1.05), z: mix(-8, 0, p), ry: (1 - ease.expo(lin(t, 0, 2.2))) * Math.PI * 4 + Math.sin(t * 0.6) * 0.25, rx: 0.08, s: lay(0.8, 0.62) };
      const tt = [0.25, 0.9, 1.6, 2.4, 3.2, 5.5];
      parts.forEach((n, i) => {
        const q = ease.out5(lin(t, tt[i], tt[i] + 0.6));
        n.style.opacity = String(q);
        n.style.transform = `translateY(${(1 - q) * 30}px)`;
        n.style.filter = q < 1 ? `blur(${(1 - q) * 12}px)` : '';
      });
      const wm = lock.querySelector('.wm');
      wm.style.letterSpacing = `${mix(0.32, 0.08, ease.out(lin(t, 0.25, 4)))}em`;
      const fade = lin(t, 9.2, 10);
      stage.style.setProperty('--fade', String(fade));
    };
  },
};

// Each scene's background: two muted washes, which drawn layer, a seed.
const LOOK = {
  hook: ['sand', 'plum', 1, 0],
  logo: ['zec', 'slate', 0, 0],
  nots: ['sand', 'slate', 1, 0],
  fees: ['sage', 'teal', 1, 0],
  split: ['slate', 'terracotta', 0, 1],
  payout: ['zec', 'sage', 1, 0],
  burn: ['terracotta', 'rose', 0, 1],
  swap: ['teal', 'sand', 1, 0],
  wallets: ['plum', 'slate', 0, 1],
  boards: ['sand', 'plum', 1, 0],
  proof: ['slate', 'teal', 0, 1],
  trust: ['sand', 'slate', 1, 0],
  finale: ['zec', 'plum', 1, 0],
};
// color-panel wipe across each cut, in the incoming scene's colors
function wipeAt(T) {
  for (let i = 1; i < timeline.length; i++) {
    const d = T - timeline[i].start;
    if (d < -0.28 || d > 0.28) continue;
    const k = (d + 0.28) / 0.56;
    const lk = LOOK[timeline[i].id];
    const [a, b] = [PAL[lk[0]], PAL[lk[1]]];
    const vert = i % 2 === 0;
    wipeEl.style.display = '';
    const e = ease.inOut(k);
    const kids = wipeEl.children;
    kids[0].style.background = a;
    kids[1].style.background = b;
    const tr = (off) => (vert ? `translate3d(0, ${(e * 2.6 - 1.3 - off) * 100}%, 0)` : `translate3d(${(e * 2.6 - 1.3 - off) * 100}%, 0, 0) skewX(-14deg)`);
    kids[0].style.transform = tr(0);
    kids[1].style.transform = tr(0.22);
    return;
  }
  wipeEl.style.display = 'none';
}

// ---------- cuts ----------
const ORDER = ['hook', 'logo', 'nots', 'fees', 'split', 'payout', 'burn', 'swap', 'wallets', 'boards', 'proof', 'trust', 'finale'];
const timeline = [];
let duration = 0;
const cues = [];

function fxAt(T) {
  let flash = 0;
  let glitch = 0;
  let whip = 0;
  let punch = 0;
  for (const [ct, kind] of cues) {
    const d = T - ct;
    if (d < -0.4 || d > 1.5) continue;
    if (kind === 'impact' || kind === 'drop' || kind === 'final') {
      if (d >= 0) flash += (kind === 'impact' ? 0.5 : 0.9) * Math.exp(-d / 0.14);
      if (d >= 0) punch += Math.exp(-d / 0.1);
    } else if (kind === 'stab' || kind === 'stab_hi') {
      if (d >= 0) punch += 0.6 * Math.exp(-d / 0.08);
    } else if (kind === 'impact_soft' || kind === 'snapshot') {
      if (d >= 0) flash += 0.15 * Math.exp(-d / 0.12);
    } else if (kind === 'glitch') {
      if (d >= 0 && d < 0.2) glitch += 1 - d / 0.2;
    } else if (kind === 'whoosh') {
      whip += Math.exp(-(d * d) / 0.004);
    }
  }
  return { flash: Math.min(1, flash), glitch: Math.min(1, glitch), whip: Math.min(1, whip), punch: Math.min(1, punch) };
}

let last = null;
function seek(T) {
  T = clamp(T, 0, duration - 1e-4);
  const s = timeline.find((x) => T >= x.start && T < x.start + x.dur) || timeline[timeline.length - 1];
  const lt = T - s.start;
  if (last !== s) {
    if (last) last.layer.style.display = 'none';
    s.layer.style.display = '';
    last = s;
  }
  BG = bgDefaults();
  {
    const lk = LOOK[s.id];
    BG.a = hex(PAL[lk[0]]);
    BG.b = hex(PAL[lk[1]]);
    BG.contour = lk[2];
    BG.halftone = lk[3];
    BG.seed = timeline.indexOf(s) * 3.7;
  }
  COIN = null;
  stage.style.setProperty('--fade', '0');
  s.update(lt, T);
  const fx = fxAt(T);
  // whip pan at cuts: directional smear and a slide
  const dir = Math.round(T * 2) % 2 ? 1 : -1;
  ov.style.transform = `translateX(${(fx.whip * 120 * dir + (fx.glitch ? Math.sin(T * 300) * 18 * fx.glitch : 0)).toFixed(1)}px) scale(${1 + fx.punch * 0.025})`;
  ov.style.filter = fx.whip > 0.02 ? `blur(${(fx.whip * 14).toFixed(1)}px)` : '';
  ov.classList.toggle('glitching', fx.glitch > 0.05);
  BG.blobOff = [fx.whip * 0.3 * dir, 0];
  flashEl.style.opacity = String(Math.min(0.75, fx.flash * 0.6));
  wipeAt(T);
  grain.style.backgroundPosition = `${Math.floor(hsh(T) * 256)}px ${Math.floor(hsh(T + 1) * 256)}px`;
  bg.render(BG, T);
  renderer.domElement.style.display = COIN ? '' : 'none';
  if (COIN) {
    coinPivot.position.set(COIN.x, COIN.y, COIN.z);
    coinPivot.rotation.set(COIN.rx, COIN.ry, 0);
    coinPivot.scale.setScalar(COIN.s);
    coin.userData.gold.emissiveIntensity = fx.punch * 0.3;
    renderer.render(scene3, cam3);
  }
}

async function init() {
  await Promise.all(['900 64px "Archivo Variable"', '700 64px "Geist Sans"', '800 64px "Geist Sans"', '500 20px "Geist Sans"', '400 20px "Geist Sans"', '400 64px "Geist Pixel"', '500 20px "Geist Mono"', '600 20px "Geist Mono"'].map((f) => document.fonts.load(f)));
  scene3.environment = makeEnv(renderer);
  let t = 0;
  for (const id of ORDER) {
    const S = SHOTS[id];
    const node = { id, start: t, dur: S.dur, music: S.music };
    const before = ov.children.length;
    node.update = S.build();
    node.layer = ov.children[before];
    node.layer.style.display = 'none';
    for (const [ct, kind] of S.cues) cues.push([+(t + ct).toFixed(4), kind]);
    timeline.push(node);
    t += S.dur;
  }
  duration = t;
  cues.sort((a, b) => a[0] - b[0]);
  const plan = timeline.map(({ id, start, dur, music }) => ({ id, start, dur, music }));
  window.__seek = seek;
  window.__ad = { duration, cues, plan, w: W, h: H, cut: CUT };
  seek(Number(params.get('t') || 0));
  if (!params.get('capture')) {
    const t0 = performance.now() - Number(params.get('t') || 0) * 1000;
    const loop = () => {
      seek(((performance.now() - t0) / 1000) % duration);
      requestAnimationFrame(loop);
    };
    loop();
  }
}
init();
