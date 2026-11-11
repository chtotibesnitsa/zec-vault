// 3D building blocks for the Zatoshi ad. Everything here is a pure function
// of time: no accumulated state, so any frame can be rendered on its own.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

export const TONE = {
  pay: new THREE.Color('#f2b440'),
  burn: new THREE.Color('#ff6b3d'),
  vault: new THREE.Color('#38c6e6'),
  trade: new THREE.Color('#4fd88a'),
  sell: new THREE.Color('#ff5c6c'),
  people: new THREE.Color('#a98bff'),
  gold: new THREE.Color('#e3a83a'),
  gold2: new THREE.Color('#f6d48e'),
};

export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lin = (t, a, b) => clamp((t - a) / (b - a));
export const ease = {
  out: (x) => 1 - Math.pow(1 - x, 3),
  out5: (x) => 1 - Math.pow(1 - x, 5),
  in: (x) => x * x * x,
  inOut: (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2),
  expo: (x) => (x >= 1 ? 1 : 1 - Math.pow(2, -10 * x)),
  back: (x) => {
    const c = 1.70158;
    return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2);
  },
  smooth: (x) => x * x * (3 - 2 * x),
};
export const mix = (a, b, k) => a + (b - a) * k;

export function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

// ---------- environment: a dark studio with colored softboxes ----------
export function makeEnv(renderer) {
  const sc = new THREE.Scene();
  sc.add(new THREE.Mesh(new THREE.SphereGeometry(60, 32, 16), new THREE.MeshBasicMaterial({ color: 0x030303, side: THREE.BackSide })));
  const panel = (w, h, color, k, pos) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k), side: THREE.DoubleSide }));
    m.position.set(...pos);
    m.lookAt(0, 0, 0);
    sc.add(m);
  };
  panel(34, 5, 0xfff1d6, 4.0, [0, 24, 6]); // overhead strip
  panel(10, 10, 0xffffff, 2.2, [10, 8, 24]); // front key
  panel(26, 14, 0xfff4e2, 1.5, [0, 2, 28]); // big soft front fill (lights the coin face)
  panel(3.5, 34, 0xf2b440, 3.0, [-24, 0, 4]); // gold strip left
  panel(3.5, 30, 0xdcecff, 1.2, [24, 2, -6]); // cool strip right
  panel(24, 3, 0xa98bff, 1.1, [0, -20, -12]); // violet floor bounce
  panel(6, 6, 0xff6b3d, 1.2, [-12, -10, -20]);
  const pm = new THREE.PMREMGenerator(renderer);
  const tex = pm.fromScene(sc, 0.03).texture;
  pm.dispose();
  return tex;
}

