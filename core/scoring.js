/* core/scoring.js — PURE scoring module (no DOM, no storage).
   Implements the EzTyping-audited scoring exactly as the live site's engines
   computed it (the algorithms the 9 golden scenarios in
   ~/workspace/typesetu-redesign-tests/ were recorded against):
     - HCM family (E3, also drills / warm-ups / revision / custom tests):
       word-alignment DP (alignWords), no half mistakes, untyped tail ignored,
       Net = (W − 10×M)/min, marks bands by net WPM.
     - SSC / RRB family (E1/E2): greedy word walk (scoreWordsEx) with
       full/half classification; CHSL/CGL qualify on Error% (untyped words =
       skipped FULL); RRB: 5%-of-W exemption, Net = (W − max(0, M−exempt)×10)/min,
       PASS at Net ≥ 30, untyped ignored.
   Universal: W = round(keystrokes/5) incl. spaces; Gross = round(W/min);
   M = Full + 0.5×Half; Accuracy = (W−M)/W×100; Error% = M/W×100.
   Every function here is a faithful port — do not "improve" the maths. */

/* ---------------- shared helpers ---------------- */

export function wordTokens(str) {
  const out = [];
  const re = /\S+/g;
  let m;
  while ((m = re.exec(str || "")) !== null) out.push({ w: m[0], s: m.index, e: m.index + m[0].length });
  return out;
}

