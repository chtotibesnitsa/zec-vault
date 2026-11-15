// Shared 3D kit: materials, canvas textures and the detailed coins used by
// every scene and every small object on the site.
//
// Coins are built like real minted coins: a lathed rim with a rounded lip,
// a reeded edge (normal map), a field with fine concentric lathe lines and
// an engraved legend (bump map), and the logo as beveled relief.
//   ZATS: gold, dark enamel ring with a legend, the Z with top/bottom stems.
//   SOL:  gunmetal, the three Solana bars in the teal-to-purple gradient.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

import { FontLoader } from 'three/examples/jsm/loaders/FontLoader.js';
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry.js';
import fontUrl from 'three/examples/fonts/helvetiker_bold.typeface.json?url';

export { THREE, RoundedBoxGeometry };

// Web fonts used inside canvas textures must be loaded before drawing.
let fontsP = null;
export function fontsReady() {
  if (!fontsP) {
    fontsP = Promise.race([
      Promise.all(['900 64px Satoshi', '700 64px Satoshi', '700 64px "JetBrains Mono"'].map((f) => document.fonts?.load(f).catch(() => null))),
      new Promise((r) => setTimeout(r, 1500)),
    ]);
  }
  return fontsP;
}

// A real typeface for extruded numbers and symbols (loaded once, lazily).
let faceP = null;
export function typeface() {
  if (!faceP) faceP = fetch(fontUrl).then((r) => r.json()).then((j) => new FontLoader().parse(j));
  return faceP;
}
export function textGeo(face, str, size, depth, bevel = size * 0.04) {
  const g = new TextGeometry(str, { font: face, size, depth, curveSegments: 10, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel * 0.7, bevelSegments: 3 });
  g.computeBoundingBox();
  const b = g.boundingBox;
  g.translate(-(b.max.x + b.min.x) / 2, -(b.max.y + b.min.y) / 2, -depth / 2);
  return g;
}

export const COL = {
  // muted, matching the site palette (v10.css): no neon
  pay: 0xe9b44c,
  gold: 0xe9a93a,
  burn: 0xd97a52,
  vault: 0x7f9ddc,
  trade: 0x7dbd96,
  sell: 0xd4776f,
  people: 0xa99cd9,
  sol: 0x9945ff,
  sol2: 0x14f195,
  steel: 0x2a2b31,
};

// ---------------------------------------------------------------- env
const envCache = new WeakMap();
export function envFor(renderer) {
  if (!envCache.has(renderer)) {
    const pmrem = new THREE.PMREMGenerator(renderer);
    const tex = pmrem.fromScene(new RoomEnvironment(), 0.035).texture;
    pmrem.dispose();
    envCache.set(renderer, tex);
  }
  return envCache.get(renderer);
}

export function setupRenderer(renderer) {
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
}

// ---------------------------------------------------------------- materials
const matCache = new Map();
const once = (k, make) => (matCache.has(k) ? matCache.get(k) : (matCache.set(k, make()), matCache.get(k)));

export const M = {
  gold: () => once('gold', () => new THREE.MeshPhysicalMaterial({ color: 0xf0b44a, metalness: 1, roughness: 0.26, clearcoat: 0.35, clearcoatRoughness: 0.2 })),
  goldDim: () => once('goldDim', () => new THREE.MeshStandardMaterial({ color: 0xc98f2c, metalness: 1, roughness: 0.34 })),
  enamel: () => once('enamel', () => new THREE.MeshPhysicalMaterial({ color: 0x17140f, metalness: 0.3, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.08 })),
  gunmetal: () => once('gunmetal', () => new THREE.MeshPhysicalMaterial({ color: 0x24252b, metalness: 1, roughness: 0.3, clearcoat: 0.5, clearcoatRoughness: 0.15 })),
  silver: () => once('silver', () => new THREE.MeshStandardMaterial({ color: 0xd6dae2, metalness: 1, roughness: 0.22 })),
  steel: (c = COL.steel, r = 0.38) => once('steel' + c + r, () => new THREE.MeshStandardMaterial({ color: c, metalness: 0.9, roughness: r })),
  paint: (c, r = 0.42) => once('paint' + c + r, () => new THREE.MeshPhysicalMaterial({ color: c, metalness: 0.15, roughness: r, clearcoat: 0.6, clearcoatRoughness: 0.2 })),
  metal: (c, r = 0.3) => once('metal' + c + r, () => new THREE.MeshStandardMaterial({ color: c, metalness: 1, roughness: r })),
  glow: (c, i = 1) => once('glow' + c + i, () => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.55 * i, metalness: 0.1, roughness: 0.45 })),
  basic: (c, o = 1) => once('basic' + c + o, () => new THREE.MeshBasicMaterial({ color: c, transparent: o < 1, opacity: o, depthWrite: o >= 1 })),
  add: (c, o = 1) => once('add' + c + o, () => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, blending: THREE.AdditiveBlending, depthWrite: false })),
};