// ---------- the coin ----------
function faceTexture() {
  const S = 2048;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  g.fillStyle = '#808080';
  g.fillRect(0, 0, S, S);
  const cx = S / 2;
  // guilloché rosette
  g.strokeStyle = 'rgba(255,255,255,0.10)';
  g.lineWidth = 2;
  for (let k = 0; k < 96; k++) {
    const a = (k / 96) * Math.PI * 2;
    g.beginPath();
    g.arc(cx + Math.cos(a) * 120, cx + Math.sin(a) * 120, 560, 0, Math.PI * 2);
    g.stroke();
  }
  // fine concentric lathe lines
  g.strokeStyle = 'rgba(0,0,0,0.10)';
  g.lineWidth = 1.2;
  for (let r = 40; r < S * 0.47; r += 5) {
    g.beginPath();
    g.arc(cx, cx, r, 0, Math.PI * 2);
    g.stroke();
  }
  // engraved ring text
  const text = 'ZATOSHI  ·  HOLD TO EARN  ·  $ZATS  ·  PAID EVERY FIVE MINUTES  ·  ';
  g.font = '700 64px "Chakra Petch"';
  g.fillStyle = 'rgba(255,255,255,0.75)';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const R = S * 0.425;
  const step = (Math.PI * 2) / text.length;
  for (let i = 0; i < text.length; i++) {
    const a = -Math.PI / 2 + i * step;
    g.save();
    g.translate(cx + Math.cos(a) * R, cx + Math.sin(a) * R);
    g.rotate(a + Math.PI / 2);
    g.fillText(text[i], 0, 0);
    g.restore();
  }
  // dotted inner ring
  g.fillStyle = 'rgba(255,255,255,0.55)';
  for (let i = 0; i < 180; i++) {
    const a = (i / 180) * Math.PI * 2;
    g.beginPath();
    g.arc(cx + Math.cos(a) * S * 0.385, cx + Math.sin(a) * S * 0.385, 5, 0, Math.PI * 2);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.anisotropy = 8;
  return t;
}

export function makeCoin() {
  const R = 1.5;
  const depth = 0.26;
  const bump = faceTexture();
  const gold = new THREE.MeshPhysicalMaterial({ color: TONE.gold, metalness: 1, roughness: 0.2, clearcoat: 0.6, clearcoatRoughness: 0.15, emissive: TONE.gold.clone(), emissiveIntensity: 0 });
  const face = gold.clone();
  face.bumpMap = bump;
  face.bumpScale = 3;
  face.roughness = 0.3;
  const dark = new THREE.MeshPhysicalMaterial({ color: 0x15120d, metalness: 0.9, roughness: 0.28, clearcoat: 1, emissive: TONE.gold.clone(), emissiveIntensity: 0 });
  const coin = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(R, R, depth, 160, 1, true), gold);
  body.rotation.x = Math.PI / 2;
  coin.add(body);
  const ridges = new THREE.InstancedMesh(new THREE.BoxGeometry(0.03, depth * 0.94, 0.045), gold, 180);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const xAxis = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
  for (let i = 0; i < 180; i++) {
    const a = (i / 180) * Math.PI * 2;
    q.setFromAxisAngle(new THREE.Vector3(0, 0, 1), a).multiply(xAxis);
    m.compose(new THREE.Vector3(Math.cos(a) * R, Math.sin(a) * R, 0), q, new THREE.Vector3(1, 1, 1));
    ridges.setMatrixAt(i, m);
  }
  coin.add(ridges);
  const stamp = (geo, mat, lift = -0.01) => {
    for (const side of [1, -1]) {
      const s = new THREE.Mesh(geo, mat);
      s.position.z = side * (depth / 2 + lift);
      if (side < 0) s.rotation.y = Math.PI;
      coin.add(s);
    }
  };
  for (const side of [1, -1]) {
    const disk = new THREE.Mesh(new THREE.CircleGeometry(R * 0.93, 160), face);
    disk.position.z = (side * depth) / 2;
    if (side < 0) disk.rotation.y = Math.PI;
    coin.add(disk);
    const lip = new THREE.Mesh(new THREE.TorusGeometry(R * 0.965, R * 0.045, 20, 200), gold);
    lip.position.z = (side * depth) / 2;
    coin.add(lip);
  }
  const ext = { depth: 0.06, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.015, bevelSegments: 4, curveSegments: 64 };
  const ring = new THREE.Shape();
  ring.absarc(0, 0, 1.1, 0, Math.PI * 2, false);
  const hole = new THREE.Path();
  hole.absarc(0, 0, 0.94, 0, Math.PI * 2, true);
  ring.holes.push(hole);
  stamp(new THREE.ExtrudeGeometry(ring, ext), dark);
  const z = new THREE.Shape();
  const pts = [[-0.5, 0.5], [0.5, 0.5], [0.5, 0.3], [-0.16, -0.32], [0.5, -0.32], [0.5, -0.5], [-0.5, -0.5], [-0.5, -0.3], [0.16, 0.32], [-0.5, 0.32]];
  z.moveTo(pts[0][0], pts[0][1]);
  pts.slice(1).forEach(([x, y]) => z.lineTo(x, y));
  z.closePath();
  stamp(new THREE.ExtrudeGeometry(z, ext), dark);
  for (const y of [0.64, -0.64]) {
    const stem = new THREE.Shape();
    stem.moveTo(-0.07, y - 0.16);
    stem.lineTo(0.07, y - 0.16);
    stem.lineTo(0.07, y + 0.16);
    stem.lineTo(-0.07, y + 0.16);
    stem.closePath();
    stamp(new THREE.ExtrudeGeometry(stem, ext), dark);
  }
  coin.userData = { gold, face, dark, R, depth };
  return coin;
}

// A small, cheap coin for swarms (instanced).
export function miniCoinGeo() {
  const g = new THREE.CylinderGeometry(0.16, 0.16, 0.035, 40);
  g.rotateX(Math.PI / 2);
  return g;
}