/* Per-character error category (HCM family). Ported verbatim. */
export function classifyChar(exp, got) {
  if (exp === " " || got === " ") return "spacing";
  if (/[.,;:!?'"()\/\-]/.test(exp) || /[.,;:!?'"()\/\-]/.test(got)) return "punct";
  if (exp.toLowerCase() === got.toLowerCase() && exp !== got) return "capital";
  if (/[A-Z]/.test(exp) && /[a-z]/.test(got) && exp.toLowerCase() !== got.toLowerCase()) return "spelling";
  if (/[A-Z]/.test(exp) || /[A-Z]/.test(got)) return "capital";
  return "spelling";
}

/* ---------------- HCM family: word-alignment DP ----------------
   Ported verbatim from the audited engine (alignWordsHcm). Aligns typed
   words to target words with a prefix-similarity cost; target words past
   the last paired typed word are NOT mistakes (untyped tail ignored);
   a final typed word that is a proper prefix of its target word counts
   as correct (the typist was cut off mid-word by the clock/submit);
   adjacent sub+del / sub+ins pairs that differ only by a space collapse
   into a single "spacing" mistake. */
export function alignWords(target, typedStr) {
  const T = wordTokens(target), G = wordTokens(typedStr);
  const n = T.length, m = G.length;
  let i, j;
  const Tw = [], Gw = [];
  for (i = 0; i < n; i++) Tw.push(T[i].w);
  for (j = 0; j < m; j++) Gw.push(G[j].w);
  function posMatches(a, b) { let c = 0; const lim = Math.min(a.length, b.length); for (let q = 0; q < lim; q++) { if (a[q] === b[q]) c++; } return c; }
  function prefixLen(a, b) { let c = 0; const lim = Math.min(a.length, b.length); while (c < lim && a[c] === b[c]) c++; return c; }

  const tIdx = {}, gIdx = {}, tUniq = [], gUniq = [], tSeq = new Int32Array(n), gSeq = new Int32Array(m);
  for (i = 0; i < n; i++) { const w1 = Tw[i]; if (tIdx[w1] === undefined) { tIdx[w1] = tUniq.length; tUniq.push(w1); } tSeq[i] = tIdx[w1]; }
  for (j = 0; j < m; j++) { const w2 = Gw[j]; if (gIdx[w2] === undefined) { gIdx[w2] = gUniq.length; gUniq.push(w2); } gSeq[j] = gIdx[w2]; }
  const gu = gUniq.length, C = new Float64Array(tUniq.length * gu);
  for (i = 0; i < tUniq.length; i++) for (j = 0; j < gu; j++) {
    C[i * gu + j] = tUniq[i] === gUniq[j] ? 0 : 1 - 0.01 * (prefixLen(tUniq[i], gUniq[j]) / Math.max(tUniq[i].length, gUniq[j].length));
  }
  const Wd = m + 1, D = new Float64Array((n + 1) * Wd);
  for (i = 0; i <= n; i++) D[i * Wd] = i;
  for (j = 0; j <= m; j++) D[j] = j;
  for (i = 1; i <= n; i++) {
    const ri = i * Wd, rp = (i - 1) * Wd, crow = tSeq[i - 1] * gu;
    for (j = 1; j <= m; j++) {
      const a = D[rp + j - 1] + C[crow + gSeq[j - 1]], b = D[rp + j] + 1, c = D[ri + j - 1] + 1;
      D[ri + j] = a < b ? (a < c ? a : c) : (b < c ? b : c);
    }
  }

  let kStar = 0; for (i = 1; i <= n; i++) { if (D[i * Wd + m] < D[kStar * Wd + m] - 1e-9) kStar = i; }
  const pairs = []; i = kStar; j = m;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && Math.abs(D[i * Wd + j] - (D[(i - 1) * Wd + j - 1] + C[tSeq[i - 1] * gu + gSeq[j - 1]])) < 1e-9) {
      pairs.push({ kind: (Tw[i - 1] === Gw[j - 1] ? "ok" : "sub"), exp: Tw[i - 1], got: Gw[j - 1], ti: i - 1, gi: j - 1 });
      i--; j--;
    } else if (i > 0 && (j === 0 || Math.abs(D[i * Wd + j] - (D[(i - 1) * Wd + j] + 1)) < 1e-9)) {
      pairs.push({ kind: "del", exp: Tw[i - 1], got: "", ti: i - 1, gi: -1 });
      i--;
    } else if (j > 0) {
      pairs.push({ kind: "ins", exp: "", got: Gw[j - 1], ti: -1, gi: j - 1 });
      j--;
    } else break;
  }
  pairs.reverse();

  let lastPaired = -1;
  pairs.forEach(function (p) { if (p.gi >= 0 && p.ti > lastPaired) lastPaired = p.ti; });
  let mistakes = 0, incorrectChars = 0; const kept = []; let spanWords = 0;
  T.forEach(function (tk) { if (tk.s < (typedStr || "").length) spanWords++; });
  pairs.forEach(function (p) {
    if (p.kind === "del" && p.ti > lastPaired) return;
    if (p.kind === "sub" && p.gi === m - 1 && p.got.length < p.exp.length && p.exp.indexOf(p.got) === 0) {
      p = { kind: "ok", exp: p.exp, got: p.got, ti: p.ti, gi: p.gi };
    }
    if (p.kind === "sub") { mistakes++; incorrectChars += p.got.length - posMatches(p.exp, p.got); }
    else if (p.kind === "del") { mistakes++; }
    else if (p.kind === "ins") { mistakes++; incorrectChars += p.got.length; }
    kept.push(p);
  });

  const collapsed = []; let ci2 = 0, didCollapse = false;
  while (ci2 < kept.length) {
    const a = kept[ci2], b = kept[ci2 + 1];
    if (b) {
      if ((a.kind === "sub" && b.kind === "del" && a.exp + b.exp === a.got) || (a.kind === "del" && b.kind === "sub" && a.exp + b.exp === b.got)) {
        const subP = (a.kind === "sub") ? a : b;
        collapsed.push({ kind: "spacing", exp: a.exp + " " + b.exp, got: subP.got, ti: a.ti, gi: subP.gi });
        ci2 += 2; didCollapse = true; continue;
      }
      if ((a.kind === "sub" && b.kind === "ins" && a.exp === a.got + b.got) || (a.kind === "ins" && b.kind === "sub" && b.exp === a.got + b.got)) {
        const subQ = (a.kind === "sub") ? a : b;
        collapsed.push({ kind: "spacing", exp: subQ.exp, got: a.got + " " + b.got, ti: subQ.ti, gi: a.gi });
        ci2 += 2; didCollapse = true; continue;
      }
    }
    collapsed.push(a); ci2++;
  }
  if (didCollapse) {
    mistakes = 0; incorrectChars = 0;
    collapsed.forEach(function (p) {
      if (p.kind === "sub") { mistakes++; incorrectChars += p.got.length - posMatches(p.exp, p.got); }
      else if (p.kind === "del") { mistakes++; }
      else if (p.kind === "ins") { mistakes++; incorrectChars += p.got.length; }
      else if (p.kind === "spacing") { mistakes++; incorrectChars += p.got.length; }
    });
    return { pairs: collapsed, mistakes, correctChars: (typedStr || "").length - incorrectChars, wordsTyped: m, spanWords, typedChars: (typedStr || "").length };
  }
  return { pairs: kept, mistakes, correctChars: (typedStr || "").length - incorrectChars, wordsTyped: m, spanWords, typedChars: (typedStr || "").length };
}

