import { useEffect, useRef, useState } from 'react';
import { fmtNum, rawToUi } from './api.js';
import { brand } from './brand.js';

// One real-time WebGL scene per page, each showing what that page is about:
//   reactor  (Live)   the fee pipeline, driven by the real feed: trades pay a
//                     fee into the vault, the vault pays holders and feeds
//                     the burn furnace. Stations are labeled; every event
//                     gets a callout where it happens.
//   exchange (Swap)   SOL coins stream through the 0% route ring and come out
//                     as $ZATS.
//   split    (How)    the fee coin splits into its 80 / 10 / 10 parts and
//                     follows the step you are reading.
//   podium   (Boards) gold, silver and bronze steps, trophy, coin stacks.
// three.js loads lazily; the loop pauses off-screen, in hidden tabs and for
// reduced motion, and the pixel ratio is capped so it stays light.

export default function Scene3D({ kind, events, step = 0, share = 80, burn = 10, className = '', fallback = null }) {
  const wrap = useRef(null);
  const api = useRef(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let stop = () => {};
    let cancelled = false;
    (async () => {
      try {
        const kit = await import('./3d/kit.js');
        const minis = await import('./3d/minis.js');
        await kit.fontsReady();
        const face = kind === 'exchange' || kind === 'podium' ? await kit.typeface() : null;
        if (cancelled || !wrap.current) return;
        const m = mount(wrap.current, kit, minis, kind, { share, burn, face });
        api.current = m.api;
        stop = m.stop;
      } catch (e) {
        console.warn('3D scene unavailable', e);
        setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
      api.current = null;
      stop();
    };
  }, [kind, share, burn]);

  // Feed events drive the reactor.
  const seen = useRef(new Set());
  useEffect(() => {
    if (!events?.length) return;
    const fresh = events.filter((e) => !seen.current.has(e.id)).slice(0, 6);
    fresh.forEach((e, i) => {
      seen.current.add(e.id);
      setTimeout(() => api.current?.event?.(e), i * 420);
    });
  }, [events]);

  useEffect(() => {
    api.current?.step?.(step);
  }, [step]);

  if (failed) return fallback;
  return <div className={`scene3d s-${kind} ${className}`} ref={wrap} aria-hidden="true" />;
}

function mount(el, kit, minis, kind, opts) {
  const { THREE } = kit;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setClearColor(0x000000, 0);
  kit.setupRenderer(renderer);
  el.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.environment = kit.envFor(renderer);
  scene.environmentIntensity = 0.75;
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
  scene.add(new THREE.AmbientLight(0xffffff, 0.18));
  const key = new THREE.DirectionalLight(0xfff2dd, 1.8);
  key.position.set(3, 6, 6);
  scene.add(key);

  // HTML labels pinned to 3D points.
  const layer = document.createElement('div');
  layer.className = 's3-labels';
  el.appendChild(layer);
  const tags = [];
  const v3 = new THREE.Vector3();
  let w = 0;
  let h = 0;
  const project = (pos, node) => {
    v3.copy(pos);
    if (ui.space) v3.applyMatrix4(ui.space.matrixWorld);
    v3.project(camera);
    node.style.transform = `translate(${((v3.x + 1) / 2) * w}px, ${((1 - v3.y) / 2) * h}px)`;
  };
  const ui = {
    space: null,
    tag(text, sub, pos, color) {
      const n = document.createElement('div');
      n.className = 's3-tag';
      n.style.color = color;
      n.innerHTML = `<span>${text}</span>${sub ? `<small>${sub}</small>` : ''}`;
      layer.appendChild(n);
      tags.push({ n, pos });
    },
    pop(text, pos, color) {
      if (!w) return;
      const n = document.createElement('div');
      n.className = 's3-pop';
      n.style.setProperty('--c', color);
      n.textContent = text;
      layer.appendChild(n);
      project(pos, n);
      setTimeout(() => n.remove(), 2300);
    },
  };

  const builders = { reactor, exchange, split, podium };
  const built = builders[kind](kit, minis, scene, camera, opts, ui);

  const resize = () => {
    w = el.clientWidth;
    h = el.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    built.fit?.(w / h);
    camera.updateMatrixWorld();
    tags.forEach((t) => project(t.pos, t.n));
  };
  const ro = new ResizeObserver(resize);
  ro.observe(el);
  resize();

  // Pointer parallax.
  const ptr = { x: 0, y: 0, tx: 0, ty: 0 };
  const onMove = (e) => {
    const r = el.getBoundingClientRect();
    if (e.clientY < r.top - 200 || e.clientY > r.bottom + 200) return;
    ptr.tx = Math.max(-1, Math.min(1, ((e.clientX - r.left) / r.width - 0.5) * 2));
    ptr.ty = Math.max(-1, Math.min(1, ((e.clientY - r.top) / r.height - 0.5) * 2));
  };
  window.addEventListener('pointermove', onMove, { passive: true });

  let visible = true;
  const io = new IntersectionObserver(([en]) => (visible = en.isIntersecting));
  io.observe(el);

  const clock = new THREE.Clock();
  let raf = 0;
  const loop = () => {
    raf = requestAnimationFrame(loop);
    if (!visible || document.hidden) {
      clock.getDelta();
      return;
    }
    const dt = Math.min(0.05, clock.getDelta());
    ptr.x += (ptr.tx - ptr.x) * 0.05;
    ptr.y += (ptr.ty - ptr.y) * 0.05;
    built.tick(dt, clock.elapsedTime, ptr);
    renderer.render(scene, camera);
    if (built.labelsMove) tags.forEach((t) => project(t.pos, t.n));
  };
  if (reduced) {
    built.tick(0, 1.2, ptr);
    renderer.render(scene, camera);
  } else loop();

  return {
    api: {
      event: (e) => !reduced && built.event?.(e),
      step: (s) => built.step?.(s),
    },
    stop() {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      window.removeEventListener('pointermove', onMove);
      renderer.dispose();
      renderer.domElement.remove();
      layer.remove();
    },
  };
}

const css = (hex) => '#' + hex.toString(16).padStart(6, '0');
const sym = '$' + brand.ticker;
const sol = (e) => (e.lamports ? (Number(e.lamports) / 1e9).toFixed(2) : null);
const amt = (e) => fmtNum(rawToUi(e.amountRaw || '0', 6), 1);
const who = (e) => (e.name?.u ? '@' + e.name.u : 'a holder');

// Arc a point from a to b with a lift, k in 0..1.
function arc(THREE, out, a, b, k, lift) {
  out.lerpVectors(a, b, k);
  out.y += Math.sin(k * Math.PI) * lift;
  return out;
}

// ---------------------------------------------------------------- Live
function reactor(kit, minis, scene, camera, opts, ui) {
  const { THREE, COL, M } = kit;
  const root = new THREE.Group();
  scene.add(root);
  ui.space = root;

  // Stations
  const P = {
    market: new THREE.Vector3(-4.3, 0, 0.6),
    vault: new THREE.Vector3(0, 0, 0),
    holders: new THREE.Vector3(3.9, 0, -0.2),
    furnace: new THREE.Vector3(1.6, 0, -2.9),
  };

  // Floor: a dark disc with a fine radial grid.
  const gridTex = kit.canvasTex(1024, (g, s) => {
    const c = s / 2;
    g.fillStyle = '#0c0c0f';
    g.fillRect(0, 0, s, s);
    g.strokeStyle = 'rgba(255,255,255,0.05)';
    for (let r = 40; r < c; r += 40) {
      g.beginPath();
      g.arc(c, c, r, 0, Math.PI * 2);
      g.stroke();
    }
    for (let i = 0; i < 48; i++) {
      const a = (i / 48) * Math.PI * 2;
      g.beginPath();
      g.moveTo(c, c);
      g.lineTo(c + Math.cos(a) * c, c + Math.sin(a) * c);
      g.stroke();
    }
    const gr = g.createRadialGradient(c, c, c * 0.45, c, c, c);
    gr.addColorStop(0, 'rgba(0,0,0,0)');
    gr.addColorStop(1, 'rgba(0,0,0,1)');
    g.globalCompositeOperation = 'destination-out';
    g.fillStyle = gr;
    g.fillRect(0, 0, s, s);
  });
  const floor = new THREE.Mesh(new THREE.CircleGeometry(7.5, 96), new THREE.MeshStandardMaterial({ map: gridTex, color: 0x9a9a9a, roughness: 0.85, metalness: 0.1, transparent: true, depthWrite: false }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.62;
  root.add(floor);

  // Market terminal: a trading screen on a stand.
  const market = new THREE.Group();
  market.position.copy(P.market);
  market.rotation.y = 0.45;
  const chartTex = kit.canvasTex(
    0,
    (g, cw, ch) => {
      g.fillStyle = '#07110c';
      g.fillRect(0, 0, cw, ch);
      g.strokeStyle = 'rgba(79,216,138,0.12)';
      for (let x = 0; x < cw; x += 32) {
        g.beginPath();
        g.moveTo(x, 0);
        g.lineTo(x, ch);
        g.stroke();
      }
      let y = ch * 0.6;
      for (let i = 0; i < 18; i++) {
        const up = Math.sin(i * 1.7) + Math.sin(i * 0.6) * 0.8 > -0.2;
        const d = (Math.sin(i * 3.3) * 0.5 + 0.7) * 26;
        const x = 20 + i * 27;
        g.fillStyle = up ? '#4fd88a' : '#ff5c6c';
        g.fillRect(x - 1, y - d - 10, 2, d + 20);
        g.fillRect(x - 8, up ? y - d : y, 16, d);
        y += up ? -d * 0.6 : d * 0.5;
        y = Math.max(40, Math.min(ch - 40, y));
      }
    },
    { w: 512, h: 300 },
  );
  const screen = new THREE.Mesh(kit.roundBox(1.9, 1.15, 0.1, 0.06, 3), M.paint(0x1a1b20, 0.35));
  screen.position.y = 1.0;
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(1.76, 1.02), new THREE.MeshBasicMaterial({ map: chartTex }));
  glass.position.set(0, 1.0, 0.056);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.9, 16), M.metal(0x8a8f9b, 0.3));
  neck.position.y = 0.0;
  const foot = new THREE.Mesh(kit.roundBox(1.0, 0.1, 0.6, 0.04, 2), M.paint(0x24252b, 0.4));
  foot.position.y = -0.48;
  market.add(screen, glass, neck, foot);
  root.add(market);
  const marketOut = P.market.clone().add(new THREE.Vector3(0.5, 0.7, 0.3));

  // The vault: a steel drum with a round door, bolt ring, wheel and a fill gauge.
  const vault = new THREE.Group();
  const drumProf = [
    [0.001, -0.6],
    [1.15, -0.6],
    [1.22, -0.5],
    [1.22, -0.36],
    [1.16, -0.32],
    [1.16, 0.62],
    [1.22, 0.66],
    [1.22, 0.8],
    [1.1, 0.92],
    [0.001, 0.92],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const drum = new THREE.Mesh(new THREE.LatheGeometry(drumProf, 96), new THREE.MeshPhysicalMaterial({ color: 0x1e1f25, metalness: 0.85, roughness: 0.38, clearcoat: 0.4, clearcoatRoughness: 0.3 }));
  vault.add(drum);
  for (const y of [-0.1, 0.3]) {
    const band = new THREE.Mesh(new THREE.TorusGeometry(1.17, 0.025, 12, 96), M.metal(0x9aa0ac, 0.25));
    band.rotation.x = Math.PI / 2;
    band.position.y = y;
    vault.add(band);
  }
  const door = new THREE.Group();
  door.position.set(0, 0.16, 1.14);
  const doorDisc = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.66, 0.12, 64), M.metal(0xb8bdc8, 0.28));
  doorDisc.rotation.x = Math.PI / 2;
  door.add(doorDisc);
  const bolts = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.035, 0.035, 0.05, 12), M.gold(), 16);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    m4.compose(new THREE.Vector3(Math.cos(a) * 0.54, Math.sin(a) * 0.54, 0.07), q, new THREE.Vector3(1, 1, 1));
    bolts.setMatrixAt(i, m4);
  }
  door.add(bolts);
  const wheel = new THREE.Group();
  wheel.position.z = 0.12;
  wheel.add(new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.03, 12, 48), M.gold()));
  for (let i = 0; i < 4; i++) {
    const spoke = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.6, 8), M.gold());
    spoke.rotation.z = (i / 4) * Math.PI;
    wheel.add(spoke);
  }
  const hubM = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.06, 24), M.gold());
  hubM.rotation.x = Math.PI / 2;
  wheel.add(hubM);
  door.add(wheel);
  vault.add(door);
  // gauge: a glass column on top filled with glowing liquid (fees waiting)
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.9, 48, 1, true), new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: 0.16, roughness: 0.05, metalness: 0, side: THREE.DoubleSide, depthWrite: false }));
  tube.position.y = 1.38;
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.08, 48), M.metal(0x9aa0ac, 0.25));
  cap.position.y = 1.86;
  const liquid = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 1, 48), new THREE.MeshStandardMaterial({ color: COL.vault, emissive: COL.vault, emissiveIntensity: 0.6, transparent: true, opacity: 0.85, roughness: 0.2 }));
  liquid.position.y = 0.95;
  vault.add(tube, cap, liquid);
  const vlight = new THREE.PointLight(COL.vault, 5, 5);
  vlight.position.set(0, 1.4, 1);
  vault.add(vlight);
  root.add(vault);
  let fill = 0.35;
  let wheelSpin = 0;
  const vaultIn = new THREE.Vector3(0, 1.95, 0);
  const vaultOut = new THREE.Vector3(0, 1.1, 0.9);

  // Holders: an arc of people on pads.
  const holders = [];
  const N = 7;
  for (let i = 0; i < N; i++) {
    const a = -0.95 + (i / (N - 1)) * 1.9;
    const pos = new THREE.Vector3(P.holders.x - 0.4 + Math.cos(a) * 1.2, -0.45, P.holders.z + Math.sin(a) * 1.9);
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.33, 0.08, 40), M.metal(0x4a4560, 0.3));
    pad.position.copy(pos);
    const ringM = new THREE.Mesh(new THREE.TorusGeometry(0.31, 0.015, 8, 48), new THREE.MeshStandardMaterial({ color: COL.people, emissive: COL.people, emissiveIntensity: 0.3 }));
    ringM.rotation.x = Math.PI / 2;
    ringM.position.copy(pos).setY(-0.4);
    const b = kit.bust(new THREE.MeshPhysicalMaterial({ color: COL.people, roughness: 0.35, metalness: 0.15, clearcoat: 0.6, emissive: COL.people, emissiveIntensity: 0 }));
    b.scale.setScalar(0.62);
    b.position.copy(pos).setY(-0.18);
    b.lookAt(P.vault.x, -0.18, P.vault.z);
    root.add(pad, ringM, b);
    holders.push({ b, ring: ringM, pos: pos.clone().setY(0.35), glow: 0 });
  }

  // Furnace (the same model as the burn card), scaled up.
  const fur = minis.builders.furnace();
  fur.root.scale.setScalar(1.1);
  fur.root.position.copy(P.furnace).setY(0.18);
  fur.root.rotation.y = -0.35;
  root.add(fur.root);
  const furnIn = P.furnace.clone().add(new THREE.Vector3(-0.2, 0.2, 1.0));
  const flash = kit.glowSprite(COL.burn, 3, 0);
  flash.position.copy(furnIn);
  root.add(flash);

  // Flow tracks with moving dashes.
  const tracks = [];
  const track = (pts, color) => {
    const curve = new THREE.CatmullRomCurve3(pts);
    const t = kit.dashTex();
    t.repeat.set(curve.getLength() / 0.7, 1);
    const m = new THREE.Mesh(new THREE.TubeGeometry(curve, 80, 0.028, 8, false), new THREE.MeshBasicMaterial({ color, map: t, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
    root.add(m);
    tracks.push(t);
    return curve;
  };
  const y0 = -0.56;
  track([new THREE.Vector3(-3.6, y0, 0.8), new THREE.Vector3(-2.2, y0, 1.0), new THREE.Vector3(-1.3, y0, 0.6)], COL.trade);
  track([new THREE.Vector3(1.3, y0, 0.6), new THREE.Vector3(2.4, y0, 1.0), new THREE.Vector3(3.3, y0, 0.7)], COL.pay);
  track([new THREE.Vector3(0.6, y0, -1.05), new THREE.Vector3(1.0, y0, -1.9), new THREE.Vector3(1.4, y0, -2.3)], COL.burn);

  // Station labels
  ui.tag('Trades', 'every buy and sell pays a fee', P.market.clone().setY(1.85), css(COL.trade));
  ui.tag('Vault', 'fees collect here', new THREE.Vector3(0, 2.3, 0), css(COL.vault));
  ui.tag('Holders', `80% paid out in ${sym}`, P.holders.clone().add(new THREE.Vector3(-0.3, 0.95, -0.4)), css(COL.people));
  ui.tag('Burn', `10% buys ${sym} and burns it`, P.furnace.clone().add(new THREE.Vector3(0.3, 2.6, 0)), css(COL.burn));

  // Flyers
  const flyers = [];
  const solGeo = kit.swarmCoinGeo();
  const solMat = new THREE.MeshStandardMaterial({ color: 0x8b5cff, metalness: 0.8, roughness: 0.28, emissive: COL.sol, emissiveIntensity: 0.25 });
  const zatsMat = kit.M.gold();
  const coinOf = (type) => {
    if (type === 'zats') {
      const c = kit.zatsCoin('lo');
      c.scale.setScalar(0.24);
      return c;
    }
    const c = new THREE.Mesh(solGeo, solMat);
    c.scale.setScalar(0.18);
    return c;
  };
  const fly = (obj, a, b, life, lift, done) => {
    obj.position.copy(a);
    root.add(obj);
    flyers.push({ obj, a: a.clone(), b: b.clone(), t: 0, life, lift, done });
  };
  const toVault = (pop, color) => {
    fly(coinOf('sol'), marketOut, vaultIn, 1.5, 1.4, () => {
      fill = Math.min(1, fill + 0.07);
      wheelSpin += 1.2;
    });
    if (pop) ui.pop(pop, marketOut.clone().setY(1.9), color);
  };
  const toHolder = (e) => {
    const hld = holders[Math.floor(Math.random() * holders.length)];
    fill = Math.max(0.12, fill - 0.04);
    fly(coinOf('zats'), vaultOut, hld.pos, 1.7, 1.5, () => {
      hld.glow = 1;
      if (e) ui.pop(`+${amt(e)} ${sym} · ${who(e)}`, hld.pos.clone().setY(0.9), css(COL.pay));
    });
  };
  const toFurnace = (e, label) => {
    fill = Math.max(0.12, fill - 0.05);
    fly(coinOf('zats'), vaultOut.clone().setZ(-0.6), furnIn, 1.6, 1.6, () => {
      flash.material.opacity = 0.9;
      if (e) ui.pop(label, P.furnace.clone().add(new THREE.Vector3(0, 2.1, 0.5)), css(COL.burn));
    });
  };
  const handle = (e) => {
    switch (e?.kind) {
      case 'buy':
        return toVault(`BUY · ${sol(e)} SOL`, css(COL.trade));
      case 'sell':
        return toVault(`SELL · ${sol(e)} SOL`, css(COL.sell));
      case 'claim':
        toVault(null);
        setTimeout(() => toVault(null), 200);
        return ui.pop(`+${sol(e)} SOL fees`, new THREE.Vector3(0, 2.6, 0), css(COL.vault));
      case 'payout':
        return toHolder(e);
      case 'burn':
        return toFurnace(e, `BURNED ${amt(e)} ${sym}`);
      case 'buyback':
        return toFurnace(e, `BUYBACK · ${sol(e)} SOL`);
      case 'join': {
        const hld = holders[Math.floor(Math.random() * holders.length)];
        hld.glow = 1;
        return ui.pop(`${who(e)} joined`, hld.pos.clone().setY(0.9), css(COL.people));
      }
      default:
    }
  };

  let quiet = 0;
  const idle = ['buy', 'payout', 'sell', 'payout', 'burn', 'payout'];
  let cue = 0;
  const tmp = new THREE.Vector3();
  const base = { x: 0, y: 5.2, z: 10.2 };
  const look = new THREE.Vector3(0.2, 1.25, 0);
  return {
    labelsMove: true,
    event(e) {
      quiet = 0;
      handle(e);
    },
    fit(aspect) {
      // portrait: turn the pipeline diagonally so all four stations fit
      // portrait: run the pipeline top to bottom (trades at the back,
      // holders at the front) so every station fits the width
      const narrow = aspect < 0.9;
      root.rotation.y = narrow ? -Math.PI / 2 : 0;
      root.updateMatrixWorld();
      base.x = narrow ? 0.75 : 0;
      base.z = narrow ? 10.6 : aspect < 1.4 ? 13 : 10.2;
      base.y = narrow ? 17 : 5.2;
      look.set(narrow ? 0.75 : 0.2, narrow ? 0 : 1.25, narrow ? -0.6 : 0);
    },
    tick(dt, t, ptr) {
      camera.position.set(base.x + ptr.x * 0.8, base.y - ptr.y * 0.4, base.z);
      camera.lookAt(look);
      // keep it moving when the feed is quiet (no callouts for these)
      quiet += dt;
      if (quiet > 2.6) {
        quiet = 1.2;
        const k = idle[cue++ % idle.length];
        if (k === 'buy' || k === 'sell') toVault(null);
        else if (k === 'payout') toHolder(null);
        else toFurnace(null);
      }
      tracks.forEach((tx) => (tx.offset.x -= dt * 0.9));
      liquid.scale.y += (fill * 0.82 - liquid.scale.y) * 0.05;
      liquid.position.y = 0.95 + liquid.scale.y / 2;
      liquid.material.emissiveIntensity = 0.5 + Math.sin(t * 3) * 0.1;
      wheelSpin *= 0.95;
      wheel.rotation.z += wheelSpin * dt * 3 + dt * 0.1;
      fur.tick(t, dt);
      flash.material.opacity *= 0.93;
      glass.material.color.setScalar(0.85 + Math.sin(t * 2) * 0.05);
      holders.forEach((hd, i) => {
        hd.glow *= 0.96;
        hd.b.position.y = -0.18 + hd.glow * 0.25 + Math.sin(t * 1.5 + i) * 0.02;
        hd.b.children[0].material.emissiveIntensity = hd.glow * 0.8;
        hd.ring.material.emissiveIntensity = 0.3 + hd.glow * 2;
      });
      for (let i = flyers.length - 1; i >= 0; i--) {
        const f = flyers[i];
        f.t += dt / f.life;
        const k = Math.min(1, f.t);
        arc(THREE, tmp, f.a, f.b, kit.ease(k), f.lift);
        f.obj.position.copy(tmp);
        f.obj.rotation.y += dt * 5;
        f.obj.rotation.x = 0.4;
        if (k >= 1) {
          root.remove(f.obj);
          f.done?.();
          flyers.splice(i, 1);
        }
      }
    },
  };
}

// ---------------------------------------------------------------- Swap
function exchange(kit, minis, scene, camera, opts) {
  const { THREE, COL, M } = kit;
  const root = new THREE.Group();
  scene.add(root);
  const sol = kit.solCoin('hi');
  sol.position.x = -2.7;
  const zats = kit.zatsCoin('hi');
  zats.position.x = 2.7;
  root.add(sol, zats);

  // The route ring: a machined ring with an inner glow and "0%" floating inside.
  const gate = new THREE.Group();
  const ringProf = [
    [0.86, -0.12],
    [1.0, -0.14],
    [1.06, -0.06],
    [1.06, 0.06],
    [1.0, 0.14],
    [0.86, 0.12],
    [0.84, 0],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const ringGeo = new THREE.LatheGeometry([...ringProf, ringProf[0]], 128);
  ringGeo.rotateX(Math.PI / 2);
  gate.add(new THREE.Mesh(ringGeo, new THREE.MeshStandardMaterial({ color: 0x9ba1ad, metalness: 1, roughness: 0.22, side: THREE.DoubleSide })));
  const inner = new THREE.Mesh(new THREE.TorusGeometry(0.84, 0.025, 12, 128), new THREE.MeshStandardMaterial({ color: COL.trade, emissive: COL.trade, emissiveIntensity: 1.4 }));
  gate.add(inner);
  const ticks = new THREE.InstancedMesh(new THREE.BoxGeometry(0.02, 0.07, 0.02), M.glow(COL.trade, 1.6), 48);
  const m4 = new THREE.Matrix4();
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * Math.PI * 2;
    m4.makeRotationZ(a - Math.PI / 2).setPosition(Math.cos(a) * 1.0, Math.sin(a) * 1.0, 0.15);
    ticks.setMatrixAt(i, m4);
  }
  gate.add(ticks);
  if (opts.face) {
    const zero = new THREE.Mesh(kit.textGeo(opts.face, '0%', 0.42, 0.1), new THREE.MeshPhysicalMaterial({ color: COL.trade, emissive: COL.trade, emissiveIntensity: 0.35, metalness: 0.5, roughness: 0.25, clearcoat: 1 }));
    gate.add(zero);
  }
  const halo = kit.glowSprite(COL.trade, 3.4, 0.25);
  halo.position.z = -0.3;
  gate.add(halo);
  root.add(gate);

  const l1 = new THREE.PointLight(COL.sol, 8, 7);
  l1.position.set(-2.7, 1.2, 2);
  const l2 = new THREE.PointLight(COL.pay, 10, 7);
  l2.position.set(2.7, 1.2, 2);
  root.add(l1, l2);

  // The stream: purple SOL coins in, gold $ZATS coins out.
  const n = 26;
  const geo = kit.swarmCoinGeo();
  const inM = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ color: 0x8b5cff, metalness: 0.85, roughness: 0.25, emissive: COL.sol, emissiveIntensity: 0.2 }), n);
  const outM = new THREE.InstancedMesh(geo, kit.M.gold(), n);
  root.add(inM, outM);
  const pv = new THREE.Vector3();
  const pq = new THREE.Quaternion();
  const pe = new THREE.Euler();
  const ps = new THREE.Vector3();
  const zero = new THREE.Vector3(0, 0, 0);
  const seeds = Array.from({ length: n }, (_, i) => ({ o: i / n, r: (Math.sin(i * 12.7) * 0.5 + 0.5) * Math.PI * 2, d: 0.15 + (Math.sin(i * 7.3) * 0.5 + 0.5) * 0.35 }));

  let camZ = 8.4;
  return {
    fit(aspect) {
      camZ = aspect < 0.9 ? 15 : aspect < 1.3 ? 11 : 8.4;
    },
    tick(dt, t, ptr) {
      camera.position.set(ptr.x * 0.8, 0.5 - ptr.y * 0.4, camZ);
      camera.lookAt(0, 0, 0);
      sol.rotation.y = Math.sin(t * 0.7) * 0.55 + 0.35;
      zats.rotation.y = Math.sin(t * 0.7 + 1) * 0.55 - 0.35;
      sol.position.y = Math.sin(t * 1.2) * 0.1;
      zats.position.y = Math.sin(t * 1.2 + 1.5) * 0.1;
      gate.rotation.y = Math.sin(t * 0.5) * 0.25;
      inner.material.emissiveIntensity = 1.2 + Math.sin(t * 3) * 0.3;
      ticks.rotation.z = t * 0.4;
      seeds.forEach((s, i) => {
        const k = (s.o + t * 0.16) % 1;
        const x = -2.1 + k * 4.2;
        const squeeze = 1 - Math.sin(k * Math.PI) * 0.75;
        pv.set(x, Math.cos(s.r + t * 0.8) * s.d * squeeze * 2.2, Math.sin(s.r + t * 0.8) * s.d * squeeze * 2.2);
        pq.setFromEuler(pe.set(t * 3 + i, Math.PI / 2 + t * 2, 0));
        const sc = 0.13 * Math.min(1, Math.min(k, 1 - k) * 8);
        ps.set(sc, sc, sc);
        if (k < 0.5) {
          m4.compose(pv, pq, ps);
          inM.setMatrixAt(i, m4);
          outM.setMatrixAt(i, m4.compose(pv, pq, zero));
        } else {
          m4.compose(pv, pq, ps);
          outM.setMatrixAt(i, m4);
          inM.setMatrixAt(i, m4.compose(pv, pq, zero));
        }
      });
      inM.instanceMatrix.needsUpdate = true;
      outM.instanceMatrix.needsUpdate = true;
    },
  };
}

