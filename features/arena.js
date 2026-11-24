/* Riyaz — Exam Arena: the four exam hubs, per-exam mock lists,
   and the custom-test builder. Passage data loads lazily, only here. */

import { EXAM_SPECS, specOf } from "../data/examSpecs.js";
import { COUNTS } from "../data/counts.js";
import { examState, launchStage } from "../app.js";
import * as store from "../core/store.js";
import { esc, icon } from "../core/util.js";

function bestEntry(testId) {
  try {
    const b = store.bestFor(testId);
    if (b && typeof b === "object" && b.net != null) return b;
    if (typeof b === "number") return { net: b, qualified: null };
  } catch (e) {}
  return null;
}

function examSummary(hist, examId) {
  const mine = hist.filter((h) => (examId === "hcm" ? (!h.examId || h.examId === "hcm") : h.examId === examId) && h.mode === "mock");
  const triedIds = new Set(mine.map((h) => h.testId).filter(Boolean));
  const passedIds = new Set(mine.filter((h) => h.qualified).map((h) => h.testId).filter(Boolean));
  const best = mine.length ? Math.max(...mine.map((h) => Math.round(h.net || 0))) : null;
  return { done: mine.length, tried: triedIds.size, passed: passedIds.size, best };
}

/* ——— Arena index ——— */

