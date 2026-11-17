// Site background: a liquid topographic map drawn on the GPU.
// One full-screen fragment shader traces anti-aliased contour lines through a
// slowly flowing, domain-warped noise field. The pointer pushes a soft hill
// into the map and leaves a fading wake of ripples behind it. Runs at the
// display's refresh rate, pauses when the tab is hidden, and falls back to a
// single still frame for reduced motion. No WebGL: the page keeps the plain background color.
import { useEffect, useRef } from 'react';

const VERT = `#version 300 es
in vec2 p;
void main() { gl_Position = vec4(p, 0.0, 1.0); }`;

const FRAG = `#version 300 es
precision highp float;
uniform vec2 uRes;
uniform float uTime;
uniform vec2 uMouse;      // px, y down
uniform float uMouseA;    // 0..1 hover strength
uniform vec4 uTrail[10];  // x, y (px), birth time, strength
uniform float uScroll;
out vec4 o;

vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x * 34.0) + 10.0) * x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
float snoise(vec3 v) {
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute(permute(permute(i.z + vec4(0.0, i1.z, i2.z, 1.0)) + i.y + vec4(0.0, i1.y, i2.y, 1.0)) + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.5 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m = m * m;
  return 105.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}

void main() {
  vec2 frag = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);
  // phones keep the same feature size as a small laptop instead of a busier map
  float S = max(min(uRes.x, uRes.y), 760.0);
  vec2 uv = frag / S;
  uv.y += uScroll / S * 0.25;
  float t = uTime;

  // liquid flow: the map is pushed around by a slower noise field
  vec2 w = uv * 1.35;
  vec2 q = vec2(snoise(vec3(w * 0.8, t * 0.045)), snoise(vec3(w * 0.8 + 7.3, t * 0.045)));
  vec2 r = vec2(snoise(vec3(w + 1.6 * q + vec2(1.7, 9.2), t * 0.06)), snoise(vec3(w + 1.6 * q + vec2(8.3, 2.8), t * 0.06)));
  float h = 0.5 + 0.38 * snoise(vec3(w + 1.1 * r, t * 0.035)) + 0.12 * snoise(vec3(w * 2.4 + r, t * 0.05));

  // the pointer: a soft hill plus a wake of ripples
  vec2 dm = (frag - uMouse) / S;
  h += uMouseA * 0.28 * exp(-dot(dm, dm) / 0.012);
  for (int i = 0; i < 10; i++) {
    vec4 tr = uTrail[i];
    float age = t - tr.z;
    if (tr.w <= 0.0 || age < 0.0 || age > 3.5) continue;
    float d = length((frag - tr.xy) / S);
    float front = age * 0.16;
    float ring = exp(-pow((d - front) / 0.035, 2.0));
    h += tr.w * 0.06 * ring * exp(-age * 1.3) * sin((d - front) * 90.0);
  }

  // anti-aliased contour lines from the height field
  float L = 14.0;
  float v = h * L;
  float fw = max(fwidth(v), 1e-4);
  float line = 1.0 - smoothstep(0.0, 1.15, abs(fract(v - 0.5) - 0.5) / fw);
  float idx = 1.0 - smoothstep(0.0, 1.4, abs(fract(v / 4.0 - 0.5) - 0.5) * 4.0 / fw);

  // brighter near the pointer, quiet toward the edges
  float glow = exp(-dot(dm, dm) / 0.05) * uMouseA;
  vec2 c = frag / uRes - 0.5;
  float vig = smoothstep(0.85, 0.15, length(c * vec2(1.0, 1.25)));
  float a = (line * 0.07 + idx * 0.09) * (0.55 + 0.45 * vig) * (1.0 + glow * 2.2);
  vec3 col = mix(vec3(0.93, 0.92, 0.9), vec3(0.96, 0.84, 0.58), glow * 0.55);
  vec3 base = vec3(0.059, 0.063, 0.071);
  o = vec4(base + col * a, 1.0);
}`;

