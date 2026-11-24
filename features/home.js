/* Riyaz — Home: hero with live auto-typing demo, today strip,
   next best step, exam entry points. Heavy data stays off this path:
   counts come from data/counts.js, specs from data/examSpecs.js. */

import { COUNTS } from "../data/counts.js";
import { EXAM_SPECS, specOf } from "../data/examSpecs.js";
import { examState, go } from "../app.js";
import * as store from "../core/store.js";
import * as stats from "../core/stats.js";
import { esc } from "../core/util.js";

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
  if (!body || !lineEl) return;

  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let target = DEMO_LINES[0];
  let lineIdx = 0;
  let typed = []; /* {ch, ok} per position */
  let keys = 0, errKeys = 0, startedAt = performance.now();
  let mode = "auto"; /* auto | user */
  let timer = null, idleTimer = null, alive = true;

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
    const mins = Math.max((performance.now() - startedAt) / 60000, 0.05);
    const wpm = Math.round(typed.length / 5 / mins);
    const acc = keys ? Math.max(0, Math.round((1 - errKeys / keys) * 100)) : 100;
    if (wpmEl) wpmEl.textContent = mode === "auto" || typed.length ? String(Math.min(wpm, 68)) : "0";
    if (accEl) accEl.textContent = `${acc}%`;
  }

  function stopTimers() {
    if (timer) { clearTimeout(timer); timer = null; }
    if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
  }

  function nextLine() {
    lineIdx = (lineIdx + 1) % DEMO_LINES.length;
    target = DEMO_LINES[lineIdx];
    typed = [];
    keys = 0; errKeys = 0;
    startedAt = performance.now();
    render();
  }

  function autoStep() {
    if (!alive || mode !== "auto") return;
    if (!document.body.contains(body)) { alive = false; return; }
    if (typed.length >= target.length) {
      timer = setTimeout(() => { nextLine(); autoStep(); }, 1500);
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
    startedAt = performance.now();
    render();
    if (stateEl) stateEl.textContent = "Your turn";
    if (hintEl) hintEl.textContent = "Type the line. Click away and it resumes the demo on its own.";
    body.focus({ preventScroll: true });
  }

  function resume() {
    if (mode === "auto") return;
    mode = "auto";
    if (stateEl) stateEl.textContent = "Live demo";
    if (hintEl) hintEl.textContent = "Click the demo and type it yourself — it hands control back after 12 idle seconds.";
    nextLine();
    autoStep();
  }

  body.addEventListener("click", takeOver);
  body.addEventListener("focus", takeOver);
  body.addEventListener("blur", () => {
    stopTimers();
    idleTimer = setTimeout(resume, 12000);
  });
  body.addEventListener("keydown", (e) => {
    if (mode !== "user") return;
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
   state — never on the stage, Arena, Studio or NCRTC routes. Pals are
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

/* ——— Page ——— */

export function renderHome(view) {
  const hist = store.history();
  const examId = examState.get();
  const spec = specOf(examId);
  const todayCount = hist.filter((h) => sameDay(h.ts, Date.now())).length;
  const goal = Math.max(1, store.goal() || 2);
  const days = normDays(safeDays(hist), hist);
  const todayMin = days.length ? days[days.length - 1].minutes : 0;
  const readiness = normReadiness(safeReadiness(hist, examId), hist, examId);
  const step = normNextStep(safeNext(hist, examId), hist, examId);

  view.innerHTML = `
  <section class="hero">
    <h1>One line a day,<br />in the register.<piix-pal pal="bitbug" hue="81" scale="3"></piix-pal></h1>
    <p class="hero-lede">Daily typing practice for <strong>Delhi Police HCM</strong>, <strong>SSC CHSL</strong>,
      <strong>SSC CGL DEST</strong> and <strong>RRB NTPC</strong> — ${COUNTS.mocks.hcm + COUNTS.mocks.chsl + COUNTS.mocks.cgl + COUNTS.mocks.rrb} full mocks
      scored by each exam's own rulebook, ${COUNTS.drills} drills, and a register that remembers
      every entry. The sheet below is already open. Start typing.</p>

    <div class="demo" aria-label="Live typing demo — a practice sheet">
      <div class="sheet-top">
        <span class="sheet-top-title">English Typing — Practice Sheet</span>
        <span class="sheet-top-fields" aria-hidden="true">
          <span>Time <b>10 min</b></span>
          <span>Target <b>30 WPM</b></span>
          <span>Marks <b>25</b></span>
        </span>
      </div>
      <div class="demo-body" tabindex="0" role="textbox" aria-label="Typing demo. Activate to type the line yourself.">
        <p class="demo-line"></p>
      </div>
      <div class="sheet-foot">
        <span class="demo-state"><span class="pulse" aria-hidden="true"></span><span class="demo-state-text">Live demo</span></span>
        <span class="demo-hint">Click the sheet and type it yourself — it hands control back after 12 idle seconds.</span>
        <span class="demo-hud" aria-hidden="true">
          <span class="dh"><span>Speed</span><b class="dh-wpm num">0</b></span>
          <span class="dh"><span>Accuracy</span><b class="dh-acc num">100%</b></span>
        </span>
      </div>
    </div>
  </section>

  <section class="section" aria-labelledby="todayH">
    <div class="section-head">
      <h2 id="todayH">Today</h2>
      <span class="aside">${new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}</span>
    </div>
    <div class="today-strip">
      <div class="today-cell">
        <div class="readout">
          <span class="readout-value num" id="todayTests">${todayCount}</span>
          <span class="label">Tests finished today</span>
        </div>
      </div>
      <div class="today-cell">
        <div class="dual-goal">
          ${ringSVG(Math.min(1, todayCount / goal), `Daily goal: ${todayCount} of ${goal} tests`)}
          <div class="dual-goal-text">
            <span class="big num"><span id="goalNow">${todayCount}</span> / <span id="goalMax">${goal}</span></span>
            <span class="label">Daily goal</span>
            <span id="goalEditWrap"><button class="link-btn" id="goalChange" type="button">Change goal</button></span>
          </div>
        </div>
      </div>
      <div class="today-cell">
        <div class="readout">
          <span class="readout-value num" id="readyPct">${Math.round(readiness * 100)}<span class="unit">%</span></span>
          <span class="label">Readiness · <span id="readyExam">${esc(spec ? spec.short : "")}</span></span>
        </div>
      </div>
      <div class="today-cell wide">
        <div class="tt-head">
          <span class="tt-total num" id="ttTotal">${todayMin} min</span>
          <span class="tt-when" id="ttWhen">Typing time today</span>
        </div>
        <div class="tt-bars" id="ttBars" role="group" aria-label="Typing time, last 7 days">
          ${days.map((d, i) => {
            const max = Math.max(30, ...days.map((x) => x.minutes));
            const h = Math.max(6, Math.round((d.minutes / max) * 100));
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
      <div class="ns-text">
        <p class="label">Next best step</p>
        <p class="ns-title" id="nsTitle">${esc(step.title)}</p>
        ${step.why ? `<p class="ns-why">${esc(step.why)}</p>` : ""}
      </div>
      <a class="btn btn-primary" id="nsCta" href="${esc(step.hash)}">${esc(step.ctaLabel)}</a>
      <piix-pal pal="pip" on="#nsCta" hue="114" scale="3"></piix-pal>
    </div>
  </section>

  <section class="section" aria-labelledby="examsH">
    <div class="section-head">
      <h2 id="examsH">Choose your exam</h2>
      <span class="aside">Readiness and recommendations follow your pick</span>
    </div>
    <div class="exam-switch" role="group" aria-label="Your exam">
      ${EXAM_SPECS.map((s) => `<button type="button" data-exam="${s.id}" aria-pressed="${s.id === examId}">${esc(s.short)}</button>`).join("")}
    </div>
    <div class="exam-rows">
      ${EXAM_SPECS.map((s) => `
        <a class="exam-row" href="#/hub/${s.id}">
          <span>
            <span class="er-name">${esc(s.name)}</span>
            <span class="er-meta" style="display:block">${esc(s.posts)} · ${esc(s.durationLabel)} · Target ${esc(s.targetLabel)}</span>
          </span>
          <span class="er-side">
            <span class="er-count num">${COUNTS.mocks[s.id] || 0}</span>
            <span class="label">Mocks</span>
          </span>
        </a>`).join("")}
    </div>
  </section>`;

  mountDemo(view);

  /* Typing-time bars: peek at a day, revert to today after 4.5s. After an
     auto-revert, the bar under a resting pointer stays muted until the
     pointer leaves the strip or picks another bar (the v20 lesson). */
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
    ttWhen.textContent = d.today ? "Typing time today" : `Typing time · ${d.full || d.label}`;
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

  /* Daily goal: inline change, saved through the store. */
  function wireGoalEdit() {
    const goalBtn = view.querySelector("#goalChange");
    if (!goalBtn) return;
    goalBtn.addEventListener("click", () => {
      const currentGoal = Math.max(1, store.goal() || 2);
      const wrap = view.querySelector("#goalEditWrap");
      wrap.innerHTML = `<span class="goal-edit-inline">
        <input id="goalInput" type="number" min="1" max="10" value="${currentGoal}"
          aria-label="Daily goal, tests per day" />
        <button class="link-btn" id="goalSave" type="button">Save</button>
        <button class="link-btn link-muted" id="goalCancel" type="button">Cancel</button></span>`;
      const input = wrap.querySelector("#goalInput");
      input.focus();
      input.select();

      const closeEdit = () => {
        wrap.innerHTML = `<button class="link-btn" id="goalChange" type="button">Change goal</button>`;
        wireGoalEdit();
      };

      const saveGoal = () => {
        store.setGoal(parseInt(input.value, 10));
        /* Show the EFFECTIVE stored goal, never the raw typed value: the
           store's valid range is 1–10, so display and storage must be read
           back from the store to guarantee they can never disagree. */
        const effective = store.goal();
        view.querySelector("#goalMax").textContent = String(effective);
        const ring = view.querySelector(".dual-goal .mini-ring");
        if (ring) {
          ring.setAttribute("aria-label", `Daily goal: ${todayCount} of ${effective} tests`);
          const fg = ring.querySelector(".ring-fg");
          if (fg) fg.setAttribute("stroke-dashoffset", (CIRC * (1 - Math.min(1, todayCount / effective))).toFixed(1));
        }
        closeEdit();
      };

      wrap.querySelector("#goalSave").addEventListener("click", saveGoal);
      wrap.querySelector("#goalCancel").addEventListener("click", closeEdit);
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") { e.preventDefault(); saveGoal(); }
        else if (e.key === "Escape") { e.preventDefault(); closeEdit(); }
      });
    });
  }
  wireGoalEdit();

  /* Exam switcher: readiness + next step follow the pick. */
  view.querySelectorAll("[data-exam]").forEach((btn) => {
    btn.addEventListener("click", () => examState.set(btn.dataset.exam));
  });

  /* Delight layer: load the two stock pals declared in this page's
     markup, the moss behaviour pack Munshi depends on, and settle
     Munshi into the footer brand line. */
  injectPal("bitbug");
  injectPal("pip");
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
