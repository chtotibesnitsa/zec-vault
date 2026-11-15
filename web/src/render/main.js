// Dev-only render bench (open /render.html with the dev server running).
// Path-traces each 3D object with soft studio light and saves a transparent
// WebP to public/renders/ through the dev server. The site shows those
// images, so visitors get render quality without running any 3D.
//   /render.html            render every job
//   /render.html?only=a,b   render some
//   /render.html?only=a&preview=1   show, don't save
import * as THREE from 'three';
import { WebGLPathTracer } from 'three-gpu-pathtracer';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { fontsReady, setupRenderer } from '../3d/kit.js';
import { jobs } from './jobs.js';

const q = new URLSearchParams(location.search);
const only = q.get('only')?.split(',');
const preview = q.has('preview');
const log = (m) => (document.getElementById('log').textContent += m + '\n');

const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setClearColor(0x000000, 0);
setupRenderer(renderer);
renderer.toneMappingExposure = 1.0;
document.getElementById('stage').appendChild(renderer.domElement);

// Studio environment: the room's soft boxes, as a cube map.
const cubeRT = new THREE.WebGLCubeRenderTarget(512, { type: THREE.HalfFloatType });
const roomScene = new RoomEnvironment();
new THREE.CubeCamera(0.1, 100, cubeRT).update(renderer, roomScene);

const pt = new WebGLPathTracer(renderer);
pt.tiles.set(2, 2);
pt.minSamples = 1;
pt.renderDelay = 0;
pt.fadeDuration = 0;
pt.dynamicLowRes = false;
pt.rasterizeScene = false;
pt.filterGlossyFactor = 0.4;
pt.bounces = 8;

// The path tracer ignores instancing; expand to plain meshes.
function expandInstances(root) {
  const list = [];
  root.traverse((o) => o.isInstancedMesh && list.push(o));
  for (const im of list) {
    const g = new THREE.Group();
    const m4 = new THREE.Matrix4();
    for (let i = 0; i < im.count; i++) {
      im.getMatrixAt(i, m4);
      const m = new THREE.Mesh(im.geometry, im.material);
      m4.decompose(m.position, m.quaternion, m.scale);
      if (m.scale.lengthSq() < 1e-6) continue;
      if (im.instanceColor) {
        m.material = im.material.clone();
        im.getColorAt(i, m.material.color);
      }
      g.add(m);
    }
    g.position.copy(im.position);
    g.quaternion.copy(im.quaternion);
    g.scale.copy(im.scale);
    im.parent.add(g);
    im.parent.remove(im);
  }
}

// The path tracer mixes up materials that are shared between meshes or
// assigned per group, so give each mesh one material of its own.
function uniqueMaterials(root) {
  const split = [];
  root.traverse((o) => o.isMesh && Array.isArray(o.material) && split.push(o));
  for (const o of split) {
    const g = new THREE.Group();
    g.position.copy(o.position);
    g.quaternion.copy(o.quaternion);
    g.scale.copy(o.scale);
    for (const grp of o.geometry.groups) {
      const src = o.geometry;
      let geo;
      if (src.index) {
        geo = src.clone();
        geo.clearGroups();
        geo.setIndex(Array.from(src.index.array.slice(grp.start, grp.start + grp.count)));
      } else {
        geo = new THREE.BufferGeometry();
        for (const [k, attr] of Object.entries(src.attributes)) {
          const n = attr.itemSize;
          geo.setAttribute(k, new THREE.BufferAttribute(attr.array.slice(grp.start * n, (grp.start + grp.count) * n), n));
        }
      }
      g.add(new THREE.Mesh(geo, o.material[grp.materialIndex]));
    }
    o.parent.add(g);
    o.parent.remove(o);
  }
  root.traverse((o) => {
    if (o.isMesh) o.material = o.material.clone();
  });
}

// Additive "glow" materials become real light sources (emissive glass).
function realLight(root) {
  root.traverse((o) => {
    if (!o.isMesh) return;
    const mats = [].concat(o.material);
    const out = mats.map((m) => {
      if (m.blending === THREE.AdditiveBlending || (m.isMeshBasicMaterial && m.transparent)) {
        return new THREE.MeshPhysicalMaterial({ color: 0x000000, emissive: m.color, emissiveIntensity: 2.2 * (m.opacity ?? 1), transparent: true, opacity: 0.55 * (m.opacity ?? 1), roughness: 1, depthWrite: false });
      }
      return m;
    });
    o.material = Array.isArray(o.material) ? out : out[0];
  });
}

