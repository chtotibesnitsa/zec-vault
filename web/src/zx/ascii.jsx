// ASCII scenes drawn on a canvas, one character grid per frame. Slow motion,
// soft contrast, and they stop drawing when scrolled out of view.
import { useEffect, useRef } from 'react';

const COLORS = ['243,242,238', '233,180,76', '57,211,83'];
const FIRE = ' .:-=+*#%@';

function makeGrid(C, R) {
  const ch = new Array(C * R).fill(' ');
  const al = new Float32Array(C * R);
  const co = new Uint8Array(C * R);
  const put = (x, y, s, a = 1, c = 0) => {
    x = Math.round(x);
    y = Math.round(y);
    if (y < 0 || y >= R) return;
    for (let i = 0; i < s.length; i++) {
      const xx = x + i;
      if (xx < 0 || xx >= C || s[i] === ' ') continue;
      const k = y * C + xx;
      ch[k] = s[i];
      al[k] = a;
      co[k] = c;
    }
  };
  const clear = () => {
    ch.fill(' ');
    al.fill(0);
  };
  return { ch, al, co, put, clear, C, R };
}

// Hook that sizes a canvas to its box and runs draw(grid, t) each frame while visible.
function useAsciiCanvas(draw, { minCols = 64, maxCell = 10 } = {}) {
  const ref = useRef(null);
  const drawRef = useRef(draw);
  drawRef.current = draw;
  useEffect(() => {
    const cv = ref.current;
    const ctx = cv.getContext('2d');
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let g;
    let cw = 8;
    let chH = 15;
    let fs = 13;
    let dpr = 1;
    const size = () => {
      const r = cv.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      cv.width = Math.max(1, Math.round(r.width * dpr));
      cv.height = Math.max(1, Math.round(r.height * dpr));
      cw = Math.min(maxCell, r.width / minCols);
      fs = cw * 1.62;
      chH = fs * 1.18;
      g = makeGrid(Math.floor(r.width / cw), Math.floor(r.height / chH));
    };
    const paint = (t) => {
      g.clear();
      drawRef.current(g, t);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cv.width, cv.height);
      ctx.font = `${fs}px "Geist Mono", ui-monospace, monospace`;
      ctx.textBaseline = 'top';
      let last = '';
      for (let i = 0; i < g.ch.length; i++) {
        const c = g.ch[i];
        if (c === ' ') continue;
        const a = Math.round(Math.min(1, g.al[i]) * 10) / 10;
        if (a <= 0) continue;
        const style = `rgba(${COLORS[g.co[i]]},${a})`;
        if (style !== last) {
          ctx.fillStyle = style;
          last = style;
        }
        ctx.fillText(c, (i % g.C) * cw, Math.floor(i / g.C) * chH);
      }
    };
    size();
    let raf = 0;
    let vis = false;
    const t0 = performance.now();
    const loop = () => {
      raf = vis ? requestAnimationFrame(loop) : 0;
      paint((performance.now() - t0) / 1000);
    };
    const io = new IntersectionObserver(([e]) => {
      vis = e.isIntersecting;
      if (vis && !raf && !still) raf = requestAnimationFrame(loop);
    });
    io.observe(cv);
    const ro = new ResizeObserver(() => {
      size();
      paint(still ? 9 : (performance.now() - t0) / 1000);
    });
    ro.observe(cv);
    document.fonts?.ready.then(() => paint(9));
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      ro.disconnect();
    };
  }, [minCols, maxCell]);
  return ref;
}

const rnd = (n) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};
const box = (g, x, y, w, h, a, c = 0) => {
  g.put(x, y, '┌' + '─'.repeat(w - 2) + '┐', a, c);
  for (let i = 1; i < h - 1; i++) {
    g.put(x, y + i, '│', a, c);
    g.put(x + w - 1, y + i, '│', a, c);
  }
  g.put(x, y + h - 1, '└' + '─'.repeat(w - 2) + '┘', a, c);
};