// ---------------------------------------------------------------- textures
export function canvasTex(size, draw, { color = true, w = size, h = size } = {}) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  if (color) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

const texCache = new Map();
const tex = (k, make) => (texCache.has(k) ? texCache.get(k) : (texCache.set(k, make()), texCache.get(k)));

// Vertical ridges for a reeded edge, as a normal map (u runs around the coin).
export const reedNormal = (n = 180) =>
  tex('reed' + n, () => {
    const t = canvasTex(
      0,
      (g, w, h) => {
        const per = w / n;
        for (let x = 0; x < w; x++) {
          const p = (x % per) / per;
          const nx = Math.sin(p * Math.PI * 2) * 0.85;
          const r = Math.round((nx * 0.5 + 0.5) * 255);
          g.fillStyle = `rgb(${r},128,${Math.round(Math.sqrt(Math.max(0, 1 - nx * nx)) * 127 + 128)})`;
          g.fillRect(x, 0, 1, h);
        }
      },
      { color: false, w: n * 8, h: 4 },
    );
    t.wrapS = THREE.RepeatWrapping;
    return t;
  });

// Coin field: fine concentric lathe lines plus an engraved legend near the rim.
// Returned as a bump map (grayscale) and a roughness variation.
function fieldTex(legend, key) {
  return tex('field' + key, () =>
    canvasTex(
      1024,
      (g, w) => {
        const c = w / 2;
        g.fillStyle = '#808080';
        g.fillRect(0, 0, w, w);
        for (let r = 4; r < c; r += 2.2) {
          g.strokeStyle = `rgba(${r % 4.4 < 2.2 ? '255,255,255' : '0,0,0'},0.10)`;
          g.lineWidth = 1;
          g.beginPath();
          g.arc(c, c, r, 0, Math.PI * 2);
          g.stroke();
        }
        if (legend) {
          g.fillStyle = '#2a2a2a';
          g.font = `700 ${w * 0.052}px "JetBrains Mono", ui-monospace, Menlo, monospace`;
          g.textAlign = 'center';
          g.textBaseline = 'middle';
          const R = c * 0.86;
          const chars = [...legend];
          const step = (Math.PI * 2) / chars.length;
          chars.forEach((ch, i) => {
            const a = -Math.PI / 2 + i * step;
            g.save();
            g.translate(c + Math.cos(a) * R, c + Math.sin(a) * R);
            g.rotate(a + Math.PI / 2);
            g.fillText(ch, 0, 0);
            g.restore();
          });
        }
      },
      { color: false },
    ),
  );
}

// ---------------------------------------------------------------- shapes
export function shapeFrom(pts, s = 1) {
  const sh = new THREE.Shape();
  pts.forEach(([x, y], i) => (i ? sh.lineTo(x * s, y * s) : sh.moveTo(x * s, y * s)));
  sh.closePath();
  return sh;
}

export function ringShape(r0, r1, seg = 96) {
  const s = new THREE.Shape();
  s.absarc(0, 0, r1, 0, Math.PI * 2, false);
  const h = new THREE.Path();
  h.absarc(0, 0, r0, 0, Math.PI * 2, true);
  s.holes.push(h);
  s.userData = { seg };
  return s;
}