/* Per-character correct/incorrect flags over the typed string (HCM family),
   used by the stage to colour typed characters. Ported verbatim. */
export function displayFlags(target, typedStr) {
  const flags = [];
  for (let q = 0; q < typedStr.length; q++) flags.push(true);
  const al = alignWords(target, typedStr);
  const G = wordTokens(typedStr);
  const byGi = {};
  al.pairs.forEach(function (p) { if (p.gi >= 0) byGi[p.gi] = p; });
  G.forEach(function (tk, gi) {
    const p = byGi[gi];
    if (!p) return;
    let c;
    if (p.kind === "ins") { for (c = tk.s; c < tk.e; c++) flags[c] = false; return; }
    if (p.kind !== "ok" && p.kind !== "sub") return;
    for (c = tk.s; c < tk.e; c++) {
      const rel = c - tk.s;
      flags[c] = rel < p.exp.length && p.exp.charAt(rel) === tk.w.charAt(rel);
    }
  });
  return flags;
}

/* Error-category / weak-key / weak-word derivation from the alignment.
   Ported verbatim from the audited engine's deriveErrCats(). */
export function deriveErrCats(target, typedStr) {
  const al = alignWords(target || "", typedStr);
  const cat = { spelling: 0, capital: 0, punct: 0, spacing: 0, other: 0 }, keys = {}, words = {};
  al.pairs.forEach(function (p) {
    if (p.kind === "ok") return;
    if (p.kind === "spacing") { cat.spacing++; keys[" "] = (keys[" "] || 0) + 1; p.exp.split(" ").forEach(function (w) { if (w) words[w] = (words[w] || 0) + 1; }); return; }
    if (p.kind === "del") { cat.other++; words[p.exp] = (words[p.exp] || 0) + 1; return; }
    if (p.kind === "ins") { cat.other++; return; }
    const e = p.exp, g = p.got;
    if (e.length !== g.length && (e.indexOf(g) === 0 || g.indexOf(e) === 0)) {
      cat.spacing++; keys[" "] = (keys[" "] || 0) + 1;
    } else {
      const lim = Math.max(e.length, g.length); let counted = false;
      for (let i2 = 0; i2 < lim; i2++) {
        const ec = i2 < e.length ? e[i2] : "", gc = i2 < g.length ? g[i2] : "";
        if (ec === gc) continue;
        if (!counted) { cat[classifyChar(ec || " ", gc || " ")]++; counted = true; }
        const kk = ec || gc; keys[kk] = (keys[kk] || 0) + 1;
      }
    }
    words[e] = (words[e] || 0) + 1;
  });
  return { errCat: cat, weakKeys: keys, weakWords: words };
}

/* Word-by-word mistake rows (grouped, count-sorted) + entry detail list.
   Ported from computeMistakes(); the entry detail drops "(extra)" rows,
   exactly as the audited history entries did. */
export function mistakeRows(target, typedStr) {
  const al = alignWords(target || "", typedStr);
  const map = {}, order = [];
  al.pairs.forEach(function (p) {
    if (p.kind === "ok") return;
    let exp, got;
    if (p.kind === "sub" || p.kind === "spacing") { exp = p.exp; got = p.got; }
    else if (p.kind === "del") { exp = p.exp; got = "(missed)"; }
    else { exp = "(extra)"; got = p.got; }
    const key = exp + "" + got;
    if (!map[key]) { map[key] = { exp, got, count: 0 }; order.push(map[key]); }
    map[key].count++;
  });
  order.sort(function (a, b) { return b.count - a.count; });
  const rows = order.slice(0, 40);
  const unique = [];
  order.forEach(function (r) { if (r.exp !== "(extra)" && unique.indexOf(r.exp) < 0) unique.push(r.exp); });
  const detail = rows.filter(function (r) { return r.exp !== "(extra)"; })
    .map(function (r) { return { exp: r.exp, got: r.got, st: "full" }; });
  return { rows, total: al.mistakes, unique, detail };
}

