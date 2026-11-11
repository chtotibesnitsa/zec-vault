// Zatoshi ($ZATS) cinematic ad. One persistent three.js world plus a type
// layer, both driven by a single timeline. window.__seek(t) renders any frame
// deterministically; trailer/render-ad.cjs captures them and trailer/score.py
// builds the soundtrack from the cue list and music plan exported here.
//
// URL params: ?cut=main (16:9, 104 s) | ?cut=vertical (9:16, 62 s)
//             ?capture=1 (no autoplay)  ?t=12 (start time when previewing)
import '@fontsource/chakra-petch/500.css';
import '@fontsource/chakra-petch/600.css';
import '@fontsource/chakra-petch/700.css';
import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/500.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import '@fontsource/ibm-plex-mono/600.css';
import '@fontsource/silkscreen/400.css';
import './ad.css';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import {
  TONE, clamp, lin, ease, mix, rng, makeEnv, makeCoin, miniCoinGeo, glyphAtlas, makeGlyphField, makeDust, makeFlow, makeVault, makeSplitRing,
  makeHolders, makeFurnace, makeEmbers, makeRays, makeBurst, makePillar, labelDisc, glassMat, gridMaterial, GradeShader,
} from './world.js';
import { el, txt, show, pop, typeText } from './text.js';

// Where the CTA sends people. One place to change it.
const SITE = 'orchard-vault.vercel.app';
const X_HANDLE = '@zatoshi_sol';

const params = new URLSearchParams(location.search);
const CUT = params.get('cut') || 'main';
const PORTRAIT = CUT === 'vertical' || params.get('ar') === '9x16';
const W = PORTRAIT ? 1080 : 1920;
const H = PORTRAIT ? 1920 : 1080;
const DPR = Number(params.get('dpr') || window.devicePixelRatio || 1);

// ---------- stage ----------
const root = document.getElementById('root');
const stage = el('div', 'stage' + (PORTRAIT ? ' portrait' : ''), null, root);
stage.style.width = W + 'px';
stage.style.height = H + 'px';
const fit = () => stage.style.setProperty('--fit', Math.min(innerWidth / W, innerHeight / H));
fit();
addEventListener('resize', fit);

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(DPR);
renderer.setSize(W, H, false);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.domElement.className = 'gl';
stage.appendChild(renderer.domElement);

const ov = el('div', 'ov', null, stage);
const bars = el('div', 'bars', '<i class="bt"></i><i class="bb"></i>', stage);
const flashEl = el('div', 'flash', null, stage);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x050403);
scene.fog = new THREE.FogExp2(0x050403, 0.018);
const camera = new THREE.PerspectiveCamera(35, W / H, 0.05, 200);

const composer = new EffectComposer(renderer);
composer.setPixelRatio(DPR);
composer.setSize(W, H);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(W, H), 0.55, 0.55, 0.92);
composer.addPass(bloom);
composer.addPass(new OutputPass());
const grade = new ShaderPass(GradeShader);
grade.uniforms.uRes.value.set(W * DPR, H * DPR);
composer.addPass(grade);

// ---------- shared world ----------
let world;
async function buildWorld() {
  await Promise.all(['700 64px "Chakra Petch"', '500 64px "IBM Plex Mono"', '400 20px "Silkscreen"', '400 20px "IBM Plex Sans"'].map((f) => document.fonts.load(f)));
  scene.environment = makeEnv(renderer);
  const key = new THREE.DirectionalLight(0xfff0d8, 3.2);
  key.position.set(4, 5, 6);
  const rim = new THREE.PointLight(TONE.gold, 80, 30);
  rim.position.set(-4, 1, -4);
  const fill = new THREE.PointLight(0x9ad8ff, 10, 30);
  fill.position.set(5, -3, 3);
  scene.add(key, rim, fill, new THREE.AmbientLight(0xffffff, 0.08));

  const coin = makeCoin();
  const coinPivot = new THREE.Group();
  coinPivot.add(coin);
  scene.add(coinPivot);
  const glyphs = makeGlyphField(glyphAtlas());
  glyphs.material.uniforms.uPR.value = DPR;
  scene.add(glyphs);
  const dust = makeDust();
  dust.material.uniforms.uPR.value = DPR;
  scene.add(dust);
  const rays = makeRays();
  scene.add(rays);
  const burst = makeBurst();
  burst.material.uniforms.uPR.value = DPR;
  scene.add(burst);

  // satellites in the five site colors
  const sats = new THREE.Group();
  const SAT = ['trade', 'vault', 'pay', 'burn', 'people'];
  const satMeshes = SAT.map((k) => {
    const g = new THREE.Group();
    const shell = new THREE.Mesh(new THREE.SphereGeometry(0.34, 48, 32), glassMat(TONE[k], { thickness: 0.7, att: 0.9 }));
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.15, 24, 16), new THREE.MeshBasicMaterial({ color: TONE[k].clone().multiplyScalar(1.4) }));
    g.add(shell, core);
    g.userData = { k };
    sats.add(g);
    return g;
  });
  const orbitLine = new THREE.Mesh(new THREE.TorusGeometry(2.5, 0.006, 8, 300), new THREE.MeshBasicMaterial({ color: TONE.gold2.clone().multiplyScalar(1.4), transparent: true, opacity: 0.5 }));
  sats.add(orbitLine);
  scene.add(sats);

  // fee shot: vault + trade flows
  const vault = makeVault();
  scene.add(vault);
  const feePaths = [];
  for (let i = 0; i < 6; i++) {
    const buy = i < 3;
    const y0 = buy ? 2.6 + i * 0.8 : -2.6 - (i - 3) * 0.8;
    const z0 = -3 + (i % 3) * 2.2;
    const a = new THREE.Vector3(-14, y0, z0);
    const b = new THREE.Vector3(-5, y0 * 0.6, z0 * 0.4 + 1);
    const c = new THREE.Vector3(-2.2, y0 * 0.12, 0.3);
    const curve = new THREE.CatmullRomCurve3([a, b, c, new THREE.Vector3(-1.25, y0 * 0.22, z0 * 0.3)]);
    feePaths.push((u) => curve.getPointAt(u));
  }
  const feeFlow = makeFlow({ count: 380, trail: 8, paths: feePaths, colorOf: (pi) => (pi < 3 ? TONE.trade : TONE.sell).clone().multiplyScalar(3), speed: 0.32, size: 0.075, spread: 0.25, gap: 0.012, seed: 4 });
  feeFlow.material.uniforms.uPR.value = DPR;
  scene.add(feeFlow);

  // split shot
  const split = makeSplitRing();
  scene.add(split);

  // payout shot
  const holders = makeHolders();
  scene.add(holders);
  const payPaths = holders.userData.orbs.map((o) => {
    const end = o.position.clone();
    const mid = end.clone().multiplyScalar(0.5);
    mid.y += 1.4 + o.userData.rad * 0.25;
    const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, 0.2, 0), mid, end);
    return (u) => curve.getPoint(u);
  });
  const payFlow = makeFlow({ count: 640, trail: 7, paths: payPaths, colorOf: () => TONE.pay.clone().multiplyScalar(1.8), speed: 0.55, size: 0.03, spread: 0.04, gap: 0.016, seed: 8 });
  payFlow.material.uniforms.uPR.value = DPR;
  scene.add(payFlow);

  // burn shot
  const furnace = makeFurnace();
  scene.add(furnace);
  const embers = makeEmbers();
  embers.material.uniforms.uPR.value = DPR;
  scene.add(embers);
  const NB = 70;
  const burnCoins = new THREE.InstancedMesh(miniCoinGeo(), new THREE.MeshPhysicalMaterial({ color: TONE.gold, metalness: 1, roughness: 0.22, emissive: TONE.burn.clone(), emissiveIntensity: 0 }), NB);
  burnCoins.frustumCulled = false;
  scene.add(burnCoins);
  const burnColor = new THREE.Color();
  for (let i = 0; i < NB; i++) burnCoins.setColorAt(i, burnColor.set(0xffffff));

  // swap shot
  const solDisc = labelDisc('SOL', ['#3b3f58', '#14151f'], '#e9e6ff', 0.85);
  const zatsMini = makeCoin();
  zatsMini.scale.setScalar(0.58);
  const swapGrp = new THREE.Group();
  swapGrp.add(solDisc, zatsMini);
  scene.add(swapGrp);
  const swapRing = new THREE.Mesh(new THREE.TorusGeometry(1.6, 0.012, 8, 300), new THREE.MeshBasicMaterial({ color: TONE.trade.clone().multiplyScalar(2.2) }));
  swapGrp.add(swapRing);

  // proof shot: grid floor
  const gridFloor = new THREE.Mesh(new THREE.PlaneGeometry(60, 80), gridMaterial(TONE.vault, 1.2, false));
  gridFloor.rotation.x = -Math.PI / 2;
  gridFloor.position.y = -1.6;
  scene.add(gridFloor);
  const gridCeil = gridFloor.clone();
  gridCeil.material = gridMaterial(TONE.vault, 0.5, false);
  gridCeil.position.y = 4.5;
  scene.add(gridCeil);

  // community: pillars
  const pillars = new THREE.Group();
  const P = [
    [2.6, -1.9],
    [3.6, 0],
    [2.0, 1.9],
  ].map(([h, x]) => {
    const p = makePillar(h, 'people');
    p.position.x = x;
    pillars.add(p);
    return p;
  });
  const pFloor = new THREE.Mesh(new THREE.CircleGeometry(9, 96), gridMaterial(TONE.people, 0.7));
  pFloor.rotation.x = -Math.PI / 2;
  pillars.add(pFloor);
  scene.add(pillars);

  // cycle: loop ring + flow around it
  const LOOP_R = 3.4;
  const loopFlowPath = [(u) => new THREE.Vector3(Math.cos(u * Math.PI * 2) * LOOP_R, Math.sin(u * Math.PI * 2) * LOOP_R * 0.32, Math.sin(u * Math.PI * 2) * LOOP_R)];
  const loopFlow = makeFlow({
    count: 700,
    trail: 6,
    paths: loopFlowPath,
    colorOf: () => new THREE.Color(1, 1, 1),
    speed: 0.12,
    size: 0.07,
    spread: 0.12,
    gap: 0.006,
    seed: 12,
  });
  loopFlow.material.uniforms.uPR.value = DPR;
  scene.add(loopFlow);

  world = { key, rim, fill, coin, coinPivot, glyphs, dust, rays, burst, sats, satMeshes, orbitLine, vault, feeFlow, split, holders, payFlow, furnace, embers, burnCoins, swapGrp, solDisc, zatsMini, swapRing, gridFloor, gridCeil, pillars, pillarList: P, loopFlow, LOOP_R };
  world.all = [coinPivot, glyphs, dust, rays, burst, sats, vault, feeFlow, split, holders, payFlow, furnace, embers, burnCoins, swapGrp, gridFloor, gridCeil, pillars, loopFlow];
}

