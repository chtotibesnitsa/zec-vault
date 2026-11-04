import { useEffect, useRef, useState } from 'react';

// Real-time 3D hero. The scene is drawn twice: as a glossy WebGL render and
// as ASCII characters on top. The pointer is a "decryption lens": inside it
// you see the real object, outside it you see the encrypted ASCII view.
// three.js is loaded lazily so the first paint stays fast.

export default function Hero3D({ kind, accent, accent2, manual = false, hint = true }) {
  const wrap = useRef(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let stop = () => {};
    let cancelled = false;
    (async () => {
      try {
        const THREE = await import('three');
        const { AsciiEffect } = await import('three/examples/jsm/effects/AsciiEffect.js');
        const { RoomEnvironment } = await import('three/examples/jsm/environments/RoomEnvironment.js');
        if (cancelled || !wrap.current) return;
        stop = mount(wrap.current, { THREE, AsciiEffect, RoomEnvironment, kind, accent, accent2, manual });
      } catch (e) {
        console.warn('3D hero unavailable', e);
        setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
      stop();
    };
  }, [kind, accent, accent2, manual]);

  if (failed) return null;
  return (
    <div className="hero3d" ref={wrap} aria-hidden="true">
      <div className="lens-ring" />
      {hint && (
        <div className="hero3d-hint">
          <span className="blink">▮</span> move to decrypt
        </div>
      )}
    </div>
  );
}

function mount(el, { THREE, AsciiEffect, RoomEnvironment, kind, accent, accent2, manual }) {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.setClearColor(0x000000, 1); // opaque black reads as blank in the ASCII pass
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.35;
  renderer.domElement.className = 'hero3d-solid';

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

  const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 100);
  camera.position.set(0, 0.3, 8.2);

  const acc = new THREE.Color(accent);
  const acc2 = new THREE.Color(accent2);
  const key = new THREE.DirectionalLight(acc2, 2.4);
  key.position.set(3, 4, 5);
  const rim = new THREE.PointLight(acc, 60, 20);
  rim.position.set(-3.5, -1, -2.5);
  const fill = new THREE.PointLight(0xfff1e0, 18, 20);
  fill.position.set(4, -3, 2);
  scene.add(key, rim, fill, new THREE.AmbientLight(0xffffff, 0.15));

  const root = new THREE.Group();
  scene.add(root);
  const tick = kind === 'zec' || kind === 'shield' ? buildZec(THREE, root, acc) : buildXmr(THREE, root, acc);

  // ASCII layer (encrypted view)
  const ascii = new AsciiEffect(renderer, ' .:-+*=%@#', { invert: true, resolution: 0.17 });
  ascii.domElement.className = 'hero3d-ascii';
  el.prepend(renderer.domElement);
  el.prepend(ascii.domElement);

  let w = 0;
  let h = 0;
  const resize = () => {
    const r = el.getBoundingClientRect();
    w = Math.max(1, Math.round(r.width));
    h = Math.max(1, Math.round(r.height));
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    ascii.setSize(w, h); // also sizes the WebGL canvas
  };
  resize();
  const ro = new ResizeObserver(resize);
  ro.observe(el);

  // decryption lens follows the pointer; drifts on its own on touch screens
  let mx = 0.62;
  let my = 0.42;
  let tx = mx;
  let ty = my;
  let lastMove = 0;
  const onMove = (e) => {
    const r = el.getBoundingClientRect();
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
  let frame = 0;
  const loop = () => {
    raf = requestAnimationFrame(loop);
    if (!visible || document.hidden) return;
    frame++;
    const t = clock.getElapsedTime();
    if (performance.now() - lastMove > 2500) {
      tx = 0.5 + Math.sin(t * 0.45) * 0.28;
      ty = 0.45 + Math.sin(t * 0.7) * 0.22;
    }
    mx += (tx - mx) * 0.08;
    my += (ty - my) * 0.08;
    el.style.setProperty('--mx', (mx * 100).toFixed(2) + '%');
    el.style.setProperty('--my', (my * 100).toFixed(2) + '%');
    root.rotation.y += ((mx - 0.5) * 0.6 - root.rotation.y) * 0.04;
    root.rotation.x += ((my - 0.5) * 0.4 - root.rotation.x) * 0.04;
    tick(t);
    // ASCII render draws the WebGL frame too; on slow phones refresh it every other frame
    if (w < 520 && frame % 2) renderer.render(scene, camera);
    else ascii.render(scene, camera);
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
      ascii.render(scene, camera);
    };
    el.__seek(0);
    el.dataset.ready = '1';
  } else if (reduced) {
    tick(1.2);
    ascii.render(scene, camera);
  } else loop();

  return () => {
    cancelAnimationFrame(raf);
    ro.disconnect();
    io.disconnect();
    window.removeEventListener('pointermove', onMove);
    renderer.dispose();
    pmrem.dispose();
    ascii.domElement.remove();
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

// Zcash: gold coin, dark ring, Z with stems. Shielded notes spiral into it.
function buildZec(THREE, root, acc) {
  const R = 1.5;
  const depth = 0.26;
  const gold = new THREE.MeshPhysicalMaterial({ color: acc, metalness: 1, roughness: 0.24, clearcoat: 0.7 });
  const dark = new THREE.MeshPhysicalMaterial({ color: 0x1a1712, metalness: 0.9, roughness: 0.3, clearcoat: 1 });
  const coin = coinBody(THREE, { R, depth, edge: gold, face: gold });
  root.add(coin);
  const ring = new THREE.Shape();
  ring.absarc(0, 0, 1.1, 0, Math.PI * 2, false);
  const hole = new THREE.Path();
  hole.absarc(0, 0, 0.94, 0, Math.PI * 2, true);
  ring.holes.push(hole);
  const ext = { depth: 0.06, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.015, bevelSegments: 3 };
  stamp(THREE, coin, new THREE.ExtrudeGeometry(ring, { ...ext, curveSegments: 64 }), dark, depth, -0.01);
  const z = new THREE.Shape();
  const pts = [[-0.5, 0.5], [0.5, 0.5], [0.5, 0.3], [-0.16, -0.32], [0.5, -0.32], [0.5, -0.5], [-0.5, -0.5], [-0.5, -0.3], [0.16, 0.32], [-0.5, 0.32]];
  z.moveTo(pts[0][0], pts[0][1]);
  pts.slice(1).forEach(([x, y]) => z.lineTo(x, y));
  z.closePath();
  stamp(THREE, coin, new THREE.ExtrudeGeometry(z, ext), dark, depth, -0.01);
  for (const y of [0.64, -0.64]) {
    const stem = new THREE.Shape();
    stem.moveTo(-0.07, y - 0.16);
    stem.lineTo(0.07, y - 0.16);
    stem.lineTo(0.07, y + 0.16);
    stem.lineTo(-0.07, y + 0.16);
    stem.closePath();
    stamp(THREE, coin, new THREE.ExtrudeGeometry(stem, ext), dark, depth, -0.01);
  }

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