// ---------------------------------------------------------------- How
function split(kit, minis, scene, camera, opts) {
  const { THREE, COL, M } = kit;
  const root = new THREE.Group();
  scene.add(root);
  const share = opts.share / 100;
  const burn = opts.burn / 100;
  const ops = Math.max(0, 1 - share - burn);
  const parts = [
    ['pay', share, COL.pay, M.gold()],
    ['burn', burn, COL.burn, new THREE.MeshPhysicalMaterial({ color: COL.burn, metalness: 0.9, roughness: 0.3, emissive: COL.burn, emissiveIntensity: 0.05, clearcoat: 0.5 })],
    ['vault', ops, COL.vault, new THREE.MeshPhysicalMaterial({ color: COL.vault, metalness: 0.9, roughness: 0.3, emissive: COL.vault, emissiveIntensity: 0.05, clearcoat: 0.5 })],
  ];
  const segs = [];
  let a0 = 0;
  for (const [name, frac, color, mat] of parts) {
    if (frac <= 0) continue;
    const len = frac * Math.PI * 2;
    const shape = new THREE.Shape();
    const R = 1.8;
    const r = 0.95;
    shape.absarc(0, 0, R, a0 + 0.03, a0 + len - 0.03, false);
    shape.absarc(0, 0, r, a0 + len - 0.03, a0 + 0.03, true);
    const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.5, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.06, bevelSegments: 5, curveSegments: 64 });
    geo.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(geo, mat.clone ? mat.clone() : mat);
    if (m.material.emissive) m.material.emissive.setHex(color);
    const mid = a0 + len / 2;
    m.userData = { name, dir: new THREE.Vector3(Math.cos(mid), 0, -Math.sin(mid)), color };
    root.add(m);
    segs.push(m);
    a0 += len;
  }
  const fee = kit.solCoin('lo');
  fee.scale.setScalar(0.55);
  root.add(fee);
  const plateProf = [
    [0.001, -0.08],
    [2.75, -0.08],
    [2.82, -0.02],
    [2.8, 0.04],
    [2.6, 0.06],
    [0.001, 0.06],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const plate = new THREE.Mesh(new THREE.LatheGeometry(plateProf, 128), M.paint(0x1b1b20, 0.4));
  plate.position.y = -0.2;
  root.add(plate);
  const halo = new THREE.Mesh(new THREE.TorusGeometry(2.78, 0.018, 8, 160), M.glow(COL.vault, 1));
  halo.rotation.x = Math.PI / 2;
  halo.position.y = -0.18;
  root.add(halo);
  const pl = new THREE.PointLight(0xffffff, 6, 10);
  pl.position.set(0, 3, 2);
  root.add(pl);

  const geo = kit.swarmCoinGeo();
  const minisM = new THREE.InstancedMesh(geo, M.gold(), 10);
  const embers = new THREE.InstancedMesh(new THREE.SphereGeometry(0.04, 8, 6), M.add(0xffa050, 1), 16);
  root.add(minisM, embers);
  const m4 = new THREE.Matrix4();
  const v = new THREE.Vector3();
  const qq = new THREE.Quaternion();
  const ee = new THREE.Euler();
  const sc = new THREE.Vector3();

  let step = 0;
  let camZ = 7.2;
  return {
    step: (s) => (step = s),
    fit(aspect) {
      camZ = aspect < 1 ? 9.5 : 7.2;
    },
    tick(dt, t, ptr) {
      camera.position.set(ptr.x * 0.6, 3.2 - ptr.y * 0.3, camZ);
      camera.lookAt(0, 0.2, 0);
      root.rotation.y = t * 0.22;
      const spread = step === 0 ? 0 : 0.45;
      for (const m of segs) {
        const tmp = m.userData.tmp || (m.userData.tmp = new THREE.Vector3());
        const on = step === 1 || (step === 2 && m.userData.name === 'burn') || (step === 3 && m.userData.name === 'pay');
        tmp.copy(m.userData.dir).multiplyScalar(spread).setY(step >= 1 && on ? 0.35 : 0);
        m.position.lerp(tmp, 0.08);
        if (m.material.emissiveIntensity !== undefined) m.material.emissiveIntensity += ((on ? 0.35 : 0.04) - m.material.emissiveIntensity) * 0.08;
      }
      const fy = step === 0 ? 0.6 + Math.abs(Math.sin(t * 2.2)) * 1.2 : -1;
      fee.position.y += (fy - fee.position.y) * 0.1;
      fee.rotation.y = t * 2;
      fee.visible = fee.position.y > -0.5;
      const burnSeg = segs.find((m) => m.userData.name === 'burn');
      for (let i = 0; i < 16; i++) {
        const k = (i / 16 + t * 0.5) % 1;
        const show = step === 2 && burnSeg;
        if (show) {
          const d = burnSeg.userData.dir;
          v.set(d.x * 1.9 + Math.sin(k * 20 + i) * 0.15, 0.4 + k * 2.2, d.z * 1.9 + Math.cos(k * 17 + i) * 0.15);
        }
        const s = show ? 1 - k : 0;
        m4.compose(v, qq.identity(), sc.set(s, s, s));
        embers.setMatrixAt(i, m4);
      }
      embers.instanceMatrix.needsUpdate = true;
      const paySeg = segs.find((m) => m.userData.name === 'pay');
      for (let i = 0; i < 10; i++) {
        const show = step === 3 && paySeg;
        const k = (i / 10 + t * 0.35) % 1;
        const ang = (i / 10) * Math.PI * 2;
        v.set(Math.cos(ang) * (1.4 + k * 1.8), 0.6 + Math.sin(k * Math.PI) * 1.4, Math.sin(ang) * (1.4 + k * 1.8));
        qq.setFromEuler(ee.set(t * 3 + i, 0, 0));
        const s = show ? 0.18 : 0;
        m4.compose(v, qq, sc.set(s, s, s));
        minisM.setMatrixAt(i, m4);
      }
      minisM.instanceMatrix.needsUpdate = true;
    },
  };
}