// ---------- camera helpers ----------
const tmpV = new THREE.Vector3();
function setCam(pos, target, { fov = 35, roll = 0, shift = [0, 0], shake = 0, t = 0 } = {}) {
  camera.fov = PORTRAIT ? fov * 1.55 : fov;
  camera.aspect = W / H;
  camera.position.copy(PORTRAIT ? target.clone().lerp(pos, 1.32) : pos);
  if (shake) {
    camera.position.x += (Math.sin(t * 1.7) + Math.sin(t * 2.9 + 1) * 0.5) * shake;
    camera.position.y += (Math.sin(t * 1.3 + 2) + Math.sin(t * 3.7) * 0.4) * shake;
  }
  camera.up.set(Math.sin(roll), Math.cos(roll), 0);
  camera.lookAt(target);
  camera.updateProjectionMatrix();
  // lens shift: moves the subject on screen without changing perspective
  const sx = PORTRAIT ? shift[2] ?? 0 : shift[0];
  const sy = PORTRAIT ? shift[3] ?? 0.22 : shift[1];
  camera.projectionMatrix.elements[8] = -sx;
  camera.projectionMatrix.elements[9] = -sy;
  camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
}
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const lerpV = (a, b, k) => a.clone().lerp(b, k);

// Projects a world point to stage pixels.
function toScreen(v) {
  tmpV.copy(v).project(camera);
  return [(tmpV.x + 1) * 0.5 * W, (1 - tmpV.y) * 0.5 * H, tmpV.z];
}

// ---------- shot builders ----------
// Each shot: { id, dur, music, cues: [[t, kind]], build() -> update(lt, T) }
const BEAT = 0.5;
function layer(id) {
  const n = el('div', 'layer L-' + id, null, ov);
  n.style.display = 'none';
  return n;
}
function featureBlock(L, tone, num, kicker, title, sub, chips = []) {
  const box = el('div', `feat tone-${tone}`, null, L);
  const k = el('div', 'kick', `<span class="dot"></span><span class="num">${num}</span><span class="kt">${kicker}</span>`, box);
  const h = txt(box, 'h-title', title);
  const s = txt(box, 'h-sub', sub);
  const c = el('div', 'chips', chips.map((x) => `<span class="chip ${x[1] ? 'tone-' + x[1] : ''}">${x[0]}</span>`).join(''), box);
  return { box, k, h, s, c, chips: [...c.children] };
}
function animFeature(f, lt, t0, t1, o = {}) {
  pop(f.k, lt, t0, t1, { y: 0, x: -30, dur: 0.5 });
  show(f.h, lt, t0 + 0.15, t1, { mode: o.titleMode || 'rise', stagger: 0.018, dur: 0.75 });
  show(f.s, lt, t0 + 0.9, t1, { mode: 'fade', stagger: 0.006, dur: 0.5 });
  f.chips.forEach((c, i) => pop(c, lt, t0 + 1.6 + i * BEAT * 0.5, t1, { y: 16, dur: 0.45 }));
}

const SHOTS = {};

SHOTS.cipher = {
  dur: 8,
  music: 'intro',
  cues: [[0, 'drone'], [0.6, 'type'], [4, 'glitch'], [4.5, 'glitch'], [5, 'glitch'], [5.5, 'glitch'], [6.0, 'tape'], [6.2, 'type'], [8, 'riser:4']],
  build() {
    const L = layer('cipher');
    const a = txt(L, 'center-line big-q', 'Most coins make you <em>work</em> for it.');
    const words = ['Stake.', 'Lock.', 'Claim.', 'Repeat.'];
    const row = el('div', 'nope-row', null, L);
    const ws = words.map((w) => txt(row, 'nope', w));
    const strike = el('i', 'strike', null, row);
    const b = txt(L, 'center-line big-q', 'What if you just <em>held</em>?');
    return (lt, T) => {
      const g = world.glyphs.material.uniforms;
      world.glyphs.visible = true;
      world.dust.visible = true;
      g.uConverge.value = 0;
      g.uExplode.value = 0;
      g.uDrift.value = lt * 2.4;
      g.uOpacity.value = ease.out(lin(lt, 0, 1.6)) * (lt > 4 && lt < 6 ? 1.25 : 1);
      g.uColor.value.copy(TONE.gold).multiplyScalar(lt > 4 && lt < 6 ? 2.2 : 1.5);
      setCam(V(0, 0, 8 - lt * 0.6), V(Math.sin(lt * 0.2) * 0.4, 0, -20), { fov: 50, roll: Math.sin(lt * 0.35) * 0.05, shift: [0, 0, 0, 0] });
      show(a, lt, 0.5, 3.6, { mode: 'decrypt', stagger: 0.035, dur: 0.6 });
      ws.forEach((w, i) => show(w, lt, 4 + i * BEAT, 5.95, { mode: 'slam', dur: 0.3, out: 0.15, outMode: 'zoom' }));
      const sp = ease.out5(lin(lt, 5.75, 6.0));
      strike.style.transform = `scaleX(${sp})`;
      strike.style.opacity = lt < 6.1 ? '1' : '0';
      show(b, lt, 6.2, 7.85, { mode: 'decrypt', stagger: 0.04, dur: 0.5, out: 0.12, outMode: 'zoom' });
    };
  },
};