// Rounded parallelogram for the Solana bars.
function solBar(x0, x1, y0, y1, slant, flip, r = 0.035) {
  // bottom edge x0..x1 at y0, top edge shifted by slant (or -slant if flip)
  const d = flip ? -slant : slant;
  const p = [
    [x0, y0],
    [x1, y0],
    [x1 + d, y1],
    [x0 + d, y1],
  ];
  const s = new THREE.Shape();
  const n = p.length;
  for (let i = 0; i < n; i++) {
    const a = p[(i + n - 1) % n];
    const b = p[i];
    const c = p[(i + 1) % n];
    const v1 = [a[0] - b[0], a[1] - b[1]];
    const v2 = [c[0] - b[0], c[1] - b[1]];
    const l1 = Math.hypot(...v1);
    const l2 = Math.hypot(...v2);
    const pA = [b[0] + (v1[0] / l1) * r, b[1] + (v1[1] / l1) * r];
    const pB = [b[0] + (v2[0] / l2) * r, b[1] + (v2[1] / l2) * r];
    if (i === 0) s.moveTo(...pA);
    else s.lineTo(...pA);
    s.quadraticCurveTo(b[0], b[1], ...pB);
  }
  s.closePath();
  return s;
}

// The Solana mark, centered, about 1 unit wide.
export function solanaShapes() {
  const W = 0.82;
  const H = 0.19;
  const gap = 0.105;
  const sl = 0.2;
  const xs = -W / 2 - sl / 2;
  const ys = [-(H * 1.5 + gap), -H / 2, H / 2 + gap];
  const shapes = [solBar(xs, xs + W, ys[0], ys[0] + H, sl, false), solBar(xs + sl, xs + sl + W, ys[1], ys[1] + H, sl, true), solBar(xs, xs + W, ys[2], ys[2] + H, sl, false)];
  return shapes;
}

// The Zcash-style Z with stems (the $ZATS mark), about 1.3 units tall.
export function zShapes() {
  const z = shapeFrom([
    [-0.42, 0.44],
    [0.42, 0.44],
    [0.42, 0.28],
    [-0.14, -0.28],
    [0.42, -0.28],
    [0.42, -0.44],
    [-0.42, -0.44],
    [-0.42, -0.28],
    [0.14, 0.28],
    [-0.42, 0.28],
  ]);
  const stem = (y0, y1) => shapeFrom([[-0.075, y0], [0.075, y0], [0.075, y1], [-0.075, y1]]);
  return [z, stem(0.44, 0.66), stem(-0.66, -0.44)];
}

