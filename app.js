/* Riyaz — app shell: hash router, theme, shared exam state.
   Pages render into #view. The typing stage is launched through
   launchStage(), which hands a contract config to core/engine.js. */

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
  if (meta) meta.setAttribute("content", t === "light" ? "#f6f8f5" : "#0b1220");
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

/* ——— Shared exam selection (Home hero + Arena) ——— */
const EXAM_KEY = "tsn_exam_v1";
let examId = "hcm";
try {
  const saved = localStorage.getItem(EXAM_KEY);
  if (saved) examId = saved;
} catch (e) {}

export const examState = {
  get() {
    return examId;
  },
  set(id) {
    if (id === examId) return;
    examId = id;
    try {
      localStorage.setItem(EXAM_KEY, id);
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
  { re: /^ncrtc$/, nav: "ncrtc", load: () => import("features/ncrtc.js"), run: (m) => m.renderNcrtc(view) },
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