SHOTS.reveal = {
  dur: 8,
  music: 'reveal',
  cues: [[0, 'impact'], [0, 'glitch'], [1.6, 'shimmer'], [3, 'shimmer'], [4, 'drop'], [4, 'impact'], [6, 'chime']],
  build() {
    const L = layer('reveal');
    const meet = txt(L, 'kicker-center', 'Introducing');
    const wm = txt(L, 'wordmark', 'ZATOSHI');
    const tick = el('div', 'ticker-chip', '<b>$ZATS</b><span>Zcash meta · on Solana</span>', L);
    const line = txt(L, 'tagline', 'The coin that pays its <em>holders</em>.');
    return (lt) => {
      const { coinPivot, coin, glyphs, rays, burst, dust } = world;
      coinPivot.visible = glyphs.visible = dust.visible = true;
      const g = glyphs.material.uniforms;
      g.uDrift.value = 8 * 2.4 + lt * 0.3;
      g.uConverge.value = ease.inOut(lin(lt, 0, 2.6));
      g.uExplode.value = ease.out(lin(lt, 3.98, 6)) * 0.6;
      g.uOpacity.value = (0.75 - ease.out(lin(lt, 1.2, 3.0)) * 0.65) * (lt > 4 ? 0.6 : 1);
      // the coin forms out of the glyphs
      const form = ease.out(lin(lt, 1.4, 3.2));
      coin.userData.gold.emissiveIntensity = (1 - form) * 0.6;
      coin.scale.setScalar(0.02 + 0.98 * ease.out5(lin(lt, 0.9, 2.6)));
      coin.rotation.set(0, 0, 0);
      coinPivot.position.set(0, 0, 0);
      // macro on the reeded edge, then pull out to face-on hero
      if (lt < 4) {
        const k = ease.inOut(lin(lt, 0.4, 4));
        coinPivot.rotation.set(0.1, mix(-1.3, -0.25, k) + lt * 0.05, 0.05);
        const p = lerpV(V(2.6, 0.35, 1.7), V(0.6, 0.1, 7.2), ease.inOut(lin(lt, 1.6, 4)));
        setCam(p, lerpV(V(1.2, 0, 0), V(0, 0, 0), ease.inOut(lin(lt, 1.6, 4))), { fov: mix(28, 34, k), t: lt, shake: 0.01, shift: [0, 0, 0, 0] });
        world.key.position.set(Math.cos(lt * 1.2) * 6, 4, Math.sin(lt * 1.2) * 6 + 2);
      } else {
        const k = lt - 4;
        coinPivot.rotation.set(0.08 + Math.sin(k * 0.6) * 0.05, -0.25 + (1 - ease.expo(lin(k, 0, 1.2))) * Math.PI * 2 + k * 0.1, 0);
        setCam(V(0, 0.15, 11.5 - k * 0.35), V(0, 0.15, 0), { fov: 34, t: lt, shake: 0.012 * Math.exp(-k * 3) + 0.004, shift: [0, 0.34, 0, 0.3] });
        world.key.position.set(4, 5, 6);
      }
      rays.visible = lt > 3.9;
      rays.position.set(0, 0, -1.2);
      rays.lookAt(camera.position);
      rays.material.opacity = ease.out(lin(lt, 4, 4.4)) * (0.55 - 0.2 * lin(lt, 4.4, 8));
      rays.rotation.z = lt * 0.05;
      burst.visible = lt >= 4;
      burst.material.uniforms.uAge.value = lt - 4;
      dust.material.uniforms.uFocus.value = 7;
      show(meet, lt, 2.2, 3.85, { mode: 'decrypt', dur: 0.4, stagger: 0.04, out: 0.1 });
      show(wm, lt, 4.0, 8, { mode: 'slam', dur: 0.55, out: 0.2 });
      wm.style.letterSpacing = `${(0.22 - 0.08 * ease.out(lin(lt, 4, 8))) * (PORTRAIT ? 0.5 : 1)}em`;
      pop(tick, lt, 4.5, 8, { y: 20 });
      show(line, lt, 6.0, 8, { mode: 'rise', stagger: 0.02, out: 0.15 });
      bars.style.setProperty('--b', String(1 - ease.out5(lin(lt, 4, 4.8))));
    };
  },
};

SHOTS.intro = {
  dur: 8,
  music: 'groove',
  cues: [[0, 'whoosh'], [0.3, 'impact_soft'], [4, 'chime']],
  build() {
    const L = layer('intro');
    const box = el('div', 'feat tone-pay intro-feat', null, L);
    const k = el('div', 'kick', '<span class="dot"></span><span class="kt">Hold to earn · on Solana</span>', box);
    const h1 = txt(box, 'h-mega', 'Hold <em>$ZATS</em>.');
    const h2 = txt(box, 'h-mega2', 'Get paid every <b>5 minutes</b>.');
    const s = txt(box, 'h-sub', 'Every trade pays a fee. The biggest share goes straight back to holders, automatically, on a timer.');
    const c = el('div', 'chips', ['Fair launch on Pump.fun', 'No presale', '1,000,000,000 supply'].map((x) => `<span class="chip">${x}</span>`).join(''), box);
    const satLabels = ['trades', 'fees', 'payouts', 'burns', 'holders'].map((x, i) => el('span', `sat-label tone-${['trade', 'vault', 'pay', 'burn', 'people'][i]}`, x, L));
    return (lt) => {
      const { coinPivot, coin, sats, satMeshes, dust } = world;
      coinPivot.visible = sats.visible = dust.visible = true;
      coin.scale.setScalar(1);
      coin.userData.gold.emissiveIntensity = 0;
      coinPivot.position.set(0, 0, 0);
      coinPivot.rotation.set(0.15, lt * 0.35 - 0.6, 0.05);
      sats.rotation.set(1.15, 0, 0.25);
      satMeshes.forEach((m, i) => {
        const a = (i / 5) * Math.PI * 2 + lt * 0.28;
        const r = 2.5 * ease.out5(lin(lt, 0.2 + i * 0.12, 1.6 + i * 0.12));
        m.position.set(Math.cos(a) * r, Math.sin(a) * r, 0);
        m.scale.setScalar(ease.back(lin(lt, 0.3 + i * 0.12, 1.1 + i * 0.12)));
      });
      world.orbitLine.scale.setScalar(ease.out5(lin(lt, 0.1, 1.4)));
      const ang = -0.5 + lt * 0.06;
      setCam(V(Math.sin(ang) * 11.5, 1.4 - lt * 0.05, Math.cos(ang) * 11.5), V(0, 0, 0), { fov: 34, t: lt, shake: 0.006, shift: [0.5, 0, 0, 0.3] });
      bars.style.setProperty('--b', '0');
      pop(k, lt, 0.3, 7.6, { y: 0, x: -30 });
      show(h1, lt, 0.45, 7.6, { stagger: 0.03 });
      show(h2, lt, 1.0, 7.6, { stagger: 0.02 });
      show(s, lt, 2.2, 7.6, { mode: 'fade', stagger: 0.006 });
      [...c.children].forEach((x, i) => pop(x, lt, 4 + i * 0.5, 7.6, { y: 14 }));
      satMeshes.forEach((m, i) => {
        m.getWorldPosition(tmpV);
        const [x, y] = toScreen(tmpV);
        const lab = satLabels[i];
        lab.style.left = x + 'px';
        lab.style.top = y + 'px';
        lab.style.opacity = String(ease.out(lin(lt, 1.2 + i * 0.12, 1.8 + i * 0.12)) * (1 - lin(lt, 7.4, 7.8)));
      });
    };
  },
};

