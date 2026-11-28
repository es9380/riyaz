/* Riyaz — Home animation layer (v3.18).

   Presentation only. Every number, ring value and headline on Home is
   computed and rendered by features/home.js + core/* exactly as before;
   this module only animates how those already-rendered values arrive:
   an amber aurora + particle globe behind the hero, a word-by-word
   headline reveal, count-up readouts, a cursor spotlight on the exam
   rows, a shiny heading accent, the goal-ring draw-in and the FAQ
   accordion mechanics.

   Effects are ported from the approved animated demo
   (riyaz-demo-v2.html): the React Bits Aurora WebGL2 shader, the
   Vaultra-style particle globe, SplitText-style word rise, SpotlightCard
   tracking and ShinyText.

   Lifecycle: mountHomeAnimations(view) is called at the end of
   renderHome. Everything a mount starts (rAF loops, observers, window
   listeners) is registered in a session bag and torn down on the next
   mount; loops also self-terminate the moment their canvas leaves the
   document (route change), so nothing leaks or duplicates.
   prefers-reduced-motion: no loops, no word rise, no count-ups — the
   DOM already carries the final values. */

import { esc } from "../core/util.js";

const reducedMotion = () =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ——— Session bag: everything a mount owns, torn down together ——— */

function newSession() {
  const s = {
    alive: true,
    rafs: new Set(),
    observers: new Set(),
    listeners: [],
    counters: new Map(), // el -> stop()
    on(target, type, fn, opts) {
      target.addEventListener(type, fn, opts);
      s.listeners.push([target, type, fn, opts]);
    },
    teardown() {
      if (!s.alive) return;
      s.alive = false;
      s.rafs.forEach((id) => cancelAnimationFrame(id));
      s.rafs.clear();
      s.observers.forEach((o) => { try { o.disconnect(); } catch (e) {} });
      s.observers.clear();
      s.listeners.forEach(([t, ty, f, o]) => { try { t.removeEventListener(ty, f, o); } catch (e) {} });
      s.listeners.length = 0;
      s.counters.forEach((stop) => { try { stop(); } catch (e) {} });
      s.counters.clear();
    },
  };
  return s;
}

let session = null;

export function teardownHomeAnimations() {
  if (session) {
    session.teardown();
    session = null;
  }
}

export function mountHomeAnimations(view) {
  teardownHomeAnimations();
  const s = newSession();
  session = s;
  const reduced = reducedMotion();
  try {
    setupAurora(view, s, reduced);
    setupGlobe(view, s, reduced);
    setupHeadline(view, s, reduced);
    setupCounters(view, s, reduced);
    setupSpotlight(view, s);
    setupShiny(view);
    setupFaq(view, s);
  } catch (e) {
    /* The animation layer must never break the page it decorates. */
  }
}

/* ——— 1. Aurora hero background (React Bits Aurora, WebGL2) ——— */

const AURORA_VERT = `#version 300 es
in vec2 aPosition;
void main() {
  gl_Position = vec4(aPosition, 0.0, 1.0);
}`;

