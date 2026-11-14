// Homepage hero: a skyline with a brutalist block and Berlin's TV tower, drawn by a WebGL
// fragment shader and printed as ASCII. Each character cell samples the scene once and
// picks a glyph from an atlas by darkness. The cursor moves the light.
// Without WebGL the CMS hero media is shown instead. With reduced motion it draws one frame.
// Idempotent, so a live-preview swap can call it again.

const RAMP = ' .,:;-=+*#%@'; // from light to dark
const CELL_CSS_PX = 9;
const INK = [0x09 / 255, 0x09 / 255, 0x09 / 255]; // --text
const PAPER = [0xf5 / 255, 0xf5 / 255, 0xf5 / 255]; // --background

const VERTEX = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

const FRAGMENT = `
precision highp float;
uniform vec2 uRes;
uniform float uTime;
uniform vec2 uMouse;
uniform float uCell;
uniform float uGlyphs;
uniform sampler2D uAtlas;
uniform vec3 uInk;
uniform vec3 uPaper;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; }
  return v;
}
float box(vec2 p, vec2 lo, vec2 hi) { return step(lo.x, p.x) * step(p.x, hi.x) * step(lo.y, p.y) * step(p.y, hi.y); }

// Concrete facade: floor slabs, recessed windows, a few lit ones that change slowly.
float facade(vec2 p, vec2 grid, float base, float seed) {
  vec2 g = p * grid;
  vec2 f = fract(g);
  vec2 id = floor(g);
  float lum = base + 0.1 * (noise(p * 60.0) - 0.5);
  if (f.y < 0.18) return base + 0.25;                       // slab edge
  if (f.x > 0.18 && f.x < 0.82 && f.y > 0.32) {
    float lit = step(0.9, hash(id + seed + floor(uTime * 0.15 + hash(id) * 7.0)));
    return mix(0.04, 0.95, lit);                            // window
  }
  return lum;
}

float scene(vec2 uv) {
  float aspect = uRes.x / uRes.y;
  vec2 p = vec2((uv.x - 0.5) * aspect, uv.y);
  vec2 m = vec2((uMouse.x - 0.5) * aspect, uMouse.y);
  vec2 light = normalize(vec2((uMouse.x - 0.5) * 2.0, 0.6));
  float t = uTime;

  // Sky: light, with slow clouds and a glow around the cursor.
  float lum = 1.0 - 0.3 * smoothstep(0.5, 0.85, fbm(vec2(p.x * 2.5 + t * 0.04, p.y * 5.0)));
  lum -= 0.18 * exp(-160.0 * dot(p - m, p - m));            // a faint halo follows the cursor

  float par = (uMouse.x - 0.5) * 0.02;                      // background parallax

  // Far block with vertical fins, right.
  vec2 q = p + vec2(par, 0.0);
  if (box(q, vec2(0.16 * aspect, 0.06), vec2(0.47 * aspect, 0.34)) > 0.0) {
    lum = fract(q.x * 32.0) < 0.35 ? 0.45 : 0.78 + 0.05 * noise(q * 40.0);
  }

  // Brutalist block, left: a slab, a cantilevered upper volume and a stair core.
  float x0 = -0.44 * aspect, x1 = -0.04 * aspect;
  if (box(p, vec2(x0, 0.06), vec2(x1, 0.5)) > 0.0) {
    lum = facade(p - vec2(x0, 0.06), vec2(34.0, 22.0), 0.42, 1.0);
    lum -= 0.2 * smoothstep(x1 - 0.06, x1, p.x) * max(0.0, -light.x); // shade the right edge
  }
  if (box(p, vec2(x0 + 0.1 * aspect, 0.5), vec2(x1 + 0.08 * aspect, 0.62)) > 0.0) {
    lum = facade(p - vec2(x0, 0.5), vec2(16.0, 18.0), 0.5, 2.0);
  }
  if (box(p, vec2(x0 + 0.1 * aspect, 0.47), vec2(x1 + 0.08 * aspect, 0.5)) > 0.0) lum = 0.18; // cantilever shadow
  if (box(p, vec2(x0 - 0.04, 0.06), vec2(x0 + 0.03, 0.7)) > 0.0) {
    lum = 0.42 + 0.25 * light.x * sign(p.x - (x0 - 0.005)) + 0.05 * noise(p * 50.0);
  }

  // TV tower: shaft, sphere with panel grid, upper shaft and striped antenna.
  float cx = 0.1 * aspect;
  float y = p.y;
  float w = mix(0.03, 0.016, smoothstep(0.06, 0.6, y));
  if (abs(p.x - cx) < w && y > 0.06 && y < 0.62) {
    float n = (p.x - cx) / w;
    lum = 0.08 + 0.4 * max(0.0, n * light.x + sqrt(max(0.0, 1.0 - n * n)) * 0.4);
  }
  vec2 sc = vec2(cx, 0.66);
  float r = 0.075;
  vec2 d = p - sc;
  if (dot(d, d) < r * r) {
    vec3 nrm = vec3(d / r, sqrt(max(0.0, 1.0 - dot(d, d) / (r * r))));
    float diff = max(0.0, dot(nrm, normalize(vec3(light, 0.8))));
    lum = 0.04 + 0.7 * diff;
    float lat = fract(asin(nrm.y) * 6.0), lon = fract(atan(nrm.x, nrm.z) * 5.0 + t * 0.05);
    if (lat < 0.08 || lon < 0.08) lum *= 0.55;               // facets
  }
  if (abs(p.x - cx) < 0.042 && abs(y - 0.6) < 0.01) lum = 0.1; // platform ring
  if (abs(p.x - cx) < 0.011 && y > 0.72 && y < 0.82) lum = 0.15;
  if (abs(p.x - cx) < 0.005 && y > 0.82 && y < 0.95) lum = fract(y * 40.0) < 0.5 ? 0.05 : 0.5;
  float blink = step(0.5, fract(t * 0.6));
  if (dot(p - vec2(cx, 0.955), p - vec2(cx, 0.955)) < 0.00004) lum = mix(0.9, 0.05, blink);

  // Ground.
  if (y < 0.06) lum = 0.55 + 0.2 * noise(vec2(p.x * 30.0, y * 80.0));

  return clamp(lum, 0.0, 1.0);
}

void main() {
  vec2 frag = gl_FragCoord.xy;
  vec2 cell = floor(frag / uCell);
  vec2 uv = (cell + 0.5) * uCell / uRes;
  float ink = 1.0 - scene(uv);
  float idx = floor(clamp(ink, 0.0, 0.999) * uGlyphs);
  vec2 local = fract(frag / uCell);
  float a = texture2D(uAtlas, vec2((idx + local.x) / uGlyphs, 1.0 - local.y)).r;
  gl_FragColor = vec4(mix(uPaper, uInk, a), 1.0);
}
`;

