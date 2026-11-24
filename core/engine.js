/* core/engine.js — the typing stage (product name comes from the shell;
   this module renders no branding of its own).
   One unified stage for every context (exam mocks, custom tests, drills,
   warm-ups, revision), launched via openStage(config):
     { examId, mode: 'mock'|'custom'|'drill'|'warmup'|'revision', title,
       text, durationMin, backspaceDefault, testId, onDone }
   Renders into #view, scores via core/scoring.js, stores via core/store.js,
   then calls config.onDone(entry).

   Settled behaviours implemented here (do not re-litigate):
   proportional sheet glide with manual-scroll hold · box follow with
   caret-reveal protection · free cursor + full arrow maths in BOTH views ·
   NO input cap (anti-flood ceiling = target + 400) · paste blocked ·
   fixed timer pill for exam modes, no mid-test stats there · text size
   S/M/L/XL everywhere from ONE persisted key · per-stage backspace session
   toggle (RRB-family lock mirrors the real CBTST: editing/navigation keys
   blocked while backspace is off) · Zen Focus · print-the-passage ·
   restart resets everything. */

import {
  scoreHcm, scoreExam, cycleTarget, displayFlags, scoreWordsEx,
  hcmMarksFor, hcmBandLabel, wordTokens,
} from "./scoring.js";
import * as store from "./store.js";
import { specOf } from "../data/examSpecs.js";

const FONT_PX = [17, 19, 21, 23];
const FONT_NAMES = ["S", "M", "L", "XL"];
const CEILING_EXTRA = 400;

let styleInjected = false;
function injectStyle() {
  if (styleInjected) return;
  styleInjected = true;
  const s = document.createElement("style");
  s.id = "ts-engine-style";
  s.textContent = ENGINE_CSS;
  document.head.appendChild(s);
}