// Cap UVs of an ExtrudeGeometry are the shape's x/y; this maps [-k, k] to [0, 1].
export function capMap(t, k = 1) {
  t.repeat.set(1 / (2 * k), 1 / (2 * k));
  t.offset.set(0.5, 0.5);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

const solGradient = () =>
  tex('solgrad', () =>
    capMap(
      canvasTex(256, (g, w) => {
        const gr = g.createLinearGradient(w * 0.95, 0, w * 0.1, w);
        gr.addColorStop(0, '#00FFA3');
        gr.addColorStop(0.5, '#4fa8e8');
        gr.addColorStop(1, '#DC1FFF');
        g.fillStyle = gr;
        g.fillRect(0, 0, w, w);
      }),
      0.62,
    ),
  );

// Legend engraved in gold on the dark enamel ring (shape coords -1..1).
const zatsRingTex = () =>
  tex('zring', () =>
    capMap(
      canvasTex(1024, (g, w) => {
        const c = w / 2;
        g.fillStyle = '#17140f';
        g.fillRect(0, 0, w, w);
        g.fillStyle = '#d9a440';
        g.font = `700 ${w * 0.036}px "JetBrains Mono", ui-monospace, Menlo, monospace`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        const text = 'ZATOSHI · $ZATS · SHIELDED · ZATOSHI · $ZATS · SHIELDED · ';
        const R = c * 0.778;
        const chars = [...text];
        const step = (Math.PI * 2) / chars.length;
        chars.forEach((ch, i) => {
          const a = -Math.PI / 2 + i * step;
          g.save();
          g.translate(c + Math.cos(a) * R, c + Math.sin(a) * R);
          g.rotate(a + Math.PI / 2);
          g.fillText(ch, 0, 0);
          g.restore();
        });
      }),
      1,
    ),
  );

// ---------------------------------------------------------------- coins
const geoCache = new Map();
const geo = (k, make) => (geoCache.has(k) ? geoCache.get(k) : (geoCache.set(k, make()), geoCache.get(k)));

// Rim + lip as one lathe (axis Z after rotation). R = 1, thickness ~0.17.
function rimGeo(seg) {
  return geo('rim' + seg, () => {
    const p = [];
    const T = 0.085;
    const add = (x, y) => p.push(new THREE.Vector2(x, y));
    add(0.865, T - 0.02);
    add(0.875, T + 0.004);
    for (let i = 0; i <= 6; i++) {
      const a = (i / 6) * Math.PI * 0.5;
      add(0.94 + Math.sin(a) * 0.05, T + 0.012 - (1 - Math.cos(a)) * 0.022);
    }
    add(0.997, T - 0.02);
    add(1.0, T - 0.03);
    // the other face (mirror)
    const back = p.map((v) => new THREE.Vector2(v.x, -v.y)).reverse();
    const g = new THREE.LatheGeometry([...back, ...p].reverse(), seg);
    g.rotateX(Math.PI / 2);
    return g;
  });
}
const edgeGeo = (seg) =>
  geo('edge' + seg, () => {
    const g = new THREE.CylinderGeometry(1.0, 1.0, 0.11, seg, 1, true);
    g.rotateX(Math.PI / 2);
    return g;
  });
const fieldGeo = (seg) => geo('field' + seg, () => new THREE.CircleGeometry(0.875, seg));

const extrude = (k, shapes, depth, bevel = 0.012, seg = 48) =>
  geo(k, () =>
    new THREE.ExtrudeGeometry(shapes, {
      depth,
      bevelEnabled: bevel > 0,
      bevelThickness: bevel,
      bevelSize: bevel * 0.9,
      bevelSegments: 3,
      curveSegments: seg,
    }),
  );

function faceMat(color, legendKey, legend, metal = 1, rough = 0.3) {
  return once('face' + legendKey + color, () => {
    const bump = fieldTex(legend, legendKey);
    return new THREE.MeshPhysicalMaterial({ color, metalness: metal, roughness: rough, bumpMap: bump, bumpScale: 1.4 });
  });
}

function edgeMat(color, rough = 0.32) {
  return once('edge' + color, () => {
    const n = reedNormal(180);
    return new THREE.MeshStandardMaterial({ color, metalness: 1, roughness: rough, normalMap: n, normalScale: new THREE.Vector2(1.2, 1.2) });
  });
}

// detail: 'hi' for hero/scene coins, 'lo' for small or many coins.
export function zatsCoin(detail = 'hi') {
  const seg = detail === 'hi' ? 128 : 64;
  const cs = detail === 'hi' ? 64 : 24;
  const g = new THREE.Group();
  const gold = M.gold();
  g.add(new THREE.Mesh(rimGeo(seg), gold));
  g.add(new THREE.Mesh(edgeGeo(seg), edgeMat(0xe6a83c)));
  const face = faceMat(0xf0b44a, 'zats', null);
  const ringMats = once('zringMats', () => [new THREE.MeshPhysicalMaterial({ map: zatsRingTex(), metalness: 0.35, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.06 }), M.enamel()]);
  const ring = extrude('zring' + cs, ringShape(0.69, 0.845), 0.03, 0.01, cs);
  const zmark = extrude('zmark' + cs, zShapes().map((s) => s), 0.04, 0.014, 8);
  for (const side of [1, -1]) {
    const f = new THREE.Group();
    const field = new THREE.Mesh(fieldGeo(seg), face);
    field.position.z = 0.07;
    f.add(field);
    const r = new THREE.Mesh(ring, ringMats);
    r.position.z = 0.062;
    f.add(r);
    const z = new THREE.Mesh(zmark, M.enamel());
    z.position.z = 0.062;
    f.add(z);
    if (side < 0) f.rotation.y = Math.PI;
    g.add(f);
  }
  g.userData.kind = 'zats';
  return g;
}

export function solCoin(detail = 'hi') {
  const seg = detail === 'hi' ? 128 : 64;
  const g = new THREE.Group();
  g.add(new THREE.Mesh(rimGeo(seg), M.gunmetal()));
  g.add(new THREE.Mesh(edgeGeo(seg), edgeMat(0x3a3c44, 0.36)));
  const face = faceMat(0x1b1c22, 'sol', 'SOLANA · PROOF OF HISTORY · SOL · ', 0.9, 0.36);
  const marks = extrude('solmark', solanaShapes(), 0.045, 0.012, 6);
  const markMats = once('solMarkMats', () => [
    new THREE.MeshPhysicalMaterial({ map: solGradient(), emissive: 0xffffff, emissiveMap: solGradient(), emissiveIntensity: 0.18, metalness: 0.55, roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.05 }),
    new THREE.MeshStandardMaterial({ color: 0x9aa0b0, metalness: 1, roughness: 0.25 }),
  ]);
  const inner = extrude('solring', ringShape(0.74, 0.76), 0.012, 0, 96);
  for (const side of [1, -1]) {
    const f = new THREE.Group();
    const field = new THREE.Mesh(fieldGeo(seg), face);
    field.position.z = 0.07;
    f.add(field);
    const m = new THREE.Mesh(marks, markMats);
    m.position.z = 0.064;
    m.scale.setScalar(1.02);
    f.add(m);
    const ir = new THREE.Mesh(inner, M.silver());
    ir.position.z = 0.068;
    f.add(ir);
    if (side < 0) f.rotation.y = Math.PI;
    g.add(f);
  }
  g.userData.kind = 'sol';
  return g;
}

// A plain coin geometry for instanced swarms (rim + faces in one mesh).
export const swarmCoinGeo = () =>
  geo('swarm', () => {
    const p = [new THREE.Vector2(0, 0.06), new THREE.Vector2(0.8, 0.06), new THREE.Vector2(0.88, 0.085), new THREE.Vector2(0.97, 0.075), new THREE.Vector2(1, 0.04), new THREE.Vector2(1, -0.04), new THREE.Vector2(0.97, -0.075), new THREE.Vector2(0.88, -0.085), new THREE.Vector2(0.8, -0.06), new THREE.Vector2(0, -0.06)];
    const g = new THREE.LatheGeometry(p.reverse(), 40);
    g.rotateX(Math.PI / 2);
    return g;
  });

export function roundBox(w, h, d, r = 0.06, seg = 4) {
  r = Math.min(r, Math.min(w, h, d) / 2 - 1e-4); // a radius over half a side makes NaN geometry
  return geo(`rb${w}|${h}|${d}|${r}|${seg}`, () => new RoundedBoxGeometry(w, h, d, seg, r));
}

// A small person: head + shoulders (a wallet holder).
export function bust(mat) {
  const g = new THREE.Group();
  const head = new THREE.Mesh(geo('bhead', () => new THREE.SphereGeometry(0.22, 32, 24)), mat);
  head.position.y = 0.3;
  const body = new THREE.Mesh(
    geo('bbody', () => {
      const pts = [];
      for (let i = 0; i <= 10; i++) {
        const a = (i / 10) * Math.PI * 0.5;
        pts.push(new THREE.Vector2(Math.sin(a) * 0.36 + 0.001, Math.cos(a) * 0.3 - 0.3));
      }
      pts.push(new THREE.Vector2(0.36, -0.34));
      pts.push(new THREE.Vector2(0.001, -0.34));
      return new THREE.LatheGeometry(pts.reverse(), 32);
    }),
    mat,
  );
  body.position.y = 0.1;
  g.add(head, body);
  return g;
}

// Soft round contact shadow under an object.
export function shadow(r = 1, o = 0.5, y = 0) {
  const t = tex('shadow', () =>
    canvasTex(128, (g, w) => {
      const gr = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
      gr.addColorStop(0, 'rgba(0,0,0,1)');
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr;
      g.fillRect(0, 0, w, w);
    }),
  );
  const m = new THREE.Mesh(new THREE.PlaneGeometry(r * 2, r * 2), new THREE.MeshBasicMaterial({ map: t, transparent: true, opacity: o, depthWrite: false }));
  m.rotation.x = -Math.PI / 2;
  m.position.y = y;
  m.userData.fakeShadow = true;
  return m;
}

// A soft glow sprite.
export function glowSprite(color, size = 1, o = 0.8) {
  const t = tex('glowdot', () =>
    canvasTex(128, (g, w) => {
      const gr = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
      gr.addColorStop(0, 'rgba(255,255,255,1)');
      gr.addColorStop(0.25, 'rgba(255,255,255,0.45)');
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr;
      g.fillRect(0, 0, w, w);
    }),
  );
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, color, transparent: true, opacity: o, blending: THREE.AdditiveBlending, depthWrite: false }));
  s.scale.setScalar(size);
  return s;
}

