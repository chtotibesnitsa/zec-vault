// The small 3D objects inside the information boxes. Each builder returns
// { root, tick(t, dt), view, sway } and is sized to fit a unit sphere.
// Each one shows what its box says, and none repeats.
import { THREE, COL, M, iconFlame, zatsCoin, solCoin, swarmCoinGeo, roundBox, bust, shadow, glowSprite, canvasTex, shapeFrom, ringShape, typeface, textGeo, ease, clamp01 } from './kit.js';
import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader.js';

const G = () => new THREE.Group();
const mesh = (geo, mat, x = 0, y = 0, z = 0) => {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  return m;
};
const cyl = (r0, r1, h, seg = 32) => new THREE.CylinderGeometry(r0, r1, h, seg);
const cycle = (t, len, off = 0) => (((t + off) % len) + len) % len / len;

// A dial face texture: ticks, numerals optional, a progress arc.
function dialTex({ bg = '#14110c', tick = '#e9c47a', arc = null, arcFrac = 0.72, nums = false } = {}) {
  return canvasTex(512, (g, w) => {
    const c = w / 2;
    const gr = g.createRadialGradient(c * 0.8, c * 0.7, 0, c, c, c);
    gr.addColorStop(0, '#2a2418');
    gr.addColorStop(1, bg);
    g.fillStyle = gr;
    g.fillRect(0, 0, w, w);
    if (arc) {
      g.strokeStyle = arc;
      g.lineWidth = w * 0.05;
      g.lineCap = 'round';
      g.beginPath();
      g.arc(c, c, c * 0.62, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * arcFrac);
      g.stroke();
    }
    for (let i = 0; i < 60; i++) {
      const a = (i / 60) * Math.PI * 2;
      const big = i % 5 === 0;
      g.strokeStyle = tick;
      g.lineWidth = big ? 6 : 2;
      g.beginPath();
      g.moveTo(c + Math.cos(a) * c * (big ? 0.76 : 0.82), c + Math.sin(a) * c * (big ? 0.76 : 0.82));
      g.lineTo(c + Math.cos(a) * c * 0.9, c + Math.sin(a) * c * 0.9);
      g.stroke();
    }
    if (nums) {
      g.fillStyle = tick;
      g.font = `700 ${w * 0.08}px "JetBrains Mono", monospace`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
        g.fillText(String(i * 10), c + Math.cos(a) * c * 0.6, c + Math.sin(a) * c * 0.6);
      }
    }
  });
}