export function hcmMarksFor(net) {
  if (net < 30) return 0; if (net < 31) return 10; if (net <= 35) return 12; if (net <= 40) return 15;
  if (net <= 45) return 18; if (net <= 50) return 21; return 25;
}
export function hcmBandLabel(n) {
  if (n < 30) return "below 30 net WPM — disqualified (0 marks)";
  if (n < 31) return "30 net WPM band — 10 marks";
  if (n <= 35) return "31–35 band — 12 marks";
  if (n <= 40) return "36–40 band — 15 marks";
  if (n <= 45) return "41–45 band — 18 marks";
  if (n <= 50) return "46–50 band — 21 marks";
  return "51+ band — full 25 marks";
}

/* HCM-family result. elapsedSec is the measured typing time.
   Numbers follow the audited stats(): mins floored at 1 second of elapsed;
   gross/net returned raw plus entry-rounded forms. */
export function scoreHcm(target, typedStr, elapsedSec) {
  const pos = (typedStr || "").length;
  const al = alignWords(target || "", typedStr || "");
  const mins = Math.max(elapsedSec || 0, 1) / 60;
  const W5 = Math.round(pos / 5);
  const gross = W5 / mins;
  const net = Math.max(0, (W5 - 10 * al.mistakes) / mins);
  const acc = W5 ? Math.max(0, Math.min(100, (W5 - al.mistakes) / W5 * 100)) : 100;
  const accChar = pos ? (al.correctChars / pos * 100) : 100;
  const cats = deriveErrCats(target || "", typedStr || "");
  const mrows = mistakeRows(target || "", typedStr || "");
  const qualified = net >= 30;
  return {
    family: "hcm",
    chars: pos, words: W5, durSec: Math.round(elapsedSec || 0), mins,
    gross, net, grossR: Math.round(gross), netR: Math.round(net),
    acc, accR: +acc.toFixed(1), accChar,
    errs: al.mistakes, mistakes: al.mistakes,
    marks: qualified ? hcmMarksFor(net) : 0, qualified,
    errCat: cats.errCat, weakKeys: cats.weakKeys, weakWords: cats.weakWords,
    mistakeRows: mrows.rows, mistakeTotal: mrows.total, mistakeUnique: mrows.unique,
    mistakeDetail: mrows.detail, pairs: al.pairs,
  };
}

/* ---------------- SSC / RRB family: greedy word walk ----------------
   Ported verbatim from the audited exam engine (scoreWords + classifyPair).
   Handles merged/split words as ONE spacing half mistake, one-word
   lookahead for skipped/extra, and a trailing partial word forgiven. */
export function classifyPair(exp, got) {
  if (exp === got) return "ok";
  if (exp.toLowerCase() === got.toLowerCase()) return "capital";
  const strip = function (s) { return s.replace(/[^A-Za-z0-9]/g, ""); };
  if (strip(exp) === strip(got)) return "punct";
  if (strip(exp).toLowerCase() === strip(got).toLowerCase()) return "capital";
  return "spelling";
}