const AURORA_FRAG = `#version 300 es
precision highp float;
precision highp int;
uniform vec2 uResolution;
uniform float uTime;
uniform vec3 uStops[5];
uniform int uStopCount;
uniform float uAmplitude;
uniform float uBlend;
uniform float uHeight;
uniform float uScale;
uniform float uGlow;
uniform float uBrightness;
uniform int uLayers;
uniform float uFlip;
uniform vec3 uPointer;
uniform float uReveal;
uniform float uOpacity;
uniform float uLightMode;
out vec4 outColor;

vec3 permute(vec3 x) {
  return mod(((x * 34.0) + 1.0) * x, 289.0);
}

float snoise(vec2 v) {
  const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
  vec2 i = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod(i, 289.0);
  vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
  m = m * m;
  m = m * m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
  vec3 g;
  g.x = a0.x * x0.x + h.x * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}

float smootherstep(float edge0, float edge1, float x) {
  float t = clamp((x - edge0) / (edge1 - edge0), 0.0, 1.0);
  return t * t * t * (t * (t * 6.0 - 15.0) + 10.0);
}

vec3 oklabToLinear(vec3 c) {
  float l = c.x + 0.3963377774 * c.y + 0.2158037573 * c.z;
  float m = c.x - 0.1055613458 * c.y - 0.0638541728 * c.z;
  float s = c.x - 0.0894841775 * c.y - 1.2914855480 * c.z;
  l = l * l * l;
  m = m * m * m;
  s = s * s * s;
  return vec3(
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
  );
}

vec3 toSrgb(vec3 c) {
  c = clamp(c, 0.0, 1.0);
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}

vec3 ramp(float t) {
  float x = clamp(t, 0.0, 1.0) * float(uStopCount - 1);
  int i = int(min(floor(x), float(uStopCount - 2)));
  float f = x - float(i);
  f = f * f * (3.0 - 2.0 * f);
  vec3 lch = mix(uStops[i], uStops[i + 1], f);
  lch.x = mix(lch.x, min(lch.x, 0.7), uLightMode);
  return toSrgb(oklabToLinear(vec3(lch.x, lch.y * cos(lch.z), lch.y * sin(lch.z))));
}

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

void main() {
  vec2 frag = gl_FragCoord.xy;
  float y = 1.0 - frag.y / uResolution.y;
  y = mix(y, 1.0 - y, uFlip);
  float u = frag.x / uResolution.x;
  float X = (frag.x - uResolution.x * 0.5) / uResolution.y;
  float t = uTime;
  float reach = uPointer.z * exp(-pow((X - uPointer.x) / 0.38, 2.0));

  vec3 glow = vec3(0.0);
  float cover = 0.0;
  for (int k = 0; k < 3; k++) {
    if (k >= uLayers) break;
    float layer = float(k);
    float seed = layer * 13.7;
    float pace = t * (1.0 - layer * 0.18);
    float warp = snoise(vec2(X * 0.45 * uScale + pace * 0.02 + seed, pace * 0.05 + seed));
    float wave = snoise(vec2(X * 0.75 * uScale + warp * 0.35 - pace * 0.03 + seed, pace * 0.07 - seed)) * 0.72
      + snoise(vec2(X * 1.6 * uScale + warp * 0.5 + pace * 0.04 - seed, pace * 0.1 + seed * 0.5)) * 0.28;
    float hem = uHeight + layer * 0.07 + wave * 0.15 * uAmplitude;
    hem += reach * 0.08 * (layer < 0.5 ? 1.0 : 0.4);
    hem = mix(-0.25, hem, uReveal);

    float soft = (0.04 + uBlend * 0.16) * (1.0 + layer * 0.9);
    float rise = hem - y;
    float low = -soft - uGlow * 0.14;
    float high = 0.26 + soft * 0.6;
    float body = pow(smootherstep(low, high, rise), 1.5 + uGlow * 0.6);
    float lobes = 0.86 + 0.14 * snoise(vec2(X * 0.9 * uScale - pace * 0.025 + seed, y * 0.3 + pace * 0.04));
    float alpha = body * lobes * (layer < 0.5 ? 1.0 : 0.32 / layer);
    alpha = clamp(alpha * (1.0 + reach * 0.25 * smootherstep(0.9, 0.0, abs(y - hem))), 0.0, 1.0);

    vec3 tint = ramp(u + 0.05 * sin(pace * 0.08 + layer * 2.3) + layer * 0.1 + max(rise, 0.0) * 0.05);
    glow = 1.0 - (1.0 - glow) * (1.0 - tint * alpha);
    cover = 1.0 - (1.0 - cover) * (1.0 - alpha);
  }

  float fade = smootherstep(0.0, 0.7, uReveal) * uOpacity;
  float strength = clamp(uBrightness, 0.0, 2.0);
  glow *= fade * min(strength, 1.0);
  cover *= fade * min(strength, 1.0);
  glow = 1.0 - pow(1.0 - glow, vec3(max(strength, 1.0)));
  float dither = (hash(frag) - 0.5) / 255.0;

  if (uLightMode > 0.5) {
    vec3 tint = cover > 0.0001 ? glow / cover : vec3(0.0);
    cover *= smootherstep(0.0, 0.25, cover);
    float alpha = cover * 0.7;
    outColor = vec4(tint * alpha + dither, clamp(alpha + dither, 0.0, 1.0));
    return;
  }
  outColor = vec4(glow + dither, clamp(cover + dither, 0.0, 1.0));
}`;

