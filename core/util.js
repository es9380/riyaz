/* core/util.js — shared pure helpers across UI features. */

const ESC_MAP = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ESC_MAP[c]);
}

export function fmtTime(sec) {
  const s = Math.max(0, Math.ceil(Number(sec) || 0));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}:${rem < 10 ? "0" : ""}${rem}`;
}

export function fmtDate(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return String(ts);
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(d);
}