SHOTS.nots = {
  dur: 4,
  music: 'stops',
  cues: [[0, 'stab'], [1, 'stab'], [2, 'stab'], [3, 'stab_hi'], [4, 'riser:1']],
  build() {
    const L = layer('nots');
    const words = ['No staking.', 'No claiming.', 'No sign-up.', 'Just <em>hold</em>.'].map((w) => txt(L, 'nots-word', w));
    return (lt) => {
      const { coinPivot, coin, dust } = world;
      coinPivot.visible = dust.visible = true;
      const beat = Math.min(3, Math.floor(lt));
      const k = lt - beat;
      coinPivot.rotation.set(0.2, 0.6 + beat * 0.9 + ease.out5(clamp(k * 3)) * 0.5, 0);
      coin.userData.gold.emissiveIntensity = 0;
      const z = [9, 7.5, 6.2, 5][beat] - ease.out5(clamp(k * 2)) * 0.6;
      setCam(V([1.4, -1.2, 1, 0][beat], [0.4, -0.3, 0.6, 0.1][beat], z), V(0, 0, 0), { fov: 34, roll: [0.08, -0.06, 0.05, 0][beat], shift: [0, 0, 0, 0] });
      words.forEach((w, i) => show(w, lt, i, i < 3 ? i + 0.94 : 4, { mode: 'slam', dur: 0.32, out: 0.06, outMode: 'zoom' }));
      world.key.intensity = 1.5;
    };
  },
};

SHOTS.fee = {
  dur: 8,
  music: 'groove',
  cues: [[0, 'whoosh'], [0, 'impact_soft'], [1, 'blips'], [3, 'blips'], [5, 'blips']],
  build() {
    const L = layer('fee');
    const f = featureBlock(L, 'vault', '01', 'The fee', 'Every trade pays the vault.', 'Each buy and sell of $ZATS, on Pump.fun, Jupiter or any app, pays a small creator fee. The vault wallet is the creator.', [
      ['Buy', 'trade'],
      ['Sell', 'sell'],
      ['→ Vault wallet', 'vault'],
    ]);
    const ticks = el('div', 'fee-ticker', null, L);
    const tkRows = Array.from({ length: 6 }, (_, i) => el('div', `ft ${i % 3 === 2 ? 'sell' : 'buy'}`, `<b>${i % 3 === 2 ? 'SELL' : 'BUY'}</b><span>fee</span><i>→ vault</i>`, ticks));
    return (lt) => {
      const { vault, feeFlow, dust, coinPivot, coin } = world;
      vault.visible = feeFlow.visible = dust.visible = coinPivot.visible = true;
      vault.userData.core.visible = false;
      coinPivot.position.set(0, 0, 0);
      coin.scale.setScalar(0.42 * ease.back(lin(lt, 0.2, 1)));
      coinPivot.rotation.set(0.1, lt * 0.9, 0);
      coin.userData.gold.emissiveIntensity = Math.exp(-((lt % BEAT) / 0.12)) * 0.25;
      const amt = ease.out(lin(lt, 0, 1.2));
      feeFlow.userData.update(28 + lt, { amount: amt, live: (u) => Math.min(1, u * 6) * clamp((0.97 - u) * 8) });
      vault.rotation.set(0.35 + Math.sin(lt * 0.4) * 0.05, lt * 0.35, 0.1);
      const pulse = Math.exp(-((lt % BEAT) / 0.12));
      vault.userData.core.material.emissiveIntensity = 1 + pulse * 1.2;
      vault.userData.core.rotation.set(lt * 0.8, lt * 1.1, 0);
      vault.userData.core.scale.setScalar(1 + pulse * 0.15 + lt * 0.04);
      vault.userData.light.intensity = 8 + pulse * 10;
      vault.scale.setScalar(ease.back(lin(lt, 0, 0.8)));
      const ang = 0.35 - lt * 0.05;
      setCam(V(Math.sin(ang) * 8.5, 0.9, Math.cos(ang) * 8.5 - lt * 0.15), V(-0.6, 0, 0), { fov: 36, t: lt, shake: 0.006, shift: [0.42, 0, 0, 0.32] });
      animFeature(f, lt, 0.2, 7.6);
      tkRows.forEach((r, i) => pop(r, lt, 2.2 + i * BEAT, 7.6, { x: 30, y: 0, dur: 0.35 }));
    };
  },
};

SHOTS.split = {
  dur: 8,
  music: 'groove',
  cues: [[0, 'whoosh'], [0, 'impact_soft'], [2, 'split'], [2.5, 'tick'], [3, 'tick'], [3.5, 'tick']],
  build() {
    const L = layer('split');
    const f = featureBlock(L, 'pay', '02', 'The split', 'The vault splits every fee.', 'Its code does the split, and every step is a public transaction you can check.');
    const legend = el('div', 'split-legend', null, f.box);
    const labels = [
      ['80%', 'to holders, every 5 minutes', 'pay'],
      ['10%', 'buys $ZATS and burns it', 'burn'],
      ['10%', 'runs the project', 'vault'],
    ].map(([n, l, t]) => el('div', `split-row glass tone-${t}`, `<b class="sn">${n}</b><span>${l}</span>`, legend));
    const center = el('div', 'split-center', '<span>creator fee</span><b>100%</b>', L);
    return (lt) => {
      const { split, coinPivot, coin, dust } = world;
      split.visible = dust.visible = coinPivot.visible = true;
      coinPivot.position.set(0, 0, 0);
      coin.scale.setScalar(0.62 * ease.back(lin(lt, 0, 0.6)));
      coinPivot.rotation.set(0, lt * 0.8, 0);
      split.rotation.set(-0.25, 0.3 - lt * 0.03, (PORTRAIT ? -2.15 : -1.3) + lt * 0.04);
      const sep = ease.back(lin(lt, 2, 2.9));
      split.userData.arcs.forEach((m, i) => {
        const d = sep * (i === 0 ? 0.25 : 0.9);
        m.position.set(Math.cos(m.userData.mid) * d, Math.sin(m.userData.mid) * d, 0);
        m.scale.setScalar(ease.out5(lin(lt, 0.1 + i * 0.1, 1.1 + i * 0.1)));
        m.material.emissiveIntensity = 0.1 + sep * 0.25 + Math.exp(-Math.max(0, lt - 2) * 4) * 0.8;
      });
      setCam(V(1.2, 0.6, 14.5 - lt * 0.25), V(0, 0, 0), { fov: 36, t: lt, shake: 0.006, shift: [0.36, 0, 0, 0.28] });
      animFeature(f, lt, 0.2, 7.6);
      labels.forEach((lab, i) => {
        pop(lab, lt, 2.1 + i * 0.5, 7.6, { x: -30, y: 0, dur: 0.45 });
        const num = [80, 10, 10][i] * ease.out(lin(lt, 2.1 + i * 0.5, 3.1 + i * 0.5));
        lab.firstChild.textContent = Math.round(num) + '%';
      });
      const [cx, cy] = toScreen(V(0, 0, 0));
      center.style.left = cx + 'px';
      center.style.top = cy + 'px';
      pop(center, lt, 0.6, 1.9, { y: 0, out: 0.2 });
    };
  },
};

