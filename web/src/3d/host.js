// One WebGL renderer for every small 3D object on the page.
// Each object owns a plain 2D <canvas>; the host renders the object's scene
// into a corner of its shared WebGL canvas and copies the pixels across.
// Only objects on screen are drawn, at 30 fps, and nothing runs while the
// tab is hidden. One GPU context instead of dozens of animated CSS layers.
import { THREE, envFor, setupRenderer, fontsReady } from './kit.js';

const FPS = 30;
let host = null;

function getHost() {
  if (host) return host;
  const canvas = document.createElement('canvas');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, premultipliedAlpha: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(1);
  renderer.setClearColor(0x000000, 0);
  renderer.setScissorTest(true);
  setupRenderer(renderer);
  host = { renderer, env: envFor(renderer), items: new Set(), W: 0, H: 0, raf: 0, last: 0 };
  return host;
}

function ensureSize(pw, ph) {
  const h = host;
  if (pw <= h.W && ph <= h.H) return;
  h.W = Math.max(h.W, pw, 256);
  h.H = Math.max(h.H, ph, 256);
  h.renderer.setSize(h.W, h.H, false);
}

function draw(it, t, dt) {
  const { renderer } = host;
  const pw = it.cv.width;
  const ph = it.cv.height;
  if (!pw || !ph) return;
  ensureSize(pw, ph);
  it.tick(t, dt);
  renderer.setViewport(0, 0, pw, ph);
  renderer.setScissor(0, 0, pw, ph);
  renderer.clear();
  renderer.render(it.scene, it.camera);
  it.ctx.clearRect(0, 0, pw, ph);
  it.ctx.drawImage(renderer.domElement, 0, host.H - ph, pw, ph, 0, 0, pw, ph);
}

function loop(now) {
  host.raf = requestAnimationFrame(loop);
  if (document.hidden) return;
  if (now - host.last < 1000 / FPS - 2) return;
  const dt = Math.min(0.1, (now - (host.last || now)) / 1000);
  host.last = now;
  const t = now / 1000;
  for (const it of host.items) if (it.visible) draw(it, t - it.t0, dt);
}

const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// build(THREE) -> { root, tick(t, dt), view: { dist, el, az, fov, y } }
export async function attach(cv, build) {
  await fontsReady();
  if (!cv.isConnected) return () => {};
  const h = getHost();
  const scene = new THREE.Scene();
  scene.environment = h.env;
  const key = new THREE.DirectionalLight(0xfff0dc, 1.6);
  key.position.set(2.5, 4, 3.5);
  const rim = new THREE.DirectionalLight(0x9fb8ff, 0.7);
  rim.position.set(-3, 1.5, -2.5);
  scene.add(key, rim, new THREE.AmbientLight(0xffffff, 0.12));
  const obj = await build();
  if (!cv.isConnected) return () => {};
  scene.add(obj.root);
  const v = { dist: 4.2, el: 0.32, az: -0.42, fov: 30, y: 0, ...obj.view };
  const camera = new THREE.PerspectiveCamera(v.fov, 1, 0.05, 50);
  camera.position.set(Math.sin(v.az) * Math.cos(v.el) * v.dist, Math.sin(v.el) * v.dist + v.y, Math.cos(v.az) * Math.cos(v.el) * v.dist);
  camera.lookAt(0, v.y, 0);

  const sway = obj.sway ?? 0.32;
  const baseY = obj.root.rotation.y;
  const it = {
    cv,
    ctx: cv.getContext('2d'),
    scene,
    camera,
    visible: false,
    t0: performance.now() / 1000 - Math.random() * 3,
    tick(t, dt) {
      if (sway) obj.root.rotation.y = baseY + Math.sin(t * 0.45) * sway;
      obj.tick?.(t, dt);
    },
  };
  const size = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = cv.clientWidth;
    const hh = cv.clientHeight;
    cv.width = Math.round(w * dpr);
    cv.height = Math.round(hh * dpr);
    camera.aspect = w / Math.max(1, hh);
    camera.updateProjectionMatrix();
    if (!it.visible || reduced()) draw(it, 1.2, 0);
  };
  const ro = new ResizeObserver(size);
  ro.observe(cv);
  const io = new IntersectionObserver(([en]) => (it.visible = en.isIntersecting && !reduced()), { rootMargin: '60px' });
  io.observe(cv);
  h.items.add(it);
  size();
  draw(it, 1.2, 0);
  if (!h.raf && !reduced()) h.raf = requestAnimationFrame(loop);

  return () => {
    ro.disconnect();
    io.disconnect();
    h.items.delete(it);
    if (!h.items.size && h.raf) {
      cancelAnimationFrame(h.raf);
      h.raf = 0;
    }
  };
}