function hexToOklab(hex) {
  const n = parseInt(hex.slice(1), 16);
  let r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const lin = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  r = lin(r); g = lin(g); b = lin(b);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s2 = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s2,
    1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s2,
    0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s2,
  ];
}

function setupAurora(view, s, reduced) {
  const canvas = view.querySelector(".hero-aurora");
  if (!canvas || reduced) return; /* reduced / no canvas: CSS gradient stays */
  const gl = canvas.getContext("webgl2", { alpha: true, antialias: false });
  if (!gl) return; /* WebGL2 unavailable: CSS gradient fallback stays visible */

  const sh = (type, src) => {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, src);
    gl.compileShader(shader);
    return shader;
  };
  const prog = gl.createProgram();
  gl.attachShader(prog, sh(gl.VERTEX_SHADER, AURORA_VERT));
  gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, AURORA_FRAG));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
  gl.useProgram(prog);

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, "aPosition");
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

  const U = (n) => gl.getUniformLocation(prog, n);
  const stops = ["#3a1c00", "#d97706", "#ffb020"].map(hexToOklab);
  const flat = [];
  stops.forEach((st) => flat.push(st[0], st[1], st[2]));
  while (flat.length < 15) flat.push(0, 0, 0);
  gl.uniform3fv(U("uStops"), new Float32Array(flat));
  gl.uniform1i(U("uStopCount"), 3);
  gl.uniform1f(U("uAmplitude"), 1.0);
  gl.uniform1f(U("uBlend"), 0.55);
  gl.uniform1f(U("uHeight"), 0.5);
  gl.uniform1f(U("uScale"), 1.0);
  gl.uniform1f(U("uGlow"), 0.6);
  gl.uniform1i(U("uLayers"), 1);
  gl.uniform1f(U("uFlip"), 1.0);
  gl.uniform1f(U("uOpacity"), 1.0);

  const applyTheme = () => {
    const light = document.documentElement.dataset.theme === "light";
    gl.uniform1f(U("uLightMode"), light ? 1 : 0);
    gl.uniform1f(U("uBrightness"), light ? 0.75 : 0.85);
  };
  applyTheme();
  const themeObs = new MutationObserver(applyTheme);
  themeObs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  s.observers.add(themeObs);

  const state = { px: 0.5, py: 0.5, pStr: 0, tStr: 0, visible: false, start: performance.now() };
  s.on(window, "pointermove", (e) => {
    state.px = e.clientX / window.innerWidth;
    state.py = e.clientY / window.innerHeight;
    state.tStr = 0.55;
  }, { passive: true });

  const resize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    gl.viewport(0, 0, canvas.width, canvas.height);
  };
  s.on(window, "resize", resize);
  resize();

  const hero = view.querySelector(".hero");
  if (hero) {
    const io = new IntersectionObserver((es) => { state.visible = es[0].isIntersecting; }, { threshold: 0.02 });
    io.observe(hero);
    s.observers.add(io);
  } else {
    state.visible = true;
  }

  const frame = (now) => {
    if (!s.alive) return;
    if (!canvas.isConnected) { s.teardown(); return; }
    const id = requestAnimationFrame(frame);
    s.rafs.add(id);
    if (!state.visible || document.hidden) return; /* paused: no draw calls */
    const t = (now - state.start) / 1000;
    state.pStr += (state.tStr - state.pStr) * 0.04;
    state.tStr *= 0.985;
    gl.uniform2f(U("uResolution"), canvas.width, canvas.height);
    gl.uniform1f(U("uTime"), t * 0.55);
    gl.uniform3f(U("uPointer"), state.px, 1 - state.py, state.pStr);
    gl.uniform1f(U("uReveal"), Math.min(1, t / 2.4));
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };
  const first = requestAnimationFrame(frame);
  s.rafs.add(first);
}

