/* Riyaz — Progress: history, stored-result detail, trend chart, backup/restore. */

import * as store from "../core/store.js";
import { specOf } from "../data/examSpecs.js";
import { esc, fmtDate } from "../core/util.js";

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

function matchesFilter(e, filter) {
  if (filter === "all") return true;
  if (filter === "practice") return e.mode === "drill" || e.mode === "warmup" || e.mode === "revision";
  if (filter === "custom") return e.mode === "custom";
  return (e.examId || "hcm") === filter && e.mode !== "drill" && e.mode !== "warmup" && e.mode !== "revision";
}

function renderTrendSvg(rows, targetWPM) {
  const pts = rows.slice(0, 20).reverse(); /* oldest -> newest */
  if (pts.length < 2) return "";
  const W = 680, H = 132, padL = 34, padR = 16, padT = 16, padB = 24;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const nets = pts.map((p) => Math.max(0, Math.round(p.net || 0)));
  const maxY = Math.max(40, targetWPM || 0, ...nets) + 5;
  const xAt = (i) => padL + (i / (pts.length - 1)) * innerW;
  const yAt = (v) => padT + innerH - (v / maxY) * innerH;
  const linePath = nets.map((v, i) => `${i === 0 ? "M" : "L"}${xAt(i).toFixed(1)},${yAt(v).toFixed(1)}`).join(" ");
  const areaPath = `${linePath} L${xAt(pts.length - 1).toFixed(1)},${(padT + innerH).toFixed(1)} L${padL},${(padT + innerH).toFixed(1)} Z`;

  return `
  <div class="trend-card" aria-label="Net WPM trend over recent attempts">
    <div class="trend-head">
      <span class="label">Net WPM trend · last ${pts.length}</span>
      <span class="trend-legend num">Latest ${nets[nets.length - 1]} WPM · Peak ${Math.max(...nets)} WPM</span>
    </div>
    <svg class="trend-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Line chart of net WPM across your last ${pts.length} attempts">
      <defs>
        <linearGradient id="trendGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="var(--accent)" stop-opacity="0.28" />
          <stop offset="100%" stop-color="var(--accent)" stop-opacity="0" />
        </linearGradient>
      </defs>
      ${[0, Math.round(maxY / 2), maxY].map((v) => `
        <line x1="${padL}" y1="${yAt(v).toFixed(1)}" x2="${W - padR}" y2="${yAt(v).toFixed(1)}" stroke="var(--line)" stroke-width="1" />
        <text x="${padL - 6}" y="${(yAt(v) + 3.5).toFixed(1)}" text-anchor="end" fill="var(--ink-3)" font-size="10">${v}</text>
      `).join("")}
      ${targetWPM ? `
        <line x1="${padL}" y1="${yAt(targetWPM).toFixed(1)}" x2="${W - padR}" y2="${yAt(targetWPM).toFixed(1)}" stroke="var(--ok)" stroke-width="1.2" stroke-dasharray="4 4" />
        <text x="${W - padR}" y="${(yAt(targetWPM) - 5).toFixed(1)}" text-anchor="end" fill="var(--ok)" font-size="10">Target ${targetWPM}</text>
      ` : ""}
      <path d="${areaPath}" fill="url(#trendGrad)" />
      <path d="${linePath}" fill="none" stroke="var(--accent)" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" />
      ${pts.map((p, i) => `
        <circle cx="${xAt(i).toFixed(1)}" cy="${yAt(nets[i]).toFixed(1)}" r="3.6" fill="var(--bg-raise)" stroke="${p.qualified ? "var(--ok)" : "var(--accent)"}" stroke-width="2">
          <title>${esc(p.name || "Test")}: ${nets[i]} WPM (${Number(p.acc || 0).toFixed(1)}% acc)</title>
        </circle>
      `).join("")}
      <text x="${padL}" y="${H - 5}" fill="var(--ink-3)" font-size="10">Oldest</text>
      <text x="${W - padR}" y="${H - 5}" text-anchor="end" fill="var(--ink-3)" font-size="10">Newest</text>
    </svg>
  </div>`;
}

