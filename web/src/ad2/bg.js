// Full-screen background for ad 2: drifting color blobs, a speed-line tunnel,
// a ring, a perspective grid floor, a dot halo, stars, color floods and grain.
// One fragment shader; every scene sets the uniforms it wants each frame.
const VS = `#version 300 es
in vec2 p; void main(){ gl_Position = vec4(p, 0., 1.); }`;

const FS = `#version 300 es
precision highp float;
uniform vec2 uRes; uniform float uTime;
uniform vec3 uA, uB, uC; uniform float uBlob; uniform vec2 uBlobOff;
uniform float uTun, uTunSpeed; uniform vec3 uTunC;
uniform vec4 uFlood; uniform float uStars, uGrid, uRing, uRingR, uDots, uEmber;
uniform vec3 uGridC, uRingC, uDotC;
uniform vec2 uCenter;
out vec4 o;
float h1(float x){ return fract(sin(x * 127.1) * 43758.5453); }
float h2(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void main(){
  vec2 uv = gl_FragCoord.xy / uRes;
  float asp = uRes.x / uRes.y;
  vec2 p = (uv - 0.5) * vec2(asp, 1.0);
  float t = uTime;
  vec3 col = vec3(0.016, 0.014, 0.018);
  // blobs
  vec2 b1 = vec2(-0.42 * asp, 0.22) + 0.12 * vec2(sin(t * 0.23), cos(t * 0.19)) + uBlobOff;
  vec2 b2 = vec2(0.40 * asp, -0.18) + 0.14 * vec2(cos(t * 0.17), sin(t * 0.21)) - uBlobOff;
  vec2 b3 = vec2(0.05 * asp, 0.42) + 0.10 * vec2(sin(t * 0.13 + 2.), cos(t * 0.29));
  col += uA * exp(-dot(p - b1, p - b1) * 2.4) * 0.55 * uBlob;
  col += uB * exp(-dot(p - b2, p - b2) * 2.2) * 0.55 * uBlob;
  col += uC * exp(-dot(p - b3, p - b3) * 3.5) * 0.35 * uBlob;
  // stars
  if (uStars > 0.) {
    vec2 g = floor(gl_FragCoord.xy / 3.0);
    float s = h2(g);
    float tw = 0.6 + 0.4 * sin(t * 2. + s * 40.);
    col += vec3(1.0, 0.95, 0.85) * step(0.9985, s) * tw * uStars * 0.8;
  }
  vec2 q = p - uCenter;
  float r = length(q);
  float a = atan(q.y, q.x) / 6.2831853 + 0.5;
  // speed-line tunnel
  if (uTun > 0.) {
    float N = 260.;
    float seg = floor(a * N);
    float rn = h1(seg);
    float f = abs(fract(a * N) - 0.5);
    float w = 0.5 - (0.6 / N) / max(r, 0.02) * 0.0 ;
    float line = smoothstep(0.5, 0.18, f);
    float z = fract(rn * 7.13 + t * uTunSpeed * (0.5 + rn));
    float rr = pow(z, 1.6) * 1.6;
    float len = 0.08 + rn * 0.35;
    float m = smoothstep(rr, rr + 0.02, r) * smoothstep(rr + len, rr + len - 0.05, r);
    m *= step(0.35, rn) * smoothstep(0.04, 0.25, r);
    col += uTunC * line * m * uTun * (0.5 + 0.8 * rn);
    col += uTunC * exp(-r * 4.) * 0.18 * uTun;
  }
  // ring
  if (uRing > 0.) {
    float d = abs(r - uRingR);
    col += uRingC * (exp(-d * d * 9000.) * 0.9 + exp(-d * 30.) * 0.08) * uRing;
  }
  // grid floor
  if (uGrid > 0. && p.y < -0.02) {
    float zz = 0.35 / (-p.y);
    vec2 g = vec2(p.x * zz, zz + t * 0.6);
    vec2 gf = abs(fract(g * 1.4) - 0.5);
    float gl = smoothstep(0.03 * zz, 0.0, min(gf.x, gf.y) - 0.0);
    col += uGridC * gl * exp(-zz * 0.22) * uGrid * 0.55;
  }
  // dot halo (ASCII-like sphere of dots)
  if (uDots > 0.) {
    vec2 cell = fract(gl_FragCoord.xy / 14.) - 0.5;
    vec2 ci = floor(gl_FragCoord.xy / 14.);
    float d = length(cell);
    float fl = 0.55 + 0.45 * sin(t * 3. + h2(ci) * 30.);
    float mask = smoothstep(0.62, 0.3, r) * (0.35 + 0.65 * smoothstep(0.2, 0.55, r));
    col += uDotC * smoothstep(0.26, 0.14, d) * mask * fl * uDots * 0.5;
  }
  // embers rising
  if (uEmber > 0.) {
    for (int i = 0; i < 3; i++) {
      float sc = 26. + float(i) * 18.;
      vec2 g = vec2(p.x * sc, p.y * sc - t * (2.5 + float(i)));
      vec2 ci = floor(g); vec2 cf = fract(g) - 0.5;
      float rn = h2(ci + float(i) * 13.);
      vec2 off = vec2(rn - 0.5, h2(ci + 7.) - 0.5) * 0.6;
      float e = smoothstep(0.12, 0.0, length(cf - off)) * step(0.82, rn);
      col += vec3(1.0, 0.45, 0.15) * e * uEmber * (1.0 - uv.y * 0.6) * 0.9;
    }
  }
  // flood
  vec3 fl = uFlood.rgb * (1.0 - 0.35 * dot(p, p));
  col = mix(col, fl, uFlood.a);
  // vignette + grain
  col *= 1.0 - 0.32 * dot(p * vec2(0.8, 1.0), p * vec2(0.8, 1.0));
  col += (h2(gl_FragCoord.xy + fract(t * 7.3) * 100.) - 0.5) * 0.025;
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
  const names = ['uRes', 'uTime', 'uA', 'uB', 'uC', 'uBlob', 'uBlobOff', 'uTun', 'uTunSpeed', 'uTunC', 'uFlood', 'uStars', 'uGrid', 'uRing', 'uRingR', 'uDots', 'uEmber', 'uGridC', 'uRingC', 'uDotC', 'uCenter'];
  for (const n of names) U[n] = gl.getUniformLocation(prog, n);
  return {
    render(s, time) {
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(U.uRes, canvas.width, canvas.height);
      gl.uniform1f(U.uTime, time);
      gl.uniform3fv(U.uA, s.a);
      gl.uniform3fv(U.uB, s.b);
      gl.uniform3fv(U.uC, s.c);
      gl.uniform1f(U.uBlob, s.blob);
      gl.uniform2fv(U.uBlobOff, s.blobOff);
      gl.uniform1f(U.uTun, s.tun);
      gl.uniform1f(U.uTunSpeed, s.tunSpeed);
      gl.uniform3fv(U.uTunC, s.tunC);
      gl.uniform4fv(U.uFlood, s.flood);
      gl.uniform1f(U.uStars, s.stars);
      gl.uniform1f(U.uGrid, s.grid);
      gl.uniform1f(U.uRing, s.ring);
      gl.uniform1f(U.uRingR, s.ringR);
      gl.uniform1f(U.uDots, s.dots);
      gl.uniform1f(U.uEmber, s.ember);
      gl.uniform3fv(U.uGridC, s.gridC);
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

export function bgDefaults() {
  return {
    a: hex('#5b3fb8'), b: hex('#1f6f9a'), c: hex('#c97a1c'), blob: 0.8, blobOff: [0, 0],
    tun: 0, tunSpeed: 0.5, tunC: hex('#f6d48e'),
    flood: [0, 0, 0, 0], stars: 0.6, grid: 0, gridC: hex('#e3a83a'),
    ring: 0, ringR: 0.3, ringC: hex('#e3a83a'), dots: 0, dotC: hex('#e3a83a'), ember: 0, center: [0, 0],
  };
}
