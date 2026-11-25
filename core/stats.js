/* core/stats.js — pure read-outs over a history array (store.js shape).
   No storage access here: callers pass history() in. Formulas are the ones
   the live site's dashboard settled on (last-5 readiness with the accuracy
   discount, CGL zero-target handling, typing-time per local day). */

import { specOf } from "../data/examSpecs.js";

/* Readiness for one exam: average of the last 5 attempts of that exam vs
   its target WPM, discounted when average accuracy is under 95%.
   HCM-stage entries may carry examId "" or "hcm" (both are HCM).
   Zero-target exams (CGL DEST, targetWPM literally 0): readiness comes
   from accuracy vs the 95% benchmark × headroom of the average error%
   under the exam's UR error cap. Returns null with no attempts. */
export function readiness(hist, examId) {
  const list = Array.isArray(hist) ? hist : [];
  const mine = list.filter(function (x) {
    const examMatch = examId === "hcm" ? (!x.examId || x.examId === "hcm") : (x.examId === examId);
    /* Incomplete attempts (early submits) are practice records only — they
       must never feed readiness, or an 11-second sprint would inflate it. */
    return examMatch && typeof x.net === "number" && !x.incomplete;
  }).slice(0, 5);
  if (!mine.length) return null;
  const avgNet = mine.reduce(function (a, x) { return a + x.net; }, 0) / mine.length;
  const avgAcc = mine.reduce(function (a, x) { return a + (x.acc || 0); }, 0) / mine.length;
  const accF = Math.min(1, Math.max(0, avgAcc / 95));
  const sp = specOf(examId);
  const targetWPM = sp ? sp.targetWPM : 0;
  if (!targetWPM) {
    const withErr = mine.filter(function (x) { return typeof x.errorPct === "number"; });
    let pct;
    if (withErr.length) {
      const ur = sp && sp.categories ? sp.categories.find(function (c) { return c.id === "UR"; }) : null;
      const cap = ur && ur.cap > 0 ? ur.cap : 20;
      const avgErr = withErr.reduce(function (a, x) { return a + x.errorPct; }, 0) / withErr.length;
      const errF = Math.min(1, Math.max(0, 1 - avgErr / cap));
      pct = Math.round(accF * errF * 100);
    } else {
      pct = Math.round(accF * 100);
    }
    return { pct, avgNet: Math.round(avgNet * 10) / 10, avgAcc: Math.round(avgAcc * 10) / 10, n: mine.length };
  }
  const speed = Math.min(1, Math.max(0, avgNet / targetWPM));
  return { pct: Math.round(speed * accF * 100), avgNet: Math.round(avgNet * 10) / 10, avgAcc: Math.round(avgAcc * 10) / 10, n: mine.length };
}

/* Typing time per local calendar day for the last `days` days (oldest
   first, today last): [{ date: Date (local midnight), seconds }].
   Sums durSec when present, else min×60 — the settled fallback. */
export function typingTimeByDay(hist, days = 7, now = new Date()) {
  const per = {};
  (Array.isArray(hist) ? hist : []).forEach(function (x) {
    const d = new Date(x.ts || x.dateStr);
    if (isNaN(d)) return;
    const sec = x.durSec ? +x.durSec : (x.min ? +x.min * 60 : 0);
    if (!sec || isNaN(sec)) return;
    const k = d.toDateString();
    per[k] = (per[k] || 0) + sec;
  });
  const out = [];
  const cur = new Date(now); cur.setHours(0, 0, 0, 0);
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(cur); d.setDate(d.getDate() - i);
    out.push({ date: d, seconds: per[d.toDateString()] || 0 });
  }
  return out;
}

/* Weak keys / words tallied over the most recent `limit` entries.
   Returns [{ key, count }] / [{ word, count }], most frequent first. */
export function weakKeys(hist, limit = 20, top = 6) {
  const tally = {};
  (Array.isArray(hist) ? hist : []).slice(0, limit).forEach(function (x) {
    if (x.weakKeys) Object.keys(x.weakKeys).forEach(function (k) { tally[k] = (tally[k] || 0) + x.weakKeys[k]; });
  });
  return Object.keys(tally)
    .map(function (k) { return { key: k, count: tally[k] }; })
    .sort(function (a, b) { return b.count - a.count; })
    .slice(0, top);
}

export function weakWords(hist, limit = 20, top = 6) {
  const tally = {};
  (Array.isArray(hist) ? hist : []).slice(0, limit).forEach(function (x) {
    if (x.weakWords) Object.keys(x.weakWords).forEach(function (k) { tally[k] = (tally[k] || 0) + x.weakWords[k]; });
  });
  return Object.keys(tally)
    .map(function (k) { return { word: k, count: tally[k] }; })
    .sort(function (a, b) { return b.count - a.count; })
    .slice(0, top);
}

/* Next-best-step for Home, three states:
   - "none": no attempts at this exam yet → start with a mock.
   - "weak": recent attempts carry weak keys → drill those keys.
   - "clean": attempts exist, no dominant weak key → keep momentum. */
export function nextStep(hist, examId) {
  const list = Array.isArray(hist) ? hist : [];
  const mine = list.filter(function (x) {
    return examId === "hcm" ? (!x.examId || x.examId === "hcm") : (x.examId === examId);
  });
  if (!mine.length) return { state: "none", examId, keys: [] };
  const keys = weakKeys(mine, 20, 3);
  if (keys.length && keys[0].count >= 3) return { state: "weak", examId, keys };
  return { state: "clean", examId, keys: [] };
}
