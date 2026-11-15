// Background for ad 2: a near-black base, two soft color washes in muted
// tones (each scene picks its own), and a quiet drawn layer on top:
// topographic contour lines and a halftone dot field that drift slowly.
// Plus the effects a few scenes use: a speed-line tunnel, a ring, a dot halo,
// embers, full-screen color floods and grain.
const VS = `#version 300 es
in vec2 p; void main(){ gl_Position = vec4(p, 0., 1.); }`;

const FS = `#version 300 es
precision highp float;
uniform vec2 uRes; uniform float uTime;
uniform vec3 uA, uB; uniform float uWash; uniform vec2 uBlobOff;
uniform float uContour, uHalftone, uSeed;
uniform float uTun, uTunSpeed; uniform vec3 uTunC;
uniform vec4 uFlood; uniform float uStars, uRing, uRingR, uDots, uEmber;
uniform vec3 uRingC, uDotC;
uniform vec2 uCenter;
out vec4 o;
float h1(float x){ return fract(sin(x * 127.1) * 43758.5453); }
float h2(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vn(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3. - 2. * f);
  return mix(mix(h2(i), h2(i + vec2(1, 0)), u.x), mix(h2(i + vec2(0, 1)), h2(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p){
  float s = 0., a = 0.5;
  for (int i = 0; i < 4; i++) { s += a * vn(p); p = p * 2.03 + 11.7; a *= 0.5; }
  return s;
}
void main(){
  vec2 uv = gl_FragCoord.xy / uRes;
  float asp = uRes.x / uRes.y;
  vec2 p = (uv - 0.5) * vec2(asp, 1.0);
  float t = uTime;
  vec3 col = vec3(0.034, 0.032, 0.031);
  // washes: big, soft, low saturation
  vec2 b1 = vec2(-0.55 * asp, 0.38) + 0.10 * vec2(sin(t * 0.17), cos(t * 0.13)) + uBlobOff;
  vec2 b2 = vec2(0.55 * asp, -0.42) + 0.10 * vec2(cos(t * 0.11), sin(t * 0.15)) - uBlobOff;
  float w1 = exp(-dot(p - b1, p - b1) * 1.1);
  float w2 = exp(-dot(p - b2, p - b2) * 1.1);
  col += uA * w1 * 0.32 * uWash + uB * w2 * 0.28 * uWash;
  vec3 tint = normalize(uA * w1 + uB * w2 + 0.15) * 0.9;
  // contour lines of a slowly drifting noise field
  if (uContour > 0.) {
    float f = fbm(p * 1.6 + vec2(uSeed, t * 0.03));
    float k = f * 14.;
    float d = abs(fract(k) - 0.5) / fwidth(k);
    float line = 1. - clamp(d - 0.2, 0., 1.);
    float major = step(0.5, fract(floor(k) * 0.25 + 0.01)) * 0.6 + 0.4;
    col += tint * line * major * 0.11 * uContour * (0.4 + 0.6 * (w1 + w2));
  }
  // halftone dots sized by the same field
  if (uHalftone > 0.) {
    float cs = 12.0;
    vec2 cell = floor(gl_FragCoord.xy / cs);
    vec2 cc = (cell + 0.5) * cs / uRes;
    vec2 pc = (cc - 0.5) * vec2(asp, 1.0);
    float f = fbm(pc * 2.2 + vec2(uSeed * 2., -t * 0.04));
    float r = smoothstep(0.42, 0.75, f) * 0.42;
    float d = length(fract(gl_FragCoord.xy / cs) - 0.5);
    col += tint * smoothstep(r, r - 0.08, d) * 0.11 * uHalftone;
  }
  if (uStars > 0.) {
    vec2 g = floor(gl_FragCoord.xy / 3.0);
    float s = h2(g);
    col += vec3(1.0, 0.96, 0.9) * step(0.9988, s) * (0.6 + 0.4 * sin(t * 2. + s * 40.)) * uStars * 0.6;
  }
  vec2 q = p - uCenter;
  float r = length(q);
  float a = atan(q.y, q.x) / 6.2831853 + 0.5;
  if (uTun > 0.) {
    float N = 220.;
    float seg = floor(a * N);
    float rn = h1(seg);
    float f = abs(fract(a * N) - 0.5);
    float line = smoothstep(0.5, 0.2, f);
    float z = fract(rn * 7.13 + t * uTunSpeed * (0.5 + rn));
    float rr = pow(z, 1.6) * 1.6;
    float len = 0.08 + rn * 0.3;
    float m = smoothstep(rr, rr + 0.02, r) * smoothstep(rr + len, rr + len - 0.05, r);
    m *= step(0.4, rn) * smoothstep(0.04, 0.25, r);
    col += uTunC * line * m * uTun * (0.4 + 0.6 * rn);
    col += uTunC * exp(-r * 4.) * 0.12 * uTun;
  }
  if (uRing > 0.) {
    float d = abs(r - uRingR);
    col += uRingC * (exp(-d * d * 9000.) * 0.8 + exp(-d * 30.) * 0.06) * uRing;
  }
  if (uDots > 0.) {
    vec2 cell = fract(gl_FragCoord.xy / 14.) - 0.5;
    vec2 ci = floor(gl_FragCoord.xy / 14.);
    float d = length(cell);
    float fl = 0.55 + 0.45 * sin(t * 3. + h2(ci) * 30.);
    float mask = smoothstep(0.62, 0.3, r) * (0.35 + 0.65 * smoothstep(0.2, 0.55, r));
    col += uDotC * smoothstep(0.26, 0.14, d) * mask * fl * uDots * 0.4;
  }
  if (uEmber > 0.) {
    for (int i = 0; i < 3; i++) {
      float sc = 26. + float(i) * 18.;
      vec2 g = vec2(p.x * sc, p.y * sc - t * (2.5 + float(i)));
      vec2 ci = floor(g); vec2 cf = fract(g) - 0.5;
      float rn = h2(ci + float(i) * 13.);
      vec2 off = vec2(rn - 0.5, h2(ci + 7.) - 0.5) * 0.6;
      float e = smoothstep(0.12, 0.0, length(cf - off)) * step(0.84, rn);
      col += vec3(0.95, 0.55, 0.3) * e * uEmber * (1.0 - uv.y * 0.6) * 0.7;
    }
  }
  vec3 fl = uFlood.rgb * (1.0 - 0.25 * dot(p, p));
  col = mix(col, fl, uFlood.a);
  col *= 1.0 - 0.3 * dot(p * vec2(0.8, 1.0), p * vec2(0.8, 1.0));
  col += (h2(gl_FragCoord.xy + fract(t * 7.3) * 100.) - 0.5) * 0.02;
  o = vec4(max(col, 0.0), 1.0);
}`;