// ---------- glyph atlas ----------
export const GLYPHS = 'ZATOSHI$01#%&*+=-:<>/\\|[]{}?!@ΞΣΔΩλπ∑∆◊◆▲▼×÷≈≠±∞§¥€£₿ZZZ0123456789ABCDEF';
export function glyphAtlas() {
  const N = 8;
  const C = 128;
  const c = document.createElement('canvas');
  c.width = c.height = N * C;
  const g = c.getContext('2d');
  g.fillStyle = '#000';
  g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = '#fff';
  g.font = '500 92px "IBM Plex Mono"';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  for (let i = 0; i < N * N; i++) {
    const ch = GLYPHS[i % GLYPHS.length];
    g.fillText(ch, (i % N) * C + C / 2, Math.floor(i / N) * C + C / 2 + 4);
  }
  const t = new THREE.CanvasTexture(c);
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

// Encrypted glyph cloud. uConverge pulls every glyph onto the coin's faces;
// uExplode pushes them out as a sphere shell.
export function makeGlyphField(atlas, count = 5200) {
  const r = rng(11);
  const pos = new Float32Array(count * 3);
  const tgt = new Float32Array(count * 3);
  const gly = new Float32Array(count);
  const seed = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    // a deep tunnel of glyphs along -z
    const a = r() * Math.PI * 2;
    const rad = 1.2 + Math.pow(r(), 0.7) * 9;
    pos[i * 3] = Math.cos(a) * rad;
    pos[i * 3 + 1] = Math.sin(a) * rad * 0.7;
    pos[i * 3 + 2] = 6 - r() * 46;
    // targets: points on the coin face and rim
    const ta = r() * Math.PI * 2;
    const face = r() < 0.75;
    const tr = face ? Math.sqrt(r()) * 1.42 : 1.5;
    tgt[i * 3] = Math.cos(ta) * tr;
    tgt[i * 3 + 1] = Math.sin(ta) * tr;
    tgt[i * 3 + 2] = face ? (r() < 0.5 ? 0.14 : -0.14) : (r() - 0.5) * 0.26;
    gly[i] = Math.floor(r() * 64);
    seed[i] = r();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aTarget', new THREE.BufferAttribute(tgt, 3));
  geo.setAttribute('aGlyph', new THREE.BufferAttribute(gly, 1));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uConverge: { value: 0 },
      uExplode: { value: 0 },
      uDrift: { value: 0 },
      uSize: { value: 230 },
      uPR: { value: 1 },
      uOpacity: { value: 1 },
      uColor: { value: TONE.gold.clone().multiplyScalar(1.6) },
      uHot: { value: TONE.gold2.clone().multiplyScalar(1.3) },
      uAtlas: { value: atlas },
      uLens: { value: new THREE.Vector3(0, 0, 0) },
    },
    vertexShader: /* glsl */ `
      attribute vec3 aTarget; attribute float aGlyph; attribute float aSeed;
      uniform float uTime, uConverge, uExplode, uDrift, uSize, uPR;
      varying float vGlyph; varying float vA; varying float vSeed; varying float vFade;
      void main(){
        vec3 p = position;
        p.z = mod(p.z + uDrift + 40.0, 46.0) - 40.0;
        float d = clamp(uConverge * 1.8 - aSeed * 0.8, 0.0, 1.0);
        d = d * d * (3.0 - 2.0 * d);
        float sw = d * (1.0 - d) * 5.0;
        mat2 R = mat2(cos(sw), -sin(sw), sin(sw), cos(sw));
        vec3 q = mix(p, aTarget, d);
        q.xy = R * q.xy;
        vec3 dir = normalize(aTarget + vec3(0.0001, 0.0, 0.3));
        q += dir * uExplode * (6.0 + aSeed * 18.0);
        vec4 mv = modelViewMatrix * vec4(q, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = uSize * uPR * mix(1.0, 0.45, d) / max(0.4, -mv.z);
        float rate = 4.0 + aSeed * 14.0;
        vGlyph = mod(aGlyph + floor(uTime * rate * (1.0 - d * 0.9)), 64.0);
        vA = d; vSeed = aSeed;
        vFade = smoothstep(-40.0, -22.0, mv.z) * smoothstep(0.2, 2.0, -mv.z);
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D uAtlas; uniform vec3 uColor; uniform vec3 uHot; uniform float uOpacity; uniform float uTime;
      varying float vGlyph; varying float vA; varying float vSeed; varying float vFade;
      void main(){
        vec2 pc = gl_PointCoord;
        float gx = mod(vGlyph, 8.0); float gy = floor(vGlyph / 8.0);
        vec2 uv = vec2((gx + pc.x) / 8.0, 1.0 - (gy + pc.y) / 8.0);
        float m = texture2D(uAtlas, uv).r;
        float flick = 0.35 + 0.65 * step(0.25, fract(sin(vSeed * 91.0 + floor(uTime * 12.0) * 3.1) * 43758.5));
        vec3 col = mix(uColor * flick, uHot, vA * vA);
        gl_FragColor = vec4(col * m, 1.0) * uOpacity * vFade;
      }`,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  return pts;
}