const B = {
  // ---------------------------------------------------------------- home: how it works
  // SOL and $ZATS trade places around a swap ring.
  swap() {
    const root = G();
    const a = solCoin('lo');
    const b = zatsCoin('lo');
    a.scale.setScalar(0.52);
    b.scale.setScalar(0.52);
    const ring = mesh(new THREE.TorusGeometry(0.62, 0.012, 8, 96), M.glow(COL.trade, 1.4));
    ring.rotation.x = Math.PI / 2;
    const arrows = [0, Math.PI].map((ang) => {
      const c = mesh(new THREE.ConeGeometry(0.05, 0.13, 16), M.glow(COL.trade, 1.4));
      c.userData.a = ang;
      return c;
    });
    root.add(a, b, ring, ...arrows, shadow(0.9, 0.45, -0.62));
    return {
      root,
      sway: 0.15,
      view: { el: 0.42, dist: 4.1 },
      tick(t) {
        const n = Math.floor(t / 2.6);
        const k = ease(clamp01((cycle(t, 2.6) - 0.35) / 0.65));
        const ang = (n + k) * Math.PI;
        a.position.set(Math.cos(ang) * 0.62, Math.sin(k * Math.PI) * 0.12, Math.sin(ang) * 0.62);
        b.position.set(-a.position.x, -a.position.y * 0.5, -a.position.z);
        a.rotation.y = -ang + Math.PI / 2 + Math.sin(t) * 0.2;
        b.rotation.y = -ang - Math.PI / 2 + Math.sin(t) * 0.2;
        arrows.forEach((c) => {
          const aa = c.userData.a + t * 1.2;
          c.position.set(Math.cos(aa) * 0.62, 0, Math.sin(aa) * 0.62);
          c.rotation.set(0, -aa, Math.PI / 2);
          c.rotateZ(Math.PI);
        });
      },
    };
  },

  // The fee coin cut into its parts; the slices pull apart and rejoin.
  split({ share = 80, burn = 10 } = {}) {
    const root = G();
    const parts = [
      [share / 100, COL.pay, M.gold()],
      [burn / 100, COL.burn, M.metal(COL.burn, 0.32)],
      [Math.max(0, 1 - share / 100 - burn / 100), COL.vault, M.metal(COL.vault, 0.32)],
    ].filter((p) => p[0] > 0);
    let a0 = Math.PI / 2;
    const slices = parts.map(([f, , mat], i) => {
      const len = f * Math.PI * 2;
      const s = new THREE.Shape();
      s.moveTo(0, 0);
      s.absarc(0, 0, 0.92, a0, a0 + len, false);
      s.lineTo(0, 0);
      const geo = new THREE.ExtrudeGeometry(s, { depth: 0.16, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 4, curveSegments: 64 });
      geo.translate(0, 0, -0.08);
      const m = mesh(geo, mat);
      const mid = a0 + len / 2;
      m.userData.dir = new THREE.Vector3(Math.cos(mid), Math.sin(mid), 0);
      m.userData.i = i;
      a0 += len;
      return m;
    });
    const plate = G();
    plate.add(...slices);
    plate.rotation.x = -Math.PI / 2;
    const glow = glowSprite(COL.burn, 0.9, 0);
    root.add(plate, glow, shadow(1.1, 0.5, -0.14));
    return {
      root,
      view: { el: 0.62, dist: 4.0 },
      tick(t) {
        const k = cycle(t, 3.6);
        const out = Math.sin(clamp01((k - 0.1) / 0.8) * Math.PI);
        slices.forEach((m) => {
          const d = 0.06 + out * (m.userData.i === 0 ? 0.12 : 0.34);
          m.position.copy(m.userData.dir).multiplyScalar(d);
          m.position.z = out * (m.userData.i === 0 ? 0 : 0.18);
        });
        const burnSlice = slices[1];
        if (burnSlice) {
          glow.position.set(burnSlice.position.x * 1.6, 0.25, -burnSlice.position.y * 1.6);
          glow.material.opacity = out * 0.7;
        }
      },
    };
  },

  // Coins dropping through the slot of a vault.
  coindrop() {
    const root = G();
    const body = mesh(roundBox(1.5, 0.78, 1.0, 0.1, 5), M.paint(0x2c2d34, 0.35), 0, -0.25, 0);
    const lid = mesh(roundBox(1.56, 0.08, 1.06, 0.035, 3), M.metal(0x8a8f9c, 0.28), 0, 0.16, 0);
    const slot = mesh(roundBox(0.82, 0.04, 0.14, 0.02, 2), M.basic(0x050505), 0, 0.2, 0);
    const slotGlow = mesh(new THREE.PlaneGeometry(0.78, 0.1), M.add(COL.pay, 0.6), 0, 0.225, 0);
    slotGlow.rotation.x = -Math.PI / 2;
    const plaque = mesh(roundBox(0.62, 0.22, 0.03, 0.03, 2), M.gold(), 0, -0.25, 0.51);
    const bolts = [-0.6, 0.6].flatMap((x) => [-0.48, -0.02].map((y) => mesh(new THREE.SphereGeometry(0.035, 16, 12), M.metal(0xb7bcc8, 0.25), x, y - 0.02, 0.5)));
    const coins = [0, 1, 2].map((i) => {
      const c = zatsCoin('lo');
      c.scale.setScalar(0.3);
      c.userData.o = i / 3;
      return c;
    });
    root.add(body, lid, slot, slotGlow, plaque, ...bolts, ...coins, shadow(1.2, 0.55, -0.64));
    return {
      root,
      view: { el: 0.38, dist: 4.4, y: 0.05 },
      tick(t) {
        coins.forEach((c) => {
          const k = cycle(t, 2.4, c.userData.o * 2.4);
          const y = 0.95 - k * k * 1.05;
          c.position.set(0, y, 0);
          c.rotation.y = 0;
          c.rotation.z = Math.sin(t * 2 + c.userData.o * 6) * 0.08;
          c.visible = y > 0.0;
        });
        slotGlow.material.opacity = 0.35 + Math.max(0, Math.sin(t * 2.6)) * 0.4;
      },
    };
  },

  // The home hero: an open vault, gold stacks inside, $ZATS spilling out.
  herovault() {
    const root = G();
    const shell = new THREE.MeshPhysicalMaterial({ color: 0x2a2b31, metalness: 0.75, roughness: 0.32, clearcoat: 0.8, clearcoatRoughness: 0.18 });
    const steel = M.metal(0xc5c9d2, 0.22);
    const gold = M.gold();
    const W = 2.2;
    const H = 2.0;
    const D = 1.7;
    // body: an outer shell with a hollow front (frame + back + sides)
    const body = G();
    const wall = 0.16;
    body.add(mesh(roundBox(W, H, wall, 0.05, 3), shell, 0, 0, -D / 2 + wall / 2));
    body.add(mesh(roundBox(wall, H, D, 0.05, 3), shell, -W / 2 + wall / 2, 0, 0));
    body.add(mesh(roundBox(wall, H, D, 0.05, 3), shell, W / 2 - wall / 2, 0, 0));
    body.add(mesh(roundBox(W, wall, D, 0.05, 3), shell, 0, H / 2 - wall / 2, 0));
    body.add(mesh(roundBox(W, wall, D, 0.05, 3), shell, 0, -H / 2 + wall / 2, 0));
    // front frame lip with a brass edge
    const lip = mesh(new THREE.TorusGeometry(1, 0.03, 12, 4), M.metal(0xc29a52, 0.25), 0, 0, D / 2);
    lip.rotation.z = Math.PI / 4;
    lip.scale.set((W - 0.12) / 1.414, (H - 0.12) / 1.414, 1);
    body.add(lip);
    // dark velvet interior and a warm light inside
    const inner = new THREE.MeshStandardMaterial({ color: 0x1a1210, roughness: 0.95 });
    body.add(mesh(new THREE.PlaneGeometry(W - wall * 2, H - wall * 2), inner, 0, 0, -D / 2 + wall + 0.005));
    const shelf = mesh(roundBox(W - wall * 2, 0.05, D - wall, 0.02, 2), steel, 0, 0.05, 0.02);
    body.add(shelf);
    const glow = mesh(new THREE.PlaneGeometry(W - 0.5, 0.06), new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffc070, emissiveIntensity: 6 }), 0, H / 2 - wall - 0.04, D / 2 - 0.3);
    glow.rotation.x = Math.PI / 2;
    body.add(glow);
    // gold coin stacks on both shelves, and a few bars
    const swarm = swarmCoinGeo();
    const flat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
    const m4 = new THREE.Matrix4();
    const stacks = [
      [-0.62, 0.08, -0.25, 9], [-0.3, 0.08, -0.1, 12], [0.05, 0.08, -0.3, 7], [0.4, 0.08, -0.15, 10], [0.7, 0.08, -0.35, 6],
      [-0.6, -0.84, -0.2, 8], [-0.2, -0.84, -0.3, 11], [0.25, -0.84, -0.15, 9], [0.65, -0.84, -0.3, 12],
    ];
    const total = stacks.reduce((n, st) => n + st[3], 0);
    const stackMesh = new THREE.InstancedMesh(swarm, gold, total);
    let k = 0;
    for (const [x, y, z, n] of stacks) {
      for (let i = 0; i < n; i++) {
        m4.compose(new THREE.Vector3(x + Math.sin(k * 3.1) * 0.012, y + 0.03 + i * 0.05, z + Math.cos(k * 2.3) * 0.012), flat, new THREE.Vector3(0.16, 0.16, 0.24));
        stackMesh.setMatrixAt(k++, m4);
      }
    }
    body.add(stackMesh);
    const bar = new THREE.ExtrudeGeometry(shapeFrom([[-0.22, 0], [0.22, 0], [0.18, 0.1], [-0.18, 0.1]]), { depth: 0.12, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.012, bevelSegments: 2 });
    [[-0.1, 0.08, 0.32], [0.38, 0.08, 0.3], [0.13, 0.18, 0.31]].forEach(([x, y, z], i) => {
      const b = mesh(bar, gold, x, y, z - 0.06);
      b.rotation.y = i * 0.2 - 0.1;
      body.add(b);
    });
    root.add(body);
    // the door, swung open on its left hinge
    const hinge = G();
    hinge.position.set(-W / 2, 0, D / 2);
    const door = G();
    door.add(mesh(roundBox(W - 0.06, H - 0.06, 0.2, 0.07, 4), shell, (W - 0.06) / 2, 0, 0.1));
    door.add(mesh(roundBox(W - 0.5, H - 0.5, 0.06, 0.025, 3), M.metal(0x34353c, 0.3), (W - 0.06) / 2, 0, 0.21));
    const dial = mesh(cyl(0.26, 0.28, 0.08, 64), gold, W / 2 - 0.25, 0.25, 0.25);
    dial.rotation.x = Math.PI / 2;
    const dialFace = mesh(new THREE.CircleGeometry(0.22, 64), new THREE.MeshStandardMaterial({ map: dialTex({ nums: true }), metalness: 0.4, roughness: 0.35 }), W / 2 - 0.25, 0.25, 0.292);
    door.add(dial, dialFace);
    const wheel = G();
    wheel.position.set(W / 2 + 0.05, -0.38, 0.27);
    wheel.add(mesh(new THREE.TorusGeometry(0.22, 0.03, 16, 48), steel));
    for (let i = 0; i < 3; i++) {
      const sp = mesh(cyl(0.02, 0.02, 0.44, 12), steel);
      sp.rotation.z = (i / 3) * Math.PI;
      wheel.add(sp);
    }
    door.add(wheel);
    const bolts = new THREE.InstancedMesh(cyl(0.05, 0.05, 0.3, 24), steel, 6);
    const qz = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2);
    [-0.6, 0, 0.6].forEach((y, i) => {
      m4.compose(new THREE.Vector3(W - 0.03, y, 0.1), qz, new THREE.Vector3(1, 1, 1));
      bolts.setMatrixAt(i, m4);
      m4.compose(new THREE.Vector3(W / 2, y < 0 ? -H / 2 + 0.02 : H / 2 - 0.02, 0.1), new THREE.Quaternion(), new THREE.Vector3(1, 1, 1));
      bolts.setMatrixAt(i + 3, m4);
    });
    door.add(bolts);
    hinge.add(door);
    hinge.rotation.y = -1.95;
    root.add(hinge);
    // coins spilling out onto the floor
    const spill = [];
    for (let i = 0; i < 22; i++) {
      const c = zatsCoin('lo');
      const r = 0.25 + Math.pow(i / 22, 0.8) * 1.6;
      const a = -0.6 + Math.sin(i * 2.7) * 1.1;
      c.scale.setScalar(0.2);
      c.position.set(Math.sin(a) * r + 0.1, -H / 2 + 0.03 + (i % 5 === 0 ? 0.04 : 0), D / 2 + Math.cos(a) * r * 0.8);
      c.rotation.set(-Math.PI / 2 + Math.sin(i * 5.1) * 0.35, Math.sin(i * 1.3) * 0.3, i * 0.9);
      spill.push(c);
    }
    // a couple leaning against the pile, one rolling
    const lean = zatsCoin('hi');
    lean.scale.setScalar(0.34);
    lean.position.set(0.85, -H / 2 + 0.3, D / 2 + 0.75);
    lean.rotation.set(-0.35, -0.55, 0.05);
    const sol = solCoin('hi');
    sol.scale.setScalar(0.3);
    sol.position.set(-0.55, -H / 2 + 0.27, D / 2 + 1.0);
    sol.rotation.set(-0.3, 0.45, -0.08);
    root.add(...spill, lean, sol);
    root.position.set(0.55, 0.15, 0);
    return {
      root,
      sway: 0,
      view: { el: 0.28, az: 0.42, dist: 9.6, fov: 30, y: -0.15 },
      tick() {},
    };
  },

  // One holder: a single person icon for the Live page.
  person() {
    const root = G();
    const mat = new THREE.MeshPhysicalMaterial({ color: COL.people, roughness: 0.32, metalness: 0.05, clearcoat: 0.8, clearcoatRoughness: 0.2 });
    const b = bust(mat);
    b.scale.setScalar(1.9);
    b.position.y = -0.2;
    const base = mesh(cyl(0.62, 0.68, 0.08, 64), M.metal(0x4a4560, 0.3), 0, -0.86, 0);
    const ring = mesh(new THREE.TorusGeometry(0.66, 0.03, 12, 64), M.glow(COL.people, 0.8), 0, -0.82, 0);
    ring.rotation.x = Math.PI / 2;
    root.add(b, base, ring);
    return { root, sway: 0.2, view: { el: 0.2, dist: 4.4, y: -0.05 }, tick() {} };
  },

  // The fire bowl without its flame (the page animates the fire).
  brazier() {
    const o = B.burn();
    const kids = o.root.children;
    o.root.remove(kids[6]);
    o.root.remove(kids[5]);
    o.root.position.y = 0.3;
    return { ...o, sway: 0, view: { el: 0.3, dist: 4.0, y: -0.25 }, tick() {} };
  },

  // Plain coins, used as the small flying coins on the page scenes.
  coinzats() {
    const root = G();
    const c = zatsCoin('hi');
    root.add(c);
    return { root, sway: 0, view: { el: 0.1, az: 0, dist: 3.1 }, tick() { c.rotation.set(0.15, 0.5, -0.1); } };
  },
  coinsol() {
    const root = G();
    const c = solCoin('hi');
    root.add(c);
    return { root, sway: 0, view: { el: 0.1, az: 0, dist: 3.1 }, tick() { c.rotation.set(0.15, 0.5, -0.1); } };
  },

  // ---------------------------------------------------------------- home: start
  zcoin() {
    const root = G();
    const coin = zatsCoin('hi');
    coin.scale.setScalar(0.82);
    const halo = glowSprite(COL.pay, 2.6, 0.35);
    halo.position.z = -0.4;
    root.add(halo, coin, shadow(0.8, 0.5, -0.98));
    return {
      root,
      sway: 0,
      view: { el: 0.12, az: 0, dist: 4.3 },
      tick(t) {
        coin.rotation.y = t * 1.1;
        coin.rotation.x = Math.sin(t * 0.8) * 0.12;
        coin.position.y = Math.sin(t * 1.4) * 0.05;
        halo.material.opacity = 0.25 + Math.sin(t * 2) * 0.08;
      },
    };
  },

  // A floor safe: door, combination dial, three-spoke handle, hinges, feet.
  safe() {
    const root = G();
    const paint = M.paint(0x34302a, 0.38);
    const body = mesh(roundBox(1.3, 1.25, 1.1, 0.1, 5), paint);
    const door = mesh(roundBox(1.02, 0.98, 0.1, 0.06, 4), M.paint(0x3e392f, 0.3), 0, 0, 0.56);
    const trim = mesh(new THREE.TorusGeometry(0.5, 0.012, 6, 4), M.gold());
    trim.rotation.z = Math.PI / 4;
    trim.scale.set(1.02 * 1.414 * 0.98, 0.98 * 1.414 * 0.98, 1);
    trim.position.set(0, 0, 0.615);
    const dialG = G();
    dialG.position.set(-0.18, 0.12, 0.62);
    const dialRim = mesh(cyl(0.2, 0.22, 0.07, 48), M.gold());
    dialRim.rotation.x = Math.PI / 2;
    const dialFace = mesh(new THREE.CircleGeometry(0.18, 48), new THREE.MeshStandardMaterial({ map: dialTex({ nums: true }), metalness: 0.5, roughness: 0.35 }), 0, 0, 0.036);
    const knob = mesh(cyl(0.07, 0.08, 0.08, 32), M.metal(0xd7b46a, 0.25), 0, 0, 0.06);
    knob.rotation.x = Math.PI / 2;
    dialG.add(dialRim, dialFace, knob);
    const handle = G();
    handle.position.set(0.26, -0.18, 0.62);
    const hub = mesh(cyl(0.06, 0.06, 0.08, 24), M.metal(0xc0c4ce, 0.25));
    hub.rotation.x = Math.PI / 2;
    handle.add(hub);
    for (let i = 0; i < 3; i++) {
      const arm = G();
      arm.rotation.z = (i / 3) * Math.PI * 2;
      const rod = mesh(cyl(0.018, 0.018, 0.22, 12), M.metal(0xc0c4ce, 0.25), 0, 0.13, 0.04);
      const ball = mesh(new THREE.SphereGeometry(0.04, 16, 12), M.metal(0xc0c4ce, 0.2), 0, 0.25, 0.04);
      arm.add(rod, ball);
      handle.add(arm);
    }
    const hinges = [0.3, -0.3].map((y) => mesh(cyl(0.035, 0.035, 0.18, 16), M.metal(0x8e8a80, 0.3), -0.52, y, 0.6));
    const feet = [-0.5, 0.5].flatMap((x) => [-0.4, 0.4].map((z) => mesh(roundBox(0.14, 0.08, 0.14, 0.02, 2), M.metal(0x222222, 0.5), x, -0.66, z)));
    const lamp = mesh(new THREE.SphereGeometry(0.03, 12, 8), M.glow(COL.trade, 2), 0.38, 0.36, 0.62);
    root.add(body, door, trim, dialG, handle, ...hinges, ...feet, lamp, shadow(1.1, 0.55, -0.7));
    root.position.y = 0.05;
    return {
      root,
      view: { el: 0.26, dist: 4.5 },
      tick(t) {
        const k = cycle(t, 3);
        dialG.rotation.z = -Math.floor(t / 3) * 1.6 - ease(clamp01(k / 0.5)) * 1.6;
        handle.rotation.z = Math.sin(t * 0.7) * 0.3;
        lamp.material.emissiveIntensity = 0.8 + Math.sin(t * 4) * 0.4;
      },
    };
  },

  // A name card: your public name, avatar and signature.
  namecard() {
    const root = G();
    const tex = canvasTex(
      0,
      (g, w, h) => {
        const gr = g.createLinearGradient(0, 0, w, h);
        gr.addColorStop(0, '#4a3b8c');
        gr.addColorStop(0.6, '#1f1937');
        gr.addColorStop(1, '#140f24');
        g.fillStyle = gr;
        g.fillRect(0, 0, w, h);
        g.strokeStyle = 'rgba(255,255,255,0.06)';
        for (let i = -h; i < w; i += 18) {
          g.beginPath();
          g.moveTo(i, 0);
          g.lineTo(i + h, h);
          g.stroke();
        }
        const ag = g.createRadialGradient(w * 0.2, h * 0.38, 4, w * 0.2, h * 0.4, h * 0.2);
        ag.addColorStop(0, '#d9c9ff');
        ag.addColorStop(1, '#8a6cf0');
        g.fillStyle = ag;
        g.beginPath();
        g.arc(w * 0.2, h * 0.4, h * 0.18, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#fff';
        g.font = `900 ${h * 0.17}px Satoshi, system-ui, sans-serif`;
        g.fillText('@you', w * 0.36, h * 0.42);
        g.fillStyle = 'rgba(255,255,255,0.55)';
        g.font = `500 ${h * 0.08}px "JetBrains Mono", monospace`;
        g.fillText('HOLDER  ·  ZATOSHI', w * 0.36, h * 0.56);
        g.strokeStyle = '#c4b2ff';
        g.lineWidth = 4;
        g.lineCap = 'round';
        g.beginPath();
        g.moveTo(w * 0.1, h * 0.8);
        g.bezierCurveTo(w * 0.2, h * 0.62, w * 0.25, h * 0.92, w * 0.33, h * 0.76);
        g.bezierCurveTo(w * 0.4, h * 0.64, w * 0.45, h * 0.88, w * 0.55, h * 0.74);
        g.stroke();
        const cg = g.createLinearGradient(w * 0.74, h * 0.66, w * 0.9, h * 0.86);
        cg.addColorStop(0, '#ffe39a');
        cg.addColorStop(1, '#b77a16');
        g.fillStyle = cg;
        g.beginPath();
        g.roundRect(w * 0.74, h * 0.66, w * 0.15, h * 0.2, 8);
        g.fill();
      },
      { w: 640, h: 400 },
    );
    const card = mesh(roundBox(1.7, 1.06, 0.05, 0.08, 4), M.paint(0x1d1830, 0.3));
    const face = mesh(new THREE.PlaneGeometry(1.6, 1.0), new THREE.MeshPhysicalMaterial({ map: tex, roughness: 0.35, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.1 }), 0, 0, 0.027);
    const edge = mesh(roundBox(1.72, 1.08, 0.03, 0.085, 4), M.metal(COL.people, 0.3));
    const flip = G();
    flip.add(card, face, edge);
    root.add(flip, shadow(1.1, 0.45, -0.8));
    return {
      root,
      sway: 0,
      view: { el: 0.18, az: 0, dist: 4.3 },
      tick(t) {
        const k = cycle(t, 6);
        flip.rotation.y = -0.5 + Math.sin(t * 0.6) * 0.25 + ease(clamp01((k - 0.75) / 0.25)) * Math.PI * 2;
        flip.rotation.x = -0.12;
        flip.position.y = Math.sin(t * 1.2) * 0.05;
      },
    };
  },

  // You in the middle, invited friends orbiting, linked.
  friends() {
    const root = G();
    const me = bust(M.paint(COL.people, 0.35));
    me.scale.setScalar(1.25);
    const cols = [COL.trade, COL.vault, COL.pay];
    const pals = cols.map((c) => {
      const b = bust(M.paint(c, 0.35));
      b.scale.setScalar(0.62);
      return b;
    });
    const lineGeo = new THREE.BufferGeometry().setFromPoints(new Array(6).fill(0).map(() => new THREE.Vector3()));
    const lines = new THREE.LineSegments(lineGeo, new THREE.LineBasicMaterial({ color: COL.people, transparent: true, opacity: 0.6 }));
    const ring = mesh(new THREE.TorusGeometry(0.95, 0.008, 6, 96), M.basic(COL.people, 0.35), 0, -0.1, 0);
    ring.rotation.x = Math.PI / 2;
    root.add(me, ...pals, lines, ring, shadow(1.2, 0.4, -0.4));
    return {
      root,
      sway: 0,
      view: { el: 0.4, dist: 4.3, y: 0.1 },
      tick(t) {
        const pos = lineGeo.attributes.position;
        pals.forEach((p, i) => {
          const a = t * 0.6 + (i / 3) * Math.PI * 2;
          p.position.set(Math.cos(a) * 0.95, -0.12 + Math.sin(t * 2 + i) * 0.06, Math.sin(a) * 0.95);
          p.rotation.y = -a + Math.PI / 2;
          pos.setXYZ(i * 2, 0, 0.35, 0);
          pos.setXYZ(i * 2 + 1, p.position.x, p.position.y + 0.25, p.position.z);
        });
        pos.needsUpdate = true;
        me.rotation.y = Math.sin(t * 0.5) * 0.4;
      },
    };
  },

  // ---------------------------------------------------------------- proof numbers
  coinstack() {
    const root = G();
    const coins = Array.from({ length: 6 }, (_, i) => {
      const c = zatsCoin('lo');
      c.scale.setScalar(0.62);
      c.rotation.x = -Math.PI / 2;
      c.rotation.z = i * 0.7;
      c.position.set(Math.sin(i * 2.1) * 0.03, -0.55 + i * 0.12, Math.cos(i * 1.7) * 0.03);
      c.userData.y = c.position.y;
      return c;
    });
    root.add(...coins, shadow(0.9, 0.5, -0.62));
    return {
      root,
      view: { el: 0.45, dist: 4.0 },
      tick(t) {
        const k = cycle(t, 2.6);
        const top = coins[coins.length - 1];
        const d = Math.max(0, 1 - k / 0.45);
        top.position.y = top.userData.y + d * d * 1.1;
        top.rotation.z = t;
        top.visible = k > 0.02;
      },
    };
  },

  // A $ZATS coin dropping into a cast-iron brazier full of fire.
  burn() {
    const root = G();
    const iron = new THREE.MeshPhysicalMaterial({ color: 0x2b2c31, metalness: 0.75, roughness: 0.42, clearcoat: 0.3 });
    const bowlProf = [
      [0.001, -0.62],
      [0.3, -0.62],
      [0.5, -0.56],
      [0.66, -0.4],
      [0.74, -0.2],
      [0.76, -0.12],
      [0.7, -0.12],
      [0.62, -0.3],
      [0.001, -0.36],
    ].map(([x, y]) => new THREE.Vector2(x, y));
    const bowl = mesh(new THREE.LatheGeometry(bowlProf, 96), iron);
    const lip = mesh(new THREE.TorusGeometry(0.735, 0.035, 16, 96), M.metal(0xb08a4a, 0.3), 0, -0.12, 0);
    lip.rotation.x = Math.PI / 2;
    const stand = mesh(cyl(0.22, 0.34, 0.16, 48), iron, 0, -0.72, 0);
    const foot = mesh(cyl(0.42, 0.44, 0.05, 48), M.metal(0x3a3b40, 0.35), 0, -0.82, 0);
    const coals = new THREE.Group();
    for (let i = 0; i < 14; i++) {
      const a = i * 2.4;
      const r = 0.15 + (i % 4) * 0.12;
      const c = mesh(new THREE.DodecahedronGeometry(0.09 + (i % 3) * 0.02, 0), new THREE.MeshPhysicalMaterial({ color: 0x1a1210, emissive: i % 3 ? 0xff5a1a : 0xffa040, emissiveIntensity: i % 3 ? 0.6 : 1.4, roughness: 0.8 }), Math.cos(a) * r, -0.3, Math.sin(a) * r);
      c.rotation.set(i, i * 2, i * 3);
      coals.add(c);
    }
    const fire = iconFlame(0.95);
    fire.position.y = -0.32;
    const coin = zatsCoin('hi');
    coin.scale.setScalar(0.34);
    coin.position.set(0.06, 0.62, 0.1);
    coin.rotation.set(0.2, -0.5, 0.35);
    root.add(bowl, lip, stand, foot, coals, fire, coin);
    return {
      root,
      sway: 0.15,
      view: { el: 0.24, dist: 4.4, y: -0.02 },
      tick(t) {
        coin.position.y = 0.62 + Math.sin(t * 1.4) * 0.05;
        fire.scale.y = 1 + Math.sin(t * 6) * 0.04;
      },
    };
  },

  // Holders appearing on a grid, one by one.
  holders() {
    const root = G();
    const base = mesh(roundBox(1.7, 0.1, 1.7, 0.05, 3), M.paint(0x1d1b26, 0.4), 0, -0.5, 0);
    const people = [];
    for (let i = 0; i < 9; i++) {
      const pad = mesh(cyl(0.2, 0.22, 0.04, 32), M.metal(0x55506a, 0.3));
      const b = bust(M.paint(COL.people, 0.32));
      const x = ((i % 3) - 1) * 0.52;
      const z = (Math.floor(i / 3) - 1) * 0.52;
      pad.position.set(x, -0.43, z);
      b.position.set(x, -0.25, z);
      b.scale.setScalar(0.48);
      b.userData.i = i;
      root.add(pad);
      people.push(b);
    }
    root.add(base, ...people);
    return {
      root,
      view: { el: 0.6, dist: 4.4, y: -0.1 },
      tick(t) {
        people.forEach((b) => {
          const k = cycle(t * 0.6, 1, -b.userData.i * 0.09);
          const pop = k < 0.12 ? Math.sin((k / 0.12) * Math.PI) : 0;
          b.position.y = -0.25 + pop * 0.18;
          b.scale.setScalar(0.48 * (1 + pop * 0.2));
        });
      },
    };
  },

  // A bar chart of trade volume, beating.
  bars() {
    const root = G();
    const base = mesh(roundBox(1.7, 0.08, 0.7, 0.04, 3), M.paint(0x1c1d22, 0.4), 0, -0.6, 0);
    const vals = [0.5, 0.8, 0.4, 1, 0.7];
    const bars = vals.map((v, i) => {
      const m = mesh(roundBox(0.24, 1, 0.24, 0.05, 3), M.metal(i === 2 ? COL.sell : COL.trade, 0.34), (i - 2) * 0.32, 0, 0);
      m.userData.v = v;
      return m;
    });
    const cap = bars.map((b) => mesh(roundBox(0.26, 0.03, 0.26, 0.012, 2), M.glow(0xffffff, 0.6)));
    root.add(base, ...bars, ...cap);
    return {
      root,
      view: { el: 0.32, dist: 4.2 },
      tick(t) {
        bars.forEach((b, i) => {
          const h = 0.25 + b.userData.v * 0.95 * (0.75 + Math.sin(t * 2.2 + i * 0.9) * 0.25);
          b.scale.y = h;
          b.position.y = -0.56 + h / 2;
          cap[i].position.set(b.position.x, -0.56 + h + 0.01, 0);
        });
      },
    };
  },

  // A brilliant-cut gem: the fee, made precious.
  prism() {
    const root = G();
    const prof = [
      [0.001, -0.85],
      [0.62, -0.08],
      [0.7, 0],
      [0.7, 0.06],
      [0.5, 0.32],
      [0.001, 0.32],
    ].map(([x, y]) => new THREE.Vector2(x, y));
    const geo = new THREE.LatheGeometry(prof, 10).toNonIndexed();
    geo.computeVertexNormals();
    const gem = mesh(
      geo,
      new THREE.MeshPhysicalMaterial({ color: COL.vault, metalness: 0.15, roughness: 0.04, clearcoat: 1, iridescence: 1, iridescenceIOR: 1.6, flatShading: true, emissive: COL.vault, emissiveIntensity: 0.12 }),
    );
    gem.position.y = 0.15;
    const glow = glowSprite(COL.vault, 2, 0.4);
    root.add(glow, gem, shadow(0.8, 0.45, -0.85));
    return {
      root,
      sway: 0,
      view: { el: 0.3, dist: 4.1 },
      tick(t) {
        gem.rotation.y = t * 0.9;
        gem.position.y = 0.15 + Math.sin(t * 1.5) * 0.06;
      },
    };
  },

  // ---------------------------------------------------------------- burn card
  // A cast-iron stove with its door open: coins go in, fire comes out.
  furnace() {
    const root = G();
    const iron = new THREE.MeshPhysicalMaterial({ color: 0x2a2b30, metalness: 0.7, roughness: 0.4, clearcoat: 0.35, clearcoatRoughness: 0.3 });
    const brass = M.metal(0xb88f4c, 0.28);
    // pot-belly body
    const prof = [];
    for (let i = 0; i <= 28; i++) {
      const v = i / 28;
      const y = -0.55 + v * 1.25;
      const r = 0.5 + Math.sin(v * Math.PI) * 0.17 - (v > 0.85 ? (v - 0.85) * 1.6 : 0);
      prof.push(new THREE.Vector2(r, y));
    }
    prof.unshift(new THREE.Vector2(0.001, -0.55));
    prof.push(new THREE.Vector2(0.001, 0.7));
    const body = mesh(new THREE.LatheGeometry(prof, 96), iron);
    const bands = [-0.42, 0.55].map((y) => {
      const b = mesh(new THREE.TorusGeometry(y < 0 ? 0.53 : 0.47, 0.03, 16, 96), brass, 0, y, 0);
      b.rotation.x = Math.PI / 2;
      return b;
    });
    const top = mesh(cyl(0.36, 0.42, 0.1, 64), iron, 0, 0.74, 0);
    const finial = mesh(new THREE.SphereGeometry(0.06, 24, 16), brass, -0.15, 0.82, 0.1);
    // chimney with an elbow
    const pipe = mesh(cyl(0.12, 0.12, 0.42, 40), iron, 0.12, 0.98, -0.08);
    const collar = mesh(cyl(0.15, 0.15, 0.06, 40), brass, 0.12, 0.82, -0.08);
    // legs
    const legs = [0, 1, 2].map((i) => {
      const a = (i / 3) * Math.PI * 2 + Math.PI / 6;
      const l = mesh(cyl(0.05, 0.035, 0.28, 16), iron, Math.cos(a) * 0.34, -0.66, Math.sin(a) * 0.34);
      l.rotation.set(Math.sin(a) * 0.25, 0, -Math.cos(a) * 0.25);
      return l;
    });
    // the open door: a recessed glowing mouth, the door swung aside
    const mouth = G();
    mouth.position.set(0, -0.08, 0.6);
    const frame = mesh(new THREE.TorusGeometry(0.24, 0.035, 16, 64), brass);
    const glowDisc = mesh(new THREE.CircleGeometry(0.235, 64), new THREE.MeshPhysicalMaterial({ color: 0x220800, emissive: 0xff6a1a, emissiveIntensity: 1.3, roughness: 1 }), 0, 0, -0.03);
    const fire = iconFlame(0.36);
    fire.position.set(0, -0.2, -0.02);
    mouth.add(glowDisc, fire, frame);
    mouth.lookAt(0, -0.08, 3);
    const hinge = G();
    hinge.position.set(0.25, -0.08, 0.58);
    const door = mesh(cyl(0.25, 0.25, 0.04, 64), iron, 0.25, 0, 0);
    door.rotation.x = Math.PI / 2;
    const knob = mesh(new THREE.SphereGeometry(0.035, 16, 12), brass, 0.42, 0, 0.04);
    const grille = [-0.08, 0, 0.08].map((y) => mesh(roundBox(0.24, 0.025, 0.02, 0.01, 2), brass, 0.25, y, 0.03));
    hinge.add(door, knob, ...grille);
    hinge.rotation.y = -1.25;
    const rivets = new THREE.Group();
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2;
      rivets.add(mesh(new THREE.SphereGeometry(0.018, 12, 8), brass, Math.cos(a) * 0.53, -0.36, Math.sin(a) * 0.53));
    }
    // coins on their way in
    const coins = [0, 1].map((i) => {
      const c = zatsCoin('hi');
      c.scale.setScalar(0.15);
      c.position.set(-0.5 + i * 0.2, 0.3 - i * 0.14, 0.95 - i * 0.12);
      c.rotation.set(0.3, 0.5 - i * 0.3, 0.2);
      return c;
    });
    root.add(body, ...bands, top, finial, pipe, collar, ...legs, mouth, hinge, rivets, ...coins);
    root.scale.setScalar(0.95);
    return {
      root,
      sway: 0.12,
      view: { el: 0.2, dist: 5.3, az: -0.35, y: 0.22 },
      tick(t) {
        coins.forEach((c, i) => (c.position.y = 0.3 - i * 0.14 + Math.sin(t * 1.5 + i) * 0.03));
      },
    };
  },

  // ---------------------------------------------------------------- swap ticks
  wallet() {
    const root = G();
    const leather = M.paint(0x167a55, 0.55);
    const body = mesh(roundBox(1.5, 1.02, 0.28, 0.12, 5), leather);
    const flap = mesh(roundBox(1.52, 0.5, 0.08, 0.1, 4), M.paint(0x1d8f64, 0.5), 0, 0.27, 0.16);
    const stitch = mesh(roundBox(1.36, 0.88, 0.005, 0.1, 3), new THREE.MeshBasicMaterial({ color: 0x8ff0c4, wireframe: false, transparent: true, opacity: 0.0 }));
    const clasp = mesh(cyl(0.09, 0.09, 0.05, 32), M.gold(), 0, 0.08, 0.22);
    clasp.rotation.x = Math.PI / 2;
    const card = mesh(roundBox(0.9, 0.6, 0.02, 0.04, 2), M.paint(COL.people, 0.3), 0.15, 0.42, -0.05);
    card.rotation.z = -0.12;
    root.add(card, body, flap, stitch, clasp, shadow(1.1, 0.45, -0.72));
    return {
      root,
      view: { el: 0.2, dist: 4.3 },
      tick(t) {
        card.position.y = 0.42 + Math.max(0, Math.sin(t * 1.6)) * 0.15;
        root.position.y = Math.sin(t) * 0.04;
      },
    };
  },

  // A stopwatch, counting toward the next snapshot.
  timer() {
    const root = G();
    const prof = [
      [0.001, 0.12],
      [0.82, 0.12],
      [0.9, 0.08],
      [0.92, 0],
      [0.9, -0.08],
      [0.82, -0.12],
      [0.001, -0.12],
    ].map(([x, y]) => new THREE.Vector2(x, y));
    const caseGeo = new THREE.LatheGeometry(prof.reverse(), 64);
    caseGeo.rotateX(Math.PI / 2);
    const watch = G();
    const shell = mesh(caseGeo, M.gold());
    const face = mesh(new THREE.CircleGeometry(0.8, 64), new THREE.MeshPhysicalMaterial({ map: dialTex({ arc: '#f2b440', arcFrac: 0.72 }), roughness: 0.4, metalness: 0.2, clearcoat: 1 }), 0, 0, 0.125);
    const glass = mesh(new THREE.SphereGeometry(0.82, 48, 16, 0, Math.PI * 2, 0, 0.5), new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: 0.12, roughness: 0, metalness: 0, clearcoat: 1 }), 0, 0, -0.6);
    glass.rotation.x = Math.PI / 2;
    const hand = mesh(roundBox(0.04, 0.6, 0.02, 0.01, 2), M.metal(0xffffff, 0.2));
    hand.geometry = hand.geometry.clone().translate(0, 0.26, 0);
    hand.position.z = 0.15;
    const pin = mesh(cyl(0.05, 0.05, 0.04, 24), M.gold(), 0, 0, 0.15);
    pin.rotation.x = Math.PI / 2;
    const crown = mesh(cyl(0.09, 0.09, 0.14, 24), M.goldDim(), 0, 0.98, 0);
    const stemM = mesh(cyl(0.05, 0.05, 0.1, 16), M.gold(), 0, 0.88, 0);
    const bow = mesh(new THREE.TorusGeometry(0.12, 0.025, 12, 32), M.gold(), 0, 1.13, 0);
    watch.add(shell, face, glass, hand, pin, crown, stemM, bow);
    watch.scale.setScalar(0.85);
    watch.position.y = -0.08;
    root.add(watch);
    return {
      root,
      view: { el: 0.1, dist: 4.2, az: -0.3 },
      tick(t) {
        hand.rotation.z = -t * 1.2;
      },
    };
  },

  // A shield with the Z: funds go wallet to pool, never through us.
  shield() {
    const root = G();
    const pts = [
      [0, 1],
      [0.82, 0.7],
      [0.82, 0.05],
      [0.78, -0.3],
      [0.55, -0.68],
      [0, -1],
      [-0.55, -0.68],
      [-0.78, -0.3],
      [-0.82, 0.05],
      [-0.82, 0.7],
    ];
    const outer = new THREE.ExtrudeGeometry(shapeFrom(pts, 0.92), { depth: 0.16, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.05, bevelSegments: 5 });
    outer.translate(0, 0, -0.08);
    const inner = new THREE.ExtrudeGeometry(shapeFrom(pts, 0.74), { depth: 0.06, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 3 });
    const zg = new THREE.ExtrudeGeometry(
      shapeFrom(
        [
          [-0.3, 0.3],
          [0.3, 0.3],
          [0.3, 0.18],
          [-0.1, -0.18],
          [0.3, -0.18],
          [0.3, -0.3],
          [-0.3, -0.3],
          [-0.3, -0.18],
          [0.1, 0.18],
          [-0.3, 0.18],
        ],
        1,
      ),
      { depth: 0.05, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.015, bevelSegments: 3 },
    );
    const s = G();
    s.add(mesh(outer, M.gold()), mesh(inner, M.enamel(), 0, 0, 0.1), mesh(zg, M.gold(), 0, 0, 0.17));
    s.scale.setScalar(0.85);
    root.add(s, shadow(0.9, 0.45, -0.95));
    return {
      root,
      sway: 0,
      view: { el: 0.12, az: 0, dist: 4.3 },
      tick(t) {
        s.rotation.y = Math.sin(t * 0.9) * 0.6;
        s.position.y = Math.sin(t * 1.3) * 0.04;
      },
    };
  },

  // ---------------------------------------------------------------- how page: token spec
  token() {
    const root = G();
    const coin = zatsCoin('hi');
    const rings = [1.35, 1.6].map((r, i) => {
      const m = mesh(new THREE.TorusGeometry(r, i ? 0.006 : 0.012, 8, 160), M.basic(COL.pay, i ? 0.35 : 0.6));
      m.rotation.x = Math.PI / 2 - 0.25;
      return m;
    });
    const beads = new THREE.InstancedMesh(new THREE.SphereGeometry(0.03, 12, 8), M.glow(COL.pay, 2), 10);
    const halo = glowSprite(COL.pay, 3.6, 0.3);
    halo.position.z = -0.5;
    const m4 = new THREE.Matrix4();
    root.add(halo, coin, ...rings, beads);
    root.scale.setScalar(0.62);
    return {
      root,
      sway: 0,
      view: { el: 0.14, az: 0, dist: 4.2 },
      tick(t) {
        coin.rotation.y = t * 0.75;
        coin.rotation.x = Math.sin(t * 0.6) * 0.1;
        for (let i = 0; i < 10; i++) {
          const a = t * 0.5 + (i / 10) * Math.PI * 2;
          m4.makeTranslation(Math.cos(a) * 1.35, Math.sin(a) * 1.35 * Math.sin(0.25) * -1, Math.sin(a) * 1.35 * Math.cos(0.25));
          beads.setMatrixAt(i, m4);
        }
        beads.instanceMatrix.needsUpdate = true;
      },
    };
  },

  // ---------------------------------------------------------------- boards
  async podium() {
    const face = await typeface();
    const root = G();
    const steps = [
      [-0.62, 0.5, 0xc0c6d2, '2'],
      [0, 0.8, 0xe7a92f, '1'],
      [0.62, 0.34, 0xc47a3f, '3'],
    ];
    steps.forEach(([x, h, c, n]) => {
      root.add(mesh(roundBox(0.58, h, 0.6, 0.04, 3), M.paint(0x24242c, 0.4), x, -0.6 + h / 2, 0));
      root.add(mesh(roundBox(0.6, 0.04, 0.62, 0.015, 2), M.metal(c, 0.25), x, -0.6 + h, 0));
      root.add(mesh(textGeo(face, n, 0.22, 0.04), M.metal(c, 0.22), x, -0.6 + h / 2, 0.31));
    });
    const cup = trophy();
    cup.scale.setScalar(0.42);
    cup.position.set(0, 0.2, 0);
    root.add(cup);
    return {
      root,
      view: { el: 0.28, dist: 4.4, y: -0.05 },
      tick(t) {
        cup.rotation.y = t * 0.8;
      },
    };
  },

  // A radio mast broadcasting.
  tower() {
    const root = G();
    const legMat = M.metal(0xb9bccb, 0.3);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const leg = mesh(cyl(0.012, 0.02, 1.5, 8), legMat, Math.cos(a) * 0.14, -0.15, Math.sin(a) * 0.14);
      leg.rotation.set(Math.sin(a) * -0.1, 0, Math.cos(a) * 0.1);
      root.add(leg);
    }
    for (let j = 0; j < 6; j++) {
      const y = -0.8 + j * 0.24;
      const r = 0.2 - j * 0.026;
      const brace = mesh(new THREE.TorusGeometry(r, 0.008, 4, 4), legMat, 0, y, 0);
      brace.rotation.set(Math.PI / 2, 0, Math.PI / 4);
      root.add(brace);
    }
    const tip = mesh(new THREE.SphereGeometry(0.07, 24, 16), M.glow(COL.people, 2.2), 0, 0.66, 0);
    const base = mesh(cyl(0.32, 0.36, 0.08, 32), M.paint(0x24242c, 0.4), 0, -0.88, 0);
    const waves = [0, 1, 2].map((i) => {
      const w = mesh(new THREE.TorusGeometry(1, 0.012, 8, 64), new THREE.MeshBasicMaterial({ color: COL.people, transparent: true, opacity: 0.6, depthWrite: false }), 0, 0.66, 0);
      w.rotation.x = Math.PI / 2;
      w.userData.o = i / 3;
      return w;
    });
    root.add(tip, base, ...waves, glowSprite(COL.people, 0.6, 0.8).translateY(0.66));
    return {
      root,
      view: { el: 0.3, dist: 4.4 },
      tick(t) {
        waves.forEach((w) => {
          const k = cycle(t * 0.6, 1, w.userData.o);
          w.scale.setScalar(0.1 + k * 0.9);
          w.material.opacity = 0.7 * (1 - k);
        });
        tip.material.emissiveIntensity = 1 + Math.sin(t * 5) * 0.3;
      },
    };
  },

  // Three interlocking chain links.
  chain() {
    const root = G();
    const L = 0.32;
    const R = 0.22;
    const path = new THREE.CurvePath();
    path.add(new THREE.LineCurve3(new THREE.Vector3(-L / 2, R, 0), new THREE.Vector3(L / 2, R, 0)));
    path.add(arc3(L / 2, R, Math.PI / 2, -Math.PI / 2));
    path.add(new THREE.LineCurve3(new THREE.Vector3(L / 2, -R, 0), new THREE.Vector3(-L / 2, -R, 0)));
    path.add(arc3(-L / 2, R, -Math.PI / 2, -Math.PI * 1.5));
    const geo = new THREE.TubeGeometry(path, 120, 0.062, 16, true);
    const links = [0, 1, 2].map((i) => {
      const m = mesh(geo, i === 1 ? M.gold() : M.silver(), (i - 1) * 0.58, 0, 0);
      m.rotation.x = i === 1 ? Math.PI / 2 : 0;
      return m;
    });
    const c = G();
    c.add(...links);
    root.add(c);
    return {
      root,
      sway: 0,
      view: { el: 0.3, dist: 4.0 },
      tick(t) {
        c.rotation.y = t * 0.6;
        c.rotation.z = Math.sin(t * 0.8) * 0.2;
      },
    };
  },

  // A black coin with the X logo.
  xbadge() {
    const root = G();
    const data = new SVGLoader().parse('<svg viewBox="0 0 24 24"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>');
    const shapes = data.paths.flatMap((p) => SVGLoader.createShapes(p));
    const xg = new THREE.ExtrudeGeometry(shapes, { depth: 1.2, bevelEnabled: true, bevelThickness: 0.3, bevelSize: 0.15, bevelSegments: 2 });
    xg.translate(-12, -12, 0);
    xg.rotateX(Math.PI); // flip SVG y without mirroring the faces
    xg.scale(0.042, 0.042, 0.04);
    xg.translate(0, 0, 0.05);
    const coin = G();
    const rimP = [
      [0.001, 0.08],
      [0.86, 0.08],
      [0.9, 0.11],
      [0.98, 0.1],
      [1, 0.05],
      [1, -0.05],
      [0.98, -0.1],
      [0.9, -0.11],
      [0.86, -0.08],
      [0.001, -0.08],
    ].map(([x, y]) => new THREE.Vector2(x, y));
    const body = new THREE.LatheGeometry(rimP.reverse(), 64);
    body.rotateX(Math.PI / 2);
    coin.add(mesh(body, M.gunmetal()));
    for (const side of [1, -1]) {
      const x = mesh(xg, M.silver(), 0, 0, side * 0.055);
      if (side < 0) x.rotation.y = Math.PI;
      coin.add(x);
    }
    coin.scale.setScalar(0.85);
    root.add(coin, shadow(0.8, 0.45, -0.95));
    return {
      root,
      sway: 0,
      view: { el: 0.1, az: 0, dist: 4.2 },
      tick(t) {
        const k = cycle(t, 4);
        coin.rotation.y = -0.4 + ease(clamp01((k - 0.5) / 0.4)) * Math.PI * 2;
        coin.position.y = Math.sin(t * 1.3) * 0.04;
      },
    };
  },

  // A fountain basin throwing coins up.
  fountain() {
    const root = G();
    const prof = [
      [0.001, -0.5],
      [0.5, -0.5],
      [0.62, -0.4],
      [0.7, -0.2],
      [0.74, -0.12],
      [0.66, -0.12],
      [0.6, -0.3],
      [0.001, -0.3],
    ].map(([x, y]) => new THREE.Vector2(x, y));
    const basin = mesh(new THREE.LatheGeometry(prof, 64), M.metal(0x8b8f9b, 0.3));
    const water = mesh(new THREE.CircleGeometry(0.64, 48), new THREE.MeshPhysicalMaterial({ color: COL.pay, emissive: COL.pay, emissiveIntensity: 0.25, metalness: 0.6, roughness: 0.15 }), 0, -0.18, 0);
    water.rotation.x = -Math.PI / 2;
    const geo = swarmCoinGeo();
    const coins = new THREE.InstancedMesh(geo, M.gold(), 7);
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const v = new THREE.Vector3();
    const sc = new THREE.Vector3(0.16, 0.16, 0.16);
    root.add(basin, water, coins, shadow(0.9, 0.5, -0.52));
    return {
      root,
      view: { el: 0.32, dist: 4.4, y: 0.05 },
      tick(t) {
        for (let i = 0; i < 7; i++) {
          const k = cycle(t * 0.55, 1, i / 7);
          const a = i * 0.9;
          v.set(Math.cos(a) * k * 0.55, -0.15 + Math.sin(k * Math.PI) * 1.05, Math.sin(a) * k * 0.55);
          q.setFromEuler(e.set(t * 3 + i, t * 2 + i, 0));
          m4.compose(v, q, sc);
          coins.setMatrixAt(i, m4);
        }
        coins.instanceMatrix.needsUpdate = true;
      },
    };
  },

  // Candlesticks with wicks.
  candles() {
    const root = G();
    const base = mesh(roundBox(1.4, 0.06, 0.6, 0.03, 2), M.paint(0x1c1d22, 0.4), 0, -0.7, 0);
    const data = [
      [-0.45, -0.25, 0.55, 1],
      [0, 0.05, 0.75, 1],
      [0.45, -0.1, 0.45, 0],
    ];
    const cs = data.map(([x, y, h, up], i) => {
      const g = G();
      const c = up ? COL.trade : COL.sell;
      g.add(mesh(roundBox(0.24, h, 0.24, 0.04, 3), M.metal(c, 0.34)));
      g.add(mesh(cyl(0.018, 0.018, h + 0.4, 8), M.glow(c, 0.8)));
      g.position.set(x, y, 0);
      g.userData = { y, i };
      return g;
    });
    root.add(base, ...cs);
    return {
      root,
      view: { el: 0.25, dist: 4.4 },
      tick(t) {
        cs.forEach((g) => (g.position.y = g.userData.y + Math.sin(t * 1.8 + g.userData.i) * 0.06));
      },
    };
  },

  // A globe with holder pins.
  globe() {
    const root = G();
    const tex = canvasTex(
      0,
      (g, w, h) => {
        g.fillStyle = '#16122a';
        g.fillRect(0, 0, w, h);
        g.strokeStyle = 'rgba(169,139,255,0.45)';
        g.lineWidth = 1.5;
        for (let i = 1; i < 12; i++) {
          g.beginPath();
          g.moveTo(0, (i / 12) * h);
          g.lineTo(w, (i / 12) * h);
          g.stroke();
        }
        for (let i = 0; i < 24; i++) {
          g.beginPath();
          g.moveTo((i / 24) * w, 0);
          g.lineTo((i / 24) * w, h);
          g.stroke();
        }
        g.fillStyle = 'rgba(169,139,255,0.9)';
        for (let i = 0; i < 260; i++) {
          const x = (Math.sin(i * 12.9898) * 43758.5453) % 1;
          const y = (Math.sin(i * 78.233) * 12345.678) % 1;
          g.beginPath();
          g.arc(Math.abs(x) * w, (0.15 + Math.abs(y) * 0.7) * h, 2.2, 0, Math.PI * 2);
          g.fill();
        }
      },
      { w: 1024, h: 512 },
    );
    const ball = mesh(new THREE.SphereGeometry(0.72, 64, 48), new THREE.MeshPhysicalMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.35, roughness: 0.35, metalness: 0.2, clearcoat: 1 }));
    const atmo = glowSprite(COL.people, 2.3, 0.35);
    const ring = mesh(new THREE.TorusGeometry(0.98, 0.01, 8, 128), M.basic(COL.people, 0.5));
    ring.rotation.x = Math.PI / 2 - 0.35;
    const pins = Array.from({ length: 6 }, (_, i) => {
      const p = G();
      const lat = (Math.sin(i * 4.1) * 0.9);
      const lon = i * 1.05;
      const dir = new THREE.Vector3(Math.cos(lat) * Math.cos(lon), Math.sin(lat), Math.cos(lat) * Math.sin(lon));
      const stalk = mesh(cyl(0.008, 0.008, 0.14, 6), M.metal(0xffffff, 0.3), 0, 0.07, 0);
      const head = mesh(new THREE.SphereGeometry(0.035, 12, 8), M.glow([COL.trade, COL.pay, COL.vault][i % 3], 2), 0, 0.15, 0);
      p.add(stalk, head);
      p.position.copy(dir.clone().multiplyScalar(0.72));
      p.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      p.userData.i = i;
      ball.add(p);
      return p;
    });
    root.add(atmo, ball, ring);
    return {
      root,
      sway: 0,
      view: { el: 0.25, dist: 4.1 },
      tick(t) {
        ball.rotation.y = t * 0.4;
        pins.forEach((p) => p.scale.setScalar(0.6 + Math.max(0, Math.sin(t * 2 + p.userData.i)) * 0.6));
      },
    };
  },

  // An @ tile: claim your name.
  async at() {
    const face = await typeface();
    const root = G();
    const tile = mesh(roundBox(1.3, 1.3, 0.24, 0.18, 6), M.paint(0x3b2f6b, 0.32));
    const at = mesh(textGeo(face, '@', 0.82, 0.12), M.metal(0xd9ccff, 0.22), 0, 0.02, 0.16);
    root.add(tile, at, shadow(0.9, 0.4, -0.85));
    return {
      root,
      view: { el: 0.15, dist: 4.2, az: -0.2 },
      tick(t) {
        root.position.y = Math.sin(t * 1.2) * 0.04;
      },
    };
  },
};

