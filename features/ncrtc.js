/* Riyaz — NCRTC MCQ mocks: 52 tests, question files fetched
   lazily per test. Runner with palette, mark-for-review, and a scored
   review at the end. */

import { NCRTC_MANIFEST } from "../data/ncrtcManifest.js";

const esc = (s) =>
  String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));

const LETTERS = ["A", "B", "C", "D", "E"];

export function renderNcrtc(view) {
  const tests = NCRTC_MANIFEST.tests || [];
  const totalQ = tests.reduce((s, t) => s + (t.count || 0), 0);
  const groups = [];
  const byGroup = new Map();
  tests.forEach((t) => {
    if (!byGroup.has(t.group)) { byGroup.set(t.group, []); groups.push(t.group); }
    byGroup.get(t.group).push(t);
  });

  view.innerHTML = `
  <section class="page-head">
    <h1>NCRTC Mocks</h1>
    <p class="lede">${tests.length} tests · ${totalQ.toLocaleString("en-IN")} questions for the NCRTC
      computer-based test — technical units, general studies and integrated scenarios.
      Answers and explanations wait until you submit, like the real thing.</p>
  </section>
  <div id="ncHost">
    ${groups.map((g) => `
    <section class="nc-groups" aria-label="${esc(g)}">
      <h2 class="nc-group-title">${esc(g)} <span class="g-count">${byGroup.get(g).length} tests</span></h2>
      <div class="nc-test-list">
        ${byGroup.get(g).map((t) => `
        <button type="button" class="item-row" data-test="${esc(t.id)}">
          <span>
            <span class="ir-name">${esc(t.title)}</span>
            <span class="ir-desc" style="display:block">${t.count} questions</span>
          </span>
          <span class="mock-go">Start test</span>
        </button>`).join("")}
      </div>
    </section>`).join("")}
  </div>`;

  view.querySelectorAll("[data-test]").forEach((btn) => {
    btn.addEventListener("click", () => runTest(view, btn.dataset.test));
  });
}

