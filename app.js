/* Riyaz — app shell: hash router, theme, shared exam state.
   Pages render into #view. The typing stage is launched through
   launchStage(), which hands a contract config to core/engine.js. */

import * as store from "./core/store.js";

const view = document.getElementById("view");

/* ——— Theme (key + JSON format shared with core/store.js) ——— */
const THEME_KEY = "tsn_theme_v1";

export function currentTheme() {
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

function applyTheme(t) {
  document.documentElement.dataset.theme = t;
  try {
    localStorage.setItem(THEME_KEY, JSON.stringify(t));
  } catch (e) {}
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", t === "light" ? "#f3f4fb" : "#0a0b17");
  const btn = document.getElementById("themeToggle");
  if (btn) {
    btn.setAttribute("aria-label", t === "light" ? "Switch to dark theme" : "Switch to light theme");
    const sun = document.getElementById("themeIconSun");
    const moon = document.getElementById("themeIconMoon");
    if (sun && moon) {
      sun.style.display = t === "light" ? "none" : "block";
      moon.style.display = t === "light" ? "block" : "none";
    }
  }
}

document.getElementById("themeToggle").addEventListener("click", () => {
  applyTheme(currentTheme() === "light" ? "dark" : "light");
});
applyTheme(currentTheme());

/* ——— Quick preferences menu in header ——— */
function initPrefsMenu() {
  const toggle = document.getElementById("prefsToggle");
  const menu = document.getElementById("prefsMenu");
  if (!toggle || !menu) return;

  const goalVal = document.getElementById("prefGoalVal");
  const goalDec = document.getElementById("prefGoalDec");
  const goalInc = document.getElementById("prefGoalInc");
  const errChk = document.getElementById("prefErrHl");
  const zenChk = document.getElementById("prefZen");
  const fontBtns = menu.querySelectorAll("[data-pfont]");

  function sync() {
    if (goalVal) goalVal.textContent = String(store.goal());
    const fs = store.fontStep();
    fontBtns.forEach((b) => b.setAttribute("aria-pressed", String(parseInt(b.dataset.pfont, 10) === fs)));
    if (errChk) errChk.checked = store.setting("errHl") !== false;
    if (zenChk) zenChk.checked = store.setting("zen") !== false;
  }

  function setOpen(open) {
    menu.hidden = !open;
    toggle.setAttribute("aria-expanded", String(open));
    if (open) sync();
  }

  toggle.addEventListener("click", (e) => {
    e.stopPropagation();
    setOpen(menu.hidden);
  });
  document.addEventListener("click", (e) => {
    if (!menu.hidden && !menu.contains(e.target) && !toggle.contains(e.target)) setOpen(false);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !menu.hidden) setOpen(false);
  });

  if (goalDec) goalDec.addEventListener("click", () => {
    store.setGoal(store.goal() - 1);
    sync();
    window.dispatchEvent(new CustomEvent("ts:prefs"));
  });
  if (goalInc) goalInc.addEventListener("click", () => {
    store.setGoal(store.goal() + 1);
    sync();
    window.dispatchEvent(new CustomEvent("ts:prefs"));
  });
  fontBtns.forEach((b) => b.addEventListener("click", () => {
    store.setFontStep(parseInt(b.dataset.pfont, 10));
    sync();
    window.dispatchEvent(new CustomEvent("ts:prefs"));
  }));
  if (errChk) errChk.addEventListener("change", () => {
    store.setting("errHl", errChk.checked);
    window.dispatchEvent(new CustomEvent("ts:prefs"));
  });
  if (zenChk) zenChk.addEventListener("change", () => {
    store.setting("zen", zenChk.checked);
    window.dispatchEvent(new CustomEvent("ts:prefs"));
  });
  sync();
}
initPrefsMenu();

