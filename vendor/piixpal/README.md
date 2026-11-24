# Vendored: Piixpal (self-hosted)

Tiny animated pixel pals as web components (`<piix-pal>`), vendored so Riyaz
never depends on a CDN at runtime.

- **Source:** npm package `piixpal@0.4` via jsDelivr
  (`https://cdn.jsdelivr.net/npm/piixpal@0.4/…`); upstream
  https://github.com/diiviikk5/Piixpal — https://piixpal.dvkk.dev/
- **Version:** 0.4.0
- **License:** MIT — see `LICENSE` in this folder. Each file also keeps its
  upstream license header.
- **Files:**
  - `core.min.js` — the shared engine (upstream `dist/core.min.js`).
  - `c/bitbug.min.js`, `c/pip.min.js`, `c/lurk.min.js` — the only stock pals
    Riyaz places (upstream `dist/c/…`). Each pal file locates `core.min.js`
    relative to its own URL, so this `c/` layout must be preserved.
  - `c/moss.min.js` — never placed as a pal; it is loaded because it defines
    the `mind` behaviour (behaviours live in the pal files, not in core),
    which the custom pal below runs on.
- **Custom pal:** "Munshi" is defined at runtime via `Piixpal.sprite()` in
  `features/home.js` — no extra file of his own.
- **Where it loads:** lazily, and only from `features/home.js` and
  `features/progress.js` (the latter only for the empty state). Never on the
  typing stage, Arena, Studio or NCRTC routes. See DESIGN.md, "Delight layer".
