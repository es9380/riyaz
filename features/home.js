/* Riyaz — Home: hero with live auto-typing demo, today strip,
   next best step, exam entry points. Heavy data stays off this path:
   counts come from data/counts.js, specs from data/examSpecs.js. */

import { COUNTS } from "../data/counts.js";
import { EXAM_SPECS, specOf } from "../data/examSpecs.js";
import { examState } from "../app.js";
import * as store from "../core/store.js";
import * as stats from "../core/stats.js";
import { esc, icon } from "../core/util.js";

const CIRC = 2 * Math.PI * 26;

function ringSVG(pct, label) {
  const off = CIRC * (1 - Math.max(0, Math.min(1, pct)));
  return `<svg class="mini-ring" viewBox="0 0 62 62" role="img" aria-label="${esc(label)}">
    <circle class="ring-bg" cx="31" cy="31" r="26" fill="none" stroke-width="5"/>
    <circle class="ring-fg" cx="31" cy="31" r="26" fill="none" stroke-width="5"
      stroke-linecap="round" stroke-dasharray="${CIRC.toFixed(1)}"
      stroke-dashoffset="${off.toFixed(1)}" transform="rotate(-90 31 31)"/>
  </svg>`;
}

/* ——— History-derived fallbacks (used only if a stats helper's shape is
       not what the contract implies; history entry shape is contractual) ——— */

function sameDay(ts, ref) {
  const a = new Date(ts), b = new Date(ref);
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function localReadiness(hist, examId) {
  const spec = specOf(examId);
  const mine = hist.filter((h) => (h.examId || "hcm") === examId).slice(0, 5);
  if (!mine.length || !spec || !spec.targetWPM) return 0;
  const avgNet = mine.reduce((s, h) => s + (h.net || 0), 0) / mine.length;
  const avgAcc = mine.reduce((s, h) => s + (h.acc || 0), 0) / mine.length;
  return Math.max(0, Math.min(1, (avgNet / spec.targetWPM) * 0.7 + (avgAcc / 95) * 0.3));
}

function localTypingDays(hist) {
  const days = [];
  const now = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const sec = hist
      .filter((h) => sameDay(h.ts, d))
      .reduce((s, h) => s + (h.durSec || (h.min || 0) * 60), 0);
    days.push({
      label: d.toLocaleDateString("en-IN", { weekday: "short" }),
      full: d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" }),
      minutes: Math.round(sec / 60),
      today: i === 0,
    });
  }
  return days;
}

