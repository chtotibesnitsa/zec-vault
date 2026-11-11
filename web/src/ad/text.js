// Kinetic type for the ad. Text is split into words and characters once;
// every frame sets each character's style from the timeline (no CSS
// animations), so frames render the same whether played live or captured.
import { clamp, ease, lin, GLYPHS } from './world.js';

export function el(tag, cls, html, parent) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html != null) n.innerHTML = html;
  if (parent) parent.appendChild(n);
  return n;
}

function splitNode(node) {
  for (const child of [...node.childNodes]) {
    if (child.nodeType === 3) {
      const frag = document.createDocumentFragment();
      const parts = child.textContent.split(/(\s+)/);
      for (const part of parts) {
        if (!part) continue;
        if (/^\s+$/.test(part)) {
          frag.appendChild(document.createTextNode(' '));
          continue;
        }
        const w = document.createElement('span');
        w.className = 'w';
        for (const ch of part) {
          const c = document.createElement('span');
          c.className = 'c';
          c.textContent = ch;
          c.dataset.ch = ch;
          w.appendChild(c);
        }
        frag.appendChild(w);
      }
      node.replaceChild(frag, child);
    } else if (child.nodeType === 1 && !child.classList.contains('nosplit')) {
      splitNode(child);
    }
  }
}

export function txt(parent, cls, html) {
  const n = el('div', 'tx ' + (cls || ''), html, parent);
  splitNode(n);
  n._c = [...n.querySelectorAll('.c')];
  n.style.opacity = '0';
  return n;
}

const hash = (a, b) => {
  const x = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return x - Math.floor(x);
};

// Show `node` between t0 and t1 (local seconds) with an entrance and exit.
// modes: rise, decrypt, slam, fade, wipe
export function show(node, t, t0, t1, o = {}) {
  const { mode = 'rise', dur = 0.7, stagger = 0.022, out = 0.35, outMode = 'up' } = o;
  if (t < t0 - 0.01 || t > t1 + out) {
    node.style.opacity = '0';
    return 0;
  }
  const q = t1 < 1e8 ? ease.in(lin(t, t1, t1 + out)) : 0;
  node.style.opacity = String(1 - q);
  if (outMode === 'up') {
    node.style.transform = `translate3d(0, ${-q * 26}px, 0)`;
    node.style.filter = q > 0 ? `blur(${q * 10}px)` : '';
  } else if (outMode === 'zoom') {
    node.style.transform = `scale(${1 + q * 0.18})`;
    node.style.filter = q > 0 ? `blur(${q * 14}px)` : '';
  } else node.style.transform = '';
  const cs = node._c || [];
  const n = cs.length;
  if (mode === 'slam') {
    const p = lin(t, t0, t0 + dur);
    const e = ease.out5(p);
    node.style.transform = `scale(${1.5 - 0.5 * e}) translate3d(0, ${-q * 26}px, 0)`;
    node.style.filter = `blur(${(1 - e) * 18 + q * 10}px)`;
    node.style.opacity = String(Math.min(1, p * 4) * (1 - q));
    for (const c of cs) {
      c.style.opacity = '';
      c.style.transform = '';
      c.style.filter = '';
    }
    return p;
  }
  for (let i = 0; i < n; i++) {
    const c = cs[i];
    const s = t0 + i * stagger;
    if (mode === 'decrypt') {
      const resolve = s + dur * 0.6;
      const on = t >= s;
      c.style.opacity = on ? '1' : '0';
      if (t < resolve && on && c.dataset.ch.trim()) {
        c.textContent = GLYPHS[Math.floor(hash(i, Math.floor(t * 26)) * GLYPHS.length)];
        c.classList.add('enc');
      } else {
        c.textContent = c.dataset.ch;
        c.classList.remove('enc');
      }
    } else if (mode === 'wipe') {
      const p = ease.out(lin(t, s, s + dur));
      c.style.opacity = String(p);
      c.style.transform = `translate3d(${(1 - p) * -0.4}em, 0, 0)`;
      c.style.filter = p < 1 ? `blur(${(1 - p) * 8}px)` : '';
    } else if (mode === 'fade') {
      const p = ease.out(lin(t, s, s + dur));
      c.style.opacity = String(p);
    } else {
      const p = ease.out5(lin(t, s, s + dur));
      c.style.opacity = String(clamp(p * 1.4));
      c.style.transform = `translate3d(0, ${(1 - p) * 0.55}em, 0) rotateX(${(1 - p) * -70}deg)`;
      c.style.filter = p < 1 ? `blur(${(1 - p) * 12}px)` : '';
    }
  }
  return lin(t, t0, t0 + dur + n * stagger);
}

// Simple element fade/slide (for cards and chips).
export function pop(node, t, t0, t1, o = {}) {
  const { dur = 0.6, out = 0.35, y = 30, x = 0, scale = 0.96, blur = 10 } = o;
  if (t < t0 - 0.01 || t > t1 + out) {
    node.style.opacity = '0';
    node.style.visibility = 'hidden';
    return 0;
  }
  node.style.visibility = 'visible';
  const p = ease.out5(lin(t, t0, t0 + dur));
  const q = ease.in(lin(t, t1, t1 + out));
  node.style.opacity = String(clamp(p * 1.3) * (1 - q));
  const sc = scale + (1 - scale) * p + q * 0.04;
  node.style.transform = `translate3d(${(1 - p) * x}px, ${(1 - p) * y - q * 20}px, 0) scale(${sc})`;
  node.style.filter = p < 1 || q > 0 ? `blur(${(1 - p) * blur + q * blur}px)` : '';
  return p;
}

export function typeText(node, text, t, t0, cps = 22) {
  const n = Math.max(0, Math.min(text.length, Math.floor((t - t0) * cps)));
  node.textContent = t < t0 ? '' : text.slice(0, n);
  return n >= text.length;
}