/* ——— 2. Particle globe (Vaultra-style, canvas 2D) ——— */

function setupGlobe(view, s, reduced) {
  const cv = view.querySelector(".hero-globe");
  if (!cv) return;
  const ctx = cv.getContext("2d");
  if (!ctx) return;

  const N = 650, pts = [];
  const GA = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < N; i++) {
    const y = 1 - (i / (N - 1)) * 2, r = Math.sqrt(1 - y * y), th = GA * i;
    pts.push([Math.cos(th) * r, y, Math.sin(th) * r]);
  }

  let W = 0, H = 0, R = 0, ang = 0, visible = false;
  function size() {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    W = cv.clientWidth; H = cv.clientHeight;
    if (!W || !H) return;
    cv.width = Math.round(W * dpr);
    cv.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    R = Math.min(W * 0.42, 340);
  }

  function draw() {
    if (!W || !H) return;
    ctx.clearRect(0, 0, W, H);
    const cx = W / 2, cy = H - R * 0.05;
    const glow = ctx.createRadialGradient(cx, cy, R * 0.2, cx, cy, R * 1.25);
    glow.addColorStop(0, "rgba(217,119,6,0)");
    glow.addColorStop(0.78, "rgba(217,119,6,.10)");
    glow.addColorStop(0.92, "rgba(255,176,32,.20)");
    glow.addColorStop(1, "rgba(255,176,32,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(cx - R * 1.3, cy - R * 1.3, R * 2.6, R * 2.6);
    const ca = Math.cos(ang), sa = Math.sin(ang);
    for (const [x, y, z] of pts) {
      const rx = x * ca + z * sa, rz = -x * sa + z * ca;
      const sx = cx + rx * R, sy = cy + y * R * 0.98;
      if (sy < -6) continue;
      const depth = (rz + 1) / 2;
      const a = 0.14 + depth * 0.55;
      ctx.beginPath();
      ctx.arc(sx, sy, 0.7 + depth * 1.15, 0, 6.2832);
      ctx.fillStyle = "rgba(255," + Math.round(168 + depth * 40) + ",64," + a.toFixed(3) + ")";
      ctx.fill();
    }
    /* thin light lines with nodes */
    ctx.strokeStyle = "rgba(241,242,251,.13)";
    ctx.lineWidth = 1;
    const lines = [[0.06, 0.16, 0.34, 0.02], [0.97, 0.10, 0.70, 0.30], [0.12, 0.34, 0.30, 0.20]];
    for (const [x1, y1, x2, y2] of lines) {
      ctx.beginPath(); ctx.moveTo(x1 * W, y1 * H); ctx.lineTo(x2 * W, y2 * H); ctx.stroke();
      ctx.beginPath(); ctx.arc(x2 * W, y2 * H, 2.2, 0, 6.2832);
      ctx.fillStyle = "rgba(255,176,32,.75)"; ctx.fill();
    }
  }

  size();
  if (reduced) { draw(); return; } /* one static frame, no loop */

  s.on(window, "resize", size);
  const hero = view.querySelector(".hero");
  if (hero) {
    const io = new IntersectionObserver((es) => { visible = es[0].isIntersecting; }, { threshold: 0.02 });
    io.observe(hero);
    s.observers.add(io);
  } else {
    visible = true;
  }

  const frame = () => {
    if (!s.alive) return;
    if (!cv.isConnected) { s.teardown(); return; }
    const id = requestAnimationFrame(frame);
    s.rafs.add(id);
    if (!visible || document.hidden) return; /* paused: no draw calls */
    ang += 0.0016;
    draw();
  };
  const first = requestAnimationFrame(frame);
  s.rafs.add(first);
}