export function scoreWordsEx(expText, gotText, opts) {
  opts = opts || {};
  const E = (expText || "").split(/\s+/).filter(Boolean), G = (gotText || "").split(/\s+/).filter(Boolean);
  let i = 0, j = 0, full = 0, half = 0, wrong = 0, skipped = 0, extra = 0;
  const detail = [];
  const cats = { spelling: 0, capital: 0, punct: 0, spacing: 0, skipped: 0, extra: 0 };
  const eStat = [], gStat = [];
  /* pairs: word-level alignment for display (ei = target word index or -1,
     gj = typed word index or -1). Display-only; no number depends on it. */
  const pairs = [];
  while (i < E.length && j < G.length) {
    if (E[i] === G[j]) { eStat.push({ st: "ok", cat: "ok" }); gStat.push({ st: "ok", cat: "ok" }); pairs.push({ kind: "ok", ei: i, gj: j }); i++; j++; continue; }
    if (i + 1 < E.length && E[i] + E[i + 1] === G[j]) {
      half++; cats.spacing++;
      detail.push({ exp: E[i] + " " + E[i + 1], got: G[j], kind: "half", cat: "spacing" });
      eStat.push({ st: "half", cat: "spacing" }); eStat.push({ st: "half", cat: "spacing" });
      gStat.push({ st: "half", cat: "spacing" });
      pairs.push({ kind: "spacing", ei: i, gj: j }); pairs.push({ kind: "spacing", ei: i + 1, gj: j });
      i += 2; j += 1; continue;
    }
    if (j + 1 < G.length && E[i] === G[j] + G[j + 1]) {
      half++; cats.spacing++;
      detail.push({ exp: E[i], got: G[j] + " " + G[j + 1], kind: "half", cat: "spacing" });
      eStat.push({ st: "half", cat: "spacing" });
      gStat.push({ st: "half", cat: "spacing" }); gStat.push({ st: "half", cat: "spacing" });
      pairs.push({ kind: "spacing", ei: i, gj: j }); pairs.push({ kind: "spacing", ei: i, gj: j + 1 });
      i += 1; j += 2; continue;
    }
    if (i + 1 < E.length && E[i + 1] === G[j]) { skipped++; full++; cats.skipped++; detail.push({ exp: E[i], got: "", kind: "skipped", cat: "skipped" }); eStat.push({ st: "full", cat: "skipped" }); pairs.push({ kind: "skipped", ei: i, gj: -1 }); i++; continue; }
    if (j + 1 < G.length && G[j + 1] === E[i]) { extra++; full++; cats.extra++; detail.push({ exp: "", got: G[j], kind: "extra", cat: "extra" }); gStat.push({ st: "full", cat: "extra" }); pairs.push({ kind: "extra", ei: -1, gj: j }); j++; continue; }
    if (j === G.length - 1 && G[j].length < E[i].length && E[i].indexOf(G[j]) === 0) { eStat.push({ st: "ok", cat: "ok" }); gStat.push({ st: "ok", cat: "ok" }); pairs.push({ kind: "ok", ei: i, gj: j }); j++; i++; break; }
    const cat = classifyPair(E[i], G[j]);
    if (cat === "capital" || cat === "punct") { half++; cats[cat]++; detail.push({ exp: E[i], got: G[j], kind: "half", cat }); eStat.push({ st: "half", cat }); gStat.push({ st: "half", cat }); pairs.push({ kind: "half", ei: i, gj: j, cat }); }
    else { full++; wrong++; cats.spelling++; detail.push({ exp: E[i], got: G[j], kind: "wrong", cat: "spelling" }); eStat.push({ st: "full", cat: "spelling" }); gStat.push({ st: "full", cat: "spelling" }); pairs.push({ kind: "wrong", ei: i, gj: j, cat: "spelling" }); }
    i++; j++;
  }
  while (j < G.length) { extra++; full++; cats.extra++; detail.push({ exp: "", got: G[j], kind: "extra", cat: "extra" }); gStat.push({ st: "full", cat: "extra" }); pairs.push({ kind: "extra", ei: -1, gj: j }); j++; }
  const consumedE = i;
  if (opts.countUntypedSkip) {
    while (i < E.length) { skipped++; full++; cats.skipped++; detail.push({ exp: E[i], got: "", kind: "skipped", cat: "skipped", tail: true }); eStat.push({ st: "full", cat: "skipped" }); pairs.push({ kind: "skipped", ei: i, gj: -1 }); i++; }
  }
  return {
    full, half, wrong, skipped, extra, detail, cats, eStat, gStat, pairs,
    wordsTyped: G.length, expWords: E.length, consumedE,
    completion: E.length ? Math.min(100, consumedE / E.length * 100) : 0,
  };
}

function dispErrPct(x) { return Math.min(100, Math.max(0, +x || 0)); }

/* Exam result for chsl / cgl (E1) and rrb (E2).
   spec: the exam's spec object (categories etc. from data/examSpecs.js).
   categoryId: chosen category for E1 (defaults to the first category).
   elapsedSec is clamped to the exam duration, as the audited engine did;
   an unstarted attempt is scored at full duration. */