const bound = new WeakSet<HTMLElement>();

function compile(gl: WebGLRenderingContext, type: number, source: string): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  return gl.getShaderParameter(shader, gl.COMPILE_STATUS) ? shader : null;
}

function atlas(cell: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = cell * RAMP.length;
  canvas.height = cell;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#fff';
  ctx.font = `${Math.round(cell * 1.05)}px ui-monospace, Menlo, Consolas, monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  [...RAMP].forEach((glyph, i) => ctx.fillText(glyph, (i + 0.5) * cell, cell * 0.55));
  return canvas;
}

function showFallback(root: HTMLElement, canvas: HTMLCanvasElement) {
  canvas.remove();
  root.querySelector<HTMLElement>('[data-ascii-fallback]')?.removeAttribute('hidden');
}

export function initAsciiHero() {
  const root = document.querySelector<HTMLElement>('[data-ascii-hero]');
  if (!root || bound.has(root)) return;
  bound.add(root);
  const canvas = root.querySelector('canvas');
  if (!canvas) return;
  const gl = canvas.getContext('webgl', { antialias: false, alpha: false });
  const vs = gl && compile(gl, gl.VERTEX_SHADER, VERTEX);
  const fs = gl && compile(gl, gl.FRAGMENT_SHADER, FRAGMENT);
  const program = gl?.createProgram();
  if (!gl || !vs || !fs || !program) return showFallback(root, canvas);
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return showFallback(root, canvas);
  gl.useProgram(program);

  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const aPos = gl.getAttribLocation(program, 'aPos');
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

  const u = (name: string) => gl.getUniformLocation(program, name);
  const uRes = u('uRes'), uTime = u('uTime'), uMouse = u('uMouse'), uCell = u('uCell');
  gl.uniform1f(u('uGlyphs'), RAMP.length);
  gl.uniform3fv(u('uInk'), INK);
  gl.uniform3fv(u('uPaper'), PAPER);
  gl.uniform1i(u('uAtlas'), 0);
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  let cell = 0;
  const resize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(canvas.clientWidth * dpr));
    canvas.height = Math.max(1, Math.round(canvas.clientHeight * dpr));
    gl.viewport(0, 0, canvas.width, canvas.height);
    const next = Math.round(CELL_CSS_PX * dpr);
    if (next !== cell) {
      cell = next;
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, atlas(cell));
    }
    gl.uniform2f(uRes, canvas.width, canvas.height);
    gl.uniform1f(uCell, cell);
  };

  const mouse = { x: 0.6, y: 0.7 };
  const target = { x: 0.6, y: 0.7 };
  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const start = performance.now();
  const draw = () => {
    mouse.x += (target.x - mouse.x) * 0.08;
    mouse.y += (target.y - mouse.y) * 0.08;
    gl.uniform1f(uTime, still ? 0 : (performance.now() - start) / 1000);
    gl.uniform2f(uMouse, mouse.x, mouse.y);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };

  let visible = true;
  let frame = 0;
  const loop = () => {
    frame = 0;
    if (!canvas.isConnected) return; // replaced by a live-preview swap
    draw();
    if (visible && !document.hidden) frame = requestAnimationFrame(loop);
  };
  const kick = () => {
    if (!frame && !still) frame = requestAnimationFrame(loop);
  };

  root.addEventListener('pointermove', (event) => {
    const rect = canvas.getBoundingClientRect();
    target.x = (event.clientX - rect.left) / rect.width;
    target.y = 1 - (event.clientY - rect.top) / rect.height;
    if (still) {
      mouse.x = target.x;
      mouse.y = target.y;
      draw();
    }
  });
  new ResizeObserver(() => {
    resize();
    draw();
  }).observe(canvas);
  new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (visible) kick();
  }).observe(canvas);
  document.addEventListener('visibilitychange', kick);

  resize();
  draw();
  kick();
}
