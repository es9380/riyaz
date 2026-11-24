/* Riyaz — Training Studio: warm-up sets, drills by part, and a
   revision set built from your own weak words. Content loads lazily. */

import { launchStage } from "../app.js";
import * as store from "../core/store.js";
import * as stats from "../core/stats.js";

const esc = (s) =>
  String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));

function weakWordCounts(hist) {
  const map = {};
  hist.slice(0, 12).forEach((h) =>
    Object.entries(h.weakWords || {}).forEach(([w, n]) => { map[w] = (map[w] || 0) + (n || 0); })
  );
  return Object.entries(map).sort((a, b) => b[1] - a[1]);
}

function weakKeyList(hist) {
  let raw = null;
  try { raw = stats.weakKeys(hist); } catch (e) {}
  if (Array.isArray(raw) && raw.length) {
    return raw.slice(0, 10).map((k) =>
      typeof k === "string" ? { key: k, count: null } : { key: k.key || k.char || "?", count: k.count ?? k.n ?? null });
  }
  if (raw && typeof raw === "object" && Object.keys(raw).length) {
    return Object.entries(raw).sort((a, b) => b[1] - a[1]).slice(0, 10)
      .map(([key, count]) => ({ key, count }));
  }
  const map = {};
  hist.slice(0, 12).forEach((h) =>
    Object.entries(h.weakKeys || {}).forEach(([k, n]) => { map[k] = (map[k] || 0) + (n || 0); })
  );
  return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 10)
    .map(([key, count]) => ({ key, count }));
}

export async function renderStudio(view) {
  const hist = store.history();
  const weakWords = weakWordCounts(hist);
  const weakKeys = weakKeyList(hist);

  view.innerHTML = `
  <section class="page-head">
    <h1>Training Studio</h1>
    <p class="lede">Short, deliberate practice: warm-ups to loosen the fingers, drills that
      isolate one weakness at a time, and a revision set built from the words your own
      results say you miss.</p>
  </section>

  <section class="section" aria-labelledby="revH" style="margin-top:30px">
    <div class="section-head"><h2 id="revH">Your revision set</h2></div>
    ${weakWords.length ? `
      <p style="color:var(--ink-2);max-width:62ch">Built from your last ${Math.min(12, hist.length)} results.
        These are the words that have actually cost you marks — not a generic list.</p>
      ${weakKeys.length ? `<div class="weak-keys" aria-label="Your weakest keys">
        ${weakKeys.map((k) => `<span class="key-chip">${esc(k.key === " " ? "space" : k.key)}${k.count != null ? `<b>×${k.count}</b>` : ""}</span>`).join("")}
      </div>` : ""}
      <p style="margin-top:16px"><button class="btn btn-primary" id="revStart" type="button">Start revision — ${weakWords.slice(0, 8).length} weak words</button></p>`
    : `
      <div class="empty-note">
        <p><strong>No revision set yet.</strong></p>
        <p>Take any mock first — the words you miss there become this set automatically.</p>
        <a class="btn" href="#/arena">Open Exam Arena</a>
      </div>`}
  </section>

  <div id="studioBody"><p style="color:var(--ink-3);margin-top:34px">Loading warm-ups and drills…</p></div>`;

  const revBtn = view.querySelector("#revStart");
  if (revBtn) {
    revBtn.addEventListener("click", () => {
      const words = weakWords.slice(0, 10).map(([w]) => w);
      const rounds = [];
      for (let r = 0; r < 5; r++) rounds.push(...words);
      launchStage({
        examId: "hcm",
        mode: "revision",
        title: "Revision — your weak words",
        text: rounds.join(" "),
        durationMin: 5,
        backspaceDefault: true,
        testId: "revision-weak",
      });
    });
  }

  const [{ WARMUPS }, { DRILLS, DIFF }] = await Promise.all([
    import("../data/warmups.js"),
    import("../data/drills.js"),
  ]);

  const body = view.querySelector("#studioBody");
  body.innerHTML = `
  <section class="section" aria-labelledby="wuH">
    <div class="section-head">
      <h2 id="wuH">Warm-ups</h2>
      <span class="aside">15-minute sets, or one short subset at a time</span>
    </div>
    ${WARMUPS.map((set) => `
    <div class="set-block">
      <div class="set-head">
        <span class="set-name">${esc(set.name)}</span>
        <span class="chip chip-${esc(set.level)}">${esc(set.level)}</span>
        <span class="set-desc">${esc(set.desc || "")}</span>
        <button class="btn" type="button" data-set="${esc(set.id)}">Full set · 15 min</button>
      </div>
      <div class="subset-rows">
        ${(set.subsets || []).slice(1).map((sub) => `
        <button type="button" class="item-row" data-subset="${esc(sub.id)}" data-setid="${esc(set.id)}">
          <span>
            <span class="ir-name">Subset ${sub.n} — ${esc(sub.topic || "Practice")}</span>
            <span class="ir-desc" style="display:block">${sub.text.split(/\s+/).filter(Boolean).length} words</span>
          </span>
          <span class="mock-go">Start</span>
        </button>`).join("")}
      </div>
    </div>`).join("")}
  </section>

  <section class="section" aria-labelledby="drillH">
    <div class="section-head">
      <h2 id="drillH">Drills</h2>
      <span class="aside">${DRILLS.reduce((n, p) => n + p.items.length, 0)} drills in ${DRILLS.length} parts</span>
    </div>
    ${DRILLS.map((part) => `
    <div class="studio-group">
      <h3>${esc(part.part)}</h3>
      <div class="item-rows">
        ${part.items.map((d) => `
        <button type="button" class="item-row" data-drill="${esc(d.id)}">
          <span>
            <span class="ir-name">${esc(d.name)}</span>
            ${d.desc ? `<span class="ir-desc" style="display:block">${esc(d.desc)}</span>` : ""}
          </span>
          <span style="display:flex;gap:10px;align-items:center">
            ${DIFF && DIFF[d.id] ? `<span class="chip chip-${esc(DIFF[d.id])}">${esc(DIFF[d.id])}</span>` : ""}
            <span class="mock-go">Start</span>
          </span>
        </button>`).join("")}
      </div>
    </div>`).join("")}
  </section>`;

  const allSubsets = {};
  WARMUPS.forEach((set) => (set.subsets || []).forEach((s) => { allSubsets[s.id] = { ...s, setName: set.name }; }));

  body.querySelectorAll("[data-set]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const set = WARMUPS.find((s) => s.id === btn.dataset.set);
      if (!set) return;
      launchStage({
        examId: "hcm", mode: "warmup", title: set.name, text: set.text,
        durationMin: 15, backspaceDefault: true, testId: set.id,
      });
    });
  });

  body.querySelectorAll("[data-subset]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const sub = allSubsets[btn.dataset.subset];
      if (!sub) return;
      launchStage({
        examId: "hcm", mode: "warmup",
        title: `${sub.setName} — Subset ${sub.n}`,
        text: sub.text, durationMin: 5, backspaceDefault: true, testId: sub.id,
      });
    });
  });

  body.querySelectorAll("[data-drill]").forEach((btn) => {
    btn.addEventListener("click", () => {
      let drill = null;
      for (const part of DRILLS) {
        drill = part.items.find((d) => d.id === btn.dataset.drill) || drill;
        if (drill) break;
      }
      if (!drill) return;
      launchStage({
        examId: "hcm", mode: "drill", title: drill.name, text: drill.text,
        durationMin: 5, backspaceDefault: true, testId: drill.id,
      });
    });
  });
}