function normDays(raw, hist) {
  if (Array.isArray(raw) && raw.length) {
    const mapped = raw.slice(-7).map((d, i, arr) => {
      if (typeof d === "number") return { label: "", full: "", minutes: Math.round(d), today: i === arr.length - 1 };
      const minutes = d.minutes != null ? d.minutes
        : d.min != null ? d.min
        : d.seconds != null ? d.seconds / 60
        : (d.sec || d.durSec || 0) / 60;
      const date = d.date ? new Date(d.date) : null;
      return {
        label: d.label || d.day || (date ? date.toLocaleDateString("en-IN", { weekday: "short" }) : ""),
        full: d.full || d.label || d.day || (date ? date.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" }) : ""),
        minutes: Math.round(minutes || 0),
        today: !!d.today || i === arr.length - 1,
      };
    });
    /* Labels matter for the UI; if the helper gave none, use local days. */
    if (mapped.some((d) => d.label)) {
      const local = localTypingDays(hist);
      return mapped.map((d, i) => ({ ...d, label: d.label || local[i]?.label || "", full: d.full || local[i]?.full || "" }));
    }
  }
  return localTypingDays(hist);
}

function normReadiness(raw, hist, examId) {
  if (typeof raw === "number" && isFinite(raw)) return raw > 1 ? raw / 100 : raw;
  if (raw && typeof raw === "object") {
    const v = raw.pct != null ? raw.pct : raw.value != null ? raw.value : raw.score;
    if (typeof v === "number") return v > 1 ? v / 100 : v;
  }
  return localReadiness(hist, examId);
}

function localNextStep(hist, examId) {
  const spec = specOf(examId);
  const mine = hist.filter((h) => (h.examId || "hcm") === examId);
  if (!mine.length) {
    return {
      title: `Take your first ${spec ? spec.short : "typing"} mock`,
      why: "One full mock sets your baseline — every recommendation after this is measured against it.",
      ctaLabel: "Open the mock list",
      hash: `#/hub/${examId}`,
    };
  }
  const weak = {};
  mine.slice(0, 5).forEach((h) =>
    Object.entries(h.weakWords || {}).forEach(([w, n]) => { weak[w] = (weak[w] || 0) + n; })
  );
  const topWeak = Object.entries(weak).sort((a, b) => b[1] - a[1])[0];
  const last = mine[0];
  if (topWeak && topWeak[1] >= 2) {
    return {
      title: `Clean up “${topWeak[0]}” and its neighbours`,
      why: `That word has cost you ${topWeak[1]} mistakes in recent tests. A short revision set targets exactly those words.`,
      ctaLabel: "Start revision",
      hash: "#/studio",
    };
  }
  if (last && last.acc < 95) {
    return {
      title: "Accuracy before speed",
      why: `Your last test ran at ${Number(last.acc).toFixed(1)}% accuracy. Slow, clean drills buy more marks than raw pace right now.`,
      ctaLabel: "Open accuracy drills",
      hash: "#/studio",
    };
  }
  return {
    title: `Next ${spec ? spec.short : ""} mock`,
    why: "Your recent tests are clean. Keep the streak honest with another full-length mock under the timer.",
    ctaLabel: "Open the mock list",
    hash: `#/hub/${examId}`,
  };
}

function normNextStep(raw, hist, examId) {
  /* core/stats.js shape: { state: "none" | "weak" | "clean", examId, keys } */
  if (raw && typeof raw === "object" && typeof raw.state === "string") {
    const spec = specOf(examId);
    if (raw.state === "none") {
      return {
        title: `Take your first ${spec ? spec.short : "typing"} mock`,
        why: "One full mock sets your baseline — every recommendation after this is measured against it.",
        ctaLabel: "Open the mock list",
        hash: `#/hub/${examId}`,
      };
    }
    if (raw.state === "weak") {
      const keys = (raw.keys || []).map((k) => (k.key === " " ? "space" : k.key)).join(", ");
      return {
        title: `Drill the keys that are costing you: ${keys}`,
        why: "These keys repeat across your recent mistakes. Ten focused minutes in the Studio pays more than another full mock right now.",
        ctaLabel: "Open Training Studio",
        hash: "#/studio",
      };
    }
    return {
      title: `Clean work — take the next ${spec ? spec.short : ""} mock`,
      why: "No repeating key pattern in your recent tests. Keep the standard with another full mock under the timer.",
      ctaLabel: "Open the mock list",
      hash: `#/hub/${examId}`,
    };
  }
  if (raw && typeof raw === "object" && (raw.title || raw.ctaLabel || raw.label)) {
    return {
      title: raw.title || raw.heading || "Your next step",
      why: raw.why || raw.reason || raw.desc || "",
      ctaLabel: raw.ctaLabel || raw.cta?.label || raw.label || "Continue",
      hash: raw.hash || raw.cta?.hash || raw.href || `#/hub/${examId}`,
    };
  }
  if (typeof raw === "string" && raw) {
    return { title: raw, why: "", ctaLabel: "Continue", hash: `#/hub/${examId}` };
  }
  return localNextStep(hist, examId);
}

/* ——— Hero demo ——— */

const DEMO_LINES = [
  "The quick brown fox jumps over the lazy dog near the river bank.",
  "Accuracy first, then speed — clean typing earns the marks band.",
  "She sells fresh flowers at the market every Sunday morning.",
  "Practice a little every day and the speed takes care of itself.",
  "The committee approved the new plan after a long discussion.",
  "Good posture and relaxed fingers keep the rhythm steady.",
];

const NEIGHBOURS = {
  a: "sqwz", b: "vghn", c: "xdfv", d: "serfcx", e: "wsdr", f: "drtgcv", g: "ftyhvb",
  h: "gyujnb", i: "ujko", j: "huiknm", k: "jiolm", l: "kop", m: "njk", n: "bhjm",
  o: "iklp", p: "ol", q: "wa", r: "edft", s: "awedxz", t: "rfgy", u: "yhji",
  v: "cfgb", w: "qase", x: "zsdc", y: "tghu", z: "asx", " ": " ",
};

function mountDemo(root) {
  const body = root.querySelector(".demo-body");
  const lineEl = root.querySelector(".demo-line");
  const stateEl = root.querySelector(".demo-state-text");
  const hintEl = root.querySelector(".demo-hint");
  const wpmEl = root.querySelector(".dh-wpm");
  const accEl = root.querySelector(".dh-acc");
  const nextBtn = root.querySelector("#demoNextBtn");
  if (!body || !lineEl) return;

  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let target = DEMO_LINES[0];
  let lineIdx = 0;
  let typed = []; /* {ch, ok} per position */
  let keys = 0, errKeys = 0, startedAt = performance.now();
  let cumChars = 0, cumKeys = 0, cumErrs = 0, sessionStart = performance.now();
  let mode = "auto"; /* auto | user */
  let timer = null, idleTimer = null, alive = true;

  function syncNextBtn() {
    if (!nextBtn) return;
    const lineDone = mode === "user" && typed.length >= target.length;
    nextBtn.hidden = !lineDone;
    if (lineDone && hintEl) {
      hintEl.textContent = "Line complete — click Next line or press Enter to keep typing.";
    } else if (mode === "user" && hintEl) {
      hintEl.textContent = "Type the line. Click away to resume the demo.";
    }
  }

  function render() {
    let html = "";
    const words = target.split(" ");
    let pos = 0;
    words.forEach((word, wi) => {
      html += `<span class="w">`;
      for (const ch of word) {
        const t = typed[pos];
        const cls = !t ? "c" : t.ok ? "c ok" : "c bad";
        if (pos === typed.length) html += `<span class="demo-caret" aria-hidden="true"></span>`;
        html += `<span class="${cls}">${esc(t ? t.ch : ch)}</span>`;
        pos++;
      }
      html += `</span>`;
      if (wi < words.length - 1) {
        const t = typed[pos];
        const cls = !t ? "c" : t.ok ? "c ok" : "c bad";
        if (pos === typed.length) html += `<span class="demo-caret" aria-hidden="true"></span>`;
        html += `<span class="${cls}"> </span>`;
        pos++;
      }
    });
    if (typed.length >= target.length) html += `<span class="demo-caret" aria-hidden="true"></span>`;
    lineEl.innerHTML = html;

    const totalTyped = mode === "user" ? (cumChars + typed.length) : typed.length;
    const totalKeys = mode === "user" ? (cumKeys + keys) : keys;
    const totalErr = mode === "user" ? (cumErrs + errKeys) : errKeys;
    const t0 = mode === "user" ? sessionStart : startedAt;
    const mins = Math.max((performance.now() - t0) / 60000, 0.05);
    const wpm = Math.round(totalTyped / 5 / mins);
    const acc = totalKeys ? Math.max(0, Math.round((1 - totalErr / totalKeys) * 100)) : 100;
    if (wpmEl) wpmEl.textContent = mode === "auto" || totalTyped ? String(Math.min(wpm, 95)) : "0";
    if (accEl) accEl.textContent = `${acc}%`;
    syncNextBtn();
  }

  function stopTimers() {
    if (timer) { clearTimeout(timer); timer = null; }
    if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
  }

  function nextLine(keepCumulative = false) {
    if (keepCumulative) {
      cumChars += typed.length;
      cumKeys += keys;
      cumErrs += errKeys;
    } else {
      cumChars = 0; cumKeys = 0; cumErrs = 0;
      sessionStart = performance.now();
    }
    lineIdx = (lineIdx + 1) % DEMO_LINES.length;
    target = DEMO_LINES[lineIdx];
    typed = [];
    keys = 0; errKeys = 0;
    startedAt = performance.now();
    render();
  }

  function advanceUserLine() {
    if (mode !== "user") return;
    if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
    nextLine(true);
    body.focus({ preventScroll: true });
  }

  function autoStep() {
    if (!alive || mode !== "auto") return;
    if (!document.body.contains(body)) { alive = false; return; }
    if (typed.length >= target.length) {
      timer = setTimeout(() => { nextLine(false); autoStep(); }, 1500);
      return;
    }
    const want = target[typed.length];
    keys++;
    if (Math.random() < 0.05 && /[a-z ]/.test(want)) {
      const pool = NEIGHBOURS[want] || "e";
      const slip = pool[Math.floor(Math.random() * pool.length)];
      errKeys++;
      typed.push({ ch: slip, ok: false });
      render();
      timer = setTimeout(() => {
        if (!alive || mode !== "auto") return;
        if (Math.random() < 0.72) {
          typed.pop(); /* corrected — the slip never reaches the score */
          render();
          timer = setTimeout(autoStep, 60 + Math.random() * 70);
        } else {
          autoStep();
        }
      }, 110 + Math.random() * 130);
      return;
    }
    typed.push({ ch: want, ok: true });
    render();
    timer = setTimeout(autoStep, 52 + Math.random() * 78);
  }

  function takeOver() {
    if (mode === "user") return;
    mode = "user";
    stopTimers();
    typed = [];
    keys = 0; errKeys = 0;
    cumChars = 0; cumKeys = 0; cumErrs = 0;
    startedAt = performance.now();
    sessionStart = startedAt;
    render();
    if (stateEl) stateEl.textContent = "Your turn";
    if (hintEl) hintEl.textContent = "Type the line. Click away to resume the demo.";
    body.focus({ preventScroll: true });
  }

  function resume() {
    if (mode === "auto") return;
    mode = "auto";
    if (stateEl) stateEl.textContent = "Live demo";
    if (hintEl) hintEl.textContent = "Click the paper and type — hands control back after 12s idle.";
    nextLine(false);
    autoStep();
  }

  if (nextBtn) {
    nextBtn.addEventListener("mousedown", (e) => e.preventDefault());
    nextBtn.addEventListener("click", advanceUserLine);
  }

  body.addEventListener("click", takeOver);
  body.addEventListener("focus", takeOver);
  body.addEventListener("blur", (e) => {
    if (nextBtn && e.relatedTarget === nextBtn) return;
    stopTimers();
    idleTimer = setTimeout(resume, 12000);
  });
  body.addEventListener("keydown", (e) => {
    if (e.key === " ") e.preventDefault();
    if (mode !== "user") return;
    if (e.key === "Enter" && typed.length >= target.length) {
      e.preventDefault();
      advanceUserLine();
      return;
    }
    if (e.key === "Backspace") {
      e.preventDefault();
      typed.pop();
      render();
      return;
    }
    if (e.key.length !== 1 || e.metaKey || e.ctrlKey || e.altKey) return;
    e.preventDefault();
    if (typed.length >= target.length) return;
    keys++;
    const ok = e.key === target[typed.length];
    if (!ok) errKeys++;
    typed.push({ ch: e.key, ok });
    render();
  });

  if (reduced) {
    typed = target.split("").map((ch) => ({ ch, ok: true }));
    keys = target.length; errKeys = 1;
    render();
    if (wpmEl) wpmEl.textContent = "41";
    if (accEl) accEl.textContent = "98%";
    return;
  }

  render();
  autoStep();
}

/* ——— Delight layer: Piixpal (self-hosted, vendor/piixpal/) ———
   Bitbug lives in the headline and Pip on the primary CTA (both declared
   in the markup above); Munshi, a custom pal, keeps the footer brand
   line. Scripts are injected only from here and from Progress's empty
   state — never on the stage, Arena or Studio routes. Pals are
   hue-rotated toward Answer Green so they belong to the register.
   See DESIGN.md, "Delight layer". */

function injectPal(name) {
  if (document.querySelector(`script[data-piix="${name}"]`)) return;
  const s = document.createElement("script");
  s.src = "vendor/piixpal/c/" + name + ".min.js";
  s.dataset.piix = name;
  document.head.appendChild(s);
}

/* Munshi — the register-keeper. Ink body, Answer-Green cap and pen, an
   open register in both hands. He runs the 'mind' behaviour — reads the
   register, turns a page, dozes over it — so he ships the same clip
   vocabulary Moss uses for that behaviour (read / flip / doze / look,
   plus idle and a poke reaction). NOTE: 'mind' is not a core behaviour —
   it is defined by moss.min.js, so that file is loaded too (it registers
   the behaviour; the moss pal itself is never placed). registerMunshi
   waits for the behaviour to exist before mounting him: an element
   asking for an unregistered behaviour is silently never recruited. */
const MUNSHI_BODY = [
  "....gggg....",
  "..gggggggg..",
  ".gddddddddg.",
  "..kkkkkkkk..",
  "..kppkkppk..",
  "...kkkkkk...",
  ".kkkkkkkkkk.",
  ".kkppppppkk.",
  ".kkppppppkg.",
  ".kkppppppkk.",
  "..kkkkkkkk..",
  "..kkk..kkk..",
  ".kkkk..kkkk.",
];
const munshiFrame = (row4, extra) => {
  const f = MUNSHI_BODY.slice();
  if (row4) f[4] = row4;
  if (extra) extra(f);
  return f;
};
const MUNSHI = {
  w: 12,
  h: 13,
  scale: 3,
  does: "mind",
  palette: { k: "#182238", g: "#2fbf8f", d: "#0b7a55", p: "#fdfcf7" },
  frames: {
    idle: [MUNSHI_BODY, munshiFrame("..kkkkkkkk..")],
    look: [
      munshiFrame(".kppkkppkk.."),
      MUNSHI_BODY,
      munshiFrame("...kppkkppk."),
      MUNSHI_BODY,
    ],
    read: [
      munshiFrame("..kkkkkkkk..", (f) => { f[5] = "...kpkkpk..."; }),
      munshiFrame("..kkkkkkkk..", (f) => {
        f[5] = "...kpkkpk...";
        f[7] = ".kkppppppkg.";
        f[8] = ".kkppppppkk.";
      }),
    ],
    flip: [
      munshiFrame(null, (f) => { f[7] = ".kkppgpppkk."; f[8] = ".kkppgpppkk."; }),
      munshiFrame(null, (f) => { f[7] = ".kkpppppgpk."; f[8] = ".kkpppppgpk."; }),
    ],
    doze: [
      [
        ".....gggg...",
        "...gggggggg.",
        "..gddddddddg",
        "..kkkkkkkk..",
        "..kkkkkkkk..",
        "...kkkkkk...",
        ".kkkkkkkkkk.",
        ".kkppppppkk.",
        ".kkppppppkg.",
        ".kkppppppkk.",
        "..kkkkkkkk..",
        "..kkk..kkk..",
        ".kkkk..kkkk.",
      ],
      [
        ".....gggg..p",
        "...gggggggg.",
        "..gddddddddg",
        "..kkkkkkkk..",
        "..kkkkkkkk..",
        "...kkkkkk...",
        ".kkkkkkkkkk.",
        ".kkppppppkk.",
        ".kkppppppkg.",
        ".kkppppppkk.",
        "..kkkkkkkk..",
        "..kkk..kkk..",
        ".kkkk..kkkk.",
      ],
    ],
    annoyed: [munshiFrame("..kkkkkkkk..")],
  },
  fps: { idle: 2, look: 2, read: 1, flip: 7, doze: 1 },
};

let munshiState = "idle"; /* idle | waiting | done | failed */

const onHomeRoute = () => location.hash.replace(/^#\/?/, "") === "";

function mountMunshi() {
  if (!onHomeRoute()) return;
  const host = document.querySelector(".footer-in > span");
  if (!host || host.querySelector("piix-pal")) return;
  const el = document.createElement("piix-pal");
  el.setAttribute("pal", "munshi");
  el.setAttribute("scale", "3");
  host.appendChild(el);
}

function registerMunshi() {
  if (munshiState === "done") { mountMunshi(); return; }
  if (munshiState !== "idle") return;
  munshiState = "waiting";
  let tries = 0;
  const attempt = () => {
    if (window.Piixpal && typeof window.Piixpal.sprite === "function" &&
        window.Piixpal.behaviors && window.Piixpal.behaviors.mind) {
      try {
        window.Piixpal.sprite("munshi", MUNSHI);
        munshiState = "done";
        mountMunshi();
      } catch (e) {
        munshiState = "failed"; /* the sprite API refused — ship without him */
      }
      return;
    }
    if (++tries <= 50) setTimeout(attempt, 120);
    else munshiState = "failed";
  };
  attempt();
}

/* The footer outlives every route, so Munshi must not: he is removed the
   moment the route leaves Home (the stage above all — no pals there).
   renderHome mounts him again on return. */
window.addEventListener("hashchange", () => {
  if (onHomeRoute()) return;
  const el = document.querySelector(".site-footer piix-pal");
  if (el) el.remove();
});

function calcStreak(hist) {
  if (!hist.length) return 0;
  const days = new Set();
  for (const h of hist) {
    const d = new Date(h.ts || h.dateStr);
    if (!Number.isNaN(d.getTime())) days.add(d.toDateString());
  }
  const cur = new Date();
  cur.setHours(0, 0, 0, 0);
  if (!days.has(cur.toDateString())) cur.setDate(cur.getDate() - 1);
  let streak = 0;
  while (days.has(cur.toDateString())) {
    streak++;
    cur.setDate(cur.getDate() - 1);
  }
  return streak;
}

function examBest(hist, examId) {
  const mine = hist.filter((h) => (examId === "hcm" ? (!h.examId || h.examId === "hcm") : h.examId === examId));
  const mocks = mine.filter((h) => h.mode === "mock");
  const complete = mine.filter((h) => !h.incomplete);
  const passed = mocks.filter((h) => h.qualified && !h.incomplete).length;
  const bestNet = complete.length ? Math.max(...complete.map((h) => Math.round(h.net || 0))) : null;
  const triedIds = new Set(mocks.map((h) => h.testId).filter(Boolean));
  return { count: mine.length, mocksTried: triedIds.size, passed, bestNet };
}

function livingVisualHtml(idx) {
  const scene = ((idx % 3) + 3) % 3;
  const titles = ["Keystroke rhythm", "Speed trajectory", "Daily register"];
  const keys = [
    ["Q", "W", "E", "R", "T", "Y"],
    ["A", "S", "D", "F", "G", "H"],
    ["SPACE"],
  ];
  return `
  <div class="living-visual" data-scene="${scene}" aria-hidden="true">
    <div class="lv-head">
      <span class="lv-title">${titles[scene]}</span>
      <span class="lv-dots">
        ${[0, 1, 2].map((d) => `<button type="button" class="lv-dot${d === scene ? " on" : ""}" data-lv="${d}" tabindex="-1" aria-label="Visual ${d + 1}"></button>`).join("")}
      </span>
    </div>
    <div class="lv-stage">
      ${scene === 0 ? `
        <div class="lv-keys">
          ${keys.map((row, ri) => `<div class="lv-krow">
            ${row.map((k, ki) => `<span class="lv-key${k === "SPACE" ? " wide" : ""}" style="--kd:${((ri * 5 + ki * 2) % 9) * 0.28}s">${k}</span>`).join("")}
          </div>`).join("")}
        </div>` : scene === 1 ? `
        <svg class="lv-svg" viewBox="0 0 260 74" fill="none">
          <line x1="8" y1="30" x2="252" y2="30" stroke="var(--ok)" stroke-width="1" stroke-dasharray="4 4" opacity="0.65"/>
          <text x="250" y="25" text-anchor="end" fill="var(--ok)" font-size="9" font-weight="700">30+ WPM</text>
          <path class="lv-curve-bg" d="M10 62 C55 58, 82 48, 122 39 C160 30, 196 20, 248 12" stroke="var(--line-strong)" stroke-width="2" stroke-linecap="round"/>
          <path class="lv-curve" d="M10 62 C55 58, 82 48, 122 39 C160 30, 196 20, 248 12" stroke="var(--accent)" stroke-width="2.6" stroke-linecap="round"/>
          <circle class="lv-dot-end" cx="248" cy="12" r="4" fill="var(--ok)"/>
        </svg>` : `
        <div class="lv-lines">
          <div class="lv-line"><i style="--lw:86%;--ld:0s"></i></div>
          <div class="lv-line"><i style="--lw:72%;--ld:0.35s"></i></div>
          <div class="lv-line"><i style="--lw:92%;--ld:0.7s"></i></div>
        </div>`}
    </div>
  </div>`;
}

let lvVisitIdx = null;
function nextLivingScene() {
  if (lvVisitIdx == null) {
    try {
      const prev = parseInt(localStorage.getItem("tsn_lv_idx") || "-1", 10);
      lvVisitIdx = Number.isFinite(prev) ? (prev + 1) % 3 : 0;
      localStorage.setItem("tsn_lv_idx", String(lvVisitIdx));
    } catch (e) {
      lvVisitIdx = 0;
    }
  }
  return lvVisitIdx;
}

const HOME_TAGLINES = [
  "Type fast. Get selected.",
  "Your speed. Your selection.",
  "Train your fingers. Earn your uniform.",
  "Every keystroke closer to the uniform.",
  "Type your way to the merit list.",
  "Merit lists are typed, not wished for.",
  "Practice like it's the real exam.",
  "Where practice becomes selection.",
  "One passage a day keeps failure away.",
  "Practise today. Parade tomorrow.",
  "Accuracy. Speed. Selection.",
  "Type the exam before the exam.",
  "Dream of the uniform? Type for it.",
  "The keyboard is your exam hall.",
  "Your name belongs in that list. Type it there.",
  "Real passages. Real pressure. Real results.",
  "Fast fingers. Honest results.",
  "Type. Test. Improve. Repeat.",
  "Speed is a skill. Build it daily.",
  "From the first keystroke to the final merit list.",
];
let lastTagIdx = -1;
let heroTagTimer = null;

/* ——— Page ——— */

export function renderHome(view) {
  const hist = store.history();
  const examId = examState.get();
  const spec = specOf(examId) || EXAM_SPECS[0];
  const todayCount = hist.filter((h) => sameDay(h.ts, Date.now())).length;
  const goal = Math.max(1, store.goal() || 2);
  const days = normDays(safeDays(hist), hist);
  const todayMin = days.length ? days[days.length - 1].minutes : 0;
  const weekMin = days.reduce((s, d) => s + (d.minutes || 0), 0);
  const readiness = normReadiness(safeReadiness(hist, examId), hist, examId);
  const readyPct = Math.round(readiness * 100);
  const readyTier = readyPct >= 75 ? "ok" : readyPct >= 40 ? "mid" : "low";
  const streak = calcStreak(hist);
  const activeExamStats = examBest(hist, examId);
  const step = normNextStep(safeNext(hist, examId), hist, examId);
  const totalMocks = COUNTS.mocks.hcm + COUNTS.mocks.chsl + COUNTS.mocks.cgl + COUNTS.mocks.rrb;
  const lvScene = nextLivingScene();

  const sheetTarget = spec.targetWPM ? `${spec.targetWPM} WPM` : "Complete text";
  const sheetRule = spec.id === "hcm" ? "Marks 25" : spec.backspace ? "Backspace On" : "Backspace Off";
  if (lastTagIdx < 0) lastTagIdx = Math.floor(Math.random() * HOME_TAGLINES.length);
  let curTagIdx = lastTagIdx;

  view.innerHTML = `
  <section class="hero">
    <div class="hero-top">
      <div class="hero-copy">
        <div class="hero-kicker-row">
          <span class="fact-pill">${icon("target", 14)} ${totalMocks} Mocks · ${COUNTS.drills} Drills · ${COUNTS.warmups} Warm-ups</span>
        </div>
        <div class="hero-headline-slot">
          <h1 id="heroTagline">${esc(HOME_TAGLINES[curTagIdx])}</h1>
        </div>
        <p class="hero-sub">Official exam rules, exact timers, and honest mistake scoring.</p>
        <div class="hero-ctas" style="margin-top:28px">
          <a class="btn btn-primary btn-lg" id="heroMainCta" href="#/hub/${examId}">
            ${icon("play", 16)}
            <span>Practise ${esc(spec.short)}</span>
          </a>
          <piix-pal pal="pip" on="#heroMainCta" hue="114" scale="3"></piix-pal>
          <a class="btn" href="#/studio">
            ${icon("bolt", 16)}
            <span>Quick Drills</span>
          </a>
        </div>
      </div>
      <div class="hero-action-box">
        <div class="lv-frame" id="lvFrame">
          <div id="lvHost">${livingVisualHtml(lvScene)}</div>
        </div>
        <piix-pal pal="bitbug" on="#lvFrame" speed="0.35" hue="81" scale="2"></piix-pal>
        <div class="exam-switch hero-exams" role="group" aria-label="Your active exam">
          ${EXAM_SPECS.map((s) => `<button type="button" data-exam="${s.id}" aria-pressed="${s.id === examId}">${esc(s.short)}</button>`).join("")}
        </div>
      </div>
    </div>

    <div class="demo" aria-label="Live typing demo — a practice sheet">
      <div class="sheet-top">
        <span class="sheet-top-title">
          <span class="sheet-seal" aria-hidden="true"></span>
          ${esc(spec.short)} — Practice Sheet
        </span>
        <span class="sheet-top-fields" aria-hidden="true">
          <span>Time <b>${spec.durationMin} min</b></span>
          <span>Target <b>${esc(sheetTarget)}</b></span>
          <span><b>${esc(sheetRule)}</b></span>
        </span>
      </div>
      <div class="demo-body" tabindex="0" role="textbox" aria-label="Typing demo. Activate to type the line yourself.">
        <p class="demo-line"></p>
      </div>
      <div class="sheet-foot">
        <span class="demo-state"><span class="pulse" aria-hidden="true"></span><span class="demo-state-text">Live demo</span></span>
        <span class="demo-hint">Click the paper and type — hands control back after 12s idle.</span>
        <button class="demo-next-btn" id="demoNextBtn" type="button" hidden>Next line →</button>
        <span class="demo-hud" aria-hidden="true">
          <span class="dh"><span>Speed</span><b class="dh-wpm num">0</b><span class="dh-u">WPM</span></span>
          <span class="dh"><span>Accuracy</span><b class="dh-acc num">100%</b></span>
        </span>
      </div>
    </div>
  </section>

  <section class="section" aria-labelledby="todayH">
    <div class="section-head">
      <h2 id="todayH">Your Story Today</h2>
      <span class="aside">${streak ? `${icon("flame", 14)} ${streak}-day streak · ` : ""}${new Date().toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })}</span>
    </div>
    <div class="today-strip">
      <div class="today-cell">
        <div class="readout">
          <span class="tile-kicker">${icon("check", 14)} Done today</span>
          <span class="readout-value num" id="todayTests">${todayCount}</span>
          <span class="label">${streak ? `${streak}-day streak` : "Start today"}</span>
        </div>
      </div>
      <div class="today-cell">
        <div class="dual-goal">
          ${ringSVG(Math.min(1, todayCount / goal), `Daily goal: ${todayCount} of ${goal} tests`)}
          <div class="dual-goal-text">
            <span class="label">Daily goal</span>
            <span class="big num"><span id="goalNow">${todayCount}</span> / <span id="goalMax">${goal}</span></span>
            <div class="goal-stepper" aria-label="Adjust daily goal">
              <button type="button" id="goalDec" aria-label="Decrease daily goal">−</button>
              <button type="button" id="goalInc" aria-label="Increase daily goal">+</button>
            </div>
          </div>
        </div>
      </div>
      <div class="today-cell">
        <div class="readout">
          <span class="tile-kicker">${icon("target", 14)} ${esc(spec.short)}</span>
          <span class="readout-value num ready-${readyTier}" id="readyPct">${readyPct}<span class="unit">%</span></span>
          <div class="mini-meter" aria-hidden="true"><i class="fill-${readyTier}" style="width:${readyPct}%"></i></div>
          <span class="label">${activeExamStats.bestNet != null ? `Best ${activeExamStats.bestNet} WPM` : "No mock yet"}</span>
        </div>
      </div>
      <div class="today-cell wide">
        <div class="tt-head">
          <span class="tt-total num" id="ttTotal">${todayMin} min</span>
          <span class="tt-when" id="ttWhen">Today · ${weekMin}m this week</span>
        </div>
        <div class="tt-bars" id="ttBars" role="group" aria-label="Typing time, last 7 days">
          ${days.map((d, i) => {
            const max = Math.max(30, ...days.map((x) => x.minutes));
            const h = Math.max(8, Math.round((d.minutes / max) * 100));
            return `<button type="button" class="tt-bar${d.today ? " sel" : ""}" data-day="${i}"
              aria-label="${esc(d.full || d.label)}, ${d.minutes} minutes">
              <i style="height:${h}%"></i></button>`;
          }).join("")}
        </div>
        <div class="tt-days" aria-hidden="true">
          ${days.map((d) => `<span>${esc(d.label)}</span>`).join("")}
        </div>
      </div>
    </div>

    <div class="next-step">
      <span class="ns-ico" aria-hidden="true">${icon("bolt", 20)}</span>
      <div class="ns-text">
        <p class="label">Recommended next</p>
        <p class="ns-title" id="nsTitle">${esc(step.title)}</p>
      </div>
      <a class="btn btn-primary" id="nsCta" href="${esc(step.hash)}">
        ${icon("arrowRight", 15)}
        <span>${esc(step.ctaLabel)}</span>
      </a>
      <span class="ns-pal" aria-hidden="true"><piix-pal pal="lurk" hue="42" scale="3"></piix-pal></span>
    </div>
  </section>

  <section class="section" aria-labelledby="examsH">
    <div class="section-head">
      <h2 id="examsH">All 4 Exams</h2>
      <a class="link-btn" href="#/arena">Custom text test →</a>
    </div>
    <div class="exam-rows">
      ${EXAM_SPECS.map((s) => {
        const st = examBest(hist, s.id);
        const total = COUNTS.mocks[s.id] || 0;
        const pct = total ? Math.round((st.mocksTried / total) * 100) : 0;
        return `
        <a class="exam-row" href="#/hub/${s.id}">
          <span>
            <span class="er-name">${esc(s.name)}</span>
            <span class="er-chips">
              <span class="chip">${icon("clock", 12)} ${s.durationMin} min</span>
              <span class="chip">${icon("target", 12)} ${s.targetWPM ? `${s.targetWPM} WPM` : "Complete"}</span>
              <span class="chip">${s.backspace ? "Backspace On" : "Backspace Off"}</span>
              ${st.bestNet != null ? `<span class="chip chip-ok">${icon("trophy", 12)} Best ${st.bestNet} WPM</span>` : ""}
            </span>
          </span>
          <span class="er-side">
            <span class="er-count num">${st.mocksTried}<span class="er-total">/${total}</span></span>
            <span class="mini-meter er-meter" aria-hidden="true"><i class="fill-accent" style="width:${pct}%"></i></span>
            <span class="label">Mocks done</span>
          </span>
        </a>`;
      }).join("")}
    </div>
  </section>`;

  mountDemo(view);

  /* Typing-time bars: peek at a day, revert to today after 4.5s. */
  const barsWrap = view.querySelector("#ttBars");
  const ttTotal = view.querySelector("#ttTotal");
  const ttWhen = view.querySelector("#ttWhen");
  let revertTimer = null;
  let spentBar = -1;

  function showDay(i, fromAuto) {
    days.forEach((d, j) => {
      const b = barsWrap.children[j];
      if (b) b.classList.toggle("sel", j === i);
    });
    const d = days[i];
    if (!d) return;
    ttTotal.textContent = `${d.minutes} min`;
    ttWhen.textContent = d.today ? `Today · ${weekMin}m this week` : `${d.full || d.label}`;
    if (revertTimer) clearTimeout(revertTimer);
    if (!d.today) {
      revertTimer = setTimeout(() => {
        spentBar = i;
        showDay(days.length - 1, true);
      }, 4500);
    } else if (!fromAuto) {
      spentBar = -1;
    }
  }

  if (barsWrap) {
    [...barsWrap.children].forEach((bar, i) => {
      bar.addEventListener("mouseenter", () => { if (spentBar !== i) showDay(i); });
      bar.addEventListener("click", () => { spentBar = -1; showDay(i); });
      bar.addEventListener("focus", () => { spentBar = -1; showDay(i); });
    });
    barsWrap.addEventListener("mouseleave", () => { spentBar = -1; });
  }

  /* Instant +/- goal stepper synced with store + ring */
  function syncGoalUI() {
    const effective = store.goal();
    const gMax = view.querySelector("#goalMax");
    if (gMax) gMax.textContent = String(effective);
    const ring = view.querySelector(".dual-goal .mini-ring");
    if (ring) {
      ring.setAttribute("aria-label", `Daily goal: ${todayCount} of ${effective} tests`);
      const fg = ring.querySelector(".ring-fg");
      if (fg) fg.setAttribute("stroke-dashoffset", (CIRC * (1 - Math.min(1, todayCount / effective))).toFixed(1));
    }
  }

  const gDec = view.querySelector("#goalDec");
  const gInc = view.querySelector("#goalInc");
  if (gDec) gDec.addEventListener("click", () => { store.setGoal(store.goal() - 1); syncGoalUI(); });
  if (gInc) gInc.addEventListener("click", () => { store.setGoal(store.goal() + 1); syncGoalUI(); });

  /* Exam switcher: hero CTA, live sheet header, readiness + next step follow the pick. */
  view.querySelectorAll("[data-exam]").forEach((btn) => {
    btn.addEventListener("click", () => examState.set(btn.dataset.exam));
  });

  /* Living visual subtle rotation over time & dot click */
  const lvHost = view.querySelector("#lvHost");
  let curLv = lvScene;
  const wireLvDots = () => {
    if (!lvHost) return;
    lvHost.querySelectorAll("[data-lv]").forEach((dot) => {
      dot.addEventListener("click", () => {
        curLv = parseInt(dot.dataset.lv, 10) || 0;
        lvVisitIdx = curLv;
        lvHost.innerHTML = livingVisualHtml(curLv);
        wireLvDots();
      });
    });
  };
  wireLvDots();
  const lvReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const tagEl = view.querySelector("#heroTagline");
  if (heroTagTimer) { clearInterval(heroTagTimer); heroTagTimer = null; }
  if (!lvReduced && tagEl) {
    heroTagTimer = setInterval(() => {
      if (!document.body.contains(tagEl)) { clearInterval(heroTagTimer); heroTagTimer = null; return; }
      let nextIdx = curTagIdx;
      while (nextIdx === curTagIdx) {
        nextIdx = Math.floor(Math.random() * HOME_TAGLINES.length);
      }
      curTagIdx = nextIdx;
      lastTagIdx = nextIdx;
      tagEl.classList.add("is-out");
      setTimeout(() => {
        if (!document.body.contains(tagEl)) return;
        tagEl.textContent = HOME_TAGLINES[nextIdx];
        tagEl.classList.remove("is-out");
        tagEl.classList.add("is-in");
        void tagEl.offsetWidth;
        tagEl.classList.remove("is-in");
      }, 280);
    }, 4200);
  }
  if (!lvReduced && lvHost) {
    const lvTimer = setInterval(() => {
      if (!document.body.contains(lvHost)) { clearInterval(lvTimer); return; }
      curLv = (curLv + 1) % 3;
      lvVisitIdx = curLv;
      lvHost.innerHTML = livingVisualHtml(curLv);
      wireLvDots();
    }, 10000);
  }

  /* Delight layer */
  injectPal("bitbug");
  injectPal("pip");
  injectPal("lurk");
  injectPal("moss");
  registerMunshi();
}

function safeDays(hist) {
  try { return stats.typingTimeByDay(hist); } catch (e) { return null; }
}
function safeReadiness(hist, examId) {
  try { return stats.readiness(hist, examId); } catch (e) { return null; }
}
function safeNext(hist, examId) {
  try { return stats.nextStep(hist, examId); } catch (e) { return null; }
}

window.addEventListener("ts:exam", () => {
  const view = document.getElementById("view");
  if (view && view.querySelector(".hero")) renderHome(view);
});

window.addEventListener("ts:prefs", () => {
  const view = document.getElementById("view");
  if (view && view.querySelector("#goalMax")) {
    const g = store.goal();
    view.querySelector("#goalMax").textContent = String(g);
    const todayCount = parseInt(view.querySelector("#todayTests")?.textContent || "0", 10);
    const fg = view.querySelector(".dual-goal .ring-fg");
    if (fg) fg.setAttribute("stroke-dashoffset", (CIRC * (1 - Math.min(1, todayCount / g))).toFixed(1));
  }
});