async function runTest(view, testId) {
  const meta = (NCRTC_MANIFEST.tests || []).find((t) => t.id === testId);
  view.innerHTML = `<p style="color:var(--ink-3);padding-top:30px" aria-live="polite">Loading ${esc(meta ? meta.title : "test")}…</p>`;
  window.scrollTo(0, 0);

  let data;
  try {
    const res = await fetch(`data/ncrtc/${encodeURIComponent(testId)}.json`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    data = await res.json();
  } catch (err) {
    view.innerHTML = `<div class="empty-note" role="alert" style="margin-top:26px">
      <p><strong>This test could not load.</strong></p>
      <p>Check your connection and try again.</p>
      <button class="btn" id="ncBack" type="button">Back to test list</button></div>`;
    view.querySelector("#ncBack").addEventListener("click", () => renderNcrtc(view));
    return;
  }

  const questions = data.questions || [];
  const answers = new Array(questions.length).fill(null);
  const marked = new Set();
  let cur = 0;
  let submitted = false;

  view.innerHTML = `
  <section class="page-head">
    <p class="label" style="margin-bottom:8px">${esc(data.group || meta?.group || "NCRTC")}</p>
    <h1 style="font-size:1.7rem">${esc(data.title || meta?.title || "Test")}</h1>
  </section>
  <div class="nc-runner">
    <div class="nc-q" id="ncQ"></div>
    <aside class="nc-palette" aria-label="Question palette">
      <p class="label">Questions</p>
      <p class="num" id="ncProg" style="margin-top:6px;font-weight:600"></p>
      <div class="pal-grid" id="ncPal"></div>
      <div class="pal-legend">
        <span>Filled — answered</span>
        <span>Ring — marked for review</span>
      </div>
      <p style="margin-top:14px"><button class="btn btn-primary" id="ncSubmit" type="button" style="width:100%;justify-content:center">Submit test</button></p>
      <p style="margin-top:8px"><button class="btn btn-quiet" id="ncQuit" type="button" style="width:100%;justify-content:center">Leave test</button></p>
    </aside>
  </div>
  <div id="ncResult"></div>`;

  const qHost = view.querySelector("#ncQ");
  const palHost = view.querySelector("#ncPal");
  const progEl = view.querySelector("#ncProg");

  function paintPalette() {
    palHost.innerHTML = questions.map((_, i) => `
      <button type="button" class="pal-btn num${answers[i] != null ? " answered" : ""}${marked.has(i) ? " marked" : ""}${i === cur ? " current" : ""}"
        data-q="${i}" aria-label="Question ${i + 1}${answers[i] != null ? ", answered" : ""}${marked.has(i) ? ", marked for review" : ""}">${i + 1}</button>`).join("");
    palHost.querySelectorAll("[data-q]").forEach((b) =>
      b.addEventListener("click", () => { cur = parseInt(b.dataset.q, 10); paint(); }));
    const done = answers.filter((a) => a != null).length;
    progEl.textContent = `${done} of ${questions.length} answered`;
  }

  function paint() {
    const q = questions[cur];
    qHost.innerHTML = `
      <p class="nc-q-count">Question ${cur + 1} of ${questions.length}${marked.has(cur) ? " · Marked for review" : ""}</p>
      <p class="nc-q-text">${esc(q.q)}</p>
      <div class="nc-opts" role="group" aria-label="Options">
        ${q.options.map((opt, i) => `
        <button type="button" class="nc-opt" data-opt="${i}" aria-pressed="${answers[cur] === i}">
          <span class="opt-letter" aria-hidden="true">${LETTERS[i]}</span>
          <span>${esc(opt)}</span>
        </button>`).join("")}
      </div>
      <div class="nc-nav">
        <button class="btn" id="ncPrev" type="button" ${cur === 0 ? "disabled" : ""}>Previous</button>
        <button class="btn" id="ncMark" type="button" aria-pressed="${marked.has(cur)}">${marked.has(cur) ? "Unmark" : "Mark for review"}</button>
        ${answers[cur] != null ? `<button class="btn btn-quiet" id="ncClear" type="button">Clear answer</button>` : ""}
        <span style="flex:1"></span>
        <button class="btn ${cur === questions.length - 1 ? "btn-primary" : ""}" id="ncNext" type="button" ${cur === questions.length - 1 ? "disabled" : ""}>Next</button>
      </div>`;
    qHost.querySelectorAll("[data-opt]").forEach((b) =>
      b.addEventListener("click", () => {
        answers[cur] = parseInt(b.dataset.opt, 10);
        paint();
      }));
    const prev = qHost.querySelector("#ncPrev");
    const next = qHost.querySelector("#ncNext");
    if (prev) prev.addEventListener("click", () => { if (cur > 0) { cur--; paint(); } });
    if (next) next.addEventListener("click", () => { if (cur < questions.length - 1) { cur++; paint(); } });
    qHost.querySelector("#ncMark").addEventListener("click", () => {
      marked.has(cur) ? marked.delete(cur) : marked.add(cur);
      paint();
    });
    const clear = qHost.querySelector("#ncClear");
    if (clear) clear.addEventListener("click", () => { answers[cur] = null; paint(); });
    paintPalette();
  }

  function submit() {
    if (submitted) return;
    const left = answers.filter((a) => a == null).length;
    if (left > 0 && !window.confirm(`${left} question${left === 1 ? " is" : "s are"} still unanswered. Submit anyway?`)) return;
    submitted = true;
    const correct = questions.reduce((s, q, i) => s + (answers[i] === q.answer ? 1 : 0), 0);
    const pct = questions.length ? Math.round((correct / questions.length) * 100) : 0;
    view.querySelector(".nc-runner").style.display = "none";
    const host = view.querySelector("#ncResult");
    host.innerHTML = `
    <section class="result" style="padding:0;max-width:none">
      <div class="result-hero" style="margin-top:22px">
        <div class="readout"><span class="readout-value num">${correct}<span class="unit">/ ${questions.length}</span></span><span class="label">Correct</span></div>
        <div class="readout"><span class="readout-value num">${pct}<span class="unit">%</span></span><span class="label">Score</span></div>
        <div class="readout"><span class="readout-value num">${questions.length - correct - left}<span class="unit"></span></span><span class="label">Wrong</span></div>
        <div class="readout"><span class="readout-value num">${left}</span><span class="label">Skipped</span></div>
      </div>
      <h3>Review</h3>
      ${questions.map((q, i) => `
      <div class="nc-review-item">
        <p class="rq">${i + 1}. ${esc(q.q)}</p>
        <div class="nc-opts">
          ${q.options.map((opt, j) => {
            const isAns = j === q.answer;
            const isMine = answers[i] === j;
            return `<div class="nc-opt${isAns ? " correct" : ""}${isMine && !isAns ? " wrong" : ""}" aria-label="Option ${LETTERS[j]}${isAns ? ", correct answer" : ""}${isMine ? ", your answer" : ""}">
              <span class="opt-letter" aria-hidden="true">${LETTERS[j]}</span>
              <span>${esc(opt)}${isMine ? ' <strong>(your answer)</strong>' : ""}${isAns ? ' <strong>(correct)</strong>' : ""}</span>
            </div>`;
          }).join("")}
        </div>
        ${answers[i] == null ? `<p class="nc-explain">You skipped this one.</p>` : ""}
        ${q.explain ? `<p class="nc-explain">${esc(q.explain)}</p>` : ""}
      </div>`).join("")}
      <div class="result-actions">
        <button class="btn btn-primary" id="ncAgain" type="button">Retake this test</button>
        <button class="btn" id="ncList" type="button">Back to test list</button>
      </div>
    </section>`;
    host.scrollIntoView({ block: "start" });
    host.querySelector("#ncAgain").addEventListener("click", () => runTest(view, testId));
    host.querySelector("#ncList").addEventListener("click", () => renderNcrtc(view));
  }

  view.querySelector("#ncSubmit").addEventListener("click", submit);
  view.querySelector("#ncQuit").addEventListener("click", () => {
    if (window.confirm("Leave this test? Your answers in it will be lost.")) renderNcrtc(view);
  });

  paint();
}
