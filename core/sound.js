/* Riyaz — offline Web Audio keyboard sound profiles (Off / Mechanical / Typewriter).
   Lazy AudioContext creation; zero external audio files or console warnings. */

import * as store from "./store.js";

let ctx = null;
let noiseBuf = null;

function ac() {
  if (ctx) {
    if (ctx.state === "suspended") {
      try { ctx.resume().catch(() => {}); } catch (e) {}
    }
    return ctx;
  }
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return null;
  ctx = new AudioCtx();
  return ctx;
}

function getNoiseBuffer(c) {
  if (noiseBuf && noiseBuf.sampleRate === c.sampleRate) return noiseBuf;
  const len = Math.floor(c.sampleRate * 0.04);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (len * 0.25));
  noiseBuf = buf;
  return buf;
}

export function soundMode() {
  const v = store.setting("sound");
  return v === "mech" || v === "type" ? v : "off";
}

export function setSoundMode(mode) {
  const m = mode === "mech" || mode === "type" ? mode : "off";
  store.setting("sound", m);
  return m;
}

export function playKey(ok = true, isSpace = false) {
  const mode = soundMode();
  if (mode === "off") return;
  try {
    const c = ac();
    if (!c) return;
    const t = c.currentTime;

    /* Crisp click transient */
    const src = c.createBufferSource();
    src.buffer = getNoiseBuffer(c);
    const bp = c.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.setValueAtTime(mode === "type" ? (ok ? 2400 : 800) : (ok ? (isSpace ? 1150 : 1850) : 720), t);
    bp.Q.setValueAtTime(mode === "type" ? 1.8 : 2.2, t);
    const ng = c.createGain();
    ng.gain.setValueAtTime(mode === "type" ? 0.16 : 0.11, t);
    ng.gain.exponentialRampToValueAtTime(0.001, t + (mode === "type" ? 0.026 : 0.02));
    src.connect(bp);
    bp.connect(ng);
    ng.connect(c.destination);
    src.start(t);

    /* Tactile body thock */
    const osc = c.createOscillator();
    osc.type = mode === "type" ? "triangle" : "sine";
    const startHz = !ok ? 135 : isSpace ? 165 : (mode === "type" ? 440 : 280);
    osc.frequency.setValueAtTime(startHz, t);
    osc.frequency.exponentialRampToValueAtTime(65, t + 0.028);
    const g = c.createGain();
    g.gain.setValueAtTime(!ok ? 0.09 : 0.065, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.03);
    osc.connect(g);
    g.connect(c.destination);
    osc.start(t);
    osc.stop(t + 0.032);
  } catch (e) {}
}

export function playFinish(passed = true) {
  if (soundMode() === "off") return;
  try {
    const c = ac();
    if (!c) return;
    const notes = passed ? [523.25, 659.25, 783.99] : [440, 392];
    const t0 = c.currentTime;
    notes.forEach((freq, i) => {
      const osc = c.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, t0 + i * 0.08);
      const g = c.createGain();
      g.gain.setValueAtTime(0.001, t0 + i * 0.08);
      g.gain.linearRampToValueAtTime(0.055, t0 + i * 0.08 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + i * 0.08 + 0.28);
      osc.connect(g);
      g.connect(c.destination);
      osc.start(t0 + i * 0.08);
      osc.stop(t0 + i * 0.08 + 0.3);
    });
  } catch (e) {}
}
