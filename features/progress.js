/* Riyaz — Progress: history, stored-result detail, summaries. */

import * as store from "../core/store.js";
import { specOf } from "../data/examSpecs.js";

/* ——— Delight layer: Piixpal (self-hosted, vendor/piixpal/) ———
   Lurk peeks over the empty state, and only the empty state: this
   injector runs solely when that state renders, so a Progress page with
   results never loads a single piixpal byte. See DESIGN.md. */
function injectPal(name) {
  if (document.querySelector(`script[data-piix="${name}"]`)) return;
  const s = document.createElement("script");
  s.src = "vendor/piixpal/c/" + name + ".min.js";
  s.dataset.piix = name;
  document.head.appendChild(s);
}

const esc = (s) =>
  String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));

const fmtDate = (ts) =>
  new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(new Date(ts));

const CAT_LABELS = {
  spelling: "Spelling / wrong word",
  capital: "Capitalisation",
  punct: "Punctuation",
  spacing: "Spacing",
  skipped: "Skipped",
  extra: "Extra",
  other: "Other",
};

function modeLabel(e) {
  if (e.mode === "mock") return specOf(e.examId)?.short || "Mock";
  if (e.mode === "custom") return "Custom";
  if (e.mode === "drill") return "Drill";
  if (e.mode === "warmup") return "Warm-up";
  if (e.mode === "revision") return "Revision";
  return e.mode || "Test";
}

function verdictBadge(e) {
  if (e.mode !== "mock" && e.mode !== "custom") return "";
  if (e.qualified == null) return "";
  return e.qualified
    ? `<span class="badge pass">Qualified</span>`
    : `<span class="badge fail">Below bar</span>`;
}