export function makeBG(canvas) {
  const gl = canvas.getContext('webgl2', { preserveDrawingBuffer: true, antialias: false });
  const sh = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  };
  const prog = gl.createProgram();
  gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS));
  gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS));
  gl.linkProgram(prog);
  gl.useProgram(prog);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'p');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const U = {};
  const names = ['uRes', 'uTime', 'uA', 'uB', 'uWash', 'uBlobOff', 'uContour', 'uHalftone', 'uSeed', 'uTun', 'uTunSpeed', 'uTunC', 'uFlood', 'uStars', 'uRing', 'uRingR', 'uDots', 'uEmber', 'uRingC', 'uDotC', 'uCenter'];
  for (const n of names) U[n] = gl.getUniformLocation(prog, n);
  return {
    render(s, time) {
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(U.uRes, canvas.width, canvas.height);
      gl.uniform1f(U.uTime, time);
      gl.uniform3fv(U.uA, s.a);
      gl.uniform3fv(U.uB, s.b);
      gl.uniform1f(U.uWash, s.wash);
      gl.uniform2fv(U.uBlobOff, s.blobOff);
      gl.uniform1f(U.uContour, s.contour);
      gl.uniform1f(U.uHalftone, s.halftone);
      gl.uniform1f(U.uSeed, s.seed);
      gl.uniform1f(U.uTun, s.tun);
      gl.uniform1f(U.uTunSpeed, s.tunSpeed);
      gl.uniform3fv(U.uTunC, s.tunC);
      gl.uniform4fv(U.uFlood, s.flood);
      gl.uniform1f(U.uStars, s.stars);
      gl.uniform1f(U.uRing, s.ring);
      gl.uniform1f(U.uRingR, s.ringR);
      gl.uniform1f(U.uDots, s.dots);
      gl.uniform1f(U.uEmber, s.ember);
      gl.uniform3fv(U.uRingC, s.ringC);
      gl.uniform3fv(U.uDotC, s.dotC);
      gl.uniform2fv(U.uCenter, s.center);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
  };
}

export const hex = (h) => {
  const n = parseInt(h.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};

// Muted, natural palette. Zcash yellow is the anchor; the rest are earthy
// and dusty so they sit together instead of glowing.
export const PAL = {
  zec: '#F4B728',
  sand: '#D8B98A',
  cream: '#EEE6D6',
  sage: '#8FB49A',
  terracotta: '#D9805A',
  slate: '#7E9CBB',
  plum: '#A58BC4',
  teal: '#6FA9A0',
  rose: '#D58F8A',
  ink: '#16130F',
};

export function bgDefaults() {
  return {
    a: hex(PAL.sand), b: hex(PAL.slate), wash: 1, blobOff: [0, 0], contour: 1, halftone: 0, seed: 0,
    tun: 0, tunSpeed: 0.5, tunC: hex('#f3e9d6'),
    flood: [0, 0, 0, 0], stars: 0.25,
    ring: 0, ringR: 0.3, ringC: hex(PAL.zec), dots: 0, dotC: hex(PAL.zec), ember: 0, center: [0, 0],
  };
}