SHOTS.pay = {
  dur: 10,
  music: 'groove2',
  cues: [[0, 'whoosh'], [0, 'impact_soft'], [0.5, 'tick'], [1, 'tick'], [1.5, 'tick'], [2, 'tick'], [2.5, 'tick'], [3, 'tick'], [3.5, 'snapshot'], [4, 'impact'], [4, 'chime'], [4.4, 'coins']],
  build() {
    const L = layer('pay');
    const timer = el('div', 'timer', `<svg viewBox="0 0 200 200"><circle class="tr-bg" cx="100" cy="100" r="88"/><circle class="tr-fg" cx="100" cy="100" r="88"/></svg><div class="tm"><span>next payout</span><b>05:00</b></div>`, L);
    const tmB = timer.querySelector('b');
    const ring = timer.querySelector('.tr-fg');
    const snap = el('div', 'snap-tag', '<i></i>snapshot · every wallet holding 100K+ $ZATS', L);
    const f = featureBlock(L, 'pay', '03', 'The payout', 'Every 5 minutes, holders get paid.', 'The vault snapshots every wallet holding 100K+ $ZATS and sends each one its share, by balance.', [
      ['Nothing to stake', 'pay'],
      ['Nothing to claim', 'pay'],
      ['Any wallet', 'pay'],
    ]);
    return (lt) => {
      const { holders, payFlow, coinPivot, coin, dust } = world;
      holders.visible = coinPivot.visible = dust.visible = true;
      coinPivot.position.set(0, 0.3, 0);
      coin.scale.setScalar(0.75);
      coinPivot.rotation.set(-Math.PI / 2 + 0.25, 0, lt * 0.6);
      const scan = lin(lt, 3.5, 5.2);
      const ur = holders.userData;
      ur.ripple.visible = scan > 0 && scan < 1;
      ur.ripple.scale.setScalar(0.5 + scan * 13);
      ur.ripple.material.opacity = (1 - scan) * 0.55;
      ur.floor.material.uniforms.uScan.value = scan > 0 && scan < 1 ? 0.5 + scan * 13 : -1;
      ur.floor.material.uniforms.uScroll.value = lt * 0.2;
      ur.orbs.forEach((o, i) => {
        const lit = ease.out(lin(lt, 4.2 + o.userData.delay * 2.2, 4.6 + o.userData.delay * 2.2));
        const seen = ease.out(lin(lt, 3.5 + o.userData.rad / 13 * 1.7, 3.7 + o.userData.rad / 13 * 1.7));
        o.material.emissiveIntensity = seen * 0.06 + lit * 0.12;
        o.userData.core.scale.setScalar(0.001 + lit * (0.55 + o.userData.bal * 0.3));
        o.position.y = Math.sin(lt * 1.2 + i) * 0.08 + lit * 0.15;
        o.scale.setScalar(ease.back(lin(lt, 0.1 + i * 0.006, 0.7 + i * 0.006)));
      });
      payFlow.visible = lt > 3.9;
      payFlow.userData.update(lt, { amount: ease.out(lin(lt, 4, 4.6)), live: (u, p) => (lt - 4 > u / p.sp ? 1 : 0) * (u > 0.96 ? 0 : 1) });
      const k = ease.inOut(lin(lt, 0, 10));
      const ang = 0.6 + lt * 0.07;
      const rad = mix(5, 13, k);
      setCam(V(Math.sin(ang) * rad, mix(14, 5.2, k), Math.cos(ang) * rad), V(0, 0, 0), { fov: 38, t: lt, shake: 0.008, shift: [0.3, -0.05, 0, 0.32], roll: mix(0.2, 0, k) });
      // countdown (sped up), then the snapshot
      const p = pop(timer, lt, 0.1, 3.4, { y: 0, scale: 0.9, out: 0.25 });
      void p;
      const left = 300 * (1 - ease.inOut(lin(lt, 0.3, 3.4)));
      const mm = Math.floor(left / 60);
      const ss = Math.floor(left % 60);
      tmB.textContent = `0${mm}:${String(ss).padStart(2, '0')}`;
      ring.style.strokeDashoffset = String(553 * (1 - left / 300));
      pop(snap, lt, 3.5, 4.6, { y: 10, dur: 0.3, out: 0.3 });
      animFeature(f, lt, 4.3, 9.6);
    };
  },
};

SHOTS.burn = {
  dur: 8,
  music: 'halftime',
  cues: [[0, 'boom'], [0, 'whoosh'], [2, 'impact_soft'], [4, 'boom'], [6, 'impact_soft']],
  build() {
    const L = layer('burn');
    const f = featureBlock(L, 'burn', '04', 'Buyback + burn', 'Bought on the market. Then burned.', '10% of every fee buys $ZATS on the open market and destroys exactly what it bought. Supply goes down. Every burn is on-chain.', [
      ['Market buy', 'burn'],
      ['Burned forever', 'burn'],
    ]);
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const s = new THREE.Vector3();
    const pv = new THREE.Vector3();
    const r = rng(41);
    const C = Array.from({ length: 70 }, () => ({ ph: r(), a: r() * Math.PI * 2, rr: 0.6 + r() * 1.3, sp: 0.18 + r() * 0.12, rot: r() * 10 }));
    return (lt, T) => {
      const { furnace, embers, burnCoins, dust } = world;
      furnace.visible = embers.visible = burnCoins.visible = true;
      dust.visible = false;
      embers.material.uniforms.uTime.value = lt + 30;
      embers.material.uniforms.uK.value = ease.out(lin(lt, 0, 1.2));
      furnace.userData.heat.material.uniforms.uTime.value = lt;
      const pulse = Math.exp(-((lt % 2) / 0.25));
      furnace.userData.light.intensity = 25 + pulse * 25;
      furnace.userData.heat.material.uniforms.uK.value = 0.8 + pulse * 0.5;
      furnace.scale.setScalar(ease.out5(lin(lt, 0, 0.8)));
      C.forEach((c, i) => {
        const u = (c.ph + (lt + 50) * c.sp) % 1; // 0 top -> 1 into the ring
        const a = c.a + u * 3;
        const rr = c.rr * (1 - u * 0.5);
        pv.set(Math.cos(a) * rr, 7 - u * 7.2, Math.sin(a) * rr);
        const dissolve = clamp((u - 0.82) / 0.18);
        e.set(c.rot + lt * 2, c.rot * 2 + lt * 1.4, 0);
        q.setFromEuler(e);
        s.setScalar(Math.max(0.001, 1 - dissolve) * 1.6);
        m4.compose(pv, q, s);
        burnCoins.setMatrixAt(i, m4);
      });
      burnCoins.instanceMatrix.needsUpdate = true;
      burnCoins.material.emissiveIntensity = 0.25;
      const k = ease.inOut(lin(lt, 0, 8));
      setCam(V(Math.sin(0.3 + lt * 0.05) * mix(9, 7, k), mix(1.0, 2.4, k), Math.cos(0.3 + lt * 0.05) * mix(9, 7, k)), V(0, 2.4, 0), { fov: 38, t: lt, shake: 0.012, shift: [0.36, 0, 0, 0.3] });
      animFeature(f, lt, 0.25, 7.6);
      void T;
    };
  },
};

