// Site background: a live topographic map. A slowly drifting noise field is
// traced into contour lines every frame (marching squares on a coarse grid),
// with a soft hill that follows the pointer. One 2D canvas, ~24 fps, paused
// while the tab is hidden, a single still frame for reduced motion.
import { useEffect, useRef } from 'react';

const CELL = 22; // CSS px per grid cell
const LEVELS = 11;
const FPS = 24;

// Small seeded value noise, smooth enough for terrain.
function makeNoise(seed = 7) {
  const P = new Uint8Array(512);
  const v = new Float32Array(256);
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 256; i++) {
    P[i] = i;
    v[i] = rnd();
  }
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [P[i], P[j]] = [P[j], P[i]];
  }
  for (let i = 0; i < 256; i++) P[i + 256] = P[i];
  const sm = (t) => t * t * (3 - 2 * t);
  const h = (x, y, z) => v[P[P[P[x & 255] + (y & 255)] + (z & 255)]];
  return (x, y, z) => {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
    const xf = sm(x - xi), yf = sm(y - yi), zf = sm(z - zi);
    const l = (a, b, t) => a + (b - a) * t;
    const a = l(l(h(xi, yi, zi), h(xi + 1, yi, zi), xf), l(h(xi, yi + 1, zi), h(xi + 1, yi + 1, zi), xf), yf);
    const b = l(l(h(xi, yi, zi + 1), h(xi + 1, yi, zi + 1), xf), l(h(xi, yi + 1, zi + 1), h(xi + 1, yi + 1, zi + 1), xf), yf);
    return l(a, b, zf);
  };
}

// Contour colors: mostly quiet warm grey, every few lines a brand tint.
function levelStyle(k) {
  if (k === 3) return 'rgba(231, 169, 47, 0.22)'; // gold
  if (k === 7) return 'rgba(150, 132, 230, 0.20)'; // violet
  if (k === 9) return 'rgba(88, 196, 140, 0.16)'; // green
  return 'rgba(236, 230, 220, 0.1)';
}

export default function Terrain() {
  const ref = useRef(null);
  useEffect(() => {
    const cv = ref.current;
    const ctx = cv.getContext('2d');
    const noise = makeNoise(11);
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let W = 0, H = 0, cols = 0, rows = 0, field = null, dpr = 1;
    let raf = 0, last = 0, t0 = performance.now();
    const ptr = { x: -9999, y: -9999, tx: -9999, ty: -9999, a: 0, ta: 0 };

    const size = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      W = window.innerWidth;
      H = window.innerHeight;
      cv.width = Math.round(W * dpr);
      cv.height = Math.round(H * dpr);
      cols = Math.ceil(W / CELL) + 1;
      rows = Math.ceil(H / CELL) + 1;
      field = new Float32Array((cols + 1) * (rows + 1));
    };

    const sample = (t) => {
      const z = t * 0.035;
      const drift = t * 0.012;
      const sc = 0.055;
      const sy = window.scrollY * 0.15; // the map moves a little with the page
      for (let j = 0; j <= rows; j++) {
        for (let i = 0; i <= cols; i++) {
          const x = i * sc + drift;
          const y = (j + sy / CELL) * sc;
          let n = noise(x, y, z) * 0.68 + noise(x * 2.3 + 40, y * 2.3, z * 1.6) * 0.32;
          if (ptr.a > 0.001) {
            const dx = i * CELL - ptr.x, dy = j * CELL - ptr.y;
            n += ptr.a * 0.22 * Math.exp(-(dx * dx + dy * dy) / (2 * 150 * 150));
          }
          field[j * (cols + 1) + i] = n;
        }
      }
    };

    const draw = (now) => {
      const t = (now - t0) / 1000;
      ptr.x += (ptr.tx - ptr.x) * 0.08;
      ptr.y += (ptr.ty - ptr.y) * 0.08;
      ptr.a += (ptr.ta - ptr.a) * 0.05;
      sample(t);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      ctx.lineWidth = 1;
      const C = cols + 1;
      for (let k = 0; k < LEVELS; k++) {
        const iso = 0.22 + (k / (LEVELS - 1)) * 0.6;
        ctx.beginPath();
        for (let j = 0; j < rows; j++) {
          for (let i = 0; i < cols; i++) {
            const a = field[j * C + i], b = field[j * C + i + 1];
            const c = field[(j + 1) * C + i + 1], d = field[(j + 1) * C + i];
            const m = (a > iso ? 8 : 0) | (b > iso ? 4 : 0) | (c > iso ? 2 : 0) | (d > iso ? 1 : 0);
            if (m === 0 || m === 15) continue;
            const x = i * CELL, y = j * CELL;
            const top = [x + CELL * ((iso - a) / (b - a)), y];
            const right = [x + CELL, y + CELL * ((iso - b) / (c - b))];
            const bot = [x + CELL * ((iso - d) / (c - d)), y + CELL];
            const left = [x, y + CELL * ((iso - a) / (d - a))];
            const seg = (p, q) => {
              ctx.moveTo(p[0], p[1]);
              ctx.lineTo(q[0], q[1]);
            };
            switch (m) {
              case 1: case 14: seg(left, bot); break;
              case 2: case 13: seg(bot, right); break;
              case 3: case 12: seg(left, right); break;
              case 4: case 11: seg(top, right); break;
              case 6: case 9: seg(top, bot); break;
              case 7: case 8: seg(left, top); break;
              case 5: seg(left, top); seg(bot, right); break;
              case 10: seg(top, right); seg(left, bot); break;
              default: break;
            }
          }
        }
        ctx.strokeStyle = levelStyle(k);
        ctx.stroke();
      }
    };

    const loop = (now) => {
      raf = requestAnimationFrame(loop);
      if (document.hidden || now - last < 1000 / FPS) return;
      last = now;
      draw(now);
    };

    const onMove = (e) => {
      ptr.tx = e.clientX;
      ptr.ty = e.clientY;
      if (ptr.x < -1000) {
        ptr.x = ptr.tx;
        ptr.y = ptr.ty;
      }
      ptr.ta = 1;
    };
    const onLeave = () => (ptr.ta = 0);
    const onResize = () => {
      size();
      if (still) draw(performance.now());
    };

    size();
    if (still) draw(t0 + 40000);
    else {
      raf = requestAnimationFrame(loop);
      window.addEventListener('pointermove', onMove, { passive: true });
      document.addEventListener('pointerleave', onLeave);
    }
    window.addEventListener('resize', onResize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerleave', onLeave);
      window.removeEventListener('resize', onResize);
    };
  }, []);
  return (
    <div className="terrain" aria-hidden="true">
      <canvas ref={ref} />
    </div>
  );
}