// Text on a transparent plane (labels on podium fronts, card faces, dials).
export function textPlane(text, { w = 1, h = 0.5, color = '#fff', font = '900 200px Satoshi, system-ui, sans-serif', px = 512 } = {}) {
  const t = canvasTex(
    0,
    (g, cw, ch) => {
      g.fillStyle = color;
      g.font = font;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(text, cw / 2, ch / 2 + ch * 0.04);
    },
    { w: px, h: Math.round((px * h) / w) },
  );
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false }));
}

export const ease = (k) => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);
export const clamp01 = (v) => Math.max(0, Math.min(1, v));

// Teardrop flame (use with additive materials, nested at 3 scales).
export const flameGeo = () =>
  geo('flame', () => {
    const pts = [];
    for (let i = 0; i <= 16; i++) {
      const v = i / 16;
      pts.push(new THREE.Vector2(Math.sin(v * Math.PI) * (1 - v) ** 0.6 * 0.5 + 0.0001, v * 1.6 - 0.2));
    }
    return new THREE.LatheGeometry(pts, 32);
  });

// A moving dash texture for flow tracks (animate .offset.x).
export function dashTex() {
  const t = canvasTex(
    0,
    (g, w, h) => {
      g.fillStyle = 'rgba(255,255,255,0.18)';
      g.fillRect(0, 0, w, h);
      const gr = g.createLinearGradient(0, 0, w * 0.5, 0);
      gr.addColorStop(0, 'rgba(255,255,255,0)');
      gr.addColorStop(1, 'rgba(255,255,255,1)');
      g.fillStyle = gr;
      g.fillRect(0, 0, w * 0.5, h);
    },
    { w: 128, h: 8 },
  );
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

// A solid, glossy flame in the style of 3D icon sets: an orange outer
// tongue with a yellow core in front, both emitting light (a path tracer
// lights the scene with them). h = height.
export function iconFlame(h = 1) {
  const g = new THREE.Group();
  const tongue = (w, hh, lean) => {
    const pts = [];
    for (let i = 0; i <= 24; i++) {
      const v = i / 24;
      const r = Math.sin(Math.pow(v, 0.42) * Math.PI) * Math.pow(1 - v, 1.05) * w * 1.35;
      pts.push(new THREE.Vector2(Math.max(0.0005, r), v * hh));
    }
    const geo = new THREE.LatheGeometry(pts, 48);
    // bend the tip sideways so it reads as a living flame, not a cone
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i) / hh;
      p.setX(i, p.getX(i) + Math.sin(y * Math.PI * 1.5) * lean * y * 1.6);
    }
    geo.computeVertexNormals();
    return geo;
  };
  const outer = new THREE.Mesh(tongue(0.4 * h, 1.45 * h, 0.16 * h), new THREE.MeshPhysicalMaterial({ color: 0xff5a1e, emissive: 0xff4a10, emissiveIntensity: 0.75, roughness: 0.35, clearcoat: 1, clearcoatRoughness: 0.15 }));
  const mid = new THREE.Mesh(tongue(0.28 * h, 1.0 * h, -0.12 * h), new THREE.MeshPhysicalMaterial({ color: 0xff9a2a, emissive: 0xff7a10, emissiveIntensity: 0.95, roughness: 0.3, clearcoat: 1 }));
  mid.position.set(0.02 * h, 0, 0.14 * h);
  const core = new THREE.Mesh(tongue(0.16 * h, 0.6 * h, 0.06 * h), new THREE.MeshPhysicalMaterial({ color: 0xffd36a, emissive: 0xffc040, emissiveIntensity: 1.2, roughness: 0.3, clearcoat: 1 }));
  core.position.set(0, 0, 0.26 * h);
  g.add(outer, mid, core);
  return g;
}