SHOTS.swap = {
  dur: 8,
  music: 'groove',
  cues: [[0, 'whoosh'], [0, 'impact_soft'], [1.2, 'type'], [2.5, 'swoosh'], [3, 'stab'], [4.5, 'click'], [5, 'chime']],
  build() {
    const L = layer('swap');
    const f = featureBlock(L, 'trade', '05', 'Swap', 'Swap here. We take <em>0%</em>.', 'Best route across Solana through Jupiter, signed in your own wallet. The funds never pass through us.', [
      ['Routed by Jupiter', 'trade'],
      ['Your wallet signs', 'trade'],
    ]);
    const card = el(
      'div',
      'swapcard glass',
      `<div class="sc-head"><b>Swap</b><span class="sc-pills"><i class="on">SOL</i><i>$ZATS</i><i>USDC</i></span></div>
       <div class="sc-box"><span class="sc-l">You pay</span><div class="sc-row"><b class="sc-amt"></b><span class="sc-tk">SOL</span></div></div>
       <div class="sc-flip">↓</div>
       <div class="sc-box"><span class="sc-l">You get</span><div class="sc-row"><b class="sc-get">$ZATS</b><span class="sc-tk gold">$ZATS</span></div></div>
       <div class="sc-meta"><span>Platform fee</span><b class="zero">0%</b></div>
       <div class="sc-meta"><span>Route</span><b>Jupiter · best price</b></div>
       <div class="sc-btn">Swap</div>
       <div class="sc-note">Signed in your own wallet</div>`,
      L,
    );
    const amt = card.querySelector('.sc-amt');
    const btn = card.querySelector('.sc-btn');
    const flip = card.querySelector('.sc-flip');
    const zero = card.querySelector('.zero');
    const note = card.querySelector('.sc-note');
    const stamp = el('div', 'zero-stamp', '0%', L);
    return (lt) => {
      const { swapGrp, solDisc, zatsMini, dust } = world;
      swapGrp.visible = dust.visible = true;
      const sw = ease.inOut(lin(lt, 2.4, 3.2));
      const a = sw * Math.PI;
      solDisc.position.set(Math.cos(a) * 1.6, Math.sin(a) * 0.7, Math.sin(a) * 1.6);
      zatsMini.position.set(-Math.cos(a) * 1.6, -Math.sin(a) * 0.7, -Math.sin(a) * 1.6);
      solDisc.rotation.set(0.2, lt * 0.9, 0.1);
      zatsMini.rotation.set(-0.1, -lt * 0.8 + 0.4, 0);
      swapGrp.rotation.set(0.2, -0.3, 0);
      swapGrp.position.set(PORTRAIT ? 0 : 2.2, PORTRAIT ? 1.2 : 0.2, -1.5);
      world.swapRing.rotation.x = Math.PI / 2;
      world.swapRing.material.color.copy(TONE.trade).multiplyScalar(1.5 + Math.exp(-Math.max(0, lt - 3) * 3) * 4);
      setCam(V(0.6, 0.8, 8.5 - lt * 0.2), V(0, 0, 0), { fov: 36, t: lt, shake: 0.006, shift: [0.05, 0.02, 0, 0.36] });
      animFeature(f, lt, 0.2, 7.6, { titleMode: 'rise' });
      const cp = pop(card, lt, 0.5, 7.6, { y: 60, scale: 0.9, dur: 0.8 });
      card.style.transform += ` perspective(1200px) rotateY(${(-14 + Math.sin(lt * 0.5) * 4) * (PORTRAIT ? 0.4 : 1)}deg) rotateX(${4 + Math.sin(lt * 0.7) * 2}deg)`;
      void cp;
      typeText(amt, '0.5', lt, 1.2, 6);
      flip.style.transform = `rotate(${ease.out5(lin(lt, 2.4, 3)) * 180}deg)`;
      zero.classList.toggle('hot', lt > 3);
      btn.classList.toggle('press', lt > 4.5 && lt < 4.7);
      btn.classList.toggle('ok', lt >= 4.7);
      btn.textContent = lt >= 4.7 ? 'Confirm in your wallet' : 'Swap';
      note.style.opacity = String(ease.out(lin(lt, 5, 5.4)));
      const sp = ease.out5(lin(lt, 3, 3.5));
      stamp.style.opacity = String(lt > 3 ? (1 - lin(lt, 7.3, 7.7)) * Math.min(1, sp * 2) : 0);
      stamp.style.transform = `translate(-50%, -50%) scale(${2.4 - 1.4 * sp}) rotate(-8deg)`;
      stamp.style.filter = `blur(${(1 - sp) * 20}px)`;
    };
  },
};

SHOTS.proof = {
  dur: 6,
  music: 'filtered',
  cues: [[0, 'whoosh'], [0, 'impact_soft'], [0.5, 'blips'], [2, 'blips'], [3.5, 'blips']],
  build() {
    const L = layer('proof');
    const head = el('div', 'proof-head tone-vault', null, L);
    const k = el('div', 'kick', '<span class="dot"></span><span class="num">06</span><span class="kt">Proof</span>', head);
    const h = txt(head, 'h-title', 'Don’t trust. <em>Check.</em>');
    const s = txt(head, 'h-sub', 'Every payout, burn and buyback is a public Solana transaction. The live feed links each one.');
    const tunnel = el('div', 'tunnel', null, L);
    const KINDS = [
      ['PAID', 'pay', 'holder received $ZATS'],
      ['BURN', 'burn', 'vault bought and burned $ZATS'],
      ['FEES', 'vault', 'vault claimed creator fees'],
      ['BUYBACK', 'vault', 'vault bought $ZATS'],
      ['PAID', 'pay', 'holder received $ZATS'],
      ['BUY', 'trade', 'someone bought $ZATS'],
    ];
    const rows = Array.from({ length: 16 }, (_, i) => {
      const [tag, tone, text] = KINDS[i % KINDS.length];
      return el('div', `trow glass tone-${tone}`, `<b class="tt">${tag}</b><span class="tx2">${text}</span><span class="redact">████████</span><span class="scan">solscan ↗</span>`, tunnel);
    });
    const tagS = el('div', 'ui-note', 'UI preview · addresses redacted', L);
    return (lt) => {
      const { gridFloor, gridCeil, dust } = world;
      gridFloor.visible = gridCeil.visible = true;
      dust.visible = true;
      gridFloor.material.uniforms.uScroll.value = lt * 2.2;
      gridCeil.material.uniforms.uScroll.value = lt * 2.2;
      setCam(V(0, 0.6, 10), V(0, 0.4, -20), { fov: 42, t: lt, shake: 0.01, shift: [0, 0, 0, 0] });
      pop(k, lt, 0.2, 5.6, { y: 0, x: -30 });
      show(h, lt, 0.3, 5.6, { stagger: 0.03 });
      show(s, lt, 1.0, 5.6, { mode: 'fade', stagger: 0.006 });
      rows.forEach((r, i) => {
        const life = (lt * 0.42 + i / rows.length) % 1;
        const z = -2600 + life * 3000;
        const side = i % 2 ? 1 : -1;
        const x = side * (PORTRAIT ? 120 : 520) + (i % 3) * 30 * side;
        const y = ((i * 7) % 5) * (PORTRAIT ? 130 : 80) - (PORTRAIT ? 120 : 100);
        r.style.transform = `translate(-50%, -50%) translate3d(${x}px, ${y}px, ${z}px) rotateY(${-side * 18}deg)`;
        r.style.opacity = String(clamp(life * 5) * clamp((1 - life) * 6) * ease.out(lin(lt, 0, 0.8)) * (1 - lin(lt, 5.6, 6)));
      });
      pop(tagS, lt, 0.8, 5.6, { y: 0 });
    };
  },
};

