/* Riyaz — Training Studio: warm-up sets, drills by part, and a
   revision set built from your own weak words. Content loads lazily. */

import { launchStage } from "../app.js";
import * as store from "../core/store.js";
import * as stats from "../core/stats.js";
import { esc, icon } from "../core/util.js";

function weakWordCounts(hist) {
  const map = {};
  hist.slice(0, 12).forEach((h) => {
    const entries = Object.entries(h.weakWords || {});
    if (entries.length) {
      entries.forEach(([w, n]) => { map[w] = (map[w] || 0) + (n || 0); });
    } else if (Array.isArray(h.mistakeDetail)) {
      /* E1/E2 (SSC/RRB) stores missed words in mistakeDetail instead of weakWords */
      h.mistakeDetail.forEach((d) => {
        const raw = d && d.exp ? String(d.exp).trim() : "";
        if (!raw || raw === "(extra)") return;
        raw.split(/\s+/).forEach((w) => {
          if (w) map[w] = (map[w] || 0) + 1;
        });
      });
    }
  });
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

function buildBestByTest(hist) {
  const map = {};
  for (const h of hist) {
    if (!h.testId) continue;
    const prev = map[h.testId];
    const accChar = h.words > 0 ? ((h.words - (h.errs || 0)) / h.words) * 100 : (h.acc || 0);
    const mastered = h.mode === "drill" && accChar >= 98 && (h.words || 0) >= 10;
    if (!prev) {
      map[h.testId] = { net: h.net || 0, acc: h.acc || 0, mastered };
    } else {
      prev.net = Math.max(prev.net, h.net || 0);
      prev.acc = Math.max(prev.acc, h.acc || 0);
      prev.mastered = prev.mastered || mastered;
    }
  }
  return map;
}

export async function renderStudio(view) {
  const hist = store.history();
  const weakWords = weakWordCounts(hist);
  const weakKeys = weakKeyList(hist);
  const bestByTest = buildBestByTest(hist);
  const revWords = weakWords.slice(0, 10);

  view.innerHTML = `
  <section class="page-head">
    <h1>Drills &amp; Warm-ups</h1>
    <p class="lede">Master keys, weak words, punctuation, and exam vocabulary.</p>
  </section>

  <section class="section" aria-labelledby="revH" style="margin-top:24px">
    <div class="section-head">
      <h2 id="revH">${icon("bolt", 18)} Practise Your Mistakes</h2>
      ${revWords.length ? `<span class="aside">${revWords.length} weak word${revWords.length === 1 ? "" : "s"} queued</span>` : ""}
    </div>
    ${revWords.length ? `
      <div class="rev-card">
        <div class="word-chips" aria-label="Weak words in your revision set">
          ${revWords.map(([w, n]) => `<span class="word-chip">${esc(w)}<b>×${n}</b></span>`).join("")}
        </div>
        ${weakKeys.length ? `<div class="weak-keys" aria-label="Your weakest keys">
          ${weakKeys.map((k) => `<span class="key-chip">${esc(k.key === " " ? "space" : k.key)}${k.count != null ? `<b>×${k.count}</b>` : ""}</span>`).join("")}
        </div>` : ""}
        <div class="rev-actions">
          <div class="seg" role="group" aria-label="Revision duration" id="revDurSeg">
            ${[3, 5, 10].map((m) => `<button type="button" data-revdur="${m}" aria-pressed="${m === 5}">${m}m</button>`).join("")}
          </div>
          <button class="btn btn-primary" id="revStart" type="button">${icon("play", 15)} <span>Practise ${revWords.length} Weak Word${revWords.length === 1 ? "" : "s"}</span></button>
        </div>
      </div>`
    : `
      <div class="empty-note">
        <p><strong>No missed words yet.</strong> Finish any mock and your weak words appear here automatically.</p>
        <a class="btn" href="#/arena">${icon("target", 15)} <span>Go to Exams</span></a>
      </div>`}
  </section>

  <div id="studioBody"><p style="color:var(--ink-3);margin-top:34px">Loading drills…</p></div>`;

  let revDur = 5;
  view.querySelectorAll("#revDurSeg [data-revdur]").forEach((btn) => {
    btn.addEventListener("click", () => {
      revDur = parseInt(btn.dataset.revdur, 10) || 5;
      view.querySelectorAll("#revDurSeg [data-revdur]").forEach((b) =>
        b.setAttribute("aria-pressed", String(b === btn)));
    });
  });

  const revBtn = view.querySelector("#revStart");
  if (revBtn) {
    revBtn.addEventListener("click", () => {
      const words = revWords.map(([w]) => w);
      const rounds = [];
      for (let r = 0; r < 5; r++) rounds.push(...words);
      launchStage({
        examId: "hcm",
        mode: "revision",
        title: "Revision — your weak words",
        text: rounds.join(" "),
        durationMin: revDur,
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
  if (!body) return;

  const totalDrills = DRILLS.reduce((n, p) => n + p.items.length, 0);
  const masteredCount = DRILLS.reduce(
    (n, p) => n + p.items.filter((d) => bestByTest[d.id]?.mastered).length,
    0,
  );
  const masteryPct = totalDrills ? Math.round((masteredCount / totalDrills) * 100) : 0;

  body.innerHTML = `
  <div class="studio-mastery">
    <div class="sm-top">
      <span class="label">${icon("trophy", 13)} Drill Mastery (≥98% accuracy)</span>
      <span class="num"><strong>${masteredCount}</strong> / ${totalDrills}</span>
    </div>
    <div class="mini-meter" aria-hidden="true"><i class="fill-ok" style="width:${masteryPct}%"></i></div>
  </div>
  <div class="mock-tools" style="margin-top:20px">
    <div class="seg" role="group" aria-label="Filter studio sections" id="studioSecSeg">
      <button type="button" data-sec="all" aria-pressed="true">All</button>
      <button type="button" data-sec="warmups" aria-pressed="false">Warm-ups (${WARMUPS.length})</button>
      <button type="button" data-sec="vocab" aria-pressed="false">Vocabulary</button>
      <button type="button" data-sec="drills" aria-pressed="false">All Drills (${totalDrills})</button>
    </div>
    <input class="search-input" id="studioSearch" type="search" placeholder="Search drills or vocab…" aria-label="Filter warm-ups or drills" />
  </div>
  <div id="studioList"></div>`;

  const listHost = body.querySelector("#studioList");
  const searchEl = body.querySelector("#studioSearch");
  let sectionFilter = "all";
  let drillPartFilter = "all";
  let query = "";

  const allSubsets = {};
  WARMUPS.forEach((set) => (set.subsets || []).forEach((s) => { allSubsets[s.id] = { ...s, setName: set.name }; }));

  function scoreBadge(id) {
    const b = bestByTest[id];
    if (!b) return "";
    return `<span class="studio-score num">${b.mastered ? `<span class="tick-ok">✓ Mastered · </span>` : ""}${Math.round(b.net)} WPM</span>`;
  }

  function paintStudio() {
    const q = query.trim().toLowerCase();
    const showWarmups = sectionFilter === "all" || sectionFilter === "warmups";
    const showDrills = sectionFilter === "all" || sectionFilter === "drills" || sectionFilter === "vocab";
    const vocabIndex = DRILLS.findIndex((p) => /vocab/i.test(p.part));

    let wuHtml = "";
    if (showWarmups) {
      const filteredSets = WARMUPS.map((set) => {
        const setMatches = !q || `${set.name} ${set.desc || ""} ${set.level}`.toLowerCase().includes(q);
        const subs = (set.subsets || []).slice(1).filter((sub) =>
          !q || setMatches || `subset ${sub.n} ${sub.topic || ""}`.toLowerCase().includes(q)
        );
        if (!setMatches && !subs.length) return null;
        return { set, subs };
      }).filter(Boolean);

      if (filteredSets.length) {
        wuHtml = `
        <section class="section" aria-labelledby="wuH">
          <div class="section-head">
            <h2 id="wuH">${icon("flame", 18)} Warm-ups</h2>
            <span class="aside">15-min full sets or 5-min subsets</span>
          </div>
          ${filteredSets.map(({ set, subs }) => `
          <div class="set-block">
            <div class="set-head">
              <span class="set-name">${esc(set.name)}</span>
              <span class="chip chip-${esc(set.level)}">${esc(set.level)}</span>
              ${scoreBadge(set.id)}
              <span class="set-desc">${esc(set.desc || "")}</span>
              <button class="btn" type="button" data-set="${esc(set.id)}">${icon("play", 13)} Full · 15m</button>
            </div>
            ${subs.length ? `<div class="subset-rows">
              ${subs.map((sub) => `
              <button type="button" class="item-row" data-subset="${esc(sub.id)}" data-setid="${esc(set.id)}">
                <span>
                  <span class="ir-name">Subset ${sub.n} — ${esc(sub.topic || "Practice")}</span>
                  <span class="ir-desc" style="display:block">${sub.text.split(/\s+/).filter(Boolean).length} words</span>
                </span>
                <span style="display:flex;gap:10px;align-items:center">
                  ${scoreBadge(sub.id)}
                  <span class="mock-go">${icon("play", 13)} Start</span>
                </span>
              </button>`).join("")}
            </div>` : ""}
          </div>`).join("")}
        </section>`;
      }
    }

    let drillHtml = "";
    if (showDrills) {
      const activePart = sectionFilter === "vocab" && vocabIndex >= 0 ? String(vocabIndex) : drillPartFilter;
      const filteredParts = DRILLS.map((part, idx) => {
        if (activePart !== "all" && String(idx) !== activePart) return null;
        const partMatches = !q || part.part.toLowerCase().includes(q);
        const items = part.items.filter((d) =>
          !q || partMatches || `${d.name} ${d.desc || ""}`.toLowerCase().includes(q)
        );
        if (!items.length) return null;
        return { part: part.part, items };
      }).filter(Boolean);

      const partTabs = sectionFilter === "vocab" ? "" : `
      <div class="part-chips" role="group" aria-label="Drill parts" id="drillPartSeg">
        <button type="button" class="chip-btn" data-part="all" aria-pressed="${drillPartFilter === "all"}">All parts</button>
        ${DRILLS.map((p, idx) => {
          const shortName = p.part.replace(/^Part \d+\s*·\s*/, "");
          return `<button type="button" class="chip-btn" data-part="${idx}" aria-pressed="${drillPartFilter === String(idx)}">${esc(shortName)}</button>`;
        }).join("")}
      </div>`;

      const shownCount = filteredParts.reduce((n, p) => n + p.items.length, 0);
      drillHtml = `
      <section class="section" aria-labelledby="drillH">
        <div class="section-head">
          <h2 id="drillH">${icon("keyboard", 18)} ${sectionFilter === "vocab" ? "Vocabulary Drills" : "Skill Drills"}</h2>
          <span class="aside">${shownCount} drill${shownCount === 1 ? "" : "s"} · 5 min each</span>
        </div>
        ${partTabs}
        ${filteredParts.length ? filteredParts.map((part) => `
        <div class="studio-group">
          <h3>${esc(part.part)}</h3>
          <div class="item-rows">
            ${part.items.map((d) => `
            <button type="button" class="item-row" data-drill="${esc(d.id)}">
              <span>
                <span class="ir-name">${esc(d.name)}</span>
                ${d.desc ? `<span class="ir-desc" style="display:block">${esc(d.desc)}</span>` : ""}
              </span>
              <span style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;justify-content:flex-end">
                ${scoreBadge(d.id)}
                ${DIFF && DIFF[d.id] ? `<span class="chip chip-${esc(DIFF[d.id])}">${esc(DIFF[d.id])}</span>` : ""}
                <span class="mock-go">${icon("play", 13)} Start</span>
              </span>
            </button>`).join("")}
          </div>
        </div>`).join("") : `<div class="empty-note" style="margin-top:16px"><p>No matching drills.</p></div>`}
      </section>`;
    }

    listHost.innerHTML = (wuHtml + drillHtml) || `<div class="empty-note" style="margin-top:20px"><p>No matching items.</p></div>`;

    listHost.querySelectorAll("#drillPartSeg [data-part]").forEach((btn) => {
      btn.addEventListener("click", () => {
        drillPartFilter = btn.dataset.part;
        paintStudio();
      });
    });

    listHost.querySelectorAll("[data-set]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const set = WARMUPS.find((s) => s.id === btn.dataset.set);
        if (!set) return;
        launchStage({
          examId: "hcm", mode: "warmup", title: set.name, text: set.text,
          durationMin: 15, backspaceDefault: true, testId: set.id,
        });
      });
    });

    listHost.querySelectorAll("[data-subset]").forEach((btn) => {
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

    listHost.querySelectorAll("[data-drill]").forEach((btn) => {
      btn.addEventListener("click", () => {
        let drill = null;
        for (const part of DRILLS) {
          const hit = part.items.find((d) => d.id === btn.dataset.drill);
          if (hit) { drill = hit; break; }
        }
        if (!drill) return;
        launchStage({
          examId: "hcm", mode: "drill", title: drill.name, text: drill.text,
          durationMin: 5, backspaceDefault: true, testId: drill.id,
        });
      });
    });
  }

  body.querySelectorAll("#studioSecSeg [data-sec]").forEach((btn) => {
    btn.addEventListener("click", () => {
      sectionFilter = btn.dataset.sec;
      body.querySelectorAll("#studioSecSeg [data-sec]").forEach((b) =>
        b.setAttribute("aria-pressed", String(b === btn)));
      paintStudio();
    });
  });

  searchEl.addEventListener("input", () => {
    query = searchEl.value;
    paintStudio();
  });

  paintStudio();
}