export function renderArena(view) {
  const hist = store.history();
  view.innerHTML = `
  <section class="page-head">
    <h1>Exams</h1>
    <p class="lede">Pick an exam for real-rule mocks, or paste your own text below.</p>
  </section>

  <div class="exam-rows" style="margin-top:20px">
    ${EXAM_SPECS.map((s) => {
      const sum = examSummary(hist, s.id);
      const total = COUNTS.mocks[s.id] || 0;
      const pct = total ? Math.round((sum.tried / total) * 100) : 0;
      return `
      <a class="exam-row" href="#/hub/${s.id}">
        <span>
          <span class="er-name">${esc(s.name)}</span>
          <span class="er-meta" style="display:block">${esc(s.posts)}</span>
          <span class="er-chips">
            <span class="chip">${icon("clock", 12)} ${s.durationMin} min</span>
            <span class="chip">${icon("target", 12)} ${s.targetWPM ? `${s.targetWPM} WPM` : "Complete text"}</span>
            <span class="chip">${s.backspace ? "Backspace On" : "Backspace Off"}</span>
            ${sum.best != null ? `<span class="chip chip-ok">${icon("trophy", 12)} Best ${sum.best} WPM</span>` : ""}
            ${sum.passed ? `<span class="chip chip-ok">${icon("check", 12)} ${sum.passed} passed</span>` : ""}
          </span>
        </span>
        <span class="er-side">
          <span class="er-count num">${sum.tried}<span class="er-total">/${total}</span></span>
          <span class="mini-meter er-meter" aria-hidden="true"><i class="fill-accent" style="width:${pct}%"></i></span>
          <span class="label">Mocks done</span>
        </span>
      </a>`;
    }).join("")}
  </div>

  <section class="section" aria-labelledby="customH">
    <div class="section-head">
      <h2 id="customH">${icon("keyboard", 18)} Custom Text Test</h2>
      <span class="aside">Practise with any article or notes</span>
    </div>
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
        <label for="ctText">Passage text</label>
        <button class="link-btn link-muted" id="ctClear" type="button" hidden>Clear text</button>
      </div>
      <textarea id="ctText" name="passage" rows="6" spellcheck="false"
        placeholder="Paste or type any English passage (minimum 10 words)…"></textarea>
      <span class="hint num" id="ctCount">0 words · 0 keystrokes</span>
    </div>
    <div class="builder-grid">
      <div class="field">
        <label for="ctExam">Exam rules</label>
        <select id="ctExam" name="exam">
          ${EXAM_SPECS.map((s) => `<option value="${s.id}"${s.id === activeExam ? " selected" : ""}>${esc(s.short)}</option>`).join("")}
        </select>
      </div>
      <div class="field">
        <label for="ctDur">Minutes</label>
        <div class="dur-row">
          <input id="ctDur" name="duration" type="number" min="1" max="30" value="10" inputmode="numeric" />
          <div class="dur-presets" role="group" aria-label="Duration presets">
            ${[3, 5, 10, 15].map((m) => `<button type="button" class="chip-btn" data-dur="${m}">${m}m</button>`).join("")}
          </div>
        </div>
      </div>
      <div class="field">
        <label for="ctTitle">Test name</label>
        <input id="ctTitle" name="title" type="text" value="Custom test" autocomplete="off" />
      </div>
    </div>
    <div class="builder-foot">
      <button class="btn btn-primary" type="submit">${icon("play", 15)} <span>Start Custom Test</span></button>
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
    count.textContent = `${w} word${w === 1 ? "" : "s"} · ${clean.length.toLocaleString("en-IN")} keystrokes`;
    const s = specOf(exam.value);
    ruleNote.textContent = s
      ? `${s.short} · Backspace ${s.backspace ? "On" : "Off"} · ${s.errorAllowance}`
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
      count.textContent = "Need at least 10 words to score properly.";
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
    view.innerHTML = `<div class="empty-note"><p><strong>Exam not found.</strong></p>
      <a class="btn" href="#/arena">Back to Exams</a></div>`;
    return;
  }
  const hist = store.history();
  const sum = examSummary(hist, examId);
  const totalMocks = COUNTS.mocks[examId] || 0;
  const passLabel = spec.targetWPM ? `${spec.targetWPM} WPM` : (spec.categories ? `≤${spec.categories[0].cap}% err` : "Pass");

  view.innerHTML = `
  <section class="page-head">
    <div class="hub-head-top">
      <div>
        <p class="label" style="margin-bottom:6px">${esc(spec.body)}</p>
        <h1>${esc(spec.name)}</h1>
        <p class="lede">${esc(spec.posts)}</p>
      </div>
      <div class="hub-ctas">
        <button class="btn btn-primary" id="hubQuickStart" type="button" disabled>${icon("play", 15)} <span>Loading…</span></button>
        <button class="btn" id="hubRandomStart" type="button" disabled>${icon("shuffle", 15)} <span>Random</span></button>
      </div>
    </div>
  </section>

  <div class="hub-spec" role="list" aria-label="Exam facts">
    <div class="readout" role="listitem">
      <span class="tile-kicker">${icon("clock", 13)} Time</span>
      <span class="readout-value num">${spec.durationMin}<span class="unit">min</span></span>
    </div>
    <div class="readout" role="listitem">
      <span class="tile-kicker">${icon("target", 13)} Pass Bar</span>
      <span class="readout-value num" style="font-size:clamp(1.4rem,3vw,1.9rem)">${esc(passLabel)}</span>
    </div>
    <div class="readout" role="listitem">
      <span class="tile-kicker">${icon("keyboard", 13)} Backspace</span>
      <span class="readout-value" style="font-size:1.5rem">${spec.backspace ? "On" : "Off"}</span>
    </div>
    <div class="readout" role="listitem">
      <span class="tile-kicker">${icon("trophy", 13)} Your Progress</span>
      <span class="readout-value num">${sum.tried}<span class="er-total">/${totalMocks}</span></span>
      <span class="label">${sum.best != null ? `Best ${sum.best} WPM` : "Not started"}</span>
    </div>
  </div>

  <div class="hub-drawers">
    ${Array.isArray(spec.formula) && spec.formula.length ? `
    <details class="info-drawer">
      <summary>${icon("book", 15)} <span>Scoring Rules</span></summary>
      <div class="drawer-body">
        <ul class="formula-list">${spec.formula.map((f) => `<li>${esc(f)}</li>`).join("")}</ul>
        ${spec.pibNote ? `<p class="drawer-note">${esc(spec.pibNote)}</p>` : ""}
      </div>
    </details>` : ""}
    ${Array.isArray(spec.faq) && spec.faq.length ? `
    <details class="info-drawer">
      <summary>${icon("alert", 15)} <span>Common Questions (${spec.faq.length})</span></summary>
      <div class="drawer-body faq-compact">
        ${spec.faq.map(([q, a]) => `
        <div class="faq-row">
          <p class="faq-q">${esc(q)}</p>
          <p class="faq-a">${esc(a)}</p>
        </div>`).join("")}
      </div>
    </details>` : ""}
  </div>

  <div class="mock-tools">
    <div class="seg" role="group" aria-label="Filter by difficulty" id="diffSeg">
      ${["all", "easy", "medium", "hard"].map((d) => `<button type="button" data-diff="${d}" aria-pressed="${d === "all"}">${d === "all" ? "All" : d[0].toUpperCase() + d.slice(1)}</button>`).join("")}
    </div>
    <div class="seg" role="group" aria-label="Filter by status" id="statusSeg">
      ${[["all", "All"], ["untried", "Not Attempted"], ["tried", "Attempted"]].map(([id, lbl]) => `<button type="button" data-status="${id}" aria-pressed="${id === "all"}">${lbl}</button>`).join("")}
    </div>
    <input class="search-input" id="mockSearch" type="search" placeholder="Search topic or #…" aria-label="Search mocks" />
    <span class="count-note" id="mockCount" aria-live="polite">Loading…</span>
  </div>
  <div class="mock-list" id="mockList"></div>`;

  const { batchTests } = await import("../data/exams.js");
  const tests = batchTests(examId);
  const listEl = view.querySelector("#mockList");
  const countEl = view.querySelector("#mockCount");
  const searchEl = view.querySelector("#mockSearch");
  const quickBtn = view.querySelector("#hubQuickStart");
  const randBtn = view.querySelector("#hubRandomStart");
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

  const untriedPool = tests.filter((t) => !bestEntry(t.id));
  const nextUntried = untriedPool[0] || tests[0];
  if (quickBtn && nextUntried) {
    quickBtn.disabled = false;
    quickBtn.innerHTML = `${icon("play", 15)} <span>${untriedPool.length ? `Next Not Attempted (#${nextUntried.num})` : `Retake #${nextUntried.num}`}</span>`;
    quickBtn.addEventListener("click", () => startMock(nextUntried));
  }
  if (randBtn && tests.length) {
    randBtn.disabled = false;
    randBtn.addEventListener("click", () => {
      const pool = untriedPool.length ? untriedPool : tests;
      const pick = pool[Math.floor(Math.random() * pool.length)];
      if (pick) startMock(pick);
    });
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
    countEl.textContent = `${rows.length} of ${tests.length}`;
    listEl.innerHTML = rows.map((t) => {
      const best = bestEntry(t.id);
      const wc = t.text.split(/\s+/).filter(Boolean).length;
      const tickHtml = best && best.qualified === true ? ' <span class="tick" aria-label="Qualified">✓</span>' : "";
      const bestSub = best
        ? `${best.acc != null ? `${Number(best.acc).toFixed(0)}% acc · ` : ""}${best.qualified === true ? "Qualified" : best.qualified === false ? "Below bar" : "Best"}`
        : "Not Attempted";
      return `
      <button type="button" class="mock-row" data-tid="${esc(t.id)}">
        <span class="mock-num num">${t.num}</span>
        <span class="mock-main">
          <span class="mock-topic">${esc(t.topic || t.name)}</span>
          <span class="mock-meta"><span>${t.name}</span><span>${wc} words</span>${t.isNew ? `<span class="chip">New</span>` : ""}</span>
        </span>
        <span class="mock-best">${best != null
          ? `<span class="mb-net num">${Math.round(best.net)}${tickHtml}</span><span class="mb-label" style="display:block">${bestSub}</span>`
          : `<span class="mb-label">Not Attempted</span>`}</span>
        <span class="chip chip-${esc(t.diff)}">${esc(t.diff)}</span>
        <span class="mock-go">${icon("play", 13)} Start</span>
      </button>`;
    }).join("") || `<div class="empty-note"><p>No matching mocks.</p></div>`;

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
