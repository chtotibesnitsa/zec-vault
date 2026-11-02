import { useEffect, useRef, useState } from 'react';

// Real-time 3D hero. The scene is drawn twice: as a glossy WebGL render and
// as ASCII characters on top. The pointer is a "decryption lens": inside it
// you see the real object, outside it you see the encrypted ASCII view.
// three.js is loaded lazily so the first paint stays fast.

export default function Hero3D({ kind, accent, accent2 }) {
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
        stop = mount(wrap.current, { THREE, AsciiEffect, RoomEnvironment, kind, accent, accent2 });
      } catch (e) {
        console.warn('3D hero unavailable', e);
        setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
      stop();
    };
  }, [kind, accent, accent2]);

  if (failed) return null;
  return (
    <div className="hero3d" ref={wrap} aria-hidden="true">
      <div className="lens-ring" />
      <div className="hero3d-hint">
        <span className="blink">▮</span> move to decrypt
      </div>
    </div>
  );
}

function mount(el, { THREE, AsciiEffect, RoomEnvironment, kind, accent, accent2 }) {
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
  const fill = new THREE.PointLight(0x8b5cf6, 25, 20);
  fill.position.set(4, -3, 2);
  scene.add(key, rim, fill, new THREE.AmbientLight(0xffffff, 0.15));

  const root = new THREE.Group();
  scene.add(root);
  const tick = kind === 'shield' ? buildOrchard(THREE, root, acc) : buildWraith(THREE, root, acc);

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
  if (reduced) {
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

// Monero mood: a living obsidian core inside a ring of decoys. One ring is the
// real signer and the highlight keeps hopping between them.
function buildWraith(THREE, root, acc) {
  const geo = new THREE.IcosahedronGeometry(1.25, 48);
  const base = geo.attributes.position.array.slice();
  const core = new THREE.Mesh(
    geo,
    new THREE.MeshPhysicalMaterial({ color: 0x111014, metalness: 0.9, roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.08, iridescence: 0.6, iridescenceIOR: 1.6 }),
  );
  root.add(core);

  const ringMat = () => new THREE.MeshPhysicalMaterial({ color: 0x2a2730, metalness: 1, roughness: 0.25, clearcoat: 1, emissive: acc.clone(), emissiveIntensity: 0 });
  const ringGeo = new THREE.TorusGeometry(0.3, 0.075, 24, 64);
  const orbit = new THREE.Group();
  orbit.rotation.x = 1.15;
  root.add(orbit);
  const rings = [];
  const N = 11;
  for (let i = 0; i < N; i++) {
    const m = new THREE.Mesh(ringGeo, ringMat());
    const a = (i / N) * Math.PI * 2;
    m.position.set(Math.cos(a) * 2.35, Math.sin(a) * 2.35, 0);
    m.rotation.set(Math.random() * 3, Math.random() * 3, 0);
    orbit.add(m);
    rings.push(m);
  }
  const halo = new THREE.Mesh(new THREE.TorusGeometry(2.35, 0.01, 8, 200), new THREE.MeshBasicMaterial({ color: acc, transparent: true, opacity: 0.35 }));
  orbit.add(halo);

  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  return (t) => {
    // slow organic wobble on the core
    for (let i = 0; i < pos.count; i++) {
      v.set(base[i * 3], base[i * 3 + 1], base[i * 3 + 2]).normalize();
      const n = Math.sin(v.x * 3.1 + t * 1.1) * Math.sin(v.y * 2.7 + t * 0.9) * Math.sin(v.z * 3.3 + t * 1.3);
      const r = 1.25 + n * 0.09;
      pos.setXYZ(i, v.x * r, v.y * r, v.z * r);
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
    core.rotation.y = t * 0.15;
    orbit.rotation.z = t * 0.12;
    const signer = Math.floor(t * 1.1) % N;
    rings.forEach((m, i) => {
      m.rotation.x += 0.01;
      m.rotation.y += 0.013;
      const target = i === signer ? 2.2 : 0;
      m.material.emissiveIntensity += (target - m.material.emissiveIntensity) * 0.15;
    });
  };
}

// Zcash mood: a heavy gold coin stamped with a Z; hexagonal notes fall into
// the shielded pool and vanish.
function buildOrchard(THREE, root, acc) {
  const gold = new THREE.MeshPhysicalMaterial({ color: acc, metalness: 1, roughness: 0.22, clearcoat: 0.6 });
  const coin = new THREE.Group();
  root.add(coin);
  const body = new THREE.Mesh(new THREE.CylinderGeometry(1.45, 1.45, 0.26, 96), gold);
  body.rotation.x = Math.PI / 2;
  coin.add(body);
  const rimGeo = new THREE.TorusGeometry(1.45, 0.07, 16, 120);
  coin.add(new THREE.Mesh(rimGeo, gold));

  // extruded Z on both faces
  const z = new THREE.Shape();
  z.moveTo(-0.6, 0.7);
  z.lineTo(0.6, 0.7);
  z.lineTo(0.6, 0.45);
  z.lineTo(-0.22, -0.45);
  z.lineTo(0.6, -0.45);
  z.lineTo(0.6, -0.7);
  z.lineTo(-0.6, -0.7);
  z.lineTo(-0.6, -0.45);
  z.lineTo(0.22, 0.45);
  z.lineTo(-0.6, 0.45);
  z.closePath();
  const zGeo = new THREE.ExtrudeGeometry(z, { depth: 0.12, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 4 });
  const zf = new THREE.Mesh(zGeo, gold);
  zf.position.z = 0.12;
  coin.add(zf);
  const zb = zf.clone();
  zb.rotation.y = Math.PI;
  zb.position.z = -0.12;
  coin.add(zb);

  const hexGeo = new THREE.CylinderGeometry(0.16, 0.16, 0.07, 6);
  const notes = [];
  for (let i = 0; i < 16; i++) {
    const m = new THREE.Mesh(hexGeo, new THREE.MeshPhysicalMaterial({ color: 0x222026, metalness: 1, roughness: 0.3, emissive: acc.clone(), emissiveIntensity: 0.25 }));
    m.userData.phase = Math.random();
    m.userData.a = Math.random() * Math.PI * 2;
    root.add(m);
    notes.push(m);
  }
  return (t) => {
    coin.rotation.y = Math.sin(t * 0.5) * 0.9 + t * 0.25;
    coin.rotation.x = Math.sin(t * 0.7) * 0.12;
    notes.forEach((m) => {
      const p = (m.userData.phase + t * 0.12) % 1; // 0 far away -> 1 absorbed
      const r = 3.3 * (1 - p) + 0.2;
      const a = m.userData.a + t * 0.4 + p * 2.5;
      m.position.set(Math.cos(a) * r, Math.sin(a * 1.3) * 0.9 * (1 - p), Math.sin(a) * r * 0.5);
      const s = p > 0.85 ? (1 - p) / 0.15 : 1;
      m.scale.setScalar(Math.max(0.001, s));
      m.rotation.x += 0.03;
      m.rotation.z += 0.02;
    });
  };
}
