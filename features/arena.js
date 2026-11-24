/* Riyaz — Exam Arena: the four exam hubs, per-exam mock lists,
   and the custom-test builder. Passage data loads lazily, only here. */

import { EXAM_SPECS, specOf } from "../data/examSpecs.js";
import { COUNTS } from "../data/counts.js";
import { examState, launchStage } from "../app.js";
import * as store from "../core/store.js";
import { esc } from "../core/util.js";

function bestEntry(testId) {
  try {
    const b = store.bestFor(testId);
    if (b && typeof b === "object" && b.net != null) return b;
    if (typeof b === "number") return { net: b, qualified: null };
  } catch (e) {}
  return null;
}

function examSummary(hist, examId) {
  const mine = hist.filter((h) => (h.examId || "hcm") === examId && h.mode === "mock");
  const passed = mine.filter((h) => h.qualified).length;
  const best = mine.length ? Math.max(...mine.map((h) => Math.round(h.net || 0))) : null;
  return { done: mine.length, passed, best };
}

/* ——— Arena index ——— */

export function renderArena(view) {
  const hist = store.history();
  view.innerHTML = `
  <section class="page-head">
    <h1>Exam Arena</h1>
    <p class="lede">Four exams, four different rulebooks. Every mock below runs the real
      duration, the real mistake rules and the real qualifying bar for its exam —
      nothing is borrowed from a neighbour.</p>
  </section>

  <div class="exam-rows" style="margin-top:22px">
    ${EXAM_SPECS.map((s) => {
      const sum = examSummary(hist, s.id);
      const prog = sum.done ? ` · ${sum.done} attempted${sum.best != null ? ` (best ${sum.best} WPM)` : ""}` : "";
      return `
      <a class="exam-row" href="#/hub/${s.id}">
        <span>
          <span class="er-name">${esc(s.name)}</span>
          <span class="er-meta" style="display:block">${esc(s.posts)}</span>
          <span class="er-meta" style="display:block">${esc(s.durationLabel)} · ${esc(s.targetLabel)} · ${esc(s.nature)}${prog}</span>
        </span>
        <span class="er-side">
          <span class="er-count num">${COUNTS.mocks[s.id] || 0}</span>
          <span class="label">Mocks</span>
        </span>
      </a>`;
    }).join("")}
  </div>

  <section class="section" aria-labelledby="customH">
    <div class="section-head"><h2 id="customH">Build your own test</h2></div>
    <p style="color:var(--ink-2);max-width:62ch">Paste any passage — a newspaper editorial, a PIB
      release, your own notes — pick an exam's rules and a duration, and it runs as a full
      mock with that exam's scoring.</p>
    <div id="customBuilder"></div>
  </section>`;

  mountCustomBuilder(view.querySelector("#customBuilder"));
}

/* ——— Custom-test builder ——— */

function mountCustomBuilder(root) {
  if (!root) return;
  const activeExam = examState.get();
  root.innerHTML = `
  <form class="builder" id="customForm" novalidate>
    <div class="field">
      <div class="field-top">
        <label for="ctText">Your passage</label>
        <button class="link-btn link-muted" id="ctClear" type="button" hidden>Clear text</button>
      </div>
      <textarea id="ctText" name="passage" rows="7" spellcheck="false"
        placeholder="Paste or type the passage you want to practise…"></textarea>
      <span class="hint num" id="ctCount">0 words · 0 keystrokes — aim for 150+ words for a meaningful test.</span>
    </div>
    <div class="builder-grid">
      <div class="field">
        <label for="ctExam">Score it as</label>
        <select id="ctExam" name="exam">
          ${EXAM_SPECS.map((s) => `<option value="${s.id}"${s.id === activeExam ? " selected" : ""}>${esc(s.short)}</option>`).join("")}
        </select>
      </div>
      <div class="field">
        <label for="ctDur">Duration (minutes)</label>
        <div class="dur-row">
          <input id="ctDur" name="duration" type="number" min="1" max="30" value="10" inputmode="numeric" />
          <div class="dur-presets" role="group" aria-label="Duration presets">
            ${[3, 5, 10, 15].map((m) => `<button type="button" class="chip-btn" data-dur="${m}">${m}m</button>`).join("")}
          </div>
        </div>
      </div>
      <div class="field">
        <label for="ctTitle">Name it</label>
        <input id="ctTitle" name="title" type="text" value="Custom test" autocomplete="off" />
      </div>
    </div>
    <div class="builder-foot">
      <button class="btn btn-primary" type="submit">Start custom test</button>
      <span class="wc" id="ctRuleNote"></span>
    </div>
  </form>`;

  const form = root.querySelector("#customForm");
  const text = root.querySelector("#ctText");
  const clearBtn = root.querySelector("#ctClear");
  const exam = root.querySelector("#ctExam");
  const durInput = root.querySelector("#ctDur");
  const count = root.querySelector("#ctCount");
  const ruleNote = root.querySelector("#ctRuleNote");

  function words() {
    return text.value.trim().split(/\s+/).filter(Boolean).length;
  }
  function syncPresets() {
    const cur = parseInt(durInput.value, 10);
    root.querySelectorAll("[data-dur]").forEach((b) =>
      b.setAttribute("aria-pressed", String(parseInt(b.dataset.dur, 10) === cur)));
  }
  function syncNote() {
    const clean = text.value.replace(/\s+/g, " ").trim();
    const w = words();
    clearBtn.hidden = !clean.length;
    count.textContent = `${w} word${w === 1 ? "" : "s"} · ${clean.length.toLocaleString("en-IN")} keystrokes${w && w < 40 ? " — quite short; the test will end when the text does" : ""}`;
    const s = specOf(exam.value);
    ruleNote.textContent = s
      ? `${s.short} rules · backspace ${s.backspace ? "allowed" : "off by default"} · ${s.errorAllowance}`
      : "";
  }

  clearBtn.addEventListener("click", () => {
    text.value = "";
    syncNote();
    text.focus();
  });
  root.querySelectorAll("[data-dur]").forEach((b) => {
    b.addEventListener("click", () => {
      durInput.value = b.dataset.dur;
      syncPresets();
    });
  });
  durInput.addEventListener("input", syncPresets);
  text.addEventListener("input", syncNote);
  exam.addEventListener("change", syncNote);
  syncPresets();
  syncNote();

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const clean = text.value.replace(/\s+/g, " ").trim();
    if (words() < 10) {
      count.textContent = "Add a little more text — at least 10 words — so the test can score properly.";
      text.focus();
      return;
    }
    const s = specOf(exam.value);
    const dur = Math.max(1, Math.min(30, parseInt(durInput.value, 10) || 10));
    launchStage({
      examId: exam.value,
      mode: "custom",
      title: root.querySelector("#ctTitle").value.trim() || "Custom test",
      text: clean,
      durationMin: dur,
      backspaceDefault: s ? s.backspace : true,
      testId: `custom-${Date.now()}`,
    });
  });
}