const ENGINE_CSS = `
.ts-stage{--ts-fs:19px;--ts-lh:1.85;max-width:1060px;margin:0 auto;padding:18px 20px 64px;color:var(--ink,#E8E6DF);font-family:var(--font-ui,system-ui,-apple-system,"Segoe UI",sans-serif)}
.ts-stage *{box-sizing:border-box}
.ts-stage.ts-exam-live{margin-top:52px}
.ts-bar{position:relative;display:flex;align-items:center;gap:6px;flex-wrap:wrap;padding:8px 0 10px;border-bottom:1px solid var(--line,#2A2C33)}
.ts-bar .ts-title{font-family:var(--font-display,system-ui,sans-serif);font-size:15px;font-weight:700;letter-spacing:.01em;margin-right:auto;min-width:80px;max-width:190px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ts-btn{appearance:none;border:1px solid var(--line-strong,var(--line,#2A2C33));background:var(--surface,#15171C);color:var(--ink,#E8E6DF);border-radius:999px;padding:6px 11px;font:inherit;font-size:12.5px;cursor:pointer;line-height:1.2;transition:border-color .16s ease,background-color .16s ease,color .16s ease,transform .16s ease}
.ts-btn:hover{border-color:var(--accent,#F59E0B)}
.ts-btn:active{transform:scale(.97)}
.ts-btn:focus-visible,.ts-pill-btn:focus-visible{outline:2px solid var(--accent,#F59E0B);outline-offset:2px}
.ts-btn.on{background:var(--accent,#F59E0B);color:var(--accent-ink,#141414);border-color:var(--accent,#F59E0B);font-weight:600}
.ts-btn.primary{background:var(--accent,#F59E0B);color:var(--accent-ink,#141414);border-color:var(--accent,#F59E0B);font-weight:700;padding:7px 16px}
.ts-btn:disabled{opacity:.45;cursor:default}
.ts-group{display:inline-flex;border:1px solid var(--line-strong,var(--line,#2A2C33));border-radius:999px;overflow:hidden}
.ts-group .ts-btn{border:0;border-radius:0;padding:6px 9px}
.ts-group .ts-btn + .ts-btn{border-left:1px solid var(--line-strong,var(--line,#2A2C33))}
.ts-bar-label{font-size:10.5px;letter-spacing:.07em;text-transform:uppercase;color:var(--muted,#9A978C);margin:0 1px 0 4px}
.ts-pop{position:absolute;top:calc(100% + 6px);right:0;z-index:60;background:var(--surface,#15171C);border:1px solid var(--line,#2A2C33);border-radius:14px;box-shadow:0 14px 40px rgba(0,0,0,.35);padding:12px 14px;min-width:230px}
.ts-pop[hidden]{display:none}
.ts-pop label{display:flex;align-items:center;justify-content:space-between;gap:14px;font-size:13.5px;padding:5px 0;cursor:pointer}
.ts-hint{min-height:20px;font-size:13px;color:var(--muted,#9A978C);padding:8px 2px 0}
.ts-hint:empty{display:none}
.ts-prac{display:flex;align-items:baseline;gap:22px;flex-wrap:wrap;padding:12px 2px 2px}
.ts-readout{display:flex;flex-direction:column}
.ts-readout .v{font-size:24px;font-weight:650;font-variant-numeric:tabular-nums;line-height:1.05}
.ts-readout .l{font-size:10.5px;letter-spacing:.09em;text-transform:uppercase;color:var(--muted,#9A978C)}
.ts-prog{height:3px;background:var(--line,#2A2C33);border-radius:2px;margin-top:10px;overflow:hidden}
.ts-prog i{display:block;height:100%;width:0;background:var(--accent,#F59E0B);transition:width .25s ease}
.ts-typebox{position:relative;margin-top:14px;border:1px solid var(--line-strong,var(--line,#2A2C33));border-radius:16px;background:var(--surface,#15171C);padding:22px 24px;max-height:342px;overflow-y:auto;overflow-anchor:none;overscroll-behavior:contain;cursor:text}
.ts-typebox.focused{border-color:color-mix(in srgb,var(--accent,#F59E0B) 48%,var(--line-strong,var(--line,#2A2C33)))}
.ts-typetext{font-size:var(--ts-fs);line-height:var(--ts-lh);white-space:pre-wrap;word-break:break-word;position:relative;z-index:1}
.ts-typetext .ch{border-radius:3px}
.ts-typetext .ch.ok{color:var(--ok,#4ADE80)}
.ts-typetext .ch.bad{color:var(--error,#F87171);background:color-mix(in srgb,var(--error,#F87171) 13%,transparent)}
.ts-caret{position:absolute;width:2px;background:var(--accent,#F59E0B);border-radius:1px;z-index:2;pointer-events:none;opacity:0;transition:left 55ms ease-out,top 55ms ease-out}
.ts-caret.on{opacity:1;animation:tsblink 1.1s ease-in-out infinite}
@keyframes tsblink{0%,38%{opacity:1}72%{opacity:.12}100%{opacity:1}}
.ts-capture{position:absolute;inset:0;width:100%;height:100%;opacity:0;resize:none;border:0;outline:none!important;box-shadow:none!important;padding:22px 24px;font-size:var(--ts-fs);line-height:var(--ts-lh);white-space:pre-wrap;word-break:break-word;overflow:hidden;background:transparent;color:transparent;caret-color:transparent;z-index:3}
.ts-paper-head{display:flex;align-items:center;gap:10px;margin-top:16px}
.ts-paper-head .cap{font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted,#9A978C)}
.ts-sheet{margin-top:8px;background:var(--sheet-bg,#FFFCF4);color:var(--sheet-ink,#191B1F);border:1px solid var(--line,#2A2C33);border-radius:8px;padding:24px 28px 30px;max-height:238px;overflow-y:auto;overscroll-behavior:contain;font-family:var(--font-sheet,"Newsreader",Georgia,serif);font-size:var(--ts-fs);line-height:var(--ts-lh);white-space:pre-wrap;word-break:break-word;box-shadow:0 2px 12px rgba(0,0,0,.14)}
.ts-paperbox{position:relative;margin-top:12px;border:1px solid var(--line-strong,var(--line,#2A2C33));border-radius:16px;background:var(--surface,#15171C);padding:20px 24px;height:240px;overflow-y:auto;overflow-anchor:none;overscroll-behavior:contain;cursor:text}
.ts-paperbox.focused{border-color:color-mix(in srgb,var(--accent,#F59E0B) 48%,var(--line-strong,var(--line,#2A2C33)))}
.ts-paper-typed{font-size:var(--ts-fs);line-height:var(--ts-lh);white-space:pre-wrap;word-break:break-word;position:relative;z-index:1;min-height:calc(var(--ts-fs)*var(--ts-lh))}
.ts-paper-typed .ph{color:var(--muted,#9A978C)}
.ts-ptcaret{display:inline;position:relative}
.ts-ptcaret::after{content:"\\200B"}
.ts-ptcaret::before{content:"";position:absolute;left:-1px;top:-0.04em;bottom:-0.04em;width:2px;background:var(--accent,#F59E0B);border-radius:1px;animation:tsblink 1.1s ease-in-out infinite}
.ts-paperbox .ts-capture,.ts-typebox .ts-capture{padding:20px 24px}
.ts-typebox .ts-capture{padding:22px 24px}
.ts-prepanel{margin-top:16px;border:1px solid var(--line,#2A2C33);border-radius:16px;background:var(--surface,#15171C);padding:22px 24px}
.ts-prepanel h2{margin:0 0 6px;font-family:var(--font-display,"Space Grotesk",system-ui,sans-serif);font-size:20px}
.ts-prepanel p{color:var(--muted,#9A978C);margin:4px 0;font-size:14px}
.ts-cats{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0}
.ts-timer-pill{position:fixed;top:calc(var(--header-h,56px) + 8px);left:50%;transform:translateX(-50%);z-index:130;background:var(--surface,#15171C);color:var(--ink,#E8E6DF);border:1px solid var(--line,#2A2C33);border-radius:999px;box-shadow:0 10px 30px rgba(0,0,0,.35);padding:8px 20px 11px;text-align:center;pointer-events:none;min-width:172px;font-family:var(--font-ui,system-ui,sans-serif)}
.ts-timer-pill .tp-label{display:block;font-size:9.5px;letter-spacing:.14em;text-transform:uppercase;color:var(--muted,#9A978C)}
.ts-timer-pill .tp-time{display:block;font-size:24px;font-weight:700;font-variant-numeric:tabular-nums;line-height:1.12}
.ts-timer-pill .tp-track{display:block;height:3px;border-radius:2px;background:var(--line,#2A2C33);margin-top:5px;overflow:hidden}
.ts-timer-pill .tp-fill{display:block;height:100%;background:var(--accent,#F59E0B);width:100%}
.ts-timer-pill.danger .tp-time{color:var(--error,#F87171)}
.ts-timer-pill.danger .tp-fill{background:var(--error,#F87171)}
body.ts-zen header,body.ts-zen nav{opacity:.06;transition:opacity .3s ease}
header,nav{transition:opacity .3s ease}
.ts-result{margin-top:20px;animation:ts-rise .35s cubic-bezier(.22,.9,.3,1) both}
@keyframes ts-rise{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}
@keyframes ts-stamp-in{0%{opacity:0;transform:scale(1.35) rotate(-6deg)}65%{opacity:1;transform:scale(.96) rotate(-2deg)}100%{opacity:1;transform:scale(1) rotate(-2deg)}}
@keyframes ts-spark{0%{opacity:0;transform:translateY(10px) scale(.6)}35%{opacity:1}100%{opacity:0;transform:translateY(-28px) scale(1.15)}}
.ts-verdict-hero{position:relative;overflow:hidden;border:1px solid var(--line-strong,var(--line,#2A2C33));border-radius:20px;padding:24px 26px;background:var(--surface,#15171C);display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:16px 24px}
.ts-verdict-hero.pass{border-color:color-mix(in srgb,var(--ok,#3ddc97) 55%,var(--line));background:radial-gradient(600px 260px at 10% 0%,color-mix(in srgb,var(--ok,#3ddc97) 18%,transparent),transparent 70%),var(--surface,#15171C)}
.ts-verdict-hero.fail{border-color:color-mix(in srgb,var(--error,#ff6b7a) 45%,var(--line));background:radial-gradient(600px 260px at 10% 0%,color-mix(in srgb,var(--error,#ff6b7a) 13%,transparent),transparent 70%),var(--surface,#15171C)}
.ts-verdict-hero.prac{border-color:color-mix(in srgb,var(--accent,#ffb020) 45%,var(--line));background:radial-gradient(600px 260px at 10% 0%,color-mix(in srgb,var(--accent,#ffb020) 15%,transparent),transparent 70%),var(--surface,#15171C)}
.ts-vh-main{display:grid;gap:8px;min-width:220px;flex:1}
.ts-vh-badges{display:flex;flex-wrap:wrap;align-items:center;gap:10px}
.ts-stamp{display:inline-flex;align-items:center;gap:7px;font-family:var(--font-display,system-ui,sans-serif);font-size:17px;font-weight:800;letter-spacing:.09em;text-transform:uppercase;border:2.5px solid currentColor;outline:1.5px solid currentColor;outline-offset:2px;border-radius:4px;padding:6px 13px;transform:rotate(-2deg);white-space:nowrap;animation:ts-stamp-in .45s cubic-bezier(.22,.9,.3,1) both}
.ts-stamp.good{color:var(--ok,#3ddc97)}
.ts-stamp.bad{color:var(--error,#ff6b7a)}
.ts-stamp.prac{color:var(--accent,#ffb020)}
.ts-best-pill{display:inline-flex;align-items:center;gap:5px;padding:4px 10px;border-radius:999px;background:var(--accent-dim,rgba(255,176,32,.15));color:var(--accent,#ffb020);font-size:12px;font-weight:700;letter-spacing:.04em;text-transform:uppercase}
.ts-vh-sub{margin:0;font-size:15.5px;font-weight:550;color:var(--ink,#f1f2fb);max-width:56ch}
.ts-vh-meta{margin:0;font-size:13px;color:var(--muted,#a5a9c9)}
.ts-confetti{position:absolute;inset:0;pointer-events:none;overflow:hidden}
.ts-confetti i{position:absolute;width:7px;height:7px;border-radius:2px;opacity:0;animation:ts-spark 1.8s ease-out var(--d,0s) 1 both}
.ts-hero-row{display:grid;grid-template-columns:1.25fr 1fr;gap:14px;margin-top:14px}
.ts-kpi-card{border:1px solid var(--line,#2A2C33);border-radius:16px;background:var(--surface,#15171C);padding:20px 22px;display:flex;align-items:center;justify-content:space-between;gap:16px}
.ts-kpi-big{font-family:var(--font-display,system-ui,sans-serif);font-size:clamp(2.3rem,5vw,3.1rem);font-weight:800;line-height:1;letter-spacing:-0.03em;font-variant-numeric:tabular-nums}
.ts-kpi-unit{font-size:.38em;font-weight:600;color:var(--muted,#9A978C);margin-left:4px;letter-spacing:.04em}
.ts-kpi-lbl{font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted,#9A978C);font-weight:700;margin-bottom:4px}
.ts-kpi-note{font-size:13px;color:var(--muted,#9A978C);margin-top:6px}
.ts-acc-ring{width:76px;height:76px;flex:none;transform:rotate(-90deg)}
.ts-acc-ring .bg{fill:none;stroke:var(--line,#2A2C33);stroke-width:7}
.ts-acc-ring .fg{fill:none;stroke:var(--ok,#3ddc97);stroke-width:7;stroke-linecap:round;transition:stroke-dashoffset .7s ease}
.ts-acc-ring.warn .fg{stroke:var(--accent,#ffb020)}
.ts-acc-ring.bad .fg{stroke:var(--error,#ff6b7a)}
.ts-tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:1px;background:var(--line,#2A2C33);border:1px solid var(--line,#2A2C33);border-radius:14px;overflow:hidden;margin-top:14px}
.ts-tile{background:var(--surface,#15171C);padding:14px 16px}
.ts-tile .v{font-family:var(--font-display,system-ui,sans-serif);font-size:23px;font-weight:700;font-variant-numeric:tabular-nums}
.ts-tile .l{font-size:10.5px;letter-spacing:.09em;text-transform:uppercase;color:var(--muted,#9A978C);margin-top:3px}
.ts-card{border:1px solid var(--line,#2A2C33);border-radius:14px;background:var(--surface,#15171C);padding:16px 18px;margin-top:14px;overflow-x:auto}
.ts-card h3{margin:0 0 10px;font-size:15px;font-family:var(--font-display,system-ui,sans-serif)}
.ts-card table{border-collapse:collapse;width:100%;font-size:13.5px}
.ts-card td,.ts-card th{padding:7px 8px;border-bottom:1px solid var(--line,#2A2C33);text-align:left;vertical-align:top}
.ts-card tr:last-child td{border-bottom:0}
.ts-card ol{margin:8px 0 0;padding-left:20px;font-size:13.5px;line-height:1.7;color:var(--muted,#9A978C)}
.ts-card .mono{font-variant-numeric:tabular-nums}
.ts-err-bars{display:grid;gap:10px}
.ts-eb-row{display:grid;grid-template-columns:130px 1fr 36px;align-items:center;gap:10px;font-size:13px}
.ts-eb-track{height:8px;border-radius:999px;background:var(--line,#2A2C33);overflow:hidden}
.ts-eb-fill{display:block;height:100%;border-radius:999px;background:var(--error,#ff6b7a)}
.ts-eb-num{text-align:right;font-weight:700;font-variant-numeric:tabular-nums}
.ts-pill-tag{display:inline-block;padding:2px 8px;border-radius:999px;font-size:11.5px;font-weight:650;border:1px solid var(--line-strong,var(--line,#2A2C33));color:var(--muted,#9A978C)}
.ts-pill-tag.ok{color:var(--ok,#3ddc97);border-color:color-mix(in srgb,var(--ok,#3ddc97) 45%,var(--line))}
.ts-pill-tag.bad{color:var(--error,#ff6b7a);border-color:color-mix(in srgb,var(--error,#ff6b7a) 45%,var(--line))}
.ts-calc-details summary{cursor:pointer;list-style:none;font-family:var(--font-display,system-ui,sans-serif);font-size:14px;font-weight:600;display:flex;align-items:center;justify-content:space-between;color:var(--ink,#E8E6DF)}
.ts-calc-details summary::-webkit-details-marker{display:none}
.ts-calc-details summary::after{content:"+";color:var(--accent,#ffb020);font-size:18px;font-weight:700}
.ts-calc-details[open] summary::after{content:"−"}
.ts-weak-chips{display:flex;flex-wrap:wrap;gap:7px;margin-top:6px}
.ts-wchip{padding:4px 10px;border-radius:999px;border:1px solid var(--line-strong,var(--line,#2A2C33));background:var(--bg-raise,#12142a);font-size:12.5px}
.ts-wchip b{color:var(--error,#ff6b7a);margin-left:4px;font-variant-numeric:tabular-nums}
.ts-actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:18px}
.ts-actions a.ts-btn{text-decoration:none;display:inline-flex;align-items:center;gap:6px}
.ts-actions button.ts-btn{display:inline-flex;align-items:center;gap:6px}
@media (max-width:680px){.ts-hero-row{grid-template-columns:1fr}.ts-verdict-hero{padding:18px 18px}}
@media (max-width:560px){.ts-stage{padding:14px 12px 56px}.ts-typebox{padding:18px 16px}.ts-sheet{padding:18px 18px 26px}.ts-capture{padding:18px 16px}.ts-eb-row{grid-template-columns:104px 1fr 28px}}
@media (prefers-reduced-motion: reduce){.ts-caret{transition:none}.ts-caret.on,.ts-ptcaret::before{animation:none}.ts-prog i,.ts-acc-ring .fg{transition:none}.ts-result,.ts-stamp,.ts-confetti i{animation:none;display:none}}
.ts-printarea{display:none}
@media print{body>*{display:none!important}body>.ts-printarea{display:block!important;color:#000;background:#fff;font-family:Georgia,serif;font-size:14pt;line-height:1.7;padding:24px;white-space:pre-wrap}}
`;