SHOTS.people = {
  dur: 8,
  music: 'groove2',
  cues: [[0, 'whoosh'], [0, 'impact_soft'], [0.8, 'click'], [1.4, 'type'], [3, 'thud'], [3.5, 'thud'], [4, 'thud'], [4, 'chime']],
  build() {
    const L = layer('people');
    const f = featureBlock(L, 'people', '07', 'Community', 'Claim your name. Climb the boards.', 'Sign one free message (no transaction). Your name shows on every payout. Link X and share your invite link.', [
      ['Free sign-in', 'people'],
      ['Link X', 'people'],
      ['Invite friends', 'people'],
    ]);
    const card = el(
      'div',
      'signin glass tone-people',
      `<div class="si-top"><span class="si-led"></span>Sign in</div>
       <div class="si-msg">Sign this message to prove you own this wallet. It sends no transaction and costs nothing.</div>
       <div class="si-name"><span>@</span><b class="si-typed"></b><i class="caret"></i></div>`,
      L,
    );
    const typed = card.querySelector('.si-typed');
    const boards = ['Top earners', 'Diamond hands', 'Recruiters'].map((x) => el('div', 'board-label tone-people', x, L));
    return (lt) => {
      const { pillars, pillarList, dust } = world;
      pillars.visible = dust.visible = true;
      pillarList.forEach((p, i) => {
        const g = ease.back(lin(lt, 3 + i * 0.5, 3.7 + i * 0.5));
        p.scale.set(1, Math.max(0.001, g), 1);
        p.userData.cap.material.color.copy(TONE.people).multiplyScalar(3 + Math.exp(-Math.max(0, lt - 3 - i * 0.5) * 4) * 6);
      });
      pillars.rotation.y = -0.35 + lt * 0.04;
      pillars.children[3].material.uniforms.uScroll.value = lt * 0.3;
      setCam(V(2.8, 2.6, 9.5 - lt * 0.15), V(0, 1.6, 0), { fov: 36, t: lt, shake: 0.006, shift: [0.36, 0, 0, 0.3] });
      animFeature(f, lt, 0.2, 7.6);
      pop(card, lt, 0.6, 2.8, { y: 40, scale: 0.92, out: 0.3 });
      typeText(typed, 'your_name', lt, 1.4, 12);
      pillarList.forEach((p, i) => {
        const v = V(0, p.userData.h * p.scale.y + 0.55, 0);
        p.localToWorld(v);
        const [x, y] = toScreen(v);
        boards[i].style.left = x + 'px';
        boards[i].style.top = y + 'px';
        pop(boards[i], lt, 3.4 + i * 0.5, 7.6, { y: 10, dur: 0.4 });
      });
    };
  },
};

