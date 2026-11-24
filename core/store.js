/* core/store.js — localStorage persistence (engine track).
   No accounts, no backend: everything lives on this device.
   Keys (new build, namespaced "tsn_"):
     tsn_history_v1   — result entries, newest first
     tsn_settings_v1  — free-form settings object (setting(k, v))
     tsn_goal_v1      — daily test goal (default 2)
     tsn_theme_v1     — "dark" | "light" (default "dark")
     tsn_font_v1      — text-size step 0..3 = S/M/L/XL (default 1 = M);
                        THE single persisted text-size key for every stage.
   History entry shape (built by core/engine.js, stored as-is):
     { id, ts, dateStr, examId, mode, name, testId, gross, net, acc, errs,
       marks, qualified, durSec, min, chars, words, bs, errCat, weakKeys,
       weakWords }  (+ optional exam extras: full, half, errorPct, …) */

const K_HIST = "tsn_history_v1";
const K_NCRTC = "tsn_ncrtc_v1";
const K_SET = "tsn_settings_v1";
const K_GOAL = "tsn_goal_v1";
const K_THEME = "tsn_theme_v1";
const K_FONT = "tsn_font_v1";
const MAX_HIST = 500;
const MAX_NCRTC = 300;

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return fallback;
    return JSON.parse(raw);
  } catch (e) { return fallback; }
}
function write(key, val) {
  try {
    localStorage.setItem(key, JSON.stringify(val));
    return true;
  } catch (e) {
    /* If storage is full and we're writing a history list, trim oldest entries and retry once */
    if (Array.isArray(val) && val.length > 20) {
      try {
        localStorage.setItem(key, JSON.stringify(val.slice(0, Math.floor(val.length / 2))));
        return true;
      } catch (e2) {}
    }
    return false;
  }
}

let idSeq = 0;
function newId() {
  idSeq++;
  return "r" + Date.now().toString(36) + "-" + idSeq.toString(36) + Math.floor(Math.random() * 1e6).toString(36);
}

/* ---------------- history ---------------- */

export function history() {
  const h = read(K_HIST, []);
  return Array.isArray(h) ? h : [];
}

export function addResult(entry) {
  if (!entry || typeof entry !== "object") return null;
  const now = new Date();
  const full = Object.assign({}, entry);
  if (!full.id) full.id = newId();
  if (!full.ts) full.ts = now.toISOString();
  if (!full.dateStr) full.dateStr = now.toLocaleString("en-IN");
  const h = history();
  h.unshift(full);
  if (h.length > MAX_HIST) h.length = MAX_HIST;
  write(K_HIST, h);
  return full;
}

export function clearHistory() {
  try { localStorage.removeItem(K_HIST); } catch (e) {}
}

/* ---------------- NCRTC MCQ history (isolated from typing history) ---------------- */

export function ncrtcHistory() {
  const h = read(K_NCRTC, []);
  return Array.isArray(h) ? h : [];
}

export function addNcrtcResult(entry) {
  if (!entry || typeof entry !== "object") return null;
  const now = new Date();
  const full = Object.assign({}, entry);
  if (!full.id) full.id = "nc-" + newId();
  if (!full.ts) full.ts = now.toISOString();
  const h = ncrtcHistory();
  h.unshift(full);
  if (h.length > MAX_NCRTC) h.length = MAX_NCRTC;
  write(K_NCRTC, h);
  return full;
}

export function bestNcrtcFor(testId) {
  if (!testId) return null;
  let best = null;
  ncrtcHistory().forEach(function (x) {
    if (x.testId !== testId || typeof x.pct !== "number") return;
    if (!best || x.pct > best.pct) best = x;
  });
  return best;
}

export function clearNcrtcHistory() {
  try { localStorage.removeItem(K_NCRTC); } catch (e) {}
}

/* ---------------- backup export / import ---------------- */

export function exportBackup() {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    history: history(),
    ncrtcHistory: ncrtcHistory(),
    goal: goal(),
    theme: theme(),
    fontStep: fontStep(),
    settings: read(K_SET, {}),
  };
}

export function importBackup(data) {
  if (!data || typeof data !== "object") return { ok: false, reason: "Invalid backup file." };
  if (!Array.isArray(data.history) && !Array.isArray(data.ncrtcHistory)) {
    return { ok: false, reason: "Backup contains no typing or NCRTC history." };
  }
  let importedCount = 0;
  if (Array.isArray(data.history)) {
    const existing = history();
    const seen = new Set(existing.map((x) => x.id).filter(Boolean));
    const merged = existing.slice();
    for (const item of data.history) {
      if (!item || typeof item !== "object") continue;
      if (item.id && seen.has(item.id)) continue;
      if (item.id) seen.add(item.id);
      merged.push(item);
      importedCount++;
    }
    merged.sort((a, b) => new Date(b.ts || 0) - new Date(a.ts || 0));
    if (merged.length > MAX_HIST) merged.length = MAX_HIST;
    write(K_HIST, merged);
  }
  if (Array.isArray(data.ncrtcHistory)) {
    const existingN = ncrtcHistory();
    const seenN = new Set(existingN.map((x) => x.id).filter(Boolean));
    const mergedN = existingN.slice();
    for (const item of data.ncrtcHistory) {
      if (!item || typeof item !== "object") continue;
      if (item.id && seenN.has(item.id)) continue;
      if (item.id) seenN.add(item.id);
      mergedN.push(item);
      importedCount++;
    }
    mergedN.sort((a, b) => new Date(b.ts || 0) - new Date(a.ts || 0));
    if (mergedN.length > MAX_NCRTC) mergedN.length = MAX_NCRTC;
    write(K_NCRTC, mergedN);
  }
  if (typeof data.goal === "number") setGoal(data.goal);
  return { ok: true, importedCount };
}

/* Best entry for a test id — highest net, earliest on ties. Null if none. */
export function bestFor(testId) {
  if (!testId) return null;
  let best = null;
  history().forEach(function (x) {
    if (x.testId !== testId || typeof x.net !== "number") return;
    if (!best || x.net > best.net) best = x;
  });
  return best;
}

/* ---------------- settings ---------------- */

export function setting(k, v) {
  const all = read(K_SET, {});
  if (v === undefined) return all[k];
  all[k] = v;
  write(K_SET, all);
  return v;
}

/* ---------------- daily goal ---------------- */

export function goal() {
  const n = parseInt(read(K_GOAL, 2), 10);
  return n >= 1 && n <= 10 ? n : 2;
}
export function setGoal(n) {
  const num = Number(n);
  if (!Number.isFinite(num)) return goal();
  const clamped = Math.max(1, Math.min(10, Math.round(num)));
  write(K_GOAL, clamped);
  return clamped;
}

/* ---------------- theme ---------------- */

export function theme() {
  const t = read(K_THEME, "dark");
  return t === "light" ? "light" : "dark";
}
export function setTheme(t) {
  write(K_THEME, t === "light" ? "light" : "dark");
  return theme();
}

/* ---------------- text size (one key for every typing context) ---------------- */

export function fontStep() {
  const n = parseInt(read(K_FONT, 1), 10);
  return n >= 0 && n <= 3 ? n : 1;
}
export function setFontStep(n) {
  n = Math.round(+n || 0);
  if (n >= 0 && n <= 3) write(K_FONT, n);
  return fontStep();
}