/* ——— 3. Word-by-word headline reveal (SplitText-style) ——— */

function splitWords(el) {
  const text = el.textContent.replace(/\s+/g, " ").trim();
  if (!text) return;
  el.setAttribute("aria-label", text);
  el.classList.add("words-live");
  el.innerHTML = text.split(" ").map((w, i) =>
    `<span class="w" aria-hidden="true"><span class="wi" style="--i:${i}">${esc(w)}</span></span>`
  ).join(" ");
}

function setupHeadline(view, s, reduced) {
  const el = view.querySelector("#heroTagline");
  if (!el || reduced) return; /* reduced: the plain headline just appears */
  splitWords(el);
  /* home.js rotates the tagline by setting textContent on the same h1;
     re-split whenever a bare text node replaces our word spans. Our own
     splits leave .wi spans behind, which the observer ignores. */
  const mo = new MutationObserver(() => {
    if (!s.alive) return;
    if (el.querySelector(".wi")) return;
    splitWords(el);
  });
  mo.observe(el, { childList: true });
  s.observers.add(mo);
}

/* ——— 4 + 7. Count-up readouts and the goal-ring draw-in ——— */

function animateCounted(el, s) {
  const node = Array.from(el.childNodes).find((n) => n.nodeType === 3 && /\d/.test(n.textContent));
  if (!node) return;
  const raw = node.textContent;
  const m = raw.match(/^(\D*)(\d[\d,]*)([\s\S]*)$/);
  if (!m) return;
  const target = parseInt(m[2].replace(/,/g, ""), 10);
  if (!target) return; /* 0 is already the final value */
  const dur = 1150, t0 = performance.now();
  let rafId = null, stopped = false;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    if (rafId) cancelAnimationFrame(rafId);
    s.rafs.delete(rafId);
    s.counters.delete(el);
    /* no snap: whoever interrupted (day-peek, stepper) owns the value now */
  };
  const tick = (now) => {
    if (stopped) return;
    if (!s.alive || !el.isConnected) { stop(); return; }
    const p = Math.min(1, (now - t0) / dur);
    const e = 1 - Math.pow(1 - p, 3);
    node.textContent = m[1] + Math.round(target * e).toLocaleString("en-IN") + m[3];
    if (p < 1) {
      rafId = requestAnimationFrame(tick);
      s.rafs.add(rafId);
    } else {
      node.textContent = raw; /* land on exactly the rendered value */
      stop();
    }
  };
  s.counters.set(el, stop);
  rafId = requestAnimationFrame(tick);
  s.rafs.add(rafId);
}