SHOTS.cycle = {
  dur: 8,
  music: 'build',
  cues: [[0, 'whoosh'], [0, 'impact_soft'], [4, 'stab'], [5, 'stab'], [6, 'stab'], [7, 'stab'], [8, 'riser:4']],
  build() {
    const L = layer('cycle');
    const head = txt(L, 'cycle-title', 'One loop. <em>Fully on-chain.</em>');
    const sub = txt(L, 'cycle-sub', 'More trading means more fees. More fees means more paid to holders, and more $ZATS burned.');
    const NODES = [
      ['trade', 'trades'],
      ['vault', 'fees'],
      ['pay', 'payouts'],
      ['burn', 'burns'],
      ['people', 'holders'],
    ];
    const labels = NODES.map(([t, n]) => el('span', `sat-label tone-${t}`, n, L));
    const trust = el('div', 'trust-row', ['No custody', 'No KYC', 'No presale', 'Fair launch'].map((x) => `<span class="chip big">${x}</span>`).join(''), L);
    return (lt) => {
      const { coinPivot, coin, sats, satMeshes, loopFlow, LOOP_R, dust } = world;
      coinPivot.visible = sats.visible = loopFlow.visible = dust.visible = true;
      coin.scale.setScalar(1);
      coinPivot.position.set(0, 0, 0);
      const spin = lt * 0.5 + Math.pow(lin(lt, 4, 8), 3) * 8;
      coinPivot.rotation.set(0.1, spin, 0);
      sats.rotation.set(0, 0, 0);
      world.orbitLine.visible = false;
      satMeshes.forEach((m, i) => {
        const a = (i / 5) * Math.PI * 2 + lt * 0.12;
        m.position.set(Math.cos(a) * LOOP_R, Math.sin(a) * LOOP_R * 0.32, Math.sin(a) * LOOP_R);
        m.scale.setScalar(0.9 * ease.back(lin(lt, 0.1 + i * 0.15, 0.8 + i * 0.15)));
      });
      // particles take each segment's color
      const cols = NODES.map(([t]) => TONE[t].clone().multiplyScalar(1.8));
      const speedUp = 1 + Math.pow(lin(lt, 3, 8), 2) * 4;
      loopFlow.userData.update(lt * speedUp + 84, {
        amount: ease.out(lin(lt, 0, 1)),
        live: () => 1,
      });
      const colAttr = loopFlow.geometry.attributes.color;
      const posAttr = loopFlow.geometry.attributes.position;
      for (let i = 0; i < colAttr.count; i++) {
        const x = posAttr.getX(i);
        const z = posAttr.getZ(i);
        let a = Math.atan2(z, x) - lt * 0.12;
        a = ((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
        const seg = Math.floor((a / (Math.PI * 2)) * 5) % 5;
        const c = cols[seg];
        const br = Math.max(colAttr.getX(i), colAttr.getY(i), colAttr.getZ(i));
        colAttr.setXYZ(i, c.r * br / 1, c.g * br / 1, c.b * br / 1);
      }
      colAttr.needsUpdate = true;
      const k = ease.in(lin(lt, 3, 7.8));
      const ang = 0.2 + lt * 0.12 + k * 1.2;
      const rad = mix(10.5, 4.2, k);
      setCam(V(Math.sin(ang) * rad, mix(3.2, 0.6, k), Math.cos(ang) * rad), V(0, 0, 0), { fov: 36, t: lt, shake: 0.006 + k * 0.03, shift: [0, -0.12, 0, 0.1] });
      show(head, lt, 0.3, 3.8, { stagger: 0.025 });
      show(sub, lt, 1.2, 3.8, { mode: 'fade', stagger: 0.008 });
      [...trust.children].forEach((c, i) => pop(c, lt, 4 + i, 7.7, { y: 0, scale: 1.3, dur: 0.25, out: 0.1, blur: 16 }));
      satMeshes.forEach((m, i) => {
        m.getWorldPosition(tmpV);
        const [x, y] = toScreen(tmpV);
        labels[i].style.left = x + 'px';
        labels[i].style.top = y + 'px';
        labels[i].style.opacity = String(ease.out(lin(lt, 0.6 + i * 0.15, 1.2 + i * 0.15)) * (1 - lin(lt, 3.6, 4)));
      });
      // pre-drop blackout
      grade.uniforms.uFade.value = 1 - ease.in(lin(lt, 7.55, 7.85));
    };
  },
};

SHOTS.finale = {
  dur: 12,
  music: 'finale',
  cues: [[0, 'drop'], [0, 'impact'], [0, 'glitch'], [2, 'chime'], [4, 'stab'], [8, 'final']],
  build() {
    const L = layer('finale');
    const wm = txt(L, 'wordmark fin', 'ZATOSHI');
    const tick = el('div', 'ticker-chip fin', '<b>$ZATS</b><span>Hold to earn · on Solana</span>', L);
    const tag = txt(L, 'tagline fin', 'Hold it. Get paid <em>every five minutes</em>.');
    const cta = el(
      'div',
      'cta',
      `<div class="cta-url glass"><span class="cta-l">Swap at 0% · open the vault</span><b>${SITE}</b></div>
       <div class="cta-x glass"><span class="cta-l">Follow for the CA</span><b>${X_HANDLE}</b></div>`,
      L,
    );
    const legal = el('div', 'legal', 'Payouts come only from real trading fees. If volume stops, payouts stop. Not affiliated with the Zcash project. Not financial advice.', L);
    return (lt) => {
      const { coinPivot, coin, rays, burst, glyphs, dust } = world;
      coinPivot.visible = rays.visible = burst.visible = glyphs.visible = dust.visible = true;
      grade.uniforms.uFade.value = 1 - ease.in(lin(lt, 11, 12));
      const g = glyphs.material.uniforms;
      g.uConverge.value = 1;
      g.uExplode.value = ease.out(lin(lt, 0, 3)) * 1.4;
      g.uOpacity.value = 0.7 * (1 - lin(lt, 2, 5));
      coin.scale.setScalar(1);
      coin.userData.gold.emissiveIntensity = Math.exp(-lt * 3) * 0.8;
      const spin = (1 - ease.expo(lin(lt, 0, 2.2))) * Math.PI * 4;
      coinPivot.rotation.set(0.06 + Math.sin(lt * 0.5) * 0.04, spin + Math.sin(lt * 0.4) * 0.12, 0);
      const up = 0;
      coinPivot.position.set(0, up, 0);
      rays.position.set(0, up, -1.5);
      rays.lookAt(camera.position);
      rays.material.opacity = 0.6 - lin(lt, 0, 6) * 0.25;
      rays.rotation.z = lt * 0.04;
      burst.material.uniforms.uAge.value = lt;
      burst.position.set(0, up, 0);
      const push = ease.out(lin(lt, 0, 12));
      setCam(V(Math.sin(lt * 0.05) * 0.5, 0.1, mix(10.5, 12.5, push)), V(0, 0, 0), { fov: 34, t: lt, shake: 0.03 * Math.exp(-lt * 2) + 0.004, shift: [0, 0.4, 0, 0.36] });
      world.key.position.set(Math.cos(lt * 0.6) * 6, 5, 6);
      show(wm, lt, 0.05, 12, { mode: 'slam', dur: 0.6, out: 0.3 });
      wm.style.letterSpacing = `${(0.2 - 0.07 * ease.out(lin(lt, 0, 6))) * (PORTRAIT ? 0.5 : 1)}em`;
      pop(tick, lt, 0.8, 12, { y: 20 });
      show(tag, lt, 2.0, 12, { stagger: 0.025 });
      const cp = pop(cta, lt, 4.0, 12, { y: 40, dur: 0.7 });
      void cp;
      pop(legal, lt, 8.2, 12, { y: 0, dur: 1 });
      bars.style.setProperty('--b', '0');
    };
  },
};

// ---------- cuts ----------
const CUTS = {
  main: ['cipher', 'reveal', 'intro', 'nots', 'fee', 'split', 'pay', 'burn', 'swap', 'proof', 'people', 'cycle', 'finale'],
  // every scene in both: each ad tells the whole story
  vertical: ['cipher', 'reveal', 'intro', 'nots', 'fee', 'split', 'pay', 'burn', 'swap', 'proof', 'people', 'cycle', 'finale'],
};
const order = CUTS[CUT] || CUTS.main;
let timeline = [];
let duration = 0;
let cues = [];

// ---------- global fx from cues ----------
function fxAt(T) {
  let flash = 0;
  let glitch = 0;
  let blur = 0;
  let punch = 0;
  for (const [ct, kind] of cues) {
    const d = T - ct;
    if (d < -0.3 || d > 2) continue;
    if (kind === 'impact' || kind === 'drop') {
      if (d >= 0) flash += (kind === 'drop' ? 1.1 : 0.7) * Math.exp(-d / 0.16);
      if (d >= 0) punch += Math.exp(-d / 0.12);
    } else if (kind === 'impact_soft' || kind === 'boom') {
      if (d >= 0) flash += 0.18 * Math.exp(-d / 0.12);
    } else if (kind === 'stab' || kind === 'stab_hi') {
      if (d >= 0) flash += 0.12 * Math.exp(-d / 0.1);
      if (d >= 0) punch += 0.5 * Math.exp(-d / 0.1);
    } else if (kind === 'glitch') {
      if (d >= 0 && d < 0.22) glitch += 1 - d / 0.22;
    } else if (kind === 'whoosh') {
      // whip blur around the cut
      blur += Math.exp(-(d * d) / 0.006) * 0.03;
    }
  }
  return { flash: Math.min(1.4, flash), glitch: Math.min(1, glitch), blur, punch: Math.min(1, punch) };
}

let lastShot = null;
function seek(T) {
  T = clamp(T, 0, duration - 1e-4);
  const s = timeline.find((x) => T >= x.start && T < x.start + x.dur) || timeline[timeline.length - 1];
  const lt = T - s.start;
  for (const o of world.all) o.visible = false;
  world.orbitLine.visible = true;
  world.key.intensity = 3.2;
  grade.uniforms.uFade.value = 1;
  world.dust.material.uniforms.uFocus.value = 8;
  if (lastShot !== s) {
    if (lastShot) lastShot.layer.style.display = 'none';
    s.layer.style.display = '';
    lastShot = s;
  }
  s.update(lt, T);
  world.dust.material.uniforms.uTime.value = T;
  world.glyphs.material.uniforms.uTime.value = T;
  const fx = fxAt(T);
  grade.uniforms.uTime.value = T;
  grade.uniforms.uFlash.value = fx.flash * 0.55;
  grade.uniforms.uGlitch.value = fx.glitch;
  grade.uniforms.uBlur.value = fx.blur;
  bloom.strength = 0.5 + fx.punch * 0.4;
  flashEl.style.opacity = String(Math.min(0.6, fx.flash * 0.35));
  ov.style.setProperty('--gl', fx.glitch.toFixed(3));
  ov.style.transform = fx.glitch > 0.01 ? `translateX(${(Math.sin(T * 300) * 14 * fx.glitch).toFixed(1)}px)` : '';
  ov.classList.toggle('glitching', fx.glitch > 0.05);
  composer.render();
}

async function init() {
  await buildWorld();
  let t = 0;
  for (const id of order) {
    const S = SHOTS[id];
    const node = { id, start: t, dur: S.dur, music: S.music };
    node.layer = null;
    const before = ov.children.length;
    node.update = S.build();
    node.layer = ov.children[before];
    node.layer.style.display = 'none';
    for (const [ct, kind] of S.cues) cues.push([+(t + ct).toFixed(4), kind]);
    timeline.push(node);
    t += S.dur;
  }
  duration = t;
  cues.sort((a, b) => a[0] - b[0]);
  const plan = timeline.map(({ id, start, dur, music }) => ({ id, start, dur, music }));
  window.__seek = seek;
  window.__world = world; // for look-dev in the console
  window.__ad = { duration, cues, plan, w: W, h: H, cut: CUT };
  seek(Number(params.get('t') || 0));
  if (!params.get('capture')) {
    // live preview with a scrub bar
    const t0 = performance.now() - Number(params.get('t') || 0) * 1000;
    const loop = () => {
      const T = ((performance.now() - t0) / 1000) % duration;
      seek(T);
      requestAnimationFrame(loop);
    };
    loop();
  }
}
init();