export default function LiquidMap() {
  const ref = useRef(null);
  useEffect(() => {
    const cv = ref.current;
    const gl = cv.getContext('webgl2', { antialias: false, alpha: false, powerPreference: 'high-performance', preserveDrawingBuffer: false });
    if (!gl) {
      cv.style.display = 'none';
      return undefined;
    }
    const sh = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    };
    let prog;
    try {
      prog = gl.createProgram();
      gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT));
      gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    } catch (e) {
      console.warn('background unavailable', e);
      cv.style.display = 'none';
      return undefined;
    }
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'p');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const U = (n) => gl.getUniformLocation(prog, n);
    const uRes = U('uRes'), uTime = U('uTime'), uMouse = U('uMouse'), uMouseA = U('uMouseA'), uTrail = U('uTrail'), uScroll = U('uScroll');

    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    // A phone renders fewer pixels; a desktop keeps up to 1.5x.
    const coarse = window.matchMedia('(pointer: coarse)').matches;
    let dpr = 1;
    // Drops resolution if the GPU can't hold ~45fps, so weak laptops stay smooth.
    let quality = 1;
    let slow = 0;
    const size = () => {
      dpr = Math.min(window.devicePixelRatio || 1, coarse ? 1 : 1.5) * quality;
      const w = Math.round(window.innerWidth * dpr);
      const h = Math.round(window.innerHeight * dpr);
      if (cv.width !== w || cv.height !== h) {
        cv.width = w;
        cv.height = h;
      }
      gl.viewport(0, 0, w, h);
    };

    const trail = new Float32Array(40);
    let ti = 0;
    let lastDrop = 0;
    const ptr = { x: window.innerWidth * 0.7, y: window.innerHeight * 0.4, tx: window.innerWidth * 0.7, ty: window.innerHeight * 0.4, a: 0, ta: 0, lx: 0, ly: 0 };
    const t0 = performance.now();
    const now = () => (performance.now() - t0) / 1000;

    const onMove = (e) => {
      ptr.tx = e.clientX;
      ptr.ty = e.clientY;
      ptr.ta = 1;
      const t = now();
      const d = Math.hypot(e.clientX - ptr.lx, e.clientY - ptr.ly);
      // drop a ripple every ~90px of travel, no more than 8 per second
      if (d > 90 && t - lastDrop > 0.12) {
        trail.set([e.clientX * dpr, e.clientY * dpr, t, Math.min(1, d / 260)], ti * 4);
        ti = (ti + 1) % 10;
        ptr.lx = e.clientX;
        ptr.ly = e.clientY;
        lastDrop = t;
      }
    };
    const onDown = (e) => {
      trail.set([e.clientX * dpr, e.clientY * dpr, now(), 1.6], ti * 4);
      ti = (ti + 1) % 10;
    };
    const onLeave = () => (ptr.ta = 0);

    let raf = 0;
    let prev = performance.now();
    const frame = (ms) => {
      raf = requestAnimationFrame(frame);
      if (document.hidden) return;
      const dt = Math.min(0.05, (ms - prev) / 1000);
      prev = ms;
      slow = dt > 0.024 ? slow + 1 : Math.max(0, slow - 1);
      if (slow > 45 && quality > 0.5) {
        quality *= 0.8;
        slow = 0;
        size();
      }
      // critically damped follow, frame-rate independent
      const k = 1 - Math.exp(-dt * 7);
      ptr.x += (ptr.tx - ptr.x) * k;
      ptr.y += (ptr.ty - ptr.y) * k;
      ptr.a += (ptr.ta - ptr.a) * (1 - Math.exp(-dt * 2.5));
      draw(now());
    };
    const draw = (t) => {
      gl.uniform2f(uRes, cv.width, cv.height);
      gl.uniform1f(uTime, t);
      gl.uniform2f(uMouse, ptr.x * dpr, ptr.y * dpr);
      gl.uniform1f(uMouseA, ptr.a);
      gl.uniform4fv(uTrail, trail);
      gl.uniform1f(uScroll, window.scrollY * dpr);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };

    size();
    window.addEventListener('resize', size);
    if (still) draw(40);
    else {
      window.addEventListener('pointermove', onMove, { passive: true });
      window.addEventListener('pointerdown', onDown, { passive: true });
      document.documentElement.addEventListener('pointerleave', onLeave);
      raf = requestAnimationFrame(frame);
    }
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', size);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerdown', onDown);
      document.documentElement.removeEventListener('pointerleave', onLeave);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    };
  }, []);
  return <canvas ref={ref} className="z-bg" aria-hidden="true" />;
}