/* ——— One exam's hub ——— */

export async function renderHub(view, examId) {
  const spec = specOf(examId);
  if (!spec) {
    view.innerHTML = `<div class="empty-note"><p><strong>That exam does not exist here.</strong></p>
      <a class="btn" href="#/arena">Back to Exam Arena</a></div>`;
    return;
  }
  const hist = store.history();
  const sum = examSummary(hist, examId);

  view.innerHTML = `
  <section class="page-head">
    <div class="hub-head-top">
      <div>
        <p class="label" style="margin-bottom:8px">${esc(spec.body)}</p>
        <h1>${esc(spec.name)}</h1>
      </div>
      <button class="btn btn-primary" id="hubQuickStart" type="button" disabled>Loading mocks…</button>
    </div>
    <p class="lede">${esc(spec.posts)} — ${esc(spec.nature)}. ${esc(spec.errorAllowance)}.</p>
  </section>

  <div class="hub-spec" role="list" aria-label="Exam facts">
    <div class="readout" role="listitem"><span class="readout-value num">${spec.durationMin}<span class="unit">min</span></span><span class="label">Duration</span></div>
    <div class="readout" role="listitem"><span class="readout-value num">${spec.targetWPM || "—"}${spec.targetWPM ? '<span class="unit">WPM</span>' : ""}</span><span class="label">Target (net)</span></div>
    <div class="readout" role="listitem"><span class="readout-value num">${COUNTS.mocks[examId] || 0}</span><span class="label">Mocks</span></div>
    <div class="readout" role="listitem"><span class="readout-value num">${sum.done}</span><span class="label">Attempted</span></div>
    <div class="readout" role="listitem"><span class="readout-value" style="font-size:1.25rem;padding-top:8px">${spec.backspace ? "On" : "Off"}<span class="unit">default</span></span><span class="label">Backspace</span></div>
  </div>

  ${Array.isArray(spec.formula) && spec.formula.length ? `
  <section aria-labelledby="howH">
    <h2 id="howH" style="font-size:var(--fs-h3);margin-top:24px">How this exam is scored</h2>
    <ul class="formula-list">${spec.formula.map((f) => `<li>${esc(f)}</li>`).join("")}</ul>
    ${spec.pibNote ? `<p style="color:var(--ink-3);font-size:var(--fs-small);margin-top:12px">${esc(spec.pibNote)}</p>` : ""}
  </section>` : ""}

  ${Array.isArray(spec.faq) && spec.faq.length ? `
  <section aria-labelledby="faqH" style="margin-top:20px">
    <h2 id="faqH" style="font-size:var(--fs-h3);margin-bottom:10px">Common questions</h2>
    <div class="faq-list">
      ${spec.faq.map(([q, a]) => `
      <details class="faq-item">
        <summary>${esc(q)}</summary>
        <p>${esc(a)}</p>
      </details>`).join("")}
    </div>
  </section>` : ""}

  <div class="mock-tools">
    <div class="seg" role="group" aria-label="Filter by difficulty" id="diffSeg">
      ${["all", "easy", "medium", "hard"].map((d) => `<button type="button" data-diff="${d}" aria-pressed="${d === "all"}">${d === "all" ? "All" : d[0].toUpperCase() + d.slice(1)}</button>`).join("")}
    </div>
    <div class="seg" role="group" aria-label="Filter by status" id="statusSeg">
      ${[["all", "All"], ["untried", "Untried"], ["tried", "Tried"]].map(([id, lbl]) => `<button type="button" data-status="${id}" aria-pressed="${id === "all"}">${lbl}</button>`).join("")}
    </div>
    <input class="search-input" id="mockSearch" type="search" placeholder="Search topic or number…" aria-label="Search mocks" />
    <span class="count-note" id="mockCount" aria-live="polite">Loading mocks…</span>
  </div>
  <div class="mock-list" id="mockList"></div>`;

  const { batchTests } = await import("../data/exams.js");
  const tests = batchTests(examId);
  const listEl = view.querySelector("#mockList");
  const countEl = view.querySelector("#mockCount");
  const searchEl = view.querySelector("#mockSearch");
  const quickBtn = view.querySelector("#hubQuickStart");
  if (!listEl) return;

  let diffFilter = "all";
  let statusFilter = "all";
  let query = "";

  const startMock = (t) => launchStage({
    examId,
    mode: "mock",
    title: t.name,
    text: t.text,
    durationMin: spec.durationMin,
    backspaceDefault: spec.backspace,
    testId: t.id,
  });

  const nextUntried = tests.find((t) => !bestEntry(t.id)) || tests[0];
  if (quickBtn && nextUntried) {
    quickBtn.disabled = false;
    quickBtn.textContent = tests.some((t) => !bestEntry(t.id))
      ? `Start next untried (#${nextUntried.num})`
      : `Practice #${nextUntried.num}`;
    quickBtn.addEventListener("click", () => startMock(nextUntried));
  }

  function paint() {
    const q = query.trim().toLowerCase();
    const rows = tests.filter((t) => {
      if (diffFilter !== "all" && t.diff !== diffFilter) return false;
      const best = bestEntry(t.id);
      if (statusFilter === "untried" && best) return false;
      if (statusFilter === "tried" && !best) return false;
      if (q) {
        const hay = `${t.num} ${t.name} ${t.topic || ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    countEl.textContent = `${rows.length} of ${tests.length} mocks`;
    listEl.innerHTML = rows.map((t) => {
      const best = bestEntry(t.id);
      const wc = t.text.split(/\s+/).filter(Boolean).length;
      const tickHtml = best && best.qualified === true ? ' <span class="tick" aria-label="Qualified">✓</span>' : "";
      const bestSub = best
        ? `${best.acc != null ? `${Number(best.acc).toFixed(0)}% acc · ` : ""}${best.qualified === true ? "Qualified" : best.qualified === false ? "Below bar" : "Best net"}`
        : "Not tried";
      return `
      <button type="button" class="mock-row" data-tid="${esc(t.id)}">
        <span class="mock-num num">${t.num}</span>
        <span class="mock-main">
          <span class="mock-topic">${esc(t.topic || t.name)}</span>
          <span class="mock-meta"><span>${t.name}</span><span>${wc} words</span>${t.isNew ? `<span class="chip">New</span>` : ""}</span>
        </span>
        <span class="mock-best">${best != null
          ? `<span class="mb-net num">${Math.round(best.net)}${tickHtml}</span><span class="mb-label" style="display:block">${bestSub}</span>`
          : `<span class="mb-label">Not tried</span>`}</span>
        <span class="chip chip-${esc(t.diff)}">${esc(t.diff)}</span>
        <span class="mock-go">Start</span>
      </button>`;
    }).join("") || `<div class="empty-note"><p>No matching mocks found.</p></div>`;

    listEl.querySelectorAll("[data-tid]").forEach((row) => {
      row.addEventListener("click", () => {
        const t = tests.find((x) => x.id === row.dataset.tid);
        if (t) startMock(t);
      });
    });
  }

  view.querySelectorAll("#diffSeg [data-diff]").forEach((btn) => {
    btn.addEventListener("click", () => {
      diffFilter = btn.dataset.diff;
      view.querySelectorAll("#diffSeg [data-diff]").forEach((b) =>
        b.setAttribute("aria-pressed", String(b === btn)));
      paint();
    });
  });

  view.querySelectorAll("#statusSeg [data-status]").forEach((btn) => {
    btn.addEventListener("click", () => {
      statusFilter = btn.dataset.status;
      view.querySelectorAll("#statusSeg [data-status]").forEach((b) =>
        b.setAttribute("aria-pressed", String(b === btn)));
      paint();
    });
  });

  searchEl.addEventListener("input", () => {
    query = searchEl.value;
    paint();
  });

  paint();
}