// ---------------------------------------------------------------- Boards
function podium(kit, minis, scene, camera, opts) {
  const { THREE, M } = kit;
  const root = new THREE.Group();
  scene.add(root);
  const places = [
    { x: 0, h: 1.7, c: 0xe9b54a, coins: 0, n: '1' },
    { x: -2.2, h: 1.15, c: 0xc9ced8, coins: 7, n: '2' },
    { x: 2.2, h: 0.8, c: 0xc47a3f, coins: 5, n: '3' },
  ];
  const stone = new THREE.MeshPhysicalMaterial({ color: 0x23232a, roughness: 0.32, metalness: 0.3, clearcoat: 0.8, clearcoatRoughness: 0.2 });
  const swarm = kit.swarmCoinGeo();
  const coinMats = { '2': M.silver(), '3': M.metal(0xc47a3f, 0.28) };
  for (const p of places) {
    const block = new THREE.Mesh(kit.roundBox(1.9, p.h, 1.9, 0.08, 4), stone);
    block.position.set(p.x, p.h / 2 - 0.6, 0);
    root.add(block);
    const trim = new THREE.Mesh(kit.roundBox(1.96, 0.07, 1.96, 0.03, 3), M.metal(p.c, 0.22));
    trim.position.set(p.x, p.h - 0.6, 0);
    root.add(trim);
    const base = new THREE.Mesh(kit.roundBox(2.0, 0.08, 2.0, 0.03, 3), M.metal(p.c, 0.3));
    base.position.set(p.x, -0.58, 0);
    root.add(base);
    if (opts.face) {
      const num = new THREE.Mesh(kit.textGeo(opts.face, p.n, 0.62, 0.12), M.metal(p.c, 0.2));
      num.position.set(p.x, p.h / 2 - 0.6, 0.98);
      root.add(num);
    }
    if (p.coins) {
      const stack = new THREE.InstancedMesh(swarm, coinMats[p.n], p.coins);
      const m4 = new THREE.Matrix4();
      for (let i = 0; i < p.coins; i++) {
        m4.compose(
          new THREE.Vector3(p.x + Math.sin(i * 2.1) * 0.04, p.h - 0.6 + 0.08 + i * 0.105, Math.cos(i * 1.7) * 0.04),
          new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2),
          new THREE.Vector3(0.42, 0.42, 0.62),
        );
        stack.setMatrixAt(i, m4);
      }
      root.add(stack);
    }
    const spot = new THREE.PointLight(p.c, p.n === '1' ? 10 : 5, 6);
    spot.position.set(p.x, p.h + 1.6, 1.4);
    root.add(spot);
  }
  const cup = minis.trophy();
  cup.scale.setScalar(0.8);
  cup.position.set(0, 1.1 + 0.8, 0);
  root.add(cup);
  const crown = kit.glowSprite(0xffd27a, 3.2, 0.35);
  crown.position.set(0, 2.1, -0.3);
  root.add(crown);

  // stage floor
  const floorProf = [
    [0.001, -0.7],
    [4.6, -0.7],
    [4.7, -0.65],
    [4.6, -0.62],
    [0.001, -0.62],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  root.add(new THREE.Mesh(new THREE.LatheGeometry(floorProf, 128), new THREE.MeshStandardMaterial({ color: 0x0d0d11, roughness: 0.6, metalness: 0.5 })));
  const rim = new THREE.Mesh(new THREE.TorusGeometry(4.65, 0.02, 8, 160), M.glow(kit.COL.people, 1.2));
  rim.rotation.x = Math.PI / 2;
  rim.position.y = -0.63;
  root.add(rim);

  // gold coins and confetti raining down
  const rain = new THREE.InstancedMesh(swarm, M.gold(), 10);
  const confColors = [0xf2b440, 0xa98bff, 0x4fd88a, 0x38c6e6, 0xff6b3d];
  const conf = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.09, 0.05), new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, metalness: 0.4, roughness: 0.4 }), 60);
  for (let i = 0; i < 60; i++) conf.setColorAt(i, new THREE.Color(confColors[i % confColors.length]));
  root.add(rain, conf);
  const m4 = new THREE.Matrix4();
  const v = new THREE.Vector3();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const s = new THREE.Vector3();

  let camZ = 10.5;
  return {
    fit(aspect) {
      camZ = aspect < 0.9 ? 16 : aspect < 1.4 ? 12.5 : 10.5;
    },
    tick(dt, t, ptr) {
      camera.position.set(Math.sin(t * 0.15) * 1.2 + ptr.x * 0.8, 3.4 - ptr.y * 0.4, camZ);
      camera.lookAt(0, 1.5, 0);
      cup.rotation.y = t * 0.6;
      for (let i = 0; i < 10; i++) {
        const k = (i / 10 + t * 0.28) % 1;
        v.set(Math.sin(i * 20) * 0.5, 3.9 - k * 2.1, Math.cos(i * 13) * 0.4 + 0.6);
        q.setFromEuler(e.set(t * 3 + i, t * 2, 0));
        const sc = 0.18 * Math.min(1, k * 6) * (k < 0.92 ? 1 : 0);
        rain.setMatrixAt(i, m4.compose(v, q, s.set(sc, sc, sc)));
      }
      rain.instanceMatrix.needsUpdate = true;
      for (let i = 0; i < 60; i++) {
        const k = (i / 60 + t * 0.09) % 1;
        const x = Math.sin(i * 7.7) * 4.2;
        v.set(x + Math.sin(t + i) * 0.3, 4.2 - k * 5, Math.cos(i * 3.1) * 1.8);
        q.setFromEuler(e.set(t * 2 + i, t * 3 + i * 2, t + i));
        conf.setMatrixAt(i, m4.compose(v, q, s.set(1, 1, 1)));
      }
      conf.instanceMatrix.needsUpdate = true;
    },
  };
}