export function renderProgress(view) {
  const hist = [...store.history()].sort((a, b) => (b.ts || 0) - (a.ts || 0));

  if (!hist.length) {
    view.innerHTML = `
    <section class="page-head">
      <h1>Progress</h1>
      <p class="lede">Every test you finish lands here — speed, accuracy, the mistakes that
        cost you, and whether you cleared the bar.</p>
    </section>
    <div class="empty-note" style="margin-top:26px">
      <p><strong>Nothing here yet.</strong></p>
      <p>Finish one mock and this page starts keeping score for you.</p>
      <a class="btn btn-primary" href="#/arena">Take your first mock</a>
    </div>`;
    const note = view.querySelector(".empty-note");
    if (note) {
      const el = document.createElement("piix-pal");
      el.setAttribute("pal", "lurk");
      el.setAttribute("hue", "-40");
      el.setAttribute("scale", "3");
      note.appendChild(el);
    }
    injectPal("lurk");
    return;
  }

  const totalSec = hist.reduce((s, h) => s + (h.durSec || 0), 0);
  const last10 = hist.slice(0, 10);
  const avgNet = Math.round(last10.reduce((s, h) => s + (h.net || 0), 0) / last10.length);
  const avgAcc = (last10.reduce((s, h) => s + (h.acc || 0), 0) / last10.length).toFixed(1);
  const bestNet = Math.max(...hist.map((h) => h.net || 0));
  let selectedId = hist[0].id;

  view.innerHTML = `
  <section class="page-head">
    <h1>Progress</h1>
    <p class="lede">Every finished test, newest first. Select any row to reopen its full result.</p>
  </section>

  <div class="hub-spec" role="list" aria-label="Your totals">
    <div class="readout" role="listitem"><span class="readout-value num">${hist.length}</span><span class="label">Tests taken</span></div>
    <div class="readout" role="listitem"><span class="readout-value num">${Math.floor(totalSec / 60)}<span class="unit">min typing</span></span><span class="label">Total practice time</span></div>
    <div class="readout" role="listitem"><span class="readout-value num">${avgNet}<span class="unit">WPM</span></span><span class="label">Avg net · last ${last10.length}</span></div>
    <div class="readout" role="listitem"><span class="readout-value num">${avgAcc}<span class="unit">%</span></span><span class="label">Avg accuracy · last ${last10.length}</span></div>
    <div class="readout" role="listitem"><span class="readout-value num">${bestNet}<span class="unit">WPM</span></span><span class="label">Best net ever</span></div>
  </div>

  <div id="detailHost"></div>

  <div class="hist-list" role="list" aria-label="Test history">
    ${hist.map((e) => `
    <button type="button" class="hist-row" role="listitem" data-id="${esc(e.id)}" aria-pressed="${e.id === selectedId}">
      <span>
        <span class="hist-name">${esc(e.name || "Test")}</span>
        <span class="hist-meta" style="display:block">${esc(modeLabel(e))} · ${esc(e.dateStr || fmtDate(e.ts))} · ${Math.round((e.durSec || 0) / 60 * 10) / 10} min</span>
      </span>
      ${verdictBadge(e)}
      <span class="hist-nums">
        <span class="hn-net num">${Math.round(e.net || 0)}</span>
        <span class="hn-sub" style="display:block">net · ${Number(e.acc || 0).toFixed(1)}% acc${e.marks != null && (e.mode === "mock" || e.mode === "custom") && e.examId === "hcm" ? ` · ${e.marks}/25` : ""}</span>
      </span>
    </button>`).join("")}
  </div>

  <p style="margin-top:26px">
    <button class="btn btn-quiet" id="clearHist" type="button">Clear all history</button>
  </p>`;

  const detailHost = view.querySelector("#detailHost");

  function paintDetail() {
    const e = hist.find((h) => h.id === selectedId) || hist[0];
    if (!e) { detailHost.innerHTML = ""; return; }
    const cats = Object.entries(e.errCat || {}).filter(([, n]) => n > 0);
    const weakKeys = Object.entries(e.weakKeys || {}).sort((a, b) => b[1] - a[1]).slice(0, 8);
    const weakWords = Object.entries(e.weakWords || {}).sort((a, b) => b[1] - a[1]).slice(0, 10);
    detailHost.innerHTML = `
    <div class="detail-panel" aria-live="polite">
      <p class="label">Stored result</p>
      <h2 style="font-size:1.3rem;margin-top:6px">${esc(e.name || "Test")}</h2>
      <p style="color:var(--ink-3);font-size:var(--fs-small);margin-top:4px">${esc(modeLabel(e))} · ${esc(e.dateStr || fmtDate(e.ts))}${e.qualified != null && (e.mode === "mock" || e.mode === "custom") ? ` · ${e.qualified ? "Qualified" : "Below the qualifying bar"}` : ""}</p>
      <div class="detail-grid">
        <div class="readout"><span class="readout-value num" style="font-size:1.7rem">${Math.round(e.net || 0)}</span><span class="label">Net WPM</span></div>
        <div class="readout"><span class="readout-value num" style="font-size:1.7rem">${Math.round(e.gross || 0)}</span><span class="label">Gross WPM</span></div>
        <div class="readout"><span class="readout-value num" style="font-size:1.7rem">${Number(e.acc || 0).toFixed(1)}<span class="unit">%</span></span><span class="label">Accuracy</span></div>
        <div class="readout"><span class="readout-value num" style="font-size:1.7rem">${e.errs ?? 0}</span><span class="label">Mistakes</span></div>
        ${e.examId === "hcm" && e.marks != null ? `<div class="readout"><span class="readout-value num" style="font-size:1.7rem">${e.marks}<span class="unit">/25</span></span><span class="label">Marks</span></div>` : ""}
        <div class="readout"><span class="readout-value num" style="font-size:1.7rem">${e.chars ?? 0}</span><span class="label">Keystrokes</span></div>
        <div class="readout"><span class="readout-value num" style="font-size:1.7rem">${e.bs ?? 0}</span><span class="label">Backspaces</span></div>
        <div class="readout"><span class="readout-value num" style="font-size:1.7rem">${Math.round((e.durSec || 0) / 6) / 10}<span class="unit">min</span></span><span class="label">Time used</span></div>
      </div>
      ${cats.length ? `<h3 style="font-size:var(--fs-h3);margin-top:20px">Where the mistakes were</h3>
        <table class="calc-table"><tbody>
          ${cats.map(([k, n]) => `<tr><td>${esc(CAT_LABELS[k] || k)}</td><td><strong>${n}</strong></td></tr>`).join("")}
        </tbody></table>` : `<p style="margin-top:16px;color:var(--ok);font-weight:600">A clean sheet — no mistakes recorded.</p>`}
      ${weakWords.length ? `<h3 style="font-size:var(--fs-h3);margin-top:20px">Words to revise</h3>
        <div class="word-chips">${weakWords.map(([w, n]) => `<span class="word-chip">${esc(w)}<b>×${n}</b></span>`).join("")}</div>` : ""}
      ${weakKeys.length ? `<h3 style="font-size:var(--fs-h3);margin-top:20px">Weakest keys</h3>
        <div class="word-chips">${weakKeys.map(([k, n]) => `<span class="word-chip mono">${esc(k === " " ? "space" : k)}<b>×${n}</b></span>`).join("")}</div>` : ""}
    </div>`;
  }

  view.querySelectorAll("[data-id]").forEach((row) => {
    row.addEventListener("click", () => {
      selectedId = row.dataset.id;
      view.querySelectorAll("[data-id]").forEach((r) =>
        r.setAttribute("aria-pressed", String(r.dataset.id === selectedId)));
      paintDetail();
      detailHost.scrollIntoView({ block: "nearest", behavior: "smooth" });
    });
  });
  paintDetail();

  const clearBtn = view.querySelector("#clearHist");
  clearBtn.addEventListener("click", () => {
    if (!window.confirm("Clear all saved results on this device? This cannot be undone.")) return;
    let cleared = false;
    if (typeof store.clearHistory === "function") { store.clearHistory(); cleared = true; }
    else if (typeof store.clear === "function") { store.clear(); cleared = true; }
    if (!cleared) {
      try {
        Object.keys(localStorage)
          .filter((k) => /histor/i.test(k) && /tsn|tsnext|typesetu/i.test(k))
          .forEach((k) => localStorage.removeItem(k));
        cleared = true;
      } catch (e) {}
    }
    if (cleared) renderProgress(view);
  });
}
