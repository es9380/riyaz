/* Riyaz — Exam Arena: the four exam hubs, per-exam mock lists,
   and the custom-test builder. Passage data loads lazily, only here. */

import { EXAM_SPECS, specOf } from "../data/examSpecs.js";
import { COUNTS } from "../data/counts.js";
import { launchStage } from "../app.js";
import * as store from "../core/store.js";

const esc = (s) =>
  String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));

function bestNet(testId) {
  try {
    const b = store.bestFor(testId);
    if (b == null) return null;
    if (typeof b === "number") return b;
    if (typeof b === "object") return b.net != null ? b.net : null;
  } catch (e) {}
  return null;
}

function attemptsOf(hist, examId) {
  return hist.filter((h) => (h.examId || "hcm") === examId && h.mode === "mock").length;
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
      const done = attemptsOf(hist, s.id);
      return `
      <a class="exam-row" href="#/hub/${s.id}">
        <span>
          <span class="er-name">${esc(s.name)}</span>
          <span class="er-meta" style="display:block">${esc(s.posts)}</span>
          <span class="er-meta" style="display:block">${esc(s.durationLabel)} · ${esc(s.targetLabel)} · ${esc(s.nature)}${done ? ` · ${done} attempted` : ""}</span>
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
  root.innerHTML = `
  <form class="builder" id="customForm" novalidate>
    <div class="field">
      <label for="ctText">Your passage</label>
      <textarea id="ctText" name="passage" rows="7" spellcheck="false"
        placeholder="Paste or type the passage you want to practise…"></textarea>
      <span class="hint" id="ctCount">0 words — aim for 150+ words for a meaningful test.</span>
    </div>
    <div class="builder-grid">
      <div class="field">
        <label for="ctExam">Score it as</label>
        <select id="ctExam" name="exam">
          ${EXAM_SPECS.map((s) => `<option value="${s.id}">${esc(s.short)}</option>`).join("")}
        </select>
      </div>
      <div class="field">
        <label for="ctDur">Duration (minutes)</label>
        <input id="ctDur" name="duration" type="number" min="1" max="30" value="10" inputmode="numeric" />
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
  const exam = root.querySelector("#ctExam");
  const count = root.querySelector("#ctCount");
  const ruleNote = root.querySelector("#ctRuleNote");

  function words() {
    return text.value.trim().split(/\s+/).filter(Boolean).length;
  }
  function syncNote() {
    const w = words();
    count.textContent = `${w} word${w === 1 ? "" : "s"}${w && w < 40 ? " — quite short; the test will end when the text does" : ""}`;
    const s = specOf(exam.value);
    ruleNote.textContent = s
      ? `${s.short} rules · backspace ${s.backspace ? "allowed" : "off by default"} · ${s.errorAllowance}`
      : "";
  }
  text.addEventListener("input", syncNote);
  exam.addEventListener("change", syncNote);
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
    const dur = Math.max(1, Math.min(30, parseInt(root.querySelector("#ctDur").value, 10) || 10));
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
  const attempted = attemptsOf(hist, examId);

  view.innerHTML = `
  <section class="page-head">
    <p class="label" style="margin-bottom:8px">${esc(spec.body)}</p>
    <h1>${esc(spec.name)}</h1>
    <p class="lede">${esc(spec.posts)} — ${esc(spec.nature)}. ${esc(spec.errorAllowance)}.</p>
  </section>

  <div class="hub-spec" role="list" aria-label="Exam facts">
    <div class="readout" role="listitem"><span class="readout-value num">${spec.durationMin}<span class="unit">min</span></span><span class="label">Duration</span></div>
    <div class="readout" role="listitem"><span class="readout-value num">${spec.targetWPM || "—"}${spec.targetWPM ? '<span class="unit">WPM</span>' : ""}</span><span class="label">Target (net)</span></div>
    <div class="readout" role="listitem"><span class="readout-value num">${COUNTS.mocks[examId] || 0}</span><span class="label">Mocks</span></div>
    <div class="readout" role="listitem"><span class="readout-value num">${attempted}</span><span class="label">Attempted by you</span></div>
    <div class="readout" role="listitem"><span class="readout-value" style="font-size:1.25rem;padding-top:8px">${spec.backspace ? "On" : "Off"}<span class="unit">default</span></span><span class="label">Backspace</span></div>
  </div>

  ${Array.isArray(spec.formula) && spec.formula.length ? `
  <section aria-labelledby="howH">
    <h2 id="howH" style="font-size:var(--fs-h3);margin-top:24px">How this exam is scored</h2>
    <ul class="formula-list">${spec.formula.map((f) => `<li>${esc(f)}</li>`).join("")}</ul>
    ${spec.pibNote ? `<p style="color:var(--ink-3);font-size:var(--fs-small);margin-top:12px">${esc(spec.pibNote)}</p>` : ""}
  </section>` : ""}

  <div class="mock-tools">
    <div class="seg" role="group" aria-label="Filter by difficulty" id="diffSeg">
      ${["all", "easy", "medium", "hard"].map((d) => `<button type="button" data-diff="${d}" aria-pressed="${d === "all"}">${d === "all" ? "All" : d[0].toUpperCase() + d.slice(1)}</button>`).join("")}
    </div>
    <span class="count-note" id="mockCount" aria-live="polite">Loading mocks…</span>
  </div>
  <div class="mock-list" id="mockList"></div>`;

  const { batchTests } = await import("../data/exams.js");
  const tests = batchTests(examId);
  const listEl = view.querySelector("#mockList");
  const countEl = view.querySelector("#mockCount");
  let filter = "all";

  function paint() {
    const rows = tests.filter((t) => filter === "all" || t.diff === filter);
    countEl.textContent = `${rows.length} of ${tests.length} mocks`;
    listEl.innerHTML = rows.map((t) => {
      const best = bestNet(t.id);
      const wc = t.text.split(/\s+/).filter(Boolean).length;
      return `
      <button type="button" class="mock-row" data-tid="${esc(t.id)}">
        <span class="mock-num num">${t.num}</span>
        <span class="mock-main">
          <span class="mock-topic">${esc(t.topic || t.name)}</span>
          <span class="mock-meta"><span>${t.name}</span><span>${wc} words</span>${t.isNew ? `<span class="chip">New</span>` : ""}</span>
        </span>
        <span class="mock-best">${best != null
          ? `<span class="mb-net num">${Math.round(best)} <span class="tick" aria-hidden="true">✓</span></span><span class="mb-label" style="display:block">Best net</span>`
          : `<span class="mb-label">Not tried</span>`}</span>
        <span class="chip chip-${esc(t.diff)}">${esc(t.diff)}</span>
        <span class="mock-go">Start</span>
      </button>`;
    }).join("") || `<div class="empty-note"><p>No ${esc(filter)} mocks in this set yet.</p></div>`;

    listEl.querySelectorAll("[data-tid]").forEach((row) => {
      row.addEventListener("click", () => {
        const t = tests.find((x) => x.id === row.dataset.tid);
        if (!t) return;
        launchStage({
          examId,
          mode: "mock",
          title: t.name,
          text: t.text,
          durationMin: spec.durationMin,
          backspaceDefault: spec.backspace,
          testId: t.id,
        });
      });
    });
  }

  view.querySelectorAll("#diffSeg [data-diff]").forEach((btn) => {
    btn.addEventListener("click", () => {
      filter = btn.dataset.diff;
      view.querySelectorAll("#diffSeg [data-diff]").forEach((b) =>
        b.setAttribute("aria-pressed", String(b === btn)));
      paint();
    });
  });

  paint();
}
