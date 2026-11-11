import { useEffect, useRef, useState } from 'react';

// Real-time 3D hero. The scene is drawn as a glossy WebGL render and as
// ASCII characters (a shader pass). The pointer is a "decryption lens": inside it
// you see the real object, outside it you see the encrypted ASCII view.
// three.js is loaded lazily so the first paint stays fast.

export default function Hero3D({ kind, accent, accent2, manual = false, hint = true, dist = 8.2 }) {
  const wrap = useRef(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let stop = () => {};
    let cancelled = false;
    (async () => {
      try {
        const kit = await import('./3d/kit.js');
        await kit.fontsReady();
        if (cancelled || !wrap.current) return;
        stop = mount(wrap.current, { kit, kind, accent, accent2, manual, dist });
      } catch (e) {
        console.warn('3D hero unavailable', e);
        setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
      stop();
    };
  }, [kind, accent, accent2, manual, dist]);

  if (failed) return null;
  return (
    <div className="hero3d" ref={wrap} aria-hidden="true">
      <div className="lens-ring" />
      {hint && (
        <div className="hero3d-hint">
          <span className="blink">▮</span> move your pointer over the coin
        </div>
      )}
    </div>
  );
}

// The ASCII view is one GPU pass: the scene renders into a texture, and a
// full-screen shader turns each character cell into a glyph from a small
// atlas (by brightness), showing the real render inside the lens. No pixel
// readback and no DOM text, so it costs about as much as the render itself.
const VERT = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const FRAG = `
uniform sampler2D tScene; uniform sampler2D tGlyph;
uniform vec2 res; uniform vec2 cell; uniform vec2 lens; uniform float lensR; uniform float feather;
uniform vec3 ink; uniform float glyphs;
varying vec2 vUv;
void main() {
  vec2 p = vUv * res;
  vec2 ci = floor(p / cell);
  vec4 sc = texture2D(tScene, (ci + 0.5) * cell / res);
  float lum = dot(sc.rgb, vec3(0.299, 0.587, 0.114));
  float l = 1.0 - exp(-lum * 2.4);
  float gi = floor(clamp(l * 1.12, 0.0, 0.999) * glyphs);
  vec2 g = fract(p / cell);
  float m = texture2D(tGlyph, vec2((gi + g.x) / glyphs, g.y)).r * step(0.02, sc.a);
  vec3 ascii = ink * m * (0.5 + l * 0.9);
  vec4 real = texture2D(tScene, vUv);
  float k = smoothstep(lensR, lensR - feather, distance(p, lens));
  gl_FragColor = vec4(mix(ascii, real.rgb, k), mix(m * 0.95, real.a, k));
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

function glyphAtlas(THREE, chars) {
  const W = 48;
  const H = 80;
  const c = document.createElement('canvas');
  c.width = W * chars.length;
  c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = '#000';
  g.fillRect(0, 0, c.width, H);
  g.fillStyle = '#fff';
  g.font = '700 62px "JetBrains Mono", ui-monospace, Menlo, monospace';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  [...chars].forEach((ch, i) => g.fillText(ch, i * W + W / 2, H / 2 + 3));
  const t = new THREE.CanvasTexture(c);
  t.minFilter = THREE.LinearFilter;
  t.generateMipmaps = false;
  return t;
}

function mount(el, { kit, kind, accent, accent2, manual, dist = 8.2 }) {
  const { THREE } = kit;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true, preserveDrawingBuffer: !!manual });
  const dpr = Math.min(window.devicePixelRatio || 1, manual ? 2 : 1.5);
  renderer.setPixelRatio(dpr);
  renderer.setClearColor(0x000000, 0);
  kit.setupRenderer(renderer);
  renderer.toneMappingExposure = 1.3;
  renderer.domElement.className = 'hero3d-gl';

  const scene = new THREE.Scene();
  scene.environment = kit.envFor(renderer);
  const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 100);
  camera.position.set(0, 0.3, dist);

  const acc = new THREE.Color(accent);
  const acc2 = new THREE.Color(accent2);
  const key = new THREE.DirectionalLight(acc2, 2.2);
  key.position.set(3, 4, 5);
  const rim = new THREE.PointLight(acc, 40, 20);
  rim.position.set(-3.5, -1, -2.5);
  const fill = new THREE.PointLight(0xfff1e0, 14, 20);
  fill.position.set(4, -3, 2);
  scene.add(key, rim, fill, new THREE.AmbientLight(0xffffff, 0.12));

  const root = new THREE.Group();
  scene.add(root);
  const tick = kind === 'zec' || kind === 'shield' ? buildZec(THREE, kit, root, acc) : buildXmr(THREE, root, acc);

  const rt = new THREE.WebGLRenderTarget(2, 2, { samples: 4, type: THREE.HalfFloatType });
  const post = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthTest: false,
    uniforms: {
      tScene: { value: rt.texture },
      tGlyph: { value: glyphAtlas(THREE, ' .:-+*=%@#') },
      glyphs: { value: 10 },
      res: { value: new THREE.Vector2(1, 1) },
      cell: { value: new THREE.Vector2(7, 11.5) },
      lens: { value: new THREE.Vector2() },
      lensR: { value: 120 },
      feather: { value: 10 },
      ink: { value: acc.clone().multiplyScalar(1.6) },
    },
  });
  const quadScene = new THREE.Scene();
  quadScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), post));
  const quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  el.prepend(renderer.domElement);
  const ringEl = el.querySelector('.lens-ring');

  let w = 0;
  let h = 0;
  const resize = () => {
    const r = el.getBoundingClientRect();
    w = Math.max(1, Math.round(r.width));
    h = Math.max(1, Math.round(r.height));
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
    rt.setSize(Math.round(w * dpr), Math.round(h * dpr));
    post.uniforms.res.value.set(w * dpr, h * dpr);
    const cw = (w < 520 ? 6 : 7) * dpr;
    post.uniforms.cell.value.set(cw, cw * 1.65);
    post.uniforms.feather.value = 10 * dpr;
    const lr = ringEl ? ringEl.getBoundingClientRect().width / 2 : 118;
    post.uniforms.lensR.value = Math.max(20, lr) * dpr;
  };
  resize();
  const ro = new ResizeObserver(resize);
  ro.observe(el);

  const draw = (mx, my) => {
    post.uniforms.lens.value.set(mx * w * dpr, (1 - my) * h * dpr);
    renderer.setRenderTarget(rt);
    renderer.clear();
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);
    renderer.clear();
    renderer.render(quadScene, quadCam);
  };

  // decryption lens follows the pointer; drifts on its own on touch screens
  let mx = 0.62;
  let my = 0.42;
  let tx = mx;
  let ty = my;
  let lastMove = 0;
  const onMove = (e) => {
    const r = el.getBoundingClientRect();
    if (e.clientY < r.top - 100 || e.clientY > r.bottom + 100) return;
    tx = (e.clientX - r.left) / r.width;
    ty = (e.clientY - r.top) / r.height;
    lastMove = performance.now();
  };
  window.addEventListener('pointermove', onMove, { passive: true });

  let visible = true;
  const io = new IntersectionObserver(([en]) => (visible = en.isIntersecting), { threshold: 0 });
  io.observe(el);

  const clock = new THREE.Clock();
  let raf = 0;
  let lastCss = '';
  const loop = () => {
    raf = requestAnimationFrame(loop);
    if (!visible || document.hidden) return;
    const t = clock.getElapsedTime();
    if (performance.now() - lastMove > 2500) {
      tx = 0.5 + Math.sin(t * 0.45) * 0.28;
      ty = 0.45 + Math.sin(t * 0.7) * 0.22;
    }
    mx += (tx - mx) * 0.08;
    my += (ty - my) * 0.08;
    const css = (mx * 100).toFixed(1) + '|' + (my * 100).toFixed(1);
    if (css !== lastCss) {
      lastCss = css;
      el.style.setProperty('--mx', (mx * 100).toFixed(1) + '%');
      el.style.setProperty('--my', (my * 100).toFixed(1) + '%');
    }
    root.rotation.y += ((mx - 0.5) * 0.6 - root.rotation.y) * 0.04;
    root.rotation.x += ((my - 0.5) * 0.4 - root.rotation.x) * 0.04;
    tick(t);
    draw(mx, my);
  };
  if (manual) {
    // Trailer capture: the caller sets the time for every frame.
    el.__seek = (t) => {
      const lx = 0.5 + Math.sin(t * 0.55) * 0.26;
      const ly = 0.47 + Math.sin(t * 0.83) * 0.2;
      el.style.setProperty('--mx', (lx * 100).toFixed(2) + '%');
      el.style.setProperty('--my', (ly * 100).toFixed(2) + '%');
      root.rotation.y = (lx - 0.5) * 0.6;
      root.rotation.x = (ly - 0.5) * 0.4;
      tick(t);
      resize();
      draw(lx, ly);
    };
    el.__seek(0);
    el.dataset.ready = '1';
  } else if (reduced) {
    tick(1.2);
    draw(mx, my);
  } else loop();

  return () => {
    cancelAnimationFrame(raf);
    ro.disconnect();
    io.disconnect();
    window.removeEventListener('pointermove', onMove);
    rt.dispose();
    post.dispose();
    renderer.dispose();
    renderer.domElement.remove();
  };
}

// A minted coin: metal body, reeded edge, raised lip on both faces. The
// face artwork is added by the caller as extruded relief.
function coinBody(THREE, { R, depth, edge, face }) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(R, R, depth, 128, 1, true), edge);
  body.rotation.x = Math.PI / 2;
  g.add(body);
  const ridges = new THREE.InstancedMesh(new THREE.BoxGeometry(0.035, depth * 0.96, 0.05), edge, 150);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const xAxis = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
  for (let i = 0; i < 150; i++) {
    const a = (i / 150) * Math.PI * 2;
    q.setFromAxisAngle(new THREE.Vector3(0, 0, 1), a).multiply(xAxis);
    m.compose(new THREE.Vector3(Math.cos(a) * R, Math.sin(a) * R, 0), q, new THREE.Vector3(1, 1, 1));
    ridges.setMatrixAt(i, m);
  }
  g.add(ridges);
  for (const side of [1, -1]) {
    const disk = new THREE.Mesh(new THREE.CircleGeometry(R * 0.93, 128), face);
    disk.position.z = (side * depth) / 2;
    if (side < 0) disk.rotation.y = Math.PI;
    g.add(disk);
    const lip = new THREE.Mesh(new THREE.TorusGeometry(R * 0.965, R * 0.045, 16, 160), edge);
    lip.position.z = (side * depth) / 2;
    g.add(lip);
  }
  return g;
}

// Adds the same relief to both faces of a coin.
function stamp(THREE, coin, geo, mat, depth, lift = 0) {
  for (const side of [1, -1]) {
    const m = new THREE.Mesh(geo, mat);
    m.position.z = side * (depth / 2 + lift);
    if (side < 0) m.rotation.y = Math.PI;
    coin.add(m);
  }
}

// Monero: orange coin, white M band, graphite lower segment. Eleven decoy
// coins orbit it; one at a time lights up as the real signer.
function buildXmr(THREE, root, acc) {
  const R = 1.5;
  const depth = 0.26;
  const orange = new THREE.MeshPhysicalMaterial({ color: acc, metalness: 0.75, roughness: 0.28, clearcoat: 0.8 });
  const graphite = new THREE.MeshPhysicalMaterial({ color: 0x4c4c4c, metalness: 0.9, roughness: 0.35 });
  const silver = new THREE.MeshPhysicalMaterial({ color: 0xf2f2f2, metalness: 0.6, roughness: 0.18, clearcoat: 1 });
  const coin = coinBody(THREE, { R, depth, edge: graphite, face: orange });
  root.add(coin);
  const k = R * 0.93;
  const P = (pts) => pts.map(([x, y]) => new THREE.Vector2(x * k, y * k));
  const mShape = new THREE.Shape(
    P([[-0.968, -0.25], [-0.62, -0.25], [-0.62, 0.56], [0, -0.06], [0.62, 0.56], [0.62, -0.25], [0.968, -0.25], [0.906, -0.42], [0.45, -0.42], [0.45, 0.15], [0, -0.3], [-0.45, 0.15], [-0.45, -0.42], [-0.906, -0.42]]),
  );
  const ext = { depth: 0.07, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.015, bevelSegments: 3 };
  stamp(THREE, coin, new THREE.ExtrudeGeometry(mShape, ext), silver, depth, -0.01);
  const seg = new THREE.Shape();
  const a0 = Math.asin(-0.42);
  seg.moveTo(-0.906 * k, -0.42 * k);
  seg.lineTo(0.906 * k, -0.42 * k);
  seg.absarc(0, 0, k, a0, Math.PI - a0 + Math.PI * 0, true);
  stamp(THREE, coin, new THREE.ExtrudeGeometry(seg, { depth: 0.03, bevelEnabled: false }), graphite, depth, -0.01);

  const orbit = new THREE.Group();
  orbit.rotation.x = 1.2;
  root.add(orbit);
  const mini = [];
  const N = 11;
  const miniGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.045, 40);
  for (let i = 0; i < N; i++) {
    const mat = new THREE.MeshPhysicalMaterial({ color: 0x2c2c2e, metalness: 1, roughness: 0.3, emissive: acc.clone(), emissiveIntensity: 0 });
    const m = new THREE.Mesh(miniGeo, mat);
    const a = (i / N) * Math.PI * 2;
    m.position.set(Math.cos(a) * 2.55, Math.sin(a) * 2.55, 0);
    m.rotation.set(i * 0.7, i * 1.3, 0);
    orbit.add(m);
    mini.push(m);
  }
  orbit.add(new THREE.Mesh(new THREE.TorusGeometry(2.55, 0.008, 8, 220), new THREE.MeshBasicMaterial({ color: acc, transparent: true, opacity: 0.3 })));
  return (t) => {
    coin.rotation.y = t * 0.7;
    coin.rotation.x = Math.sin(t * 0.6) * 0.18;
    coin.position.y = Math.sin(t * 1.1) * 0.06;
    orbit.rotation.z = t * 0.14;
    const signer = Math.floor(t * 1.2) % N;
    mini.forEach((m, i) => {
      m.rotation.x = i * 0.7 + t * 0.9;
      m.rotation.z = t * 0.6 + i;
      const target = i === signer ? 2.4 : 0;
      m.material.emissiveIntensity += (target - m.material.emissiveIntensity) * 0.18;
    });
  };
}

// $ZATS: the detailed minted coin from the shared kit (gold, enamel ring
// with legend, Z with stems). Shielded notes spiral into it.
function buildZec(THREE, kit, root, acc) {
  const coin = kit.zatsCoin('hi');
  coin.scale.setScalar(1.5);
  root.add(coin);

  const hexGeo = new THREE.CylinderGeometry(0.16, 0.16, 0.06, 6);
  const notes = [];
  for (let i = 0; i < 16; i++) {
    const m = new THREE.Mesh(hexGeo, new THREE.MeshPhysicalMaterial({ color: 0x24211b, metalness: 1, roughness: 0.3, emissive: acc.clone(), emissiveIntensity: 0.3 }));
    m.userData.phase = i / 16;
    m.userData.a = i * 2.39;
    root.add(m);
    notes.push(m);
  }
  return (t) => {
    coin.rotation.y = t * 0.6;
    coin.rotation.x = Math.sin(t * 0.7) * 0.14;
    coin.position.y = Math.sin(t * 1.0) * 0.06;
    notes.forEach((m) => {
      const p = (m.userData.phase + t * 0.1) % 1;
      const r = 3.4 * (1 - p) + 0.3;
      const a = m.userData.a + t * 0.4 + p * 2.5;
      m.position.set(Math.cos(a) * r, Math.sin(a * 1.3) * 0.9 * (1 - p), Math.sin(a) * r * 0.5);
      const sc = p > 0.85 ? (1 - p) / 0.15 : 1;
      m.scale.setScalar(Math.max(0.001, sc));
      m.rotation.x = t * 1.8 + m.userData.a;
      m.rotation.z = t * 1.2;
    });
  };
}