export function renderProgress(view) {
  const hist = [...store.history()].sort((a, b) => new Date(b.ts || 0) - new Date(a.ts || 0));

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
      <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">
        <a class="btn btn-primary" href="#/arena">Take your first mock</a>
        <label class="btn" for="importBackupEmpty">Import backup</label>
        <input id="importBackupEmpty" type="file" accept="application/json,.json" hidden />
      </div>
      <p class="hint" id="importEmptyMsg" role="status"></p>
    </div>`;
    const impEmpty = view.querySelector("#importBackupEmpty");
    if (impEmpty) {
      impEmpty.addEventListener("change", () => handleImport(impEmpty, view.querySelector("#importEmptyMsg"), view));
    }
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

  let filter = "all";
  let query = "";
  let selectedId = hist[0].id;

  view.innerHTML = `
  <section class="page-head">
    <h1>Progress</h1>
    <p class="lede">Every finished test, newest first. Filter by exam, inspect your trend, or select any row to reopen its full breakdown.</p>
  </section>

  <div class="mock-tools" style="margin-top:18px">
    <div class="seg" role="group" aria-label="Filter history" id="histFilterSeg">
      ${[
        ["all", "All"],
        ["hcm", "HCM"],
        ["chsl", "CHSL"],
        ["cgl", "CGL"],
        ["rrb", "RRB"],
        ["practice", "Practice"],
        ["custom", "Custom"],
      ].map(([id, lbl]) => `<button type="button" data-hfilter="${id}" aria-pressed="${id === "all"}">${lbl}</button>`).join("")}
    </div>
    <input class="search-input" id="histSearch" type="search" placeholder="Search test name…" aria-label="Search history" />
  </div>

  <div id="histSummary"></div>
  <div id="trendHost"></div>
  <div id="detailHost"></div>
  <div class="hist-list" id="histList" role="list" aria-label="Test history"></div>

  <div class="progress-footer-actions">
    <button class="btn" id="exportBackup" type="button">Export backup (.json)</button>
    <label class="btn" for="importBackup">Import backup</label>
    <input id="importBackup" type="file" accept="application/json,.json" hidden />
    <span style="flex:1"></span>
    <button class="btn btn-quiet" id="clearHist" type="button">Clear all history</button>
  </div>
  <p class="hint" id="backupStatus" role="status" style="margin-top:8px;color:var(--ink-2);font-size:var(--fs-small)"></p>`;

  const summaryHost = view.querySelector("#histSummary");
  const trendHost = view.querySelector("#trendHost");
  const detailHost = view.querySelector("#detailHost");
  const listHost = view.querySelector("#histList");
  const searchEl = view.querySelector("#histSearch");

  function filteredRows() {
    const q = query.trim().toLowerCase();
    return hist.filter((e) => {
      if (!matchesFilter(e, filter)) return false;
      if (q && !(e.name || "").toLowerCase().includes(q)) return false;
      return true;
    });
  }

  function paintDetail(rows) {
    const e = rows.find((h) => h.id === selectedId) || rows[0];
    if (!e) { detailHost.innerHTML = ""; return; }
    selectedId = e.id;
    const cats = Object.entries(e.errCat || {}).filter(([, n]) => n > 0);
    const weakKeys = Object.entries(e.weakKeys || {}).sort((a, b) => b[1] - a[1]).slice(0, 8);
    const weakWords = Object.entries(e.weakWords || {}).sort((a, b) => b[1] - a[1]).slice(0, 10);
    const hasExBreakdown = e.engine === "E1" || e.engine === "E2" || e.full != null || e.half != null;
    const mistakeCount = e.errs ?? 0;
    const details = Array.isArray(e.mistakeDetail) ? e.mistakeDetail : [];
    const totalMistakesRecorded = cats.length > 0 || mistakeCount > 0 || (e.full || 0) > 0 || (e.half || 0) > 0 || details.length > 0;

    let mistakeSection = "";
    if (!totalMistakesRecorded) {
      mistakeSection = `<p style="margin-top:16px;color:var(--ok);font-weight:600">A clean sheet — no mistakes recorded.</p>`;
    } else if (cats.length) {
      mistakeSection = `<h3 style="font-size:var(--fs-h3);margin-top:20px">Where the mistakes were</h3>
        <table class="calc-table"><tbody>
          ${cats.map(([k, n]) => `<tr><td>${esc(CAT_LABELS[k] || k)}</td><td><strong>${n}</strong></td></tr>`).join("")}
        </tbody></table>`;
    } else if (hasExBreakdown) {
      const bd = e.breakdown || {};
      const rowsEx = [
        e.full != null ? ["Full mistakes", e.full] : null,
        e.half != null ? ["Half mistakes", e.half] : null,
        bd.wrong ? ["Wrong / misspelled", bd.wrong] : null,
        bd.skipped ? ["Skipped words", bd.skipped] : null,
        bd.extra ? ["Extra words", bd.extra] : null,
        e.allowance != null ? ["Free 5% allowance", e.allowance.toFixed ? e.allowance.toFixed(1) : e.allowance] : null,
      ].filter(Boolean);
      if (rowsEx.length) {
        mistakeSection = `<h3 style="font-size:var(--fs-h3);margin-top:20px">Mistake summary</h3>
          <table class="calc-table"><tbody>
            ${rowsEx.map(([k, n]) => `<tr><td>${esc(k)}</td><td><strong>${esc(n)}</strong></td></tr>`).join("")}
          </tbody></table>`;
      }
    }

    detailHost.innerHTML = `
    <div class="detail-panel" aria-live="polite">
      <div class="detail-head">
        <div>
          <p class="label">Stored result</p>
          <h2 style="font-size:1.3rem;margin-top:6px">${esc(e.name || "Test")}</h2>
          <p style="color:var(--ink-3);font-size:var(--fs-small);margin-top:4px">${esc(modeLabel(e))} · ${esc(e.dateStr || fmtDate(e.ts))}${e.category ? ` · ${esc(e.category)}` : ""}${e.verdict ? ` · ${esc(e.verdict)}` : (e.qualified != null && (e.mode === "mock" || e.mode === "custom") ? ` · ${e.qualified ? "Qualified" : "Below the qualifying bar"}` : "")}</p>
        </div>
        ${verdictBadge(e)}
      </div>
      <div class="detail-grid">
        <div class="readout"><span class="readout-value num" style="font-size:1.7rem">${Math.round(e.net || 0)}</span><span class="label">Net WPM</span></div>
        <div class="readout"><span class="readout-value num" style="font-size:1.7rem">${Math.round(e.gross || 0)}</span><span class="label">Gross WPM</span></div>
        <div class="readout"><span class="readout-value num" style="font-size:1.7rem">${Number(e.acc || 0).toFixed(1)}<span class="unit">%</span></span><span class="label">Accuracy</span></div>
        <div class="readout"><span class="readout-value num" style="font-size:1.7rem">${mistakeCount}</span><span class="label">Mistakes</span></div>
        ${e.errorPct != null ? `<div class="readout"><span class="readout-value num" style="font-size:1.7rem">${e.errorPct}<span class="unit">%</span></span><span class="label">Error %</span></div>` : ""}
        ${e.examId === "hcm" && e.marks != null ? `<div class="readout"><span class="readout-value num" style="font-size:1.7rem">${e.marks}<span class="unit">/25</span></span><span class="label">Marks</span></div>` : ""}
        <div class="readout"><span class="readout-value num" style="font-size:1.7rem">${e.chars ?? 0}</span><span class="label">Keystrokes</span></div>
        <div class="readout"><span class="readout-value num" style="font-size:1.7rem">${e.bs ?? 0}</span><span class="label">Backspaces</span></div>
        <div class="readout"><span class="readout-value num" style="font-size:1.7rem">${Math.round((e.durSec || 0) / 6) / 10}<span class="unit">min</span></span><span class="label">Time used</span></div>
      </div>
      ${mistakeSection}
      ${details.length ? `<h3 style="font-size:var(--fs-h3);margin-top:20px">Mistakes (${details.length}${details.length >= 40 ? "+" : ""})</h3>
        <table class="mistake-table">
          <thead><tr><th>Passage</th><th>You typed</th><th>Kind</th></tr></thead>
          <tbody>
            ${details.slice(0, 25).map((r) => `<tr><td>${esc(r.exp || "—")}</td><td class="got">${esc(r.got === "" ? "(skipped)" : r.got)}</td><td>${esc(r.st || r.kind || "full")}</td></tr>`).join("")}
          </tbody>
        </table>` : ""}
      ${weakWords.length ? `<h3 style="font-size:var(--fs-h3);margin-top:20px">Words to revise</h3>
        <div class="word-chips">${weakWords.map(([w, n]) => `<span class="word-chip">${esc(w)}<b>×${n}</b></span>`).join("")}</div>` : ""}
      ${weakKeys.length ? `<h3 style="font-size:var(--fs-h3);margin-top:20px">Weakest keys</h3>
        <div class="word-chips">${weakKeys.map(([k, n]) => `<span class="word-chip mono">${esc(k === " " ? "space" : k)}<b>×${n}</b></span>`).join("")}</div>` : ""}
    </div>`;
  }

  function paint() {
    const rows = filteredRows();
    const totalSec = rows.reduce((s, h) => s + (h.durSec || 0), 0);
    const last10 = rows.slice(0, 10);
    const avgNet = last10.length ? Math.round(last10.reduce((s, h) => s + (h.net || 0), 0) / last10.length) : 0;
    const avgAcc = last10.length ? (last10.reduce((s, h) => s + (h.acc || 0), 0) / last10.length).toFixed(1) : "0.0";
    const bestNet = rows.length ? Math.max(...rows.map((h) => Math.round(h.net || 0))) : 0;

    summaryHost.innerHTML = `
    <div class="hub-spec" role="list" aria-label="Your totals">
      <div class="readout" role="listitem"><span class="readout-value num">${rows.length}</span><span class="label">Tests shown</span></div>
      <div class="readout" role="listitem"><span class="readout-value num">${Math.floor(totalSec / 60)}<span class="unit">min typing</span></span><span class="label">Practice time</span></div>
      <div class="readout" role="listitem"><span class="readout-value num">${avgNet}<span class="unit">WPM</span></span><span class="label">Avg net · last ${last10.length}</span></div>
      <div class="readout" role="listitem"><span class="readout-value num">${avgAcc}<span class="unit">%</span></span><span class="label">Avg accuracy · last ${last10.length}</span></div>
      <div class="readout" role="listitem"><span class="readout-value num">${bestNet}<span class="unit">WPM</span></span><span class="label">Best net</span></div>
    </div>`;

    const spec = (filter === "hcm" || filter === "chsl" || filter === "rrb") ? specOf(filter) : null;
    trendHost.innerHTML = renderTrendSvg(rows, spec ? spec.targetWPM : 0);

    if (!rows.length) {
      detailHost.innerHTML = "";
      listHost.innerHTML = `<div class="empty-note" style="margin-top:16px"><p>No tests match that filter yet.</p></div>`;
      return;
    }

    if (!rows.some((r) => r.id === selectedId)) selectedId = rows[0].id;
    paintDetail(rows);

    listHost.innerHTML = rows.map((e) => `
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
    </button>`).join("");

    listHost.querySelectorAll("[data-id]").forEach((row) => {
      row.addEventListener("click", () => {
        selectedId = row.dataset.id;
        listHost.querySelectorAll("[data-id]").forEach((r) =>
          r.setAttribute("aria-pressed", String(r.dataset.id === selectedId)));
        paintDetail(rows);
        detailHost.scrollIntoView({ block: "nearest", behavior: "smooth" });
      });
    });
  }

  view.querySelectorAll("#histFilterSeg [data-hfilter]").forEach((btn) => {
    btn.addEventListener("click", () => {
      filter = btn.dataset.hfilter;
      view.querySelectorAll("#histFilterSeg [data-hfilter]").forEach((b) =>
        b.setAttribute("aria-pressed", String(b === btn)));
      paint();
    });
  });

  searchEl.addEventListener("input", () => {
    query = searchEl.value;
    paint();
  });

  view.querySelector("#exportBackup").addEventListener("click", () => {
    const data = store.exportBackup();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `riyaz-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    view.querySelector("#backupStatus").textContent = "Backup exported to your downloads folder.";
  });

  view.querySelector("#importBackup").addEventListener("change", (ev) =>
    handleImport(ev.target, view.querySelector("#backupStatus"), view));

  view.querySelector("#clearHist").addEventListener("click", () => {
    if (!window.confirm("Clear all saved typing results on this device? This cannot be undone.")) return;
    store.clearHistory();
    renderProgress(view);
  });

  paint();
}

function handleImport(input, statusEl, view) {
  const file = input.files && input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(String(reader.result || ""));
      const res = store.importBackup(parsed);
      if (!res.ok) {
        if (statusEl) statusEl.textContent = res.reason || "Could not import backup.";
        return;
      }
      renderProgress(view);
    } catch (e) {
      if (statusEl) statusEl.textContent = "That file is not valid Riyaz JSON.";
    }
  };
  reader.readAsText(file);
}