export function scoreExam(spec, target, typedStr, elapsedSec, categoryId) {
  const typedText = typedStr || "";
  const durSecTotal = spec.durationMin * 60;
  let el = elapsedSec == null ? durSecTotal : Math.min(elapsedSec, durSecTotal);
  if (el <= 0) el = durSecTotal;
  const mins = el / 60;
  const isE1 = spec.engine === "E1";
  const sc = scoreWordsEx(target || "", typedText, { countUntypedSkip: isE1 });
  const W5 = Math.round(typedText.length / 5);
  const gross = mins > 0 ? W5 / mins : 0;
  const weighted = sc.full + 0.5 * sc.half;
  const errorPct = W5 ? (weighted / W5 * 100) : 0;
  const acc = W5 ? Math.max(0, (W5 - weighted) / W5 * 100) : 100;

  /* entry mistake detail: deduped, extras and untyped tail dropped (audited shape) */
  const seen = {}, det = [];
  sc.detail.forEach(function (d) {
    if (d.kind === "extra" || !d.exp || d.tail) return;
    const k = d.exp + "" + d.got;
    if (seen[k]) return; seen[k] = 1;
    det.push({ exp: d.exp, got: d.got, st: (d.kind === "half" ? "half" : "full") });
  });

  const base = {
    family: isE1 ? "e1" : "e2", examId: spec.id, engine: spec.engine,
    chars: typedText.length, words: W5, durSec: Math.round(el), mins,
    gross, grossR: Math.round(gross),
    full: sc.full, half: sc.half, weighted,
    errorPct, errorPctR: +errorPct.toFixed(1), errorPctDisp: dispErrPct(errorPct),
    acc, accR: +acc.toFixed(1), errs: Math.round(weighted),
    breakdown: { wrong: sc.wrong, skipped: sc.skipped, extra: sc.extra },
    cats: sc.cats, completion: sc.completion,
    wordsTyped: sc.wordsTyped, expWords: sc.expWords,
    mistakeDetail: det.slice(0, 60), detail: sc.detail, score: sc,
  };

  if (isE1) {
    const cat = (spec.categories || []).find(function (c) { return c.id === categoryId; }) || (spec.categories || [])[0] || null;
    const cap = cat ? cat.cap : 100;
    const qualified = errorPct <= cap;
    const reason = qualified
      ? "Error " + dispErrPct(errorPct).toFixed(1) + "% is within the " + cap + "% " + (cat ? cat.label : "") + " limit"
      : "Error " + dispErrPct(errorPct).toFixed(1) + "% exceeds the " + cap + "% " + (cat ? cat.label : "") + " limit";
    base.net = gross; base.netR = Math.round(gross); /* SSC: displayed Net = Gross */
    base.category = cat ? cat.id : ""; base.cap = cap; base.qualified = qualified; base.reason = reason;
    if (spec.id === "cgl") {
      /* Standing under BOTH DEST standards (headline uses Non-CPT caps). */
      const rows = [
        { group: "Non-CPT + Non-DEST", cells: [{ label: "UR", cap: 20 }, { label: "OBC / EWS", cap: 25 }, { label: "Others", cap: 30 }] },
        { group: "CPT + DEST — higher standard", cells: [{ label: "UR", cap: 5 }, { label: "Others", cap: 7 }, { label: "PwBD", cap: 10 }] },
      ];
      rows.forEach(function (r) { r.cells.forEach(function (c) { c.pass = errorPct <= c.cap; }); });
      base.dual = rows;
    }
    return base;
  }

  /* RRB (E2): 5%-of-W exemption, then 10 words per remaining mistake. */
  const allowance = W5 * 0.05;
  const finalM = Math.max(0, weighted - allowance);
  const net = mins > 0 ? Math.max(0, (W5 - finalM * 10) / mins) : 0;
  const qualified = net >= 30;
  const reason = qualified
    ? "Net speed " + net.toFixed(1) + " WPM meets the 30 WPM qualifying standard"
    : "Net speed " + net.toFixed(1) + " WPM is below the 30 WPM qualifying standard";
  base.net = net; base.netR = Math.round(net);
  base.allowance = allowance; base.allowanceR = +allowance.toFixed(1);
  base.finalMistakes = finalM; base.finalMistakesR = +finalM.toFixed(1);
  base.category = ""; base.qualified = qualified; base.reason = reason;
  return base;
}

/* RRB target cycling: the passage repeats (space-joined) so a fast typist
   never runs out of text; enough repetitions to cover the typed length. */
export function cycleTarget(baseText, typedLen) {
  const base = baseText || "";
  if (!base) return "";
  const reps = Math.max(1, Math.ceil(((typedLen || 0) + 200) / base.length));
  let out = "";
  for (let k = 0; k < reps; k++) out += (out ? " " : "") + base;
  return out;
}