// ---------- soft bokeh dust ----------
export function makeDust(count = 520, color = TONE.gold2, spread = 26) {
  const r = rng(5);
  const pos = new Float32Array(count * 3);
  const seed = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = (r() - 0.5) * spread;
    pos[i * 3 + 1] = (r() - 0.5) * spread * 0.6;
    pos[i * 3 + 2] = (r() - 0.5) * spread;
    seed[i] = r();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uPR: { value: 1 }, uColor: { value: color.clone() }, uOpacity: { value: 0.32 }, uFocus: { value: 8 } },
    vertexShader: /* glsl */ `
      attribute float aSeed; uniform float uTime, uPR, uFocus; varying float vS; varying float vBlur;
      void main(){
        vec3 p = position;
        p.y += sin(uTime * 0.3 + aSeed * 40.0) * 0.6 + uTime * 0.05 * (aSeed - 0.5);
        p.x += cos(uTime * 0.2 + aSeed * 23.0) * 0.5;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        float dist = -mv.z;
        vBlur = clamp(abs(dist - uFocus) / 6.0, 0.0, 1.0);
        gl_PointSize = uPR * (2.5 + 40.0 * vBlur * (0.3 + aSeed)) * 6.0 / max(0.5, dist);
        vS = aSeed;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform float uOpacity; varying float vS; varying float vBlur;
      void main(){
        float d = length(gl_PointCoord - 0.5) * 2.0;
        float disc = smoothstep(1.0, mix(0.2, 0.85, vBlur), d);
        float ring = smoothstep(1.0, 0.86, d) * smoothstep(0.7, 0.9, d) * vBlur * 0.5;
        float a = (disc * mix(1.0, 0.18, vBlur) + ring) * uOpacity * (0.4 + vS * 0.6);
        gl_FragColor = vec4(uColor * a, 1.0);
      }`,
  });
  const p = new THREE.Points(geo, mat);
  p.frustumCulled = false;
  return p;
}

// ---------- flows: glowing particles with trails along paths ----------
// paths: array of fn(u) -> Vector3 (u in 0..1). Each particle is assigned a
// path, a phase and a color. update(t) moves everything deterministically.
export function makeFlow({ count = 400, trail = 7, paths, colorOf, speed = 0.4, size = 0.12, seed = 3, spread = 0.08, gap = 0.03 }) {
  const r = rng(seed);
  const n = count * trail;
  const pos = new Float32Array(n * 3);
  const col = new Float32Array(n * 3);
  const sz = new Float32Array(n);
  const P = [];
  for (let i = 0; i < count; i++) {
    const pi = Math.floor(r() * paths.length);
    const c = colorOf(pi, r);
    P.push({ pi, ph: r(), sp: speed * (0.7 + r() * 0.6), jx: (r() - 0.5) * spread, jy: (r() - 0.5) * spread, jz: (r() - 0.5) * spread, c, s: 0.6 + r() * 0.8 });
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(sz, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexColors: true,
    uniforms: { uPR: { value: 1 }, uOpacity: { value: 1 } },
    vertexShader: /* glsl */ `
      attribute float aSize; uniform float uPR; varying vec3 vC;
      void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * mv; gl_PointSize = aSize * uPR * 300.0 / max(0.3, -mv.z); vC = color; }`,
    fragmentShader: /* glsl */ `
      uniform float uOpacity; varying vec3 vC;
      void main(){ float d = length(gl_PointCoord-0.5)*2.0; float a = exp(-d*d*4.0) ; gl_FragColor = vec4(vC * a * uOpacity, 1.0); }`,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  const v = new THREE.Vector3();
  pts.userData.update = (t, { amount = 1, live = () => 1 } = {}) => {
    for (let i = 0; i < count; i++) {
      const p = P[i];
      const k = i / count < amount ? 1 : 0;
      for (let j = 0; j < trail; j++) {
        const u = (((p.ph + t * p.sp - j * gap) % 1) + 1) % 1;
        const idx = i * trail + j;
        v.copy(paths[p.pi](u, p));
        pos[idx * 3] = v.x + p.jx;
        pos[idx * 3 + 1] = v.y + p.jy;
        pos[idx * 3 + 2] = v.z + p.jz;
        const fade = (1 - j / trail) * k * live(u, p);
        col[idx * 3] = p.c.r * fade;
        col[idx * 3 + 1] = p.c.g * fade;
        col[idx * 3 + 2] = p.c.b * fade;
        sz[idx] = size * p.s * (1 - j / (trail * 1.4));
      }
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
    geo.attributes.aSize.needsUpdate = true;
  };
  return pts;
}

// ---------- liquid glass ----------
export function glassMat(tint, opts = {}) {
  return new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(tint).lerp(new THREE.Color('#ffffff'), 0.55),
    metalness: 0,
    roughness: opts.roughness ?? 0.06,
    transmission: 1,
    thickness: opts.thickness ?? 1.2,
    ior: 1.42,
    attenuationColor: new THREE.Color(tint),
    attenuationDistance: opts.att ?? 2.2,
    clearcoat: 1,
    clearcoatRoughness: 0.05,
    iridescence: opts.iri ?? 0.35,
    iridescenceIOR: 1.3,
    specularIntensity: 1,
    envMapIntensity: opts.env ?? 1.4,
    transparent: false,
  });
}

export function makeVault() {
  const g = new THREE.Group();
  const vm = glassMat(TONE.vault, { thickness: 0.8, att: 9, iri: 0.08, env: 2.2 });
  vm.color.set('#e9fbff');
  vm.ior = 1.3;
  const box = new THREE.Mesh(new RoundedBoxGeometry(2.4, 2.4, 2.4, 8, 0.32), vm);
  g.add(box);
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.42, 2), new THREE.MeshStandardMaterial({ color: 0x0b1f24, emissive: TONE.vault.clone(), emissiveIntensity: 1.2, roughness: 0.4, flatShading: true }));
  g.add(core);
  const frame = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(2.75, 2.75, 2.75)), new THREE.LineBasicMaterial({ color: TONE.vault.clone().multiplyScalar(1.6), transparent: true, opacity: 0.35 }));
  g.add(frame);
  const light = new THREE.PointLight(0xfff0dc, 12, 10);
  light.position.set(0, 1.6, 2.2);
  g.add(light);
  g.userData = { box, core, frame, light };
  return g;
}

