// What the render bench produces. Each job builds a scene root and a camera.
import * as THREE from 'three';
import * as kit from '../3d/kit.js';
import * as minis from '../3d/minis.js';
import { builders } from '../3d/minis.js';
import { reactor, exchange, split, podium } from '../Scene3D.jsx';

function cameraFor(view, aspect) {
  const v = { dist: 4.2, el: 0.32, az: -0.42, fov: 30, y: 0, ...view };
  const cam = new THREE.PerspectiveCamera(v.fov, aspect, 0.05, 60);
  cam.position.set(Math.sin(v.az) * Math.cos(v.el) * v.dist, Math.sin(v.el) * v.dist + v.y, Math.cos(v.az) * Math.cos(v.el) * v.dist);
  cam.lookAt(0, v.y, 0);
  cam.updateMatrixWorld();
  return cam;
}

// A small object posed at time t (its animation frozen at a good moment).
const mini = (name, kind, { t = 1.2, args, size = [560, 480], samples = 700, view, tweak } = {}) => ({
  name,
  size,
  samples,
  async build(aspect) {
    const o = await builders[kind](args || {});
    o.tick?.(t, 0);
    if (o.sway !== 0) o.root.rotation.y += Math.sin(t * 0.45) * (o.sway ?? 0.32);
    tweak?.(o.root);
    return { root: o.root, camera: cameraFor({ ...o.view, ...view }, aspect) };
  },
});

export const jobs = [
  mini('hero-coin', 'zcoin', {
    t: 0.42,
    size: [1040, 1040],
    samples: 900,
    view: { dist: 4.3, el: 0.18, az: -0.25 },
    tweak(root) {
      root.rotation.z = -0.18;
    },
  }),
  mini('coin-zats', 'coinzats', { size: [192, 192], samples: 500 }),
  mini('coin-sol', 'coinsol', { size: [192, 192], samples: 500 }),
  mini('person', 'person', { t: 0.6 }),
  mini('brazier', 'brazier', { t: 0 }),
  mini('swap', 'swap', { t: 1.6 }),
  mini('split', 'split', { t: 1.6 }),
  mini('coindrop', 'coindrop', {
    t: 0.7,
    tweak(root) {
      const coins = root.children.filter((o) => o.userData.o !== undefined);
      coins.forEach((c, i) => (c.visible = i === 0));
      if (coins[0]) {
        coins[0].position.set(0, 0.62, 0);
        coins[0].rotation.set(0, -0.35, 0.12);
      }
    },
  }),
  mini('zcoin', 'zcoin', { t: 0.55 }),
  mini('safe', 'safe', { t: 1 }),
  mini('namecard', 'namecard', { t: 0.4 }),
  mini('friends', 'friends', { t: 0.8 }),
  mini('coinstack', 'coinstack', { t: 2.4 }),
  mini('burn', 'burn', { t: 1.2 }),
  mini('holders', 'holders', { t: 3 }),
  mini('bars', 'bars', { t: 0.6 }),
  mini('prism', 'prism', { t: 0.4 }),
  mini('furnace', 'furnace', { t: 1.2 }),
  mini('wallet', 'wallet', { t: 0.9 }),
  mini('timer', 'timer', { t: 1.4 }),
  mini('shield', 'shield', { t: 0.5 }),
  mini('token', 'token', { t: 0.5, size: [640, 580] }),
  mini('podium', 'podium', { t: 0.6 }),
  mini('tower', 'tower', { t: 0.4 }),
  mini('chain', 'chain', { t: 0.9 }),
  mini('xbadge', 'xbadge', { t: 0.5 }),
  mini('fountain', 'fountain', { t: 0.9 }),
  mini('candles', 'candles', { t: 0.4 }),
  mini('globe', 'globe', { t: 1.1 }),
  mini('at', 'at', { t: 0.4 }),
];

// A whole page scene from Scene3D.jsx, frozen at time t. Anchors (named 3D
// points) are projected to percentages of the image and saved as JSON so
// the page can pin labels and animate coins over the still render.
const ui = { space: null, tag() {}, pop() {} };
const page = (name, builder, { size, t = 1.2, samples = 600, opts = {}, after } = {}) => ({
  name,
  size,
  samples,
  async build(aspect) {
    const holder = new THREE.Group();
    const camera = new THREE.PerspectiveCamera(34, aspect, 0.1, 100);
    const face = await kit.typeface();
    const b = builder(kit, minis, holder, camera, { share: 80, burn: 10, face, ...opts }, ui);
    b.fit?.(aspect);
    b.tick(0, t, { x: 0, y: 0 });
    after?.(b);
    camera.updateMatrixWorld();
    let meta = null;
    if (b.anchors) {
      meta = {};
      for (const [k, v] of Object.entries(b.anchors())) {
        const p = v.clone().project(camera);
        meta[k] = [+(((p.x + 1) / 2) * 100).toFixed(2), +(((1 - p.y) / 2) * 100).toFixed(2)];
      }
    }
    return { root: holder, camera, meta };
  },
});

jobs.push(
  page('live-wide', reactor, { size: [1600, 800] }),
  page('live-tall', reactor, { size: [900, 1300] }),
  page('swap-scene', exchange, {
    size: [1800, 630],
    t: 2.2,
    // the coin stream is animated on the page, so leave it out of the still
    after(b) {
      const swarm = [];
      b.root.traverse((o) => o.isInstancedMesh && o.count > 20 && swarm.push(o));
      swarm.forEach((o) => o.parent.remove(o));
    },
  }),
  page('boards-scene', podium, { size: [1600, 800], t: 1.4 }),
  ...[0, 1, 2, 3].map((st) =>
    page('split-' + st, split, {
      size: [900, 780],
      t: 1.0,
      after(b) {
        b.step(st);
        for (let i = 0; i < 120; i++) b.tick(0.016, 1.0, { x: 0, y: 0 });
      },
    }),
  ),
);

// The home hero, lit like a product shot with color: a warm key, a lilac
// side light and a sage back light.
jobs.push({
  name: 'hero-vault',
  size: [1200, 1012],
  samples: 700,
  tiles: [6, 6],
  bounces: 5,
  async build(aspect) {
    const o = builders.herovault();
    return { root: o.root, camera: cameraFor(o.view, aspect) };
  },
  lights(scene) {
    const L = (color, power, w, h, pos) => {
      const l = new THREE.RectAreaLight(color, power, w, h);
      l.position.set(...pos);
      l.lookAt(0, 0, 0);
      scene.add(l);
    };
    L(0xffe2b8, 7, 5, 5, [-4, 6, 5]);
    L(0xb8a6ff, 6, 3, 5, [-6, 1.5, -1]);
    L(0x8fd6b8, 5, 4, 3, [5, 3, -5]);
    L(0xffffff, 1.6, 3, 3, [7, 0.5, 2]);
  },
});

// Coins turning half a revolution in 24 frames; both faces match, so the
// strip loops seamlessly as a full spin.
const spin = (name, kind) => ({
  name,
  size: [288, 288],
  samples: 260,
  frames: 24,
  quality: 0.8,
  async build(aspect, frame) {
    const o = builders[kind]();
    const coin = o.root.children[0];
    coin.rotation.set(0.12, (frame / 24) * Math.PI, -0.12);
    return { root: o.root, camera: cameraFor({ ...o.view, dist: 3.5 }, aspect) };
  },
});
jobs.push(spin('spin-zats', 'coinzats'), spin('spin-sol', 'coinsol'));