function setupCounters(view, s, reduced) {
  if (reduced) return; /* final values are already in the DOM */
  const targets = [];
  ["#todayTests", "#goalNow", "#readyPct", "#ttTotal"].forEach((sel) => {
    const el = view.querySelector(sel);
    if (el) { el.dataset.anim = "count"; targets.push(el); }
  });
  view.querySelectorAll(".er-count").forEach((el) => {
    el.dataset.anim = "count";
    targets.push(el);
  });

  /* Daily-goal ring: hold it empty until it scrolls into view, then let
     the existing stroke-dashoffset transition draw it to its settled
     value. #goalNow is itself count-up-animated, so its final value is
     captured now, before any animation starts; #goalMax is never
     animated (the stepper/prefs own it), so it is read live at draw
     time and can never be stale. */
  const ringSvg = view.querySelector(".dual-goal .mini-ring");
  const ringFg = view.querySelector(".dual-goal .ring-fg");
  if (ringSvg && ringFg) {
    const C = parseFloat(ringFg.getAttribute("stroke-dasharray")) || 163.4;
    const goalNowFinal = parseInt((view.querySelector("#goalNow") || {}).textContent || "0", 10) || 0;
    ringFg.setAttribute("stroke-dashoffset", C.toFixed(1));
    ringSvg.dataset.anim = "ring";
    ringSvg._drawTarget = () => {
      const max = Math.max(1, parseInt((view.querySelector("#goalMax") || {}).textContent || "1", 10) || 1);
      ringFg.setAttribute("stroke-dashoffset", (C * (1 - Math.min(1, goalNowFinal / max))).toFixed(1));
    };
    targets.push(ringSvg);
  }

  if (!targets.length) return;
  const io = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      if (!en.isIntersecting) return;
      io.unobserve(en.target);
      if (en.target.dataset.anim === "ring") {
        if (en.target._drawTarget) en.target._drawTarget();
      } else {
        animateCounted(en.target, s);
      }
    });
  }, { threshold: 0.35 });
  targets.forEach((t) => io.observe(t));
  s.observers.add(io);

  /* The typing-time readout is shared with the day-peek bars: if the
     user starts peeking mid-count-up, the count-up must let go. */
  const tt = view.querySelector("#ttTotal");
  const bars = view.querySelector("#ttBars");
  if (tt && bars) {
    const letGo = (e) => {
      if (e.target.closest && e.target.closest(".tt-bar")) {
        const stop = s.counters.get(tt);
        if (stop) stop();
      }
    };
    s.on(bars, "pointerover", letGo, true);
    s.on(bars, "focusin", letGo, true);
  }
}

/* ——— 5. Spotlight hover on the exam rows (SpotlightCard port) ——— */

function setupSpotlight(view, s) {
  view.querySelectorAll(".exam-row").forEach((row) => {
    s.on(row, "pointermove", (e) => {
      const r = row.getBoundingClientRect();
      row.style.setProperty("--mx", ((e.clientX - r.left) / r.width * 100) + "%");
      row.style.setProperty("--my", ((e.clientY - r.top) / r.height * 100) + "%");
    });
  });
}

/* ——— 6. ShinyText on the exams heading's accent word ——— */

function setupShiny(view) {
  const h2 = view.querySelector("#examsH");
  if (!h2) return;
  if (h2.childNodes.length !== 1 || h2.firstChild.nodeType !== 3) return;
  const parts = h2.textContent.split(/(Exams)/);
  if (parts.length < 2) return;
  h2.innerHTML = parts.map((p) =>
    p === "Exams" ? `<span class="shiny-text">Exams</span>` : esc(p)
  ).join("");
}

/* ——— 8. FAQ accordion (one open at a time, measured height) ——— */

function setupFaq(view, s) {
  const items = Array.from(view.querySelectorAll(".faq-item"));
  if (!items.length) return;
  items.forEach((item) => {
    const btn = item.querySelector(".faq-q");
    const panel = item.querySelector(".faq-a");
    if (!btn || !panel) return;
    s.on(btn, "click", () => {
      const wasOpen = item.classList.contains("open");
      items.forEach((o) => {
        o.classList.remove("open");
        const p = o.querySelector(".faq-a");
        if (p) p.style.height = "0px";
        const b = o.querySelector(".faq-q");
        if (b) b.setAttribute("aria-expanded", "false");
      });
      if (!wasOpen) {
        item.classList.add("open");
        panel.style.height = panel.scrollHeight + "px";
        btn.setAttribute("aria-expanded", "true");
      }
    });
  });
  /* Keep an open panel correctly sized if the viewport changes. */
  s.on(window, "resize", () => {
    const open = view.querySelector(".faq-item.open .faq-a");
    if (open) open.style.height = open.scrollHeight + "px";
  });
}