// Three arcs: 80 / 10 / 10. Each separates outward along its bisector.
export function makeSplitRing() {
  const g = new THREE.Group();
  const R = 2.3;
  const parts = [
    ['pay', 0.8],
    ['burn', 0.1],
    ['vault', 0.1],
  ];
  let a0 = Math.PI / 2;
  const arcs = [];
  for (const [tone, frac] of parts) {
    const arc = frac * Math.PI * 2 - 0.06;
    const geo = new THREE.TorusGeometry(R, 0.3, 48, Math.max(24, Math.round(260 * frac)), arc);
    const mat = new THREE.MeshPhysicalMaterial({
      color: TONE[tone].clone(),
      metalness: 0.25,
      roughness: 0.12,
      transmission: 0.55,
      thickness: 0.8,
      clearcoat: 1,
      emissive: TONE[tone].clone(),
      emissiveIntensity: 0.1,
      iridescence: 0.25,
    });
    const m = new THREE.Mesh(geo, mat);
    const start = a0 - arc - 0.03;
    m.rotation.z = start;
    const mid = start + arc / 2;
    m.userData = { mid, tone, frac };
    g.add(m);
    arcs.push(m);
    a0 = start - 0.03;
  }
  g.userData = { arcs };
  return g;
}

// Holder field: glass orbs on a disc, size by balance.
export function makeHolders(n = 64) {
  const r = rng(21);
  const g = new THREE.Group();
  const orbs = [];
  for (let i = 0; i < n; i++) {
    const ring = 1 + Math.floor(i / 12);
    const a = (i % 12) / 12 * Math.PI * 2 + ring * 0.37 + r() * 0.2;
    const rad = 2.4 + ring * 1.15 + r() * 0.4;
    const bal = Math.pow(r(), 2.2);
    const s = 0.12 + bal * 0.38;
    const mat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, metalness: 0, roughness: 0.05, transmission: 1, thickness: 0.6, ior: 1.5, clearcoat: 1, iridescence: 0.5, emissive: TONE.pay.clone(), emissiveIntensity: 0 });
    const m = new THREE.Mesh(new THREE.SphereGeometry(s, 40, 24), mat);
    m.position.set(Math.cos(a) * rad, (r() - 0.5) * 0.3, Math.sin(a) * rad);
    m.userData = { a, rad, bal, s, delay: rad / 10 };
    const core = new THREE.Mesh(new THREE.SphereGeometry(s * 0.45, 20, 12), new THREE.MeshBasicMaterial({ color: TONE.pay.clone().multiplyScalar(1.5) }));
    core.scale.setScalar(0.001);
    m.add(core);
    m.userData.core = core;
    g.add(m);
    orbs.push(m);
  }
  // snapshot ripple
  const ripple = new THREE.Mesh(new THREE.RingGeometry(0.985, 1, 160), new THREE.MeshBasicMaterial({ color: TONE.pay.clone().multiplyScalar(1.4), transparent: true, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
  ripple.rotation.x = -Math.PI / 2;
  g.add(ripple);
  // floor disc grid
  const floor = new THREE.Mesh(new THREE.CircleGeometry(14, 128), gridMaterial(TONE.pay, 0.5));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.5;
  g.add(floor);
  g.userData = { orbs, ripple, floor };
  return g;
}

// Polar / square grid floor shader with a fade to the horizon.
export function gridMaterial(color, strength = 1, polar = true) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: { uColor: { value: color.clone() }, uK: { value: strength }, uTime: { value: 0 }, uScroll: { value: 0 }, uScan: { value: -1 } },
    vertexShader: `varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform float uK, uScroll, uScan; varying vec2 vP;
      float line(float x, float w){ float f = abs(fract(x) - 0.5); return smoothstep(w, 0.0, 0.5 - f); }
      void main(){
        float r = length(vP);
        float a = 0.0;
        ${polar ? `float ang = atan(vP.y, vP.x) / 6.2831853 * 48.0; a = max(line(r * 1.0 - uScroll, 0.03), line(ang, 0.02) * smoothstep(1.5, 3.0, r));` : `a = max(line(vP.x * 0.8, 0.025), line(vP.y * 0.8 + uScroll, 0.025));`}
        float fade = ${polar ? 'smoothstep(14.0, 3.0, r)' : 'smoothstep(30.0, 4.0, abs(vP.y)) * smoothstep(22.0, 6.0, abs(vP.x))'};
        float scan = uScan > 0.0 ? smoothstep(0.35, 0.0, abs(r - uScan)) * 1.2 : 0.0;
        gl_FragColor = vec4(uColor * (a * 0.55 * fade + scan * fade) * uK, 1.0);
      }`,
  });
}