/* ——— Shared exam selection (Home hero + Arena) ——— */
const EXAM_KEY = "tsn_exam_v1";
let examId = "hcm";
try {
  const raw = localStorage.getItem(EXAM_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (typeof parsed === "string" && parsed) examId = parsed;
    } catch (_) {
      /* backward compatibility with earlier raw-string writes */
      examId = raw;
      localStorage.setItem(EXAM_KEY, JSON.stringify(raw));
    }
  }
} catch (e) {}

export const examState = {
  get() {
    return examId;
  },
  set(id) {
    if (id === examId) return;
    examId = id;
    try {
      localStorage.setItem(EXAM_KEY, JSON.stringify(id));
    } catch (e) {}
    window.dispatchEvent(new CustomEvent("ts:exam", { detail: { examId: id } }));
  },
};

export function go(hash) {
  if (location.hash === hash) route();
  else location.hash = hash;
}

/* ——— Stage launch ——— */
let pendingStage = null;
let stageActive = false;

export function launchStage(config) {
  pendingStage = config;
  const slug = config.testId || config.mode || "stage";
  if (location.hash === `#/play/${slug}`) route();
  else location.hash = `#/play/${slug}`;
}

async function renderStage() {
  view.classList.add("view-stage");
  if (!pendingStage) {
    go("#/arena");
    return;
  }
  const cfg = pendingStage;
  try {
    const { openStage } = await import("core/engine.js");
    stageActive = true;
    const userDone = cfg.onDone;
    openStage({
      ...cfg,
      onDone: (entry) => {
        stageActive = false;
        if (typeof userDone === "function") userDone(entry);
      },
    });
  } catch (err) {
    console.error("Stage failed to load", err);
    view.innerHTML = `<div class="empty-note" role="alert">
      <p><strong>The typing stage could not load.</strong></p>
      <p>Go back to the Arena and try again.</p>
      <a class="btn" href="#/arena">Back to Exam Arena</a>
    </div>`;
  }
}

/* ——— Router ——— */
const routes = [
  { re: /^\/?$/, nav: "home", load: () => import("features/home.js"), run: (m) => m.renderHome(view) },
  { re: /^arena$/, nav: "arena", load: () => import("features/arena.js"), run: (m) => m.renderArena(view) },
  {
    re: /^hub\/([a-z0-9-]+)$/,
    nav: "arena",
    load: () => import("features/arena.js"),
    run: (m, match) => m.renderHub(view, match[1]),
  },
  { re: /^studio$/, nav: "studio", load: () => import("features/studio.js"), run: (m) => m.renderStudio(view) },
  { re: /^progress$/, nav: "progress", load: () => import("features/progress.js"), run: (m) => m.renderProgress(view) },
];

function setNav(nav) {
  document.querySelectorAll(".main-nav a").forEach((a) => {
    if (a.dataset.nav === nav) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  });
}

let routeToken = 0;

export async function route() {
  const token = ++routeToken;
  const raw = location.hash.replace(/^#\/?/, "");
  const playMatch = raw.match(/^play\/([a-z0-9-]+)$/i);

  if (playMatch) {
    setNav("arena");
    await renderStage();
    return;
  }

  /* Leaving a stage (or any page): tell listeners (the engine) to tidy up. */
  if (stageActive) {
    stageActive = false;
    window.dispatchEvent(new CustomEvent("ts:leave-stage"));
  }
  pendingStage = null;
  view.classList.remove("view-stage");

  for (const r of routes) {
    const match = raw.match(r.re);
    if (!match) continue;
    setNav(r.nav);
    try {
      const mod = await r.load();
      if (token !== routeToken) return;
      view.classList.remove("view-enter");
      void view.offsetWidth;
      await r.run(mod, match);
      view.classList.add("view-enter");
      window.scrollTo(0, 0);
    } catch (err) {
      console.error("Route failed", err);
      view.innerHTML = `<div class="empty-note" role="alert">
        <p><strong>This page could not load.</strong></p>
        <a class="btn" href="#/">Back to Home</a>
      </div>`;
    }
    return;
  }

  go("#/");
}

window.addEventListener("hashchange", route);
route();

if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost" || location.hostname === "127.0.0.1")) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}