// The vault, as a diagram: trades on the left drop fees into the vault; every
// cycle it sends Z coins hopping into holder wallets and drops a fifth into the
// burn. `phase` (0, 1, 2) brightens the part the text next to it is about.
export function VaultFlow({ phase = -1, holders = 6, className = '' }) {
  const ph = useRef(phase);
  ph.current = phase;
  const ref = useAsciiCanvas((g, t) => {
    const { C, R, put } = g;
    const P = ph.current;
    const em = (k) => (P < 0 ? 0.85 : P === k ? 1 : 0.3);
    const CYC = 6;
    const cyc = Math.floor(t / CYC);
    const ct = t - cyc * CYC;

    // left: trades
    const lx = 1;
    const vw = Math.max(18, Math.round(C * 0.2));
    const vh = 9;
    const vx = Math.round(C * 0.4);
    const vy = Math.max(2, Math.round(R / 2 - vh / 2) - 2);
    const a0 = em(0);
    put(lx, 1, 'TRADES', a0);
    put(lx, 2, '──────', a0 * 0.5);
    const rows = Math.max(3, Math.min(9, Math.floor((R - 5) / 2)));
    const step = 0.8;
    const n0 = Math.floor(t / step);
    for (let i = 0; i < rows; i++) {
      const n = n0 - i;
      const y = 4 + i * 2;
      const buy = rnd(n) > 0.38;
      const sol = (0.05 + rnd(n + 9) * 2.4).toFixed(2);
      const fresh = i === 0 ? Math.min(1, (t - n0 * step) / 0.25) : 1;
      put(lx, y, `${buy ? 'BUY ' : 'SELL'} ${sol.padStart(5)} SOL`, a0 * (1 - i / (rows + 2)) * fresh, 0);
    }
    // fee packets travel from the newest trades into the vault
    for (let k = 0; k < 7; k++) {
      const n = n0 - k;
      const age = t - n * step;
      const dur = 2.2;
      if (age < 0 || age > dur) continue;
      const p = age / dur;
      const sy = 4 + Math.min(rows - 1, k) * 2;
      const x0 = lx + 15;
      const x1 = vx - 1;
      const ty = vy + 4;
      const x = x0 + (x1 - x0) * p;
      const y = sy + (ty - sy) * Math.pow(p, 2.2);
      put(x, y, '•', Math.max(a0, 0.5), 1);
      put(x - 1, y, '·', a0 * 0.5, 1);
    }

    // vault
    const a1 = em(1);
    box(g, vx, vy, vw, vh, a1);
    put(vx + 2, vy + 1, 'VAULT', a1);
    put(vx + vw - 7, vy + 1, `#${String(1000 + cyc).slice(-3)}`, a1 * 0.7);
    const fill = Math.min(1, ct / (CYC - 1));
    const bw = vw - 4;
    const on = Math.round(bw * fill);
    put(vx + 2, vy + 3, '▮'.repeat(on), a1, 1);
    put(vx + 2 + on, vy + 3, '▯'.repeat(bw - on), a1 * 0.45);
    put(vx + 2, vy + 5, '80% holders', a1);
    put(vx + 2, vy + 6, '20% burn', a1);
    put(vx + 2, vy + 7, 'fees in SOL', a1 * 0.6);

    // burn pit under the vault
    const bx = vx + 2;
    const by = vy + vh + 3;
    const bwid = vw - 4;
    const flare = ct < 1.6 ? 1 - ct / 1.6 : 0;
    put(vx + 2, vy + vh + 1, 'BURN', a1 * 0.9);
    for (let y = 0; y < 3; y++)
      for (let x = 0; x < bwid; x++) {
        const v = Math.sin(x * 0.9 + t * 3.1 + y) * 0.5 + Math.sin(x * 0.37 - t * 2.3) * 0.5;
        const h = Math.max(0, Math.min(0.999, (v * 0.5 + 0.5) * (0.55 + 0.45 * flare) - y * 0.18 + 0.15));
        put(bx + x, by + 2 - y, FIRE[Math.floor(h * FIRE.length)], a1 * (0.45 + 0.4 * flare), y === 0 ? 1 : 0);
      }

    // wallets
    const a2 = em(2);
    const wx = Math.round(C * 0.72);
    const nW = Math.max(3, Math.min(holders, Math.floor((R - 4) / 2.4)));
    const gap = (R - 4) / nW;
    put(wx, 1, 'HOLDERS', a2);
    put(wx, 2, '───────', a2 * 0.5);
    for (let i = 0; i < nW; i++) {
      const wy = Math.round(4 + i * gap);
      const share = [24, 19, 15, 11, 8, 6, 5, 4, 3][i] || 2;
      const bar = Math.max(1, Math.round(share / 3));
      // a hit lands around 1.2s + i*0.12 into the cycle
      const land = 1.15 + i * 0.12;
      const hit = ct > land && ct < land + 0.9 ? 1 - (ct - land) / 0.9 : 0;
      put(wx, wy, `holder_${String(i + 1).padStart(2, '0')}`, a2);
      put(wx + 10, wy, '█'.repeat(bar), a2 * 0.75, i < 1 ? 1 : 0);
      if (C - wx > 26) put(wx + 19, wy, `${share}%`, a2 * 0.8);
      if (hit > 0) put(wx + 23 < C - 4 ? wx + 23 : wx + 19, wy, '+Z', Math.max(hit, 0.2), 2);
      // the coin for this wallet: a short hop from the vault
      const s0 = 0.25 + i * 0.12;
      const p = (ct - s0) / (land - s0);
      if (p > 0 && p < 1) {
        const x0 = vx + vw;
        const y0 = vy + 3;
        const x1 = wx - 2;
        const x = x0 + (x1 - x0) * p;
        const y = y0 + (wy - y0) * p - Math.sin(p * Math.PI) * (3 + i * 0.4);
        put(x, y, 'Z', Math.max(a2, 0.55), 1);
        put(x - 1, y + 0.4, '·', a2 * 0.4, 1);
      }
    }
    // one coin in five drops into the burn
    const dp = (ct - 0.3) / 0.9;
    if (dp > 0 && dp < 1) put(vx + vw / 2, vy + vh + dp * 4, 'Z', Math.max(a1, 0.55), 1);
  });
  return <canvas ref={ref} className={`zx-ascii ${className}`} aria-hidden="true" />;
}

// A quiet field of falling digits and Z's, for section backgrounds.
export function AsciiRain({ className = '', density = 0.06 }) {
  const ref = useAsciiCanvas(
    (g, t) => {
      const { C, R, put } = g;
      for (let x = 0; x < C; x++) {
        if (rnd(x) > density * 4) continue;
        const sp = 0.6 + rnd(x + 3) * 1.6;
        const head = ((t * sp + rnd(x + 7) * R * 3) % (R + 12)) - 6;
        for (let k = 0; k < 6; k++) {
          const y = Math.floor(head) - k;
          const c = rnd(x * 31 + y) > 0.85 ? 'Z' : String(Math.floor(rnd(x * 7 + y + Math.floor(t * 2)) * 10));
          put(x, y, c, (1 - k / 6) * 0.22, c === 'Z' ? 1 : 0);
        }
      }
    },
    { minCols: 90, maxCell: 9 },
  );
  return <canvas ref={ref} className={`zx-ascii ${className}`} aria-hidden="true" />;
}