// Furnace: a white-hot ring with a heat disc.
export function makeFurnace() {
  const g = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.TorusGeometry(2.1, 0.09, 24, 220), new THREE.MeshBasicMaterial({ color: TONE.burn.clone().multiplyScalar(3) }));
  ring.rotation.x = -Math.PI / 2;
  g.add(ring);
  const ring2 = new THREE.Mesh(new THREE.TorusGeometry(2.5, 0.025, 12, 220), new THREE.MeshBasicMaterial({ color: TONE.burn.clone().multiplyScalar(2.5) }));
  ring2.rotation.x = -Math.PI / 2;
  g.add(ring2);
  const heat = new THREE.Mesh(
    new THREE.CircleGeometry(2.1, 96),
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      uniforms: { uTime: { value: 0 }, uK: { value: 1 } },
      vertexShader: `varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: /* glsl */ `
        uniform float uTime, uK; varying vec2 vP;
        float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
        float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
        void main(){
          float r = length(vP) / 2.1;
          float ang = atan(vP.y, vP.x);
          float sw = n(vec2(ang * 3.0 + uTime * 0.6, r * 6.0 - uTime * 2.0)) * 0.6 + n(vec2(ang * 7.0 - uTime, r * 12.0 - uTime * 3.0)) * 0.4;
          float core = smoothstep(1.0, 0.0, r);
          vec3 c = mix(vec3(1.0,0.25,0.05), vec3(1.0,0.8,0.4), sw * core);
          gl_FragColor = vec4(c * (0.12 + sw * 0.7) * core * uK, 1.0);
        }`,
    }),
  );
  heat.rotation.x = -Math.PI / 2;
  heat.position.y = -0.02;
  g.add(heat);
  const light = new THREE.PointLight(TONE.burn, 30, 14);
  light.position.y = 0.8;
  g.add(light);
  g.userData = { ring, ring2, heat, light };
  return g;
}

// Embers: rise from the furnace ring with swirl, cool from white to red.
export function makeEmbers(count = 1400) {
  const r = rng(9);
  const pos = new Float32Array(count * 3);
  const seed = new Float32Array(count * 2);
  for (let i = 0; i < count; i++) {
    seed[i * 2] = r();
    seed[i * 2 + 1] = r();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 2));
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uPR: { value: 1 }, uK: { value: 1 } },
    vertexShader: /* glsl */ `
      attribute vec2 aSeed; uniform float uTime, uPR; varying float vLife; varying float vS;
      void main(){
        float life = fract(aSeed.x + uTime * (0.18 + aSeed.y * 0.22));
        float a = aSeed.y * 6.2831 + life * (2.0 + aSeed.x * 3.0);
        float rad = mix(1.9 + aSeed.x * 0.5, 0.6 + aSeed.y * 2.8, life);
        vec3 p = vec3(cos(a) * rad, life * (5.0 + aSeed.x * 3.0), sin(a) * rad);
        p.x += sin(life * 9.0 + aSeed.y * 30.0) * 0.3;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = uPR * (14.0 + aSeed.x * 22.0) * (1.0 - life * 0.7) / max(0.4, -mv.z);
        vLife = life; vS = aSeed.x;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uK; varying float vLife; varying float vS;
      void main(){
        float d = length(gl_PointCoord - 0.5) * 2.0; float a = exp(-d * d * 5.0);
        vec3 hot = vec3(1.0, 0.85, 0.55) * 5.0; vec3 mid = vec3(1.0, 0.42, 0.12) * 3.0; vec3 cold = vec3(0.6, 0.08, 0.02);
        vec3 c = vLife < 0.3 ? mix(hot, mid, vLife / 0.3) : mix(mid, cold, (vLife - 0.3) / 0.7);
        float fl = 0.7 + 0.3 * sin(vLife * 80.0 + vS * 40.0);
        gl_FragColor = vec4(c * a * (1.0 - vLife) * fl * uK, 1.0);
      }`,
  });
  const p = new THREE.Points(geo, mat);
  p.frustumCulled = false;
  return p;
}

// God rays: a big additive radial-streak plane.
export function makeRays(color = TONE.gold2) {
  const S = 1024;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const r = rng(77);
  g.translate(S / 2, S / 2);
  for (let i = 0; i < 140; i++) {
    const a = r() * Math.PI * 2;
    const w = 0.004 + r() * 0.03;
    const len = S * (0.2 + r() * 0.3);
    const grd = g.createLinearGradient(0, 0, Math.cos(a) * len, Math.sin(a) * len);
    grd.addColorStop(0, `rgba(255,255,255,${0.12 + r() * 0.2})`);
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.beginPath();
    g.moveTo(0, 0);
    g.arc(0, 0, len, a - w, a + w);
    g.closePath();
    g.fill();
  }
  const rad = g.createRadialGradient(0, 0, 0, 0, 0, S / 2);
  rad.addColorStop(0, 'rgba(255,255,255,0.9)');
  rad.addColorStop(0.08, 'rgba(255,255,255,0.35)');
  rad.addColorStop(0.4, 'rgba(255,255,255,0.05)');
  rad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = rad;
  g.fillRect(-S / 2, -S / 2, S, S);
  const tex = new THREE.CanvasTexture(c);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(16, 16), new THREE.MeshBasicMaterial({ map: tex, color: color.clone().multiplyScalar(0.8), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  return m;
}

// Burst: a shell of sparks thrown out from the origin at time t0.
export function makeBurst(count = 2200, color = TONE.gold2) {
  const r = rng(31);
  const dir = new Float32Array(count * 3);
  const seed = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const u = r() * 2 - 1;
    const a = r() * Math.PI * 2;
    const s = Math.sqrt(1 - u * u);
    dir[i * 3] = Math.cos(a) * s;
    dir[i * 3 + 1] = u * 0.75;
    dir[i * 3 + 2] = Math.sin(a) * s;
    seed[i] = r();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(dir, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uAge: { value: -1 }, uPR: { value: 1 }, uColor: { value: color.clone().multiplyScalar(2.2) } },
    vertexShader: /* glsl */ `
      attribute float aSeed; uniform float uAge, uPR; varying float vA;
      void main(){
        float age = max(0.0, uAge);
        float sp = 4.0 + aSeed * 14.0;
        float d = sp * (1.0 - exp(-age * 2.2)) / 2.2 * 2.2;
        vec3 p = position * d + vec3(0.0, -0.4 * age * age, 0.0);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        vA = uAge < 0.0 ? 0.0 : exp(-age * (0.8 + aSeed * 1.2));
        gl_PointSize = uPR * (8.0 + aSeed * 16.0) / max(0.4, -mv.z) * (0.5 + vA);
      }`,
    fragmentShader: `uniform vec3 uColor; varying float vA; void main(){ float d = length(gl_PointCoord-0.5)*2.0; gl_FragColor = vec4(uColor * exp(-d*d*5.0) * vA, 1.0); }`,
  });
  const p = new THREE.Points(geo, mat);
  p.frustumCulled = false;
  return p;
}

// Rounded glass pillar for the leaderboards.
export function makePillar(h, tone) {
  const g = new THREE.Group();
  const m = new THREE.Mesh(new RoundedBoxGeometry(1.3, h, 1.3, 6, 0.16), glassMat(TONE[tone], { thickness: 1.4, att: 1.6 }));
  m.position.y = h / 2;
  g.add(m);
  const cap = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.04, 1.05), new THREE.MeshBasicMaterial({ color: TONE[tone].clone().multiplyScalar(2) }));
  cap.position.y = h + 0.03;
  g.add(cap);
  const inner = new THREE.Mesh(new THREE.BoxGeometry(0.5, h * 0.9, 0.5), new THREE.MeshBasicMaterial({ color: TONE[tone].clone().multiplyScalar(0.7), transparent: true, opacity: 0.5 }));
  inner.position.y = h * 0.47;
  g.add(inner);
  g.userData = { h, body: m, cap, inner };
  return g;
}

// Text label rendered to a canvas, as a sprite-like plane (for 3D tokens).
export function labelDisc(text, bg, fg, R = 0.9) {
  const S = 512;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(S * 0.35, S * 0.3, 10, S / 2, S / 2, S / 2);
  grd.addColorStop(0, bg[0]);
  grd.addColorStop(1, bg[1]);
  g.fillStyle = grd;
  g.beginPath();
  g.arc(S / 2, S / 2, S / 2 - 4, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = 'rgba(255,255,255,0.5)';
  g.lineWidth = 10;
  g.stroke();
  g.fillStyle = fg;
  g.font = `700 ${text.length > 4 ? 118 : 150}px "Chakra Petch"`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, S / 2, S / 2 + 8);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const grp = new THREE.Group();
  const face = new THREE.MeshPhysicalMaterial({ map: tex, metalness: 0.3, roughness: 0.2, clearcoat: 1 });
  for (const side of [1, -1]) {
    const d = new THREE.Mesh(new THREE.CircleGeometry(R, 96), face);
    d.position.z = side * 0.09;
    if (side < 0) d.rotation.y = Math.PI;
    grp.add(d);
  }
  const edge = new THREE.Mesh(new THREE.CylinderGeometry(R, R, 0.18, 96, 1, true), new THREE.MeshPhysicalMaterial({ color: 0xdedede, metalness: 1, roughness: 0.25 }));
  edge.rotation.x = Math.PI / 2;
  grp.add(edge);
  return grp;
}

// ---------- final grade: blur, chroma, glitch, flash, vignette, grain ----------
export const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uVig: { value: 0.55 },
    uGrain: { value: 0.035 },
    uCA: { value: 0.0015 },
    uFlash: { value: 0 },
    uFlashColor: { value: new THREE.Color(1, 0.86, 0.6) },
    uGlitch: { value: 0 },
    uBlur: { value: 0 },
    uBlurDir: { value: new THREE.Vector2(1, 0) },
    uRes: { value: new THREE.Vector2(1920, 1080) },
    uLift: { value: new THREE.Color(0.012, 0.01, 0.008) },
    uFade: { value: 1 },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float uTime, uVig, uGrain, uCA, uFlash, uGlitch, uBlur, uFade;
    uniform vec3 uFlashColor, uLift; uniform vec2 uBlurDir, uRes; varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main(){
      vec2 uv = vUv;
      float fr = floor(uTime * 24.0);
      if (uGlitch > 0.001) {
        float row = floor(uv.y * 18.0 + h(vec2(fr, 1.0)) * 6.0);
        float r = h(vec2(row, fr));
        if (r < uGlitch * 0.55) uv.x += (h(vec2(row, fr + 3.0)) - 0.5) * 0.12 * uGlitch;
      }
      vec2 c = uv - 0.5;
      float ca = uCA + uGlitch * 0.012;
      vec3 col = vec3(0.0);
      for (int i = 0; i < 9; i++) {
        float k = float(i) / 8.0 - 0.5;
        vec2 o = uBlurDir * uBlur * k;
        col.r += texture2D(tDiffuse, uv + o + c * ca).r;
        col.g += texture2D(tDiffuse, uv + o).g;
        col.b += texture2D(tDiffuse, uv + o - c * ca).b;
      }
      col /= 9.0;
      float v = smoothstep(0.95, 0.25, length(c * vec2(1.0, 1.15)));
      col *= mix(1.0, v, uVig);
      col = col + uLift * (1.0 - col);
      col += uFlashColor * uFlash;
      col += (h(uv * uRes + fract(uTime * 7.13)) - 0.5) * uGrain;
      gl_FragColor = vec4(col * uFade, 1.0);
    }`,
};