// Yield to the event loop without timers (background tabs throttle those).
const chan = new MessageChannel();
const waiting = [];
chan.port1.onmessage = () => waiting.shift()?.();
const tick = () => new Promise((r) => (waiting.push(r), chan.port2.postMessage(0)));

// Path-trace one frame of a job into the renderer's canvas.
async function traceFrame(job, frame) {
  const [w, h] = job.size;
  renderer.setSize(w, h, false);
  renderer.domElement.style.width = Math.min(w, 720) + 'px';
  const scene = new THREE.Scene();
  scene.background = null;
  scene.environment = cubeRT.texture;
  scene.environmentIntensity = job.env ?? 1;
  const { root, camera, meta } = await job.build(w / h, frame);
  const fakes = [];
  // fake shadows, glow sprites and lines have no place in a path-traced
  // image (sprites also shift the tracer's material indices)
  root.traverse((o) => (o.userData.fakeShadow || o.isSprite || o.isLine || o.isPoints) && fakes.push(o));
  fakes.forEach((o) => o.parent.remove(o));
  expandInstances(root);
  uniqueMaterials(root);
  realLight(root);
  scene.add(root);
  if (job.lights) job.lights(scene);
  else {
    // a soft key and rim, as in a product shoot
    const key = new THREE.RectAreaLight(0xfff3e4, job.key ?? 6, 4, 4);
    key.position.set(-3, 5, 4);
    key.lookAt(0, 0, 0);
    const rim = new THREE.RectAreaLight(0xdfe8ff, job.rim ?? 3, 3, 3);
    rim.position.set(4, 2.5, -4);
    rim.lookAt(0, 0, 0);
    scene.add(key, rim);
  }
  scene.updateMatrixWorld(true);
  // heavy frames are traced in smaller tiles so no single GPU call runs
  // long enough to trip the driver watchdog (which kills the context)
  const [tx, ty] = job.tiles || [2, 2];
  pt.tiles.set(tx, ty);
  pt.bounces = job.bounces ?? 8;
  pt.setScene(scene, camera);
  const target = job.samples ?? 300;
  while (pt.samples < target) {
    pt.renderSample();
    if ((pt.samples | 0) % 16 === 0) await tick();
  }
  return meta;
}

const save = (name, body) => fetch(`/__render/save?name=${name}`, { method: 'POST', body });

async function renderJob(job) {
  const t0 = performance.now();
  const ext = q.has('png') ? 'png' : 'webp';
  if (job.frames) {
    // an animation: every frame side by side in one strip image
    const [w, h] = job.size;
    const strip = document.createElement('canvas');
    strip.width = w * job.frames;
    strip.height = h;
    const g = strip.getContext('2d');
    for (let i = 0; i < job.frames; i++) {
      await traceFrame(job, i);
      g.drawImage(renderer.domElement, i * w, 0);
    }
    log(`${job.name}: ${job.frames} frames in ${((performance.now() - t0) / 1000).toFixed(1)}s`);
    if (preview) return;
    const blob = await new Promise((r) => strip.toBlob(r, 'image/' + ext, job.quality ?? 0.82));
    const res = await save(`${job.name}.${ext}`, blob);
    log(`  saved ${job.name}.${ext} (${Math.round(blob.size / 1024)} KB) ${res.ok ? '' : 'FAILED'}`);
    return;
  }
  const meta = await traceFrame(job, 0);
  log(`${job.name}: ${job.samples ?? 300} samples in ${((performance.now() - t0) / 1000).toFixed(1)}s`);
  if (preview) return;
  const blob = await new Promise((r) => renderer.domElement.toBlob(r, 'image/' + ext, job.quality ?? 0.9));
  const res = await save(`${job.name}.${ext}`, blob);
  log(`  saved ${job.name}.${ext} (${Math.round(blob.size / 1024)} KB) ${res.ok ? '' : 'FAILED'}`);
  if (meta) await save(`${job.name}.json`, JSON.stringify(meta));
}

(async () => {
  await fontsReady();
  const list = jobs.filter((j) => !only || only.includes(j.name));
  for (const j of list) {
    try {
      await renderJob(j);
    } catch (e) {
      log(`${j.name}: ERROR ${e.message}`);
      console.error(e);
    }
  }
  log('done');
  document.body.dataset.done = '1';
})();