function esc(s) {
  return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function fmtTime(s) {
  s = Math.max(0, Math.ceil(s));
  return Math.floor(s / 60) + ":" + ("0" + (s % 60)).slice(-2);
}
function h(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

/* Module-level current stage so a new openStage() cleans up the old one. */
let current = null;

export function openStage(config) {
  injectStyle();
  if (current) { current.destroy(); current = null; }
  const view = document.getElementById("view") || document.body;
  const st = new Stage(view, config || {});
  current = st;
  st.mount();
  return st;
}

class Stage {
  constructor(view, cfg) {
    this.view = view;
    this.cfg = cfg;
    this.examId = cfg.examId || "hcm";
    this.mode = cfg.mode || "mock";
    this.isExam = this.mode === "mock" || this.mode === "custom";
    this.spec = specOf(this.examId) || null;
    /* Scoring family: chsl/cgl → E1, rrb → E2, everything else → HCM family. */
    this.family = (this.examId === "chsl" || this.examId === "cgl") ? "e1"
      : this.examId === "rrb" ? "e2" : "hcm";
    this.title = cfg.title || (this.spec ? this.spec.short + " Mock" : "Typing test");
    this.baseText = String(cfg.text || "");
    this.durationMin = typeof cfg.durationMin === "number" && cfg.durationMin > 0
      ? cfg.durationMin
      : (this.isExam && this.spec ? this.spec.durationMin : 5);
    this.testId = cfg.testId || "";
    this.onDone = typeof cfg.onDone === "function" ? cfg.onDone : null;

    /* session state */
    this.typed = "";
    this.caret = 0;
    this.caretAffinity = "down"; /* at a wrap boundary: "up" = the caret belongs to the line above (native End behaviour) */
    this.started = false;
    this.startT = 0;
    this.finished = false;
    this.bsCount = 0;
    this.paperView = false;
    this.backspaceOn = cfg.backspaceDefault != null ? !!cfg.backspaceDefault
      : (this.spec ? !!this.spec.backspace : true);
    this.category = this.spec && this.spec.categories ? this.spec.categories[0].id : "";
    this.fontStep = store.fontStep();
    this.liveErrors = store.setting("errHl") !== false;
    this.zenArmed = true;      /* Zen re-engages on the next keystroke after a reveal */
    this.timer = null;
    this.destroyed = false;
    this.lastInputAt = 0;
    this.paperHold = false;
    this.paperProgScroll = false;
    this.spanCls = [];         /* screen-view span class cache */
    this.builtTarget = null;   /* target string the spans were built for */
    this.boundHandlers = [];
  }

  /* The effective target: RRB cycles the passage; others are fixed. */
  target() {
    if (this.family === "e2") return cycleTarget(this.baseText, this.typed.length);
    return this.baseText;
  }

  on(el, ev, fn, opts) {
    el.addEventListener(ev, fn, opts);
    this.boundHandlers.push([el, ev, fn, opts]);
  }

  mount() {
    const v = this.view;
    this.on(window, "ts:leave-stage", () => this.handleLeaveStage());
    v.innerHTML = "";
    const root = h("div", "ts-stage" + (this.isExam ? " ts-exam-live" : ""));
    root.style.setProperty("--ts-fs", FONT_PX[this.fontStep] + "px");
    this.root = root;
    v.appendChild(root);

    this.buildBar(root);
    if (this.family === "e1" || this.family === "e2") this.buildPrePanel(root);
    this.buildStageBody(root);
    if (this.isExam) this.mountPill();
    this.applyFont();
    this.renderAll(true);
    /* Land at the top of the stage. The router does not reset scroll for
       stage routes, so the hub's scroll position carries over and can
       leave the command bar tucked under the fixed header (at 390px the
       Paper View toggle's centre sat inside the header's box and clicks
       never reached it). Instant, not smooth: entry geometry must be
       final immediately. */
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
    if (this.prePanel) {
      this.stageBody.style.display = "none";
    } else {
      this.focusCapture();
    }
  }

  buildBar(root) {
    const bar = h("div", "ts-bar");
    bar.id = "tsBar";
    this.bar = bar;
    const back = h("button", "ts-btn", "← Back");
    back.type = "button";
    back.addEventListener("click", () => this.leave());
    bar.appendChild(back);
    const titleEl = h("span", "ts-title", this.title);
    titleEl.title = this.title;
    bar.appendChild(titleEl);

    /* view toggle */
    const vg = h("span", "ts-group");
    this.viewScreenBtn = h("button", "ts-btn on", "Passage");
    this.viewPaperBtn = h("button", "ts-btn", "Paper View");
    this.viewScreenBtn.type = this.viewPaperBtn.type = "button";
    this.viewScreenBtn.addEventListener("click", () => this.setPaperView(false));
    this.viewPaperBtn.addEventListener("click", () => this.setPaperView(true));
    vg.appendChild(this.viewScreenBtn); vg.appendChild(this.viewPaperBtn);
    bar.appendChild(vg);

    /* text size — one control, every context */
    bar.appendChild(h("span", "ts-bar-label", "Text size"));
    const fg = h("span", "ts-group ts-fonts");
    this.fontBtns = FONT_NAMES.map((nm, i) => {
      const b = h("button", "ts-btn" + (i === this.fontStep ? " on" : ""), nm);
      b.type = "button";
      b.dataset.act = "pfont";
      b.addEventListener("click", () => this.setFontStep(i));
      fg.appendChild(b);
      return b;
    });
    bar.appendChild(fg);

    /* backspace session toggle */
    this.bsBtn = h("button", "ts-btn", "");
    this.bsBtn.type = "button";
    this.bsBtn.addEventListener("click", () => {
      this.backspaceOn = !this.backspaceOn;
      this.paintBsBtn();
      this.focusCapture();
    });
    bar.appendChild(this.bsBtn);
    this.paintBsBtn();

    const printBtn = h("button", "ts-btn", "Print");
    printBtn.type = "button";
    printBtn.addEventListener("click", () => this.printPassage());
    bar.appendChild(printBtn);

    const restartBtn = h("button", "ts-btn", "Restart");
    restartBtn.type = "button";
    restartBtn.addEventListener("click", () => this.restart());
    bar.appendChild(restartBtn);

    /* settings popover */
    const setWrap = h("span", "");
    setWrap.style.position = "relative";
    const gear = h("button", "ts-btn", "⚙ More");
    gear.type = "button";
    const pop = h("div", "ts-pop");
    pop.hidden = true;
    const lab = h("label", "", "");
    lab.appendChild(h("span", "", "Live error colours"));
    const chk = document.createElement("input");
    chk.type = "checkbox";
    chk.checked = this.liveErrors;
    chk.addEventListener("change", () => {
      this.liveErrors = chk.checked;
      store.setting("errHl", chk.checked);
      this.spanCls = [];
      this.renderText();
    });
    lab.appendChild(chk);
    pop.appendChild(lab);
    const note = h("p", "", "Errors are always scored exactly — this only changes colours while you type.");
    note.style.cssText = "margin:6px 0 0;font-size:12px;color:var(--muted,#9A978C)";
    pop.appendChild(note);
    gear.addEventListener("click", (e) => { e.stopPropagation(); pop.hidden = !pop.hidden; });
    this.on(document, "click", (e) => { if (!pop.hidden && !setWrap.contains(e.target)) pop.hidden = true; });
    this.on(document, "keydown", (e) => { if (e.key === "Escape") pop.hidden = true; });
    setWrap.appendChild(gear); setWrap.appendChild(pop);
    bar.appendChild(setWrap);

    this.submitBtn = h("button", "ts-btn primary", this.isExam ? "Submit" : "Finish");
    this.submitBtn.type = "button";
    this.submitBtn.addEventListener("click", () => this.finish());
    bar.appendChild(this.submitBtn);

    root.appendChild(bar);
    this.hint = h("div", "ts-hint");
    root.appendChild(this.hint);
  }

  paintBsBtn() {
    this.bsBtn.textContent = "Backspace: " + (this.backspaceOn ? "On" : "Off");
    this.bsBtn.classList.toggle("on", this.backspaceOn);
  }

  buildPrePanel(root) {
    const p = h("div", "ts-prepanel");
    this.prePanel = p;
    p.appendChild(h("h2", "", this.title + " — before you start"));
    const words = this.baseText.split(/\s+/).filter(Boolean).length;
    const info = h("p", "", this.durationMin + " minutes · " + words + " words · " +
      this.baseText.length.toLocaleString("en-IN") + " keystrokes · Backspace " +
      (this.backspaceOn ? "allowed" : "DISABLED") +
      (this.spec ? " · " + this.spec.evaluation + "." : "."));
    p.appendChild(info);
    if (this.spec && this.spec.categories) {
      p.appendChild(h("p", "", "Your category — the verdict uses this error cap:"));
      const cats = h("div", "ts-cats");
      this.catBtns = this.spec.categories.map((c) => {
        const b = h("button", "ts-btn" + (c.id === this.category ? " on" : ""), c.label + " — error ≤ " + c.cap + "%");
        b.type = "button";
        b.addEventListener("click", () => {
          this.category = c.id;
          this.catBtns.forEach((x) => x.classList.toggle("on", x.dataset.cat === c.id));
        });
        b.dataset.cat = c.id;
        cats.appendChild(b);
        return b;
      });
      p.appendChild(cats);
    }
    const start = h("button", "ts-btn primary", "Start test");
    start.type = "button";
    start.addEventListener("click", () => {
      p.style.display = "none";
      this.stageBody.style.display = "";
      this.focusCapture();
    });
    p.appendChild(start);
    root.appendChild(p);
  }

  buildStageBody(root) {
    const body = h("div", "");
    this.stageBody = body;

    if (!this.isExam) {
      /* practice readout strip: count-up time + live net + progress */
      const pr = h("div", "ts-prac");
      const mk = (l) => { const r = h("div", "ts-readout"); r.appendChild(h("span", "v", "0")); r.appendChild(h("span", "l", l)); return r; };
      this.prTime = mk("Time"); this.prNet = mk("Net WPM"); this.prAcc = mk("Accuracy"); this.prErr = mk("Errors");
      pr.appendChild(this.prTime); pr.appendChild(this.prNet); pr.appendChild(this.prAcc); pr.appendChild(this.prErr);
      body.appendChild(pr);
      const prog = h("div", "ts-prog"); this.progFill = h("i", ""); prog.appendChild(this.progFill);
      body.appendChild(prog);
    }

    /* screen view */
    const screen = h("div", "ts-screen");
    this.screenEl = screen;
    const box = h("div", "ts-typebox");
    this.typeBox = box;
    this.typeText = h("div", "ts-typetext");
    box.appendChild(this.typeText);
    this.caretEl = h("div", "ts-caret");
    box.appendChild(this.caretEl);
    screen.appendChild(box);
    body.appendChild(screen);

    /* paper view */
    const paper = h("div", "ts-paper");
    paper.style.display = "none";
    this.paperEl = paper;
    const head = h("div", "ts-paper-head");
    head.appendChild(h("span", "cap", "Paper View — type from the sheet"));
    const pp = h("button", "ts-btn", "Print passage");
    pp.type = "button";
    pp.addEventListener("click", () => this.printPassage());
    head.appendChild(pp);
    paper.appendChild(head);
    this.sheet = h("div", "ts-sheet");
    paper.appendChild(this.sheet);
    const pbox = h("div", "ts-paperbox");
    this.paperBox = pbox;
    this.paperTyped = h("div", "ts-paper-typed");
    pbox.appendChild(this.paperTyped);
    paper.appendChild(pbox);
    body.appendChild(paper);

    /* the ONE hidden capture, re-parented into the active box */
    const cap = document.createElement("textarea");
    cap.className = "ts-capture";
    cap.id = "tsCapture";
    cap.setAttribute("autocomplete", "off");
    cap.setAttribute("autocorrect", "off");
    cap.setAttribute("autocapitalize", "off");
    cap.setAttribute("spellcheck", "false");
    cap.setAttribute("aria-label", "Typing capture — type here");
    cap.rows = 1;
    this.capture = cap;
    box.appendChild(cap);
    this.wireCapture(cap);
    this.wireBox(box, false);
    this.wireBox(pbox, true);

    root.appendChild(body);
    this.resultEl = h("div", "ts-result");
    this.resultEl.style.display = "none";
    root.appendChild(this.resultEl);
  }

  /* ---------------- capture & input ---------------- */

  focusCapture() {
    try { this.capture.focus({ preventScroll: true }); } catch (e) { this.capture.focus(); }
  }

  editingLocked() { return !this.backspaceOn; }

  wireCapture(cap) {
    this.on(cap, "paste", (e) => { e.preventDefault(); });
    this.on(cap, "input", () => this.handleInput());
    this.on(cap, "keydown", (e) => this.handleKeydown(e));
    this.on(cap, "keyup", (e) => {
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") this.syncCaretFromCapture();
    });
    this.on(cap, "select", () => this.syncCaretFromCapture());
    this.on(cap, "blur", () => {
      this.typeBox.classList.remove("focused");
      this.paperBox.classList.remove("focused");
    });
    this.on(cap, "focus", () => {
      (this.paperView ? this.paperBox : this.typeBox).classList.add("focused");
    });
  }

  wireBox(box, isPaper) {
    /* Click-to-place runs on MOUSEDOWN, not click: a native mousedown in
       the capture first sets the browser's own selection, whose 'select'
       sync re-scrolls the box — by click time the coordinates would point
       at a different character. Placing on mousedown + preventDefault
       keeps the coordinates honest and the caret ours. */
    this.on(box, "mousedown", (e) => {
      this.focusCapture();
      if (this.finished) return;
      e.preventDefault();
      this.focusCapture();
      if (this.editingLocked()) { this.setCaret(this.typed.length); return; }
      if (isPaper) {
        const idx = this.paperCaretFromPoint(e.clientX, e.clientY);
        this.caretAffinity = this._papAffinity || "down";
        this.setCaret(idx == null ? this.typed.length : idx);
      } else {
        this.setCaret(this.screenCaretFromPoint(e.clientX, e.clientY));
      }
    });
    this.on(box, "click", () => { this.focusCapture(); });
    this.on(box, "paste", (e) => { e.preventDefault(); });
    if (isPaper) {
      this.on(this.sheet, "scroll", () => { if (!this.paperProgScroll) this.paperHold = true; });
      this.on(box, "scroll", () => {
        /* caret-reveal guard: a scroll landing within 400 ms of a keystroke
           while the caret line is out of view is the browser's own reveal
           inside the capture — re-assert our follow. */
        if (performance.now() - this.lastInputAt < 400) {
          requestAnimationFrame(() => this.followPaperBox(true));
        }
      });
    }
  }

  handleInput() {
    if (this.finished || this.destroyed) return;
    this.lastInputAt = performance.now();
    let v = this.capture.value;
    const ceiling = this.target().length + CEILING_EXTRA;
    if (v.length > ceiling) {
      const cs = this.capture.selectionStart;
      v = v.slice(0, ceiling);
      this.capture.value = v;
      const nc = Math.max(0, Math.min(cs != null ? cs : v.length, v.length));
      try { this.capture.setSelectionRange(nc, nc); } catch (e) {}
    }
    if (!this.started && v.length > 0) this.startTimer();
    this.typed = v;
    const sel = this.capture.selectionStart;
    this.caret = Math.max(0, Math.min(sel != null ? sel : v.length, v.length));
    /* A caret that arrived by typing/backspacing sits just after the
       last touched char — at a wrap boundary that char is on the line
       above, so the caret's affinity is upstream. */
    this.caretAffinity = this.caret > 0 ? "up" : "down";
    this.engageZen();
    this.renderAll(false);
    /* the browser's native caret-reveal inside the capture lands after our
       render — re-assert the follow in the post-input frame (settled fix). */
    const wy = window.scrollY, wx = window.scrollX;
    requestAnimationFrame(() => {
      if (this.destroyed) return;
      if (window.scrollY !== wy || window.scrollX !== wx) window.scrollTo(wx, wy);
      if (this.paperView) this.followPaperBox(false);
      else this.followScreenBox();
    });
  }

  handleKeydown(e) {
    if (this.finished) return;
    if (e.key === "Escape") { this.revealZen(); return; }
    if (this.editingLocked()) {
      /* CBTST-style lock: no editing, no navigation, no shortcuts —
         the caret stays at the end, exactly as the audited engine did
         (golden rrb_run probes assert defaultPrevented for these keys). */
      if (e.key === "Backspace" || e.key === "Delete" || e.key.indexOf("Arrow") === 0 ||
          e.key === "Home" || e.key === "End" || e.ctrlKey || e.metaKey) {
        e.preventDefault();
      }
      return;
    }
    if (e.key === "Backspace") { this.bsCount++; return; }
    if (e.key === "PageUp" || e.key === "PageDown") { e.preventDefault(); return; }
    if (e.key === "ArrowUp" || e.key === "ArrowDown" || e.key === "Home" || e.key === "End") {
      e.preventDefault();
      const dir = e.key === "ArrowUp" ? "up" : e.key === "ArrowDown" ? "down" : e.key === "Home" ? "home" : "end";
      const nc = this.paperView ? this.paperLineCaret(dir) : this.screenLineCaret(dir);
      /* End leaves the caret at a line end with upstream affinity (it
         belongs to the line it ended); Home leaves it downstream. */
      if (dir === "end") this.caretAffinity = "up";
      else if (dir === "home") this.caretAffinity = "down";
      this.setCaret(nc);
    }
  }

  syncCaretFromCapture() {
    if (this.finished || this.editingLocked()) return;
    const cs = this.capture.selectionStart;
    if (cs == null) return;
    const c = Math.max(0, Math.min(cs, this.typed.length));
    if (c !== this.caret) { this.caret = c; this.renderText(); if (this.paperView) this.followPaperBox(false); else this.followScreenBox(); }
  }

  setCaret(c) {
    c = Math.max(0, Math.min(c, this.typed.length));
    this.caret = c;
    try { this.capture.setSelectionRange(c, c); } catch (e) {}
    this.renderText();
    if (this.paperView) this.followPaperBox(false); else this.followScreenBox();
  }

  /* Screen View click placement is measured from the spans' real rects.
     The event target cannot be trusted: the hidden capture overlays the
     spans, so elementFromPoint / e.target normally names the capture. */
  screenCaretFromPoint(x, y) {
    const kids = this.typeText.children;
    if (!kids.length) return this.typed.length;
    let best = -1, bestScore = Infinity;
    for (let i = 0; i < kids.length; i++) {
      const r = kids[i].getBoundingClientRect();
      if (!r.height) continue;
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) {
        return Math.max(0, Math.min(i + (x > r.left + r.width / 2 ? 1 : 0), this.typed.length));
      }
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      const score = Math.abs(cy - y) * 4 + Math.abs(cx - x);
      if (score < bestScore) { bestScore = score; best = i + (x > cx ? 1 : 0); }
    }
    return Math.max(0, Math.min(best < 0 ? kids.length : best, this.typed.length));
  }

  /* ---------------- line-caret maths ---------------- */

  /* Screen view: spans carry the layout (the audited scrollCursorIntoView
     companion — same row maths as the old hcmLineCaret). */
  screenLineCaret(dir) {
    const kids = this.typeText.children, total = kids.length;
    if (!total) return this.caret;
    const c = Math.max(0, Math.min(this.caret || 0, this.typed.length));
    /* Same wrap-boundary affinity as Paper View: with upstream affinity
       (after End / typing) a caret sitting exactly on a line start
       belongs to the row ABOVE — anchor on the previous span or Home
       after End sticks at the boundary. */
    let anchorIdx = Math.min(c, total - 1);
    if (this.caretAffinity === "up" && c > 0 && c < total &&
        kids[c].offsetTop !== kids[c - 1].offsetTop) anchorIdx = c - 1;
    const anchor = kids[anchorIdx];
    const aTop = anchor.offsetTop;
    const aLeft = c === anchorIdx + 1
      ? anchor.offsetLeft + anchor.offsetWidth
      : (c < total ? kids[c].offsetLeft : anchor.offsetLeft + anchor.offsetWidth);
    const rowTops = [];
    for (let i = 0; i < total; i++) { if (rowTops.indexOf(kids[i].offsetTop) < 0) rowTops.push(kids[i].offsetTop); }
    rowTops.sort((a, b) => a - b);
    if (dir === "home" || dir === "end") {
      let first = -1, last = -1;
      for (let j = 0; j < total; j++) { if (kids[j].offsetTop === aTop) { if (first < 0) first = j; last = j; } }
      if (first < 0) return c;
      return dir === "home" ? Math.min(first, this.typed.length) : Math.min(last + 1, this.typed.length);
    }
    let targetTop = null, ri;
    if (dir === "up") { for (ri = rowTops.length - 1; ri >= 0; ri--) { if (rowTops[ri] < aTop) { targetTop = rowTops[ri]; break; } } }
    else { for (ri = 0; ri < rowTops.length; ri++) { if (rowTops[ri] > aTop) { targetTop = rowTops[ri]; break; } } }
    if (targetTop == null) return c;
    let best = -1, bestD = Infinity;
    for (let k = 0; k < total; k++) {
      if (kids[k].offsetTop !== targetTop) continue;
      const d = Math.abs(kids[k].offsetLeft - aLeft);
      if (d < bestD) { bestD = d; best = k; }
    }
    if (best < 0) return c;
    const lastSpan = kids[best];
    const nc = (aLeft > lastSpan.offsetLeft + lastSpan.offsetWidth) ? best + 1 : best;
    return Math.max(0, Math.min(nc, this.typed.length));
  }

  /* Paper View: the typed text is two text nodes split by the zero-width
     caret span. Build the REAL laid-out lines first — group every
     character's Range rect by its top — then let Home/End/Up/Down operate
     on those lines. (The previous version guessed the line pitch from a
     single char's rect height, which is the font's em box, not the
     1.85 line-height pitch, so the adjacent-line scan never matched;
     and it anchored Home/End on the char AT the caret, which at a line
     end is the next line's first char.) */
  paperLineCaret(dir) {
    const before = this.paperTextNode, after = this.paperTextNodeAfter;
    const split = before ? before.length : 0;
    const total = (before ? before.length : 0) + (after ? after.length : 0);
    if (!total) return 0;
    if (dir === "left") return Math.max(0, (this.caret || 0) - 1);
    if (dir === "right") return Math.min(this.typed.length, (this.caret || 0) + 1);
    const limit = Math.min(total, this.typed.length);
    const pos = Math.max(0, Math.min(this.caret || 0, limit));
    const range = document.createRange();
    const rectAt = (p) => {
      if (p < split) { range.setStart(before, p); range.setEnd(before, p + 1); }
      else { range.setStart(after, p - split); range.setEnd(after, p - split + 1); }
      return range.getBoundingClientRect();
    };
    /* Real lines: chars arrive in reading order, so a new line starts
       when the rect top steps away from the current line's top by more
       than a fraction of the char height. Zero-height rects (a typed
       newline) borrow the previous char's rect and join its line. */
    const rects = new Array(total);
    const lines = [];
    let lastRect = null;
    for (let p = 0; p < total; p++) {
      let r = rectAt(p);
      if (!r.height) { if (lastRect) r = lastRect; else continue; }
      rects[p] = r;
      const line = lines[lines.length - 1];
      if (!line || Math.abs(r.top - line.top) > Math.max(2, r.height * 0.35)) {
        lines.push({ start: p, end: p + 1, top: r.top });
      } else {
        line.end = p + 1;
      }
      lastRect = r;
    }
    if (!lines.length) return pos;
    /* The caret's line: the line containing the char to its right (at a
       wrap boundary that char is the next line's first char, and the
       caret visually sits at that line's start); at end-of-text, the
       last char's line. */
    let lineIdx;
    if (pos >= total) lineIdx = lines.length - 1;
    else {
      lineIdx = lines.findIndex((ln) => pos >= ln.start && pos < ln.end);
      if (lineIdx < 0) lineIdx = lines.findIndex((ln) => pos < ln.start);
      if (lineIdx < 0) lineIdx = lines.length - 1;
      /* Upstream affinity (set by End, typing, or a click on a line's
         last char): a caret sitting exactly on a line start belongs to
         the line ABOVE — otherwise Home after End "sticks" at the
         boundary and vertical moves aim at the wrong line. */
      if (this.caretAffinity === "up" && lineIdx > 0 && lines[lineIdx].start === pos) lineIdx--;
    }
    const line = lines[lineIdx];
    if (dir === "home") return Math.min(line.start, limit);
    if (dir === "end") return Math.min(line.end, limit);
    const targetIdx = lineIdx + (dir === "up" ? -1 : 1);
    if (targetIdx < 0 || targetIdx >= lines.length) return pos;
    /* The caret's visual X: at its line's end it is the right edge of
       the last char of THAT line, not the left edge of the next line's
       first char. */
    const caretX = (pos === line.end && pos > 0 && rects[pos - 1])
      ? rects[pos - 1].right
      : (pos >= total ? rects[total - 1].right : (rects[pos] ? rects[pos].left : 0));
    const tl = lines[targetIdx];
    let bestPos = tl.start, bestDx = Infinity;
    for (let p = tl.start; p <= tl.end; p++) {
      const x = p === tl.end ? rects[tl.end - 1].right : (rects[p] ? rects[p].left : 0);
      const dx = Math.abs(x - caretX);
      if (dx < bestDx) { bestDx = dx; bestPos = p; }
    }
    return Math.max(0, Math.min(bestPos, limit));
  }

  /* Click-to-place measured off the typed text's own Range rects.
     (caretRangeFromPoint is unusable here: the hidden capture overlays the
     box, and Chrome returns null for points over a textarea.) */
  paperCaretFromPoint(x, y) {
    const before = this.paperTextNode, after = this.paperTextNodeAfter;
    const split = before ? before.length : 0;
    const total = split + (after ? after.length : 0);
    if (!total) return 0;
    const range = document.createRange();
    const rectAt = (pos) => {
      const p = Math.max(0, Math.min(pos, total - 1));
      if (p < split) { range.setStart(before, p); range.setEnd(before, p + 1); }
      else { range.setStart(after, p - split); range.setEnd(after, p - split + 1); }
      return range.getBoundingClientRect();
    };
    let best = -1, bestScore = Infinity;
    for (let p = 0; p < total; p++) {
      const r = rectAt(p);
      if (!r.height) continue;
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) {
        const after = x > r.left + r.width / 2;
        /* Clicking the right half of a line's LAST char puts the caret
           on the wrap boundary — it belongs to the clicked line
           (upstream), not the next one. */
        if (after && p + 1 < total) {
          const rn = rectAt(p + 1);
          this._papAffinity = (rn.height && Math.abs(rn.top - r.top) > 2) ? "up" : "down";
        } else {
          this._papAffinity = after ? "up" : "down";
        }
        return Math.max(0, Math.min(p + (after ? 1 : 0), this.typed.length));
      }
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      const score = Math.abs(cy - y) * 4 + Math.abs(cx - x);
      if (score < bestScore) { bestScore = score; best = p + (x > cx ? 1 : 0); }
    }
    this._papAffinity = "down";
    return Math.max(0, Math.min(best < 0 ? total : best, this.typed.length));
  }

  /* ---------------- scroll follows ---------------- */

  /* Screen box: caret line rests with one line of margin (audited rule). */
  followScreenBox() {
    const kids = this.typeText.children, total = kids.length;
    if (!total) return;
    const box = this.typeBox;
    const idx = Math.max(0, Math.min(this.caret, total - 1));
    const cur = kids[idx];
    if (!cur) return;
    const savedY = window.scrollY, savedX = window.scrollX;
    const boxRect = box.getBoundingClientRect();
    let curRect = cur.getBoundingClientRect();
    if ((curRect.height === 0 || curRect.width === 0) && idx > 0) {
      const prevRect = kids[idx - 1].getBoundingClientRect();
      if (prevRect.height > 0) curRect = prevRect;
    }
    let lh = parseFloat(getComputedStyle(this.typeText).lineHeight);
    if (isNaN(lh) || lh <= 0) lh = curRect.height > 0 ? curRect.height : 35;
    const borderTop = box.clientTop || 0;
    const lineTop = curRect.top - boxRect.top + box.scrollTop;
    const lineBottom = lineTop + lh;
    const viewH = box.clientHeight;
    const viewTop = box.scrollTop + borderTop, viewBottom = viewTop + viewH;
    let desired = box.scrollTop;
    if (lineBottom + lh > viewBottom) desired = lineBottom + lh - borderTop - viewH;
    if (lineTop - lh < desired + borderTop) desired = lineTop - lh - borderTop;
    const maxScroll = Math.max(0, box.scrollHeight - box.clientHeight);
    desired = Math.max(0, Math.min(desired, maxScroll));
    if (desired !== box.scrollTop) box.scrollTop = desired;
    if (window.scrollY !== savedY || window.scrollX !== savedX) window.scrollTo(savedX, savedY);
  }

  /* Paper sheet: PROPORTIONAL glide (settled) — target = progress × max,
     2px deadband, manual scroll held until the target closes within 48px. */
  syncPaperScroll() {
    if (!this.paperView) return;
    const sh = this.sheet;
    const max = sh.scrollHeight - sh.clientHeight;
    if (max <= 0) return;
    const tgt = this.target();
    const prog = tgt.length ? this.typed.length / tgt.length : 0;
    const target = Math.round(prog * max);
    if (this.paperHold) {
      if (Math.abs(sh.scrollTop - target) <= 48) this.paperHold = false;
      else return;
    }
    if (Math.abs(sh.scrollTop - target) < 2) return;
    this.paperProgScroll = true;
    sh.scrollTop = target;
    requestAnimationFrame(() => { this.paperProgScroll = false; });
  }

  /* Paper typed box: minimal follow, caret line rests one line above the
     bottom edge / below the top edge — measured off the caret span. */
  followPaperBox(fromGuard) {
    const box = this.paperBox;
    const caretEl = this.paperTyped.querySelector(".ts-ptcaret");
    if (!caretEl) return;
    const boxRect = box.getBoundingClientRect();
    const r = caretEl.getBoundingClientRect();
    if (!r.height) return;
    let lh = parseFloat(getComputedStyle(this.paperTyped).lineHeight);
    if (isNaN(lh) || lh <= 0) lh = r.height;
    const lineTop = r.top - boxRect.top + box.scrollTop;
    const lineBottom = lineTop + lh;
    const viewTop = box.scrollTop, viewBottom = viewTop + box.clientHeight;
    let desired = box.scrollTop;
    if (lineBottom + lh > viewBottom) desired = lineBottom + lh - box.clientHeight;
    if (lineTop - lh < viewTop) desired = lineTop - lh;
    const maxScroll = Math.max(0, box.scrollHeight - box.clientHeight);
    desired = Math.max(0, Math.min(desired, maxScroll));
    if (desired !== box.scrollTop) box.scrollTop = desired;
  }

  /* ---------------- rendering ---------------- */

  /* Char flags for the screen view, from the family's OWN alignment so the
     colours always agree with the score: HCM family uses the audited
     displayFlags; E1/E2 use scoreWordsEx pairs mapped onto target-word offsets. */
  charFlags() {
    const tgt = this.target(), typed = this.typed;
    if (this.family === "hcm") return displayFlags(tgt, typed);
    const sc = scoreWordsEx(tgt, typed);
    const E = wordTokens(tgt), G = wordTokens(typed);
    const flags = new Array(tgt.length).fill(null);
    for (const p of sc.pairs) {
      if (p.ei < 0) continue;
      const eTok = E[p.ei];
      if (!eTok) continue;
      const ew = eTok.w, base = eTok.s;
      if (p.gj < 0) {
        for (let k = 0; k < ew.length; k++) flags[base + k] = false;
        continue;
      }
      const gTok = G[p.gj];
      const gw = gTok ? gTok.w : "";
      if (p.kind === "ok") {
        const lim = p.gj === G.length - 1 ? Math.min(ew.length, gw.length) : ew.length;
        for (let k = 0; k < lim; k++) flags[base + k] = true;
      } else if (p.kind === "wrong" || p.kind === "half") {
        const isLast = p.gj === G.length - 1;
        const lim = isLast ? Math.min(ew.length, gw.length) : ew.length;
        for (let k = 0; k < lim; k++) flags[base + k] = (k < gw.length && gw[k] === ew[k]);
      } else if (p.kind === "spacing") {
        for (let k = 0; k < ew.length; k++) flags[base + k] = false;
      }
    }
    return flags;
  }

  renderAll(first) {
    this.renderText();
    this.renderPaper();
    this.renderStats();
    if (this.paperView) { this.syncPaperScroll(); this.followPaperBox(false); }
    else this.followScreenBox();
  }

  renderText() {
    const tgt = this.target();
    if (tgt !== this.builtTarget) this.buildSpans(tgt);
    const typed = this.typed;
    const showErr = this.liveErrors;
    const flags = (typed.length && !this.finished) ? this.charFlags() : null;
    const kids = this.typeText.children;
    for (let i = 0; i < kids.length; i++) {
      let cls = "ch";
      if (flags && flags[i] === true) cls += " ok";
      else if (flags && flags[i] === false && showErr) cls += " bad";
      else if (flags && flags[i] === false) cls += " ok";
      if (this.spanCls[i] !== cls) { kids[i].className = cls; this.spanCls[i] = cls; }
    }
    this.positionCaret();
  }

  buildSpans(tgt) {
    this.builtTarget = tgt;
    this.spanCls = [];
    const frag = document.createDocumentFragment();
    for (let i = 0; i < tgt.length; i++) {
      const s = document.createElement("span");
      s.className = "ch";
      s.textContent = tgt[i];
      frag.appendChild(s);
    }
    this.typeText.innerHTML = "";
    this.typeText.appendChild(frag);
  }

  positionCaret() {
    const kids = this.typeText.children;
    const el = this.caretEl;
    if (!kids.length || this.finished) { el.classList.remove("on"); return; }
    const box = this.typeBox;
    const boxRect = box.getBoundingClientRect();
    if (!boxRect.height) return;
    const atEnd = this.caret >= kids.length;
    let idx = atEnd ? kids.length - 1 : Math.max(0, this.caret);
    let placeAfter = atEnd;
    const sp = kids[idx];
    if (!sp) { el.classList.remove("on"); return; }
    let r = sp.getBoundingClientRect();
    if ((r.height === 0 || r.width === 0) && idx > 0) {
      const prevR = kids[idx - 1].getBoundingClientRect();
      if (prevR.height > 0) { r = prevR; placeAfter = true; }
    }
    if (!r.height) { el.classList.remove("on"); return; }
    const fs = FONT_PX[this.fontStep];
    const h = Math.round(fs * 1.32);
    const x = (placeAfter ? r.right : r.left) - boxRect.left - box.clientLeft + box.scrollLeft - 1;
    const y = (r.top - boxRect.top - box.clientTop + box.scrollTop) + ((r.height - h) / 2);
    el.style.left = Math.round(x) + "px";
    el.style.top = Math.round(y) + "px";
    el.style.height = h + "px";
    el.classList.remove("on");
    void el.offsetWidth;
    el.classList.add("on");
  }

  renderPaper() {
    const tgt = this.target();
    if (this.sheet.textContent !== tgt) this.sheet.textContent = tgt;
    const typed = this.typed;
    const pt = this.paperTyped;
    pt.innerHTML = "";
    this.paperTextNode = null;
    if (!typed.length) {
      pt.appendChild(h("span", "ts-ptcaret"));
      const ph = h("span", "ph", "Start typing — what you type appears here, under the sheet.");
      pt.appendChild(ph);
      return;
    }
    const before = document.createTextNode(typed.slice(0, this.caret));
    const caretSpan = h("span", "ts-ptcaret");
    const after = document.createTextNode(typed.slice(this.caret));
    /* keep ONE text node identity for range maths: merge via a wrapper —
       the caret span is zero-width, so concatenate offsets manually. */
    pt.appendChild(before);
    pt.appendChild(caretSpan);
    pt.appendChild(after);
    this.paperTextNode = before;
    this.paperTextNodeAfter = after;
  }

  renderStats() {
    const elapsed = this.started ? (performance.now() - this.startT) / 1000 : 0;
    /* completion hint (both families) */
    const tgt = this.baseText;
    if (!this.finished && this.typed.length >= tgt.length && tgt.length > 0 && this.family !== "e2") {
      this.hint.textContent = this.isExam
        ? "Text complete — the timer is still running. You can still correct anything; press Submit when ready."
        : "Text complete — that's the whole text. You can still correct anything; press Finish to see your result.";
    } else if (!this.finished) {
      this.hint.textContent = "";
    }
    if (this.isExam) return; /* exam contexts: NO live stats, pill only */
    /* practice: live readout from the HCM-family quick maths (display only) */
    const mins = Math.max(elapsed, 1) / 60;
    const W = Math.round(this.typed.length / 5);
    let errs = 0;
    if (this.typed.length) {
      const f = this.charFlags();
      for (let i = 0; i < f.length; i++) if (f[i] === false) errs++;
    }
    const errWords = this.typed.length ? Math.ceil(errs / 5) : 0;
    const net = Math.max(0, Math.round((W - errWords) / mins));
    const acc = this.typed.length ? Math.max(0, Math.round((W - errWords) / Math.max(W, 1) * 100)) : 100;
    this.prTime.querySelector(".v").textContent = fmtTime(elapsed);
    this.prNet.querySelector(".v").textContent = String(this.typed.length ? net : 0);
    this.prAcc.querySelector(".v").textContent = String(acc);
    this.prErr.querySelector(".v").textContent = String(errs);
    const prog = this.baseText.length ? Math.min(100, this.typed.length / this.baseText.length * 100) : 0;
    this.progFill.style.width = prog + "%";
  }

  /* ---------------- view / font / zen ---------------- */

  setPaperView(on) {
    if (this.finished) return;
    this.paperView = on;
    this.viewScreenBtn.classList.toggle("on", !on);
    this.viewPaperBtn.classList.toggle("on", on);
    this.screenEl.style.display = on ? "none" : "";
    this.paperEl.style.display = on ? "" : "none";
    const box = on ? this.paperBox : this.typeBox;
    box.appendChild(this.capture);
    this.focusCapture();
    this.renderAll(false);
    if (on) this.alignStageForPaper();
  }

  /* Keep the command bar + both panes clear of the fixed header and the
     timer pill. Measure the ACTUAL rendered geometry — header height,
     pill bottom, bar position — never constants: at phone widths the
     bar wraps to several rows and the pill is taller, so the old
     56px-header arithmetic landed the bar underneath both. Land
     instantly (the page's smooth scroll-behavior would leave the bar
     mid-flight, still overlapping, when entry checks run). */
  alignStageForPaper() {
    const bar = this.bar;
    if (!bar) return;
    const header = document.querySelector(".site-header");
    const headerBottom = header ? header.getBoundingClientRect().bottom : 0;
    const pillBottom = this.pill ? this.pill.getBoundingClientRect().bottom : 0;
    const want = Math.max(headerBottom, pillBottom) + 8;
    const r = bar.getBoundingClientRect();
    const dy = r.top - want;
    if (Math.abs(dy) > 1) {
      window.scrollTo({ top: Math.max(0, window.scrollY + dy), left: window.scrollX, behavior: "instant" });
    }
  }

  setFontStep(i) {
    this.fontStep = Math.max(0, Math.min(3, i));
    store.setFontStep(this.fontStep);
    this.applyFont();
    this.fontBtns.forEach((b, k) => b.classList.toggle("on", k === this.fontStep));
    this.spanCls = [];
    this.renderAll(false);
    /* The click took focus to the button — hand it back to the capture
       (as the other toggles do) or the next keystrokes go nowhere.
       Preserve the caret/selection across the refocus. */
    if (!this.finished && !this.destroyed) {
      const selStart = this.capture.selectionStart;
      const selEnd = this.capture.selectionEnd;
      this.focusCapture();
      if (selStart != null) {
        try { this.capture.setSelectionRange(selStart, selEnd != null ? selEnd : selStart); } catch (e) {}
      }
    }
  }

  applyFont() {
    this.root.style.setProperty("--ts-fs", FONT_PX[this.fontStep] + "px");
  }

  engageZen() {
    if (store.setting("zen") === false) return;
    if (!this.zenArmed) return;
    document.body.classList.add("ts-zen");
  }
  revealZen() {
    document.body.classList.remove("ts-zen");
    this.zenArmed = false;
  }

  /* ---------------- timer pill ---------------- */

  mountPill() {
    const pill = h("div", "ts-timer-pill");
    pill.setAttribute("role", "timer");
    pill.setAttribute("aria-label", "Time remaining");
    pill.innerHTML = '<span class="tp-label">Time remaining</span><span class="tp-time">' +
      fmtTime(this.durationMin * 60) + '</span><span class="tp-track"><span class="tp-fill"></span></span>';
    document.body.appendChild(pill);
    this.pill = pill;
    this.pillTime = pill.querySelector(".tp-time");
    this.pillFill = pill.querySelector(".tp-fill");
    this.tickPill();
  }

  tickPill() {
    if (!this.pill || this.finished) return;
    const total = this.durationMin * 60;
    const elapsed = this.started ? (performance.now() - this.startT) / 1000 : 0;
    const remain = Math.max(0, total - elapsed);
    this.pillTime.textContent = fmtTime(remain);
    this.pillFill.style.width = (total ? (remain / total) * 100 : 0) + "%";
    this.pill.classList.toggle("danger", remain <= 60 && remain > 0);
  }

  startTimer() {
    this.started = true;
    this.startT = performance.now();
    const step = () => {
      if (this.destroyed || this.finished) return;
      const elapsed = (performance.now() - this.startT) / 1000;
      if (this.isExam) {
        this.tickPill();
        if (elapsed >= this.durationMin * 60) { this.finish(); return; }
      } else {
        this.renderStats();
        if (this.mode === "warmup" && elapsed >= this.durationMin * 60) { this.finish(); return; }
      }
    };
    step();
    this.timer = setInterval(step, 200);
  }

  /* ---------------- print / restart / leave ---------------- */

  printPassage() {
    const pa = h("div", "ts-printarea");
    pa.textContent = this.baseText;
    document.body.appendChild(pa);
    const cleanup = () => { pa.remove(); window.removeEventListener("afterprint", cleanup); };
    window.addEventListener("afterprint", cleanup);
    setTimeout(cleanup, 4000);
    window.print();
  }

  restart() {
    const cfg = this.cfg;
    this.destroy();
    if (current === this) current = null;
    openStage(cfg);
  }

  handleLeaveStage() {
    if (current === this) current = null;
    this.destroy();
  }

  leave() {
    this.destroy();
    if (current === this) current = null;
    if (this.mode === "mock" && this.examId) location.hash = `#/hub/${this.examId}`;
    else if (this.mode === "drill" || this.mode === "warmup" || this.mode === "revision") location.hash = "#/studio";
    else if (this.mode === "custom") location.hash = "#/arena";
    else if (location.hash && location.hash !== "#/") location.hash = "#/";
    else this.view.innerHTML = "";
  }

  destroy() {
    this.destroyed = true;
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    if (this.pill) { this.pill.remove(); this.pill = null; }
    document.body.classList.remove("ts-zen");
    this.boundHandlers.forEach(([el, ev, fn, opts]) => { try { el.removeEventListener(ev, fn, opts); } catch (e) {} });
    this.boundHandlers = [];
  }

  /* ---------------- finish & results ---------------- */

  elapsedSec() {
    return this.started ? (performance.now() - this.startT) / 1000 : 0;
  }

  finish() {
    if (this.finished || this.destroyed) return;
    this.finished = true;
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    document.body.classList.remove("ts-zen");
    const elapsed = this.elapsedSec();
    const typed = this.typed;
    const durSec = Math.round(elapsed);
    const prevBest = this.testId ? store.bestFor(this.testId) : null;
    let entry, resultHtml;

    if (this.family === "hcm") {
      const sc = scoreHcm(this.baseText, typed, elapsed);
      entry = {
        examId: this.examId, mode: this.mode, name: this.title, testId: this.testId,
        gross: sc.grossR, net: sc.netR, acc: sc.accR, errs: sc.errs,
        marks: sc.marks, qualified: sc.qualified, durSec, min: this.durationMin,
        chars: typed.length, words: sc.words, bs: this.bsCount,
        errCat: sc.errCat, weakKeys: sc.weakKeys, weakWords: sc.weakWords,
        mistakeDetail: sc.mistakeDetail, full: sc.errs, half: 0,
        errorPct: sc.words ? +(sc.errs / sc.words * 100).toFixed(1) : 0,
        verdict: sc.qualified ? "Qualified" : "Not qualified",
      };
      this.isNewBest = entry.net > 0 && (!prevBest || entry.net > prevBest.net);
      resultHtml = this.isExam ? this.examResultHcm(sc, entry) : this.practiceResult(sc, entry);
    } else {
      const tgt = this.family === "e2" ? cycleTarget(this.baseText, typed.length) : this.baseText;
      const sc = scoreExam(this.spec, tgt, typed, elapsed, this.category);
      const catObj = this.spec && this.spec.categories
        ? this.spec.categories.find((c) => c.id === sc.category) : null;
      const verdict = (sc.qualified ? "Qualified" : "Not qualified") + " — " + sc.reason;
      entry = {
        examId: this.examId, mode: this.mode, name: this.title, testId: this.testId,
        gross: sc.grossR, net: sc.netR, acc: sc.accR, errs: sc.errs,
        marks: 0, qualified: sc.qualified, durSec, min: this.durationMin,
        chars: typed.length, words: sc.words, bs: this.bsCount,
        errCat: { spelling: 0, capital: 0, punct: 0, spacing: 0, skipped: 0, extra: 0 },
        weakKeys: {}, weakWords: {},
        mistakeDetail: sc.mistakeDetail, full: sc.full, half: sc.half,
        errorPct: sc.errorPctR, verdict,
        engine: sc.engine, category: catObj ? catObj.label : "",
        finalMistakes: sc.finalMistakes, allowance: sc.allowance,
        breakdown: sc.breakdown, completion: sc.completion,
      };
      this.isNewBest = entry.net > 0 && (!prevBest || entry.net > prevBest.net);
      resultHtml = this.examResultEx(sc, entry, verdict);
    }

    const stored = store.addResult(entry);
    if (this.pill) { this.pill.remove(); this.pill = null; }
    this.stageBody.style.display = "none";
    if (this.prePanel) this.prePanel.style.display = "none";
    this.submitBtn.disabled = true;
    this.resultEl.innerHTML = resultHtml;
    this.resultEl.style.display = "";
    const rb = this.resultEl.querySelector("[data-act='retake']");
    if (rb) rb.addEventListener("click", () => this.restart());
    window.scrollTo(0, 0);
    if (this.onDone) { try { this.onDone(stored); } catch (e) {} }
  }

  confettiHtml() {
    const spots = [
      ["8%", "22%", "#3ddc97", "0.05s"], ["18%", "70%", "#ffb020", "0.15s"],
      ["32%", "18%", "#ffc65c", "0.25s"], ["48%", "78%", "#3ddc97", "0.1s"],
      ["64%", "24%", "#ffb020", "0.2s"], ["78%", "68%", "#3ddc97", "0.3s"],
      ["90%", "30%", "#ffc65c", "0.12s"], ["26%", "55%", "#ff6b7a", "0.22s"],
    ];
    return '<div class="ts-confetti" aria-hidden="true">' + spots.map(([l, t, c, d]) =>
      '<i style="left:' + l + ";top:" + t + ";background:" + c + ";--d:" + d + '"></i>'
    ).join("") + "</div>";
  }

  heroStatsHtml(primaryVal, primaryUnit, primaryLabel, primaryNote, accPct) {
    const clamped = Math.max(0, Math.min(100, Number(accPct) || 0));
    const circ = 2 * Math.PI * 30;
    const off = circ * (1 - clamped / 100);
    const ringCls = clamped >= 95 ? "" : clamped >= 85 ? " warn" : " bad";
    return '<div class="ts-hero-row">' +
      '<div class="ts-kpi-card"><div>' +
        '<div class="ts-kpi-lbl">' + esc(primaryLabel) + "</div>" +
        '<div class="ts-kpi-big">' + esc(primaryVal) + '<span class="ts-kpi-unit">' + esc(primaryUnit) + "</span></div>" +
        (primaryNote ? '<div class="ts-kpi-note">' + esc(primaryNote) + "</div>" : "") +
      "</div></div>" +
      '<div class="ts-kpi-card"><div>' +
        '<div class="ts-kpi-lbl">Accuracy</div>' +
        '<div class="ts-kpi-big">' + esc(clamped.toFixed ? Number(accPct).toFixed(1) : accPct) + '<span class="ts-kpi-unit">%</span></div>' +
        '<div class="ts-kpi-note">' + (clamped >= 98 ? "Clean precision" : clamped >= 95 ? "Exam standard" : "Focus on accuracy") + "</div>" +
      '</div><svg class="ts-acc-ring' + ringCls + '" viewBox="0 0 76 76" aria-hidden="true">' +
        '<circle class="bg" cx="38" cy="38" r="30"/>' +
        '<circle class="fg" cx="38" cy="38" r="30" stroke-dasharray="' + circ.toFixed(1) + '" stroke-dashoffset="' + off.toFixed(1) + '"/>' +
      "</svg></div></div>";
  }

  tilesHtml(tiles) {
    return '<div class="ts-tiles">' + tiles.map(([v, l]) =>
      '<div class="ts-tile"><div class="v">' + esc(v) + '</div><div class="l">' + esc(l) + "</div></div>").join("") + "</div>";
  }

  actionsHtml(errs) {
    const backHref = this.mode === "mock" && this.examId ? "#/hub/" + esc(this.examId)
      : (this.mode === "drill" || this.mode === "warmup" || this.mode === "revision") ? "#/studio"
      : "#/arena";
    const backLabel = this.mode === "mock" ? "More Mocks" : "More Practice";
    return '<div class="ts-actions">' +
      '<button type="button" class="ts-btn primary" data-act="retake">↻ Retake</button>' +
      (errs > 0 && this.family === "hcm" ? '<a class="ts-btn" href="#/studio">⚡ Practise Weak Words</a>' : "") +
      '<a class="ts-btn" href="' + backHref + '">' + esc(backLabel) + "</a>" +
      '<a class="ts-btn" href="#/progress">Progress</a>' +
      '<a class="ts-btn" href="#/">Home</a></div>';
  }

  errBarsHtml(cats) {
    if (!cats || !cats.length) return '<p style="margin:0;color:var(--ok,#3ddc97);font-size:13.5px;font-weight:600">No errors recorded.</p>';
    const max = Math.max(1, ...cats.map(([, n]) => n));
    return '<div class="ts-err-bars">' + cats.map(([k, n]) =>
      '<div class="ts-eb-row"><span>' + esc(k) + '</span><span class="ts-eb-track"><span class="ts-eb-fill" style="width:' + Math.round((n / max) * 100) + '%"></span></span><span class="ts-eb-num">' + n + "</span></div>"
    ).join("") + "</div>";
  }

  mistakeRowsHtml(rows) {
    if (!rows || !rows.length) return '<p style="margin:0;color:var(--ok,#3ddc97);font-size:13.5px;font-weight:600">✓ Spotless run — no mistakes.</p>';
    return "<table><tr><th>Passage</th><th>You typed</th><th>Kind</th></tr>" + rows.map((r) =>
      "<tr><td>" + esc(r.exp || "—") + '</td><td style="color:var(--error,#ff6b7a)">' + esc(r.got === "" ? "(skipped)" : r.got) + '</td><td><span class="ts-pill-tag">' +
      esc(r.kind + (r.cat && r.cat !== r.kind ? " · " + r.cat : "")) + "</span></td></tr>").join("") + "</table>";
  }

  examResultHcm(sc, e) {
    const band = hcmBandLabel(e.net);
    const verdict = sc.qualified
      ? e.marks + " of 25 marks · " + band
      : "Net speed " + e.net + " WPM — 30 WPM needed to qualify";
    const cats = [["Spelling", sc.errCat.spelling], ["Capitalisation", sc.errCat.capital], ["Punctuation", sc.errCat.punct],
      ["Spacing", sc.errCat.spacing], ["Word skipped", sc.errCat.skipped], ["Extra word", sc.errCat.extra]]
      .filter(([, n]) => n > 0);
    const weakK = Object.keys(sc.weakKeys).sort((a, b) => sc.weakKeys[b] - sc.weakKeys[a]).slice(0, 6);
    const weakW = Object.keys(sc.weakWords).sort((a, b) => sc.weakWords[b] - sc.weakWords[a]).slice(0, 6);
    let html = '<div class="ts-verdict-hero ' + (sc.qualified ? "pass" : "fail") + '">' +
      (sc.qualified ? this.confettiHtml() : "") +
      '<div class="ts-vh-main">' +
        '<div class="ts-vh-badges">' +
          '<span class="ts-stamp ' + (sc.qualified ? "good" : "bad") + '">' + (sc.qualified ? "✓ QUALIFIED" : "BELOW THE BAR") + "</span>" +
          (this.isNewBest ? '<span class="ts-best-pill">★ New Personal Best</span>' : "") +
        "</div>" +
        '<p class="ts-vh-sub">' + esc(verdict) + "</p>" +
        '<p class="ts-vh-meta">' + esc(this.title) + " · " + fmtTime(e.durSec) + " used</p>" +
      "</div></div>";
    html += this.heroStatsHtml(e.net, "WPM net", "Net Speed", "Gross " + e.gross + " WPM · Target 30+ WPM", e.acc);
    html += this.tilesHtml([
      [e.marks + " / 25", "Marks"], [e.gross + "", "Gross WPM"], [e.errs + "", "Mistakes"],
      [e.words + "", "Words typed"], [e.bs + "", "Backspaces"], [fmtTime(e.durSec), "Time used"],
    ]);
    html += '<div class="ts-card"><h3>Error Breakdown</h3>' + this.errBarsHtml(cats) + "</div>";
    html += '<div class="ts-card"><h3>Mistakes</h3>' + this.mistakeRowsHtml(sc.mistakeDetail) + "</div>";
    if (weakK.length || weakW.length) {
      html += '<div class="ts-card"><h3>Weak Spots</h3>' +
        (weakK.length ? '<div class="ts-weak-chips">' + weakK.map((k) => '<span class="ts-wchip mono">' + esc(k === " " ? "Space" : k) + "<b>×" + sc.weakKeys[k] + "</b></span>").join("") + "</div>" : "") +
        (weakW.length ? '<div class="ts-weak-chips">' + weakW.map((w) => '<span class="ts-wchip">' + esc(w) + "<b>×" + sc.weakWords[w] + "</b></span>").join("") + "</div>" : "") +
      "</div>";
    }
    html += '<details class="ts-card ts-calc-details"><summary>Show exact score calculation</summary><ol>' +
      "<li>Words typed W = keystrokes ÷ 5 = " + e.chars + " ÷ 5 = <b>" + e.words + "</b></li>" +
      "<li>Gross speed = W ÷ minutes = <b>" + e.gross + " WPM</b></li>" +
      "<li>Mistakes M = <b>" + e.errs + "</b> (Delhi Police counts full mistakes only)</li>" +
      "<li>Accuracy = (W − M) ÷ W = <b>" + e.acc + "%</b></li>" +
      "<li>Net speed = (W − 10 × M) ÷ minutes = <b>" + e.net + " WPM</b> → " + esc(band) + "</li></ol></details>";
    html += this.actionsHtml(e.errs);
    return html;
  }

  examResultEx(sc, e, verdict) {
    const isE2 = sc.engine === "E2";
    const calc = isE2 ? [
      "Words typed W = keystrokes ÷ 5 = " + sc.chars + " ÷ 5 = " + sc.words,
      "Mistakes M = full " + sc.full + " + ½ × half " + sc.half + " = " + sc.weighted,
      "Free allowance = 5% of W = " + sc.allowanceR + " mistakes",
      "Counted mistakes = max(0, M − allowance) = " + sc.finalMistakesR,
      "Gross speed = W ÷ minutes = " + sc.grossR + " WPM",
      "Net speed = (W − 10 × counted) ÷ minutes = " + sc.netR + " WPM",
      sc.reason + ".",
    ] : [
      "Words typed W = keystrokes ÷ 5 = " + sc.chars + " ÷ 5 = " + sc.words,
      "Mistakes M = full " + sc.full + " + ½ × half " + sc.half + " = " + sc.weighted,
      "Error % = M ÷ W × 100 = " + sc.errorPctR + "%",
      "Gross speed = W ÷ minutes = " + sc.grossR + " WPM — for SSC the net shown is the gross speed",
      sc.reason + ".",
    ];
    let html = '<div class="ts-verdict-hero ' + (sc.qualified ? "pass" : "fail") + '">' +
      (sc.qualified ? this.confettiHtml() : "") +
      '<div class="ts-vh-main">' +
        '<div class="ts-vh-badges">' +
          '<span class="ts-stamp ' + (sc.qualified ? "good" : "bad") + '">' + (sc.qualified ? "✓ QUALIFIED" : "BELOW THE BAR") + "</span>" +
          (this.isNewBest ? '<span class="ts-best-pill">★ New Personal Best</span>' : "") +
        "</div>" +
        '<p class="ts-vh-sub">' + esc(sc.reason) + ".</p>" +
        '<p class="ts-vh-meta">' + esc(this.title) + (e.category ? " · " + esc(e.category) : "") + " · " + fmtTime(e.durSec) + " used</p>" +
      "</div></div>";
    html += this.heroStatsHtml(
      e.net,
      isE2 ? "WPM net" : "WPM",
      isE2 ? "Net Speed" : "Gross / Net Speed",
      isE2 ? "Gross " + e.gross + " WPM · Target 30+ WPM" : "Error " + e.errorPct + "% (Cap " + sc.cap + "%)",
      e.acc
    );
    html += this.tilesHtml([
      [e.gross + "", "Gross WPM"], [sc.weighted + "", "Mistakes (M)"], [e.errorPct + "%", "Error %"],
      [sc.full + " / " + sc.half, "Full / Half"], [e.words + "", "Words typed"], [fmtTime(e.durSec), "Time used"],
    ]);
    if (sc.dual) {
      html += '<div class="ts-card"><h3>Where you stand under both CGL standards</h3>' +
        sc.dual.map((row) => "<p style='margin:10px 0 4px;font-weight:600;font-size:13.5px'>" + esc(row.group) + "</p>" +
          "<table><tr><th>Category</th><th>Error cap</th><th>Your error %</th><th>Verdict</th></tr>" +
          row.cells.map((c) => "<tr><td>" + esc(c.label) + "</td><td>" + c.cap + "%</td><td class='mono'>" + e.errorPct + '%</td><td><span class="ts-pill-tag ' + (c.pass ? "ok" : "bad") + '">' +
            (c.pass ? "Qualified" : "Not qualified") + "</span></td></tr>").join("") + "</table>").join("") + "</div>";
    }
    const rows = (sc.mistakeDetail || []).map((d) => ({ exp: d.exp, got: d.got, kind: d.st, cat: "" }));
    html += '<div class="ts-card"><h3>Mistakes</h3>' + this.mistakeRowsHtml(rows) + "</div>";
    html += '<details class="ts-card ts-calc-details"><summary>Show exact score calculation</summary><ol>' +
      calc.map((c) => "<li>" + esc(c) + "</li>").join("") + "</ol></details>";
    html += this.actionsHtml(e.errs);
    return html;
  }

  practiceResult(sc, e) {
    const accChar = e.words > 0 ? (e.words - e.errs) / e.words * 100 : 100;
    const cats = [["Spelling", sc.errCat.spelling], ["Capitalisation", sc.errCat.capital], ["Punctuation", sc.errCat.punct],
      ["Spacing", sc.errCat.spacing], ["Word skipped", sc.errCat.skipped], ["Extra word", sc.errCat.extra]]
      .filter(([, n]) => n > 0);
    const top = cats.slice().sort((a, b) => b[1] - a[1])[0];
    let line;
    if (e.errs === 0) line = "Clean run — zero mistakes.";
    else if (top && top[0] === "Word skipped") line = "Focus on line turns to prevent skipped words.";
    else if (top && top[0] === "Extra word") line = "Keep eyes one word ahead to avoid extra words.";
    else if (top) line = "Top focus area: " + top[0].toLowerCase() + " (" + top[1] + ").";
    else line = "Solid practice run.";
    const mastered = this.mode === "drill" && accChar >= 98;
    const celebrate = mastered || e.errs === 0;
    const stampText = mastered ? "✓ DRILL MASTERED" : e.errs === 0 ? "✓ CLEAN RUN" : e.net + " WPM NET";
    const gateNote = this.mode === "drill"
      ? " · Character accuracy " + accChar.toFixed(1) + "% (98% to master)"
      : "";
    let html = '<div class="ts-verdict-hero ' + (celebrate ? "pass" : "prac") + '">' +
      (celebrate ? this.confettiHtml() : "") +
      '<div class="ts-vh-main">' +
        '<div class="ts-vh-badges">' +
          '<span class="ts-stamp ' + (celebrate ? "good" : "prac") + '">' + esc(stampText) + "</span>" +
          (this.isNewBest ? '<span class="ts-best-pill">★ New Personal Best</span>' : "") +
        "</div>" +
        '<p class="ts-vh-sub">' + esc(line) + esc(gateNote) + "</p>" +
        '<p class="ts-vh-meta">' + esc(this.title) + " · " + fmtTime(e.durSec) + "</p>" +
      "</div></div>";
    html += this.heroStatsHtml(e.net, "WPM net", "Net Speed", "Gross " + e.gross + " WPM", e.acc);
    html += this.tilesHtml([
      [e.gross + "", "Gross WPM"], [e.errs + "", "Mistakes"],
      [e.words + "", "Words typed"], [fmtTime(e.durSec), "Time"],
    ]);
    if (cats.length) html += '<div class="ts-card"><h3>Error Breakdown</h3>' + this.errBarsHtml(cats) + "</div>";
    html += '<div class="ts-card"><h3>Mistakes</h3>' + this.mistakeRowsHtml(sc.mistakeDetail) + "</div>";
    html += this.actionsHtml(e.errs);
    return html;
  }
}