function arc3(cx, r, a0, a1) {
  const pts = [];
  for (let i = 0; i <= 16; i++) {
    const a = a0 + ((a1 - a0) * i) / 16;
    pts.push(new THREE.Vector3(cx + Math.cos(a) * r, Math.sin(a) * r, 0));
  }
  return new THREE.CatmullRomCurve3(pts);
}

// A trophy cup (lathe) with handles, for the podium.
export function trophy() {
  const g = G();
  const prof = [
    [0.001, -1],
    [0.55, -1],
    [0.55, -0.88],
    [0.32, -0.82],
    [0.12, -0.7],
    [0.09, -0.3],
    [0.16, -0.2],
    [0.42, -0.05],
    [0.6, 0.3],
    [0.66, 0.75],
    [0.62, 0.78],
    [0.55, 0.4],
    [0.001, 0.0],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  g.add(mesh(new THREE.LatheGeometry(prof, 64), M.gold()));
  for (const s of [1, -1]) {
    const h = mesh(new THREE.TorusGeometry(0.24, 0.045, 12, 32, Math.PI * 1.2), M.gold(), s * 0.66, 0.35, 0);
    h.rotation.z = s > 0 ? -Math.PI * 0.6 : Math.PI * 0.4;
    g.add(h);
  }
  const star = mesh(new THREE.OctahedronGeometry(0.12, 0), M.glow(0xffffff, 1.2), 0, 0.95, 0);
  g.add(star);
  return g;
}

export const builders = B;
