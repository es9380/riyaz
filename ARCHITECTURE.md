# TypeSetu NEXT — Architecture Contract (binding for all builders)

Build the best version of the product from scratch in this workspace
(`~/workspace/typesetu-next/`). Sid's brief (expanded 24 Nov 16:58 IST): free hand, senior
developer + designer standard, "look great, work great, behave great", dynamic feel — and the
site does NOT have to keep the TypeSetu name or anything of the current look and feel. New name,
new identity, new arrangement are all open; only the SUBSTANCE is fixed (audited scoring, exam
specs, passage/NCRTC data, settled typing behaviours). This is a NEW repo (typesetu-v2) for his
own testing — NOT a deploy over the live site. **No login, no backend, no Firebase** — all state
in localStorage. Backend later only if he approves this build.
Skills mandate: the installed skills in ~/workspace/custom-skills/ (diagnosing-bugs,
systematic-debugging, verification-before-completion, frontend-design, web-design-guidelines,
typesetu-qa-gate) are working tools for this build, not decoration — the design track follows
frontend-design's plan-first process, and every claim of "done" follows
verification-before-completion (fresh evidence, in hand).

## Tech ground rules
- Zero-build static site: plain ES modules + importmap, hash routing, works on GitHub Pages and
  any local static server. No framework, no bundler, no npm deps.
- Heavy data (passages/warmups/ncrtc) loads ONLY via dynamic `import()` when entering the
  feature that needs it — never on the Home/boot path.
- Dark + light themes via CSS custom properties in styles/tokens.css. `prefers-reduced-motion`
  respected. Keyboard focus always visible. No per-keystroke layout animation (animate chrome,
  never the typing surface per keystroke).
- File budget: stay close to the module map below (~18 files + data/). Fewer, larger modules
  beat many small ones (the repo is uploaded file-by-file).

## Data (already ported into data/ — do not edit content values)
- `data/passages.js` → `PASSAGE_BATCH` {hcm:116, chsl:24, cgl:24, rrb:24} — mock numbering is
  POSITIONAL (array order); never reorder. Fields: tid, diff, topic, text.
- `data/examSpecs.js` → `EXAM_SPECS`, `specOf(id)` — durations, targets, backspace defaults.
- `data/exams.js`, `data/counts.js` → exam metadata + counts.
- `data/warmups.js` (sets × subsets), `data/drills.js` (row/numbers/punctuation drills),
  `data/ncrtcManifest.js` + `data/ncrtc/*.json` (52 tests, 2,040 questions).
- Warm-up/drill content shapes: inspect the files before coding against them.

## Scoring — sacred, from the EzTyping audit (implement exactly; prove against golden scenarios)
Universal: W = round(keystrokes/5) incl. spaces; Gross = round(W/min);
M = Full + 0.5×Half; Accuracy = (W−M)/W×100; Error% = M/W×100.
Mistakes counted by WORD ALIGNMENT (not raw position): full = spelling/wrong word/skipped/extra
(incl. single-letter errors); backspace-corrected = not a mistake. Half mistakes (SSC+RRB only):
capitalisation / punctuation / spacing.
- **HCM**: no half mistakes; untyped ignored; Net = (W − 10×M)/min; marks by NET WPM:
  <30 DQ(0), 30→10, 31–35→12, 36–40→15, 41–45→18, 46–50→21, 51+→25.
- **CHSL**: qualify Error% ≤7 (UR) / ≤10 (reserved); displayed Net = Gross; every untyped word =
  skipped FULL mistake.
- **CGL**: same engine as CHSL; 15 min; dual standards exist in spec (CPT error caps UR 5 /
  Others 7 / PwBD 10) — show the DEST standard result.
- **RRB**: backspace DISABLED by default (session toggle may enable); exemption = first 5% of W
  mistakes free; Net = (W − max(0, M − exemption)×10)/min; PASS if Net ≥30; untyped ignored.
Acceptance: the 9 golden scenarios in `~/workspace/typesetu-redesign-tests/` (golden.json +
harness) define expected outputs for identical inputs. The new `core/scoring.js` must reproduce
them exactly — replay the scenarios through the new module with a small adapter script and diff.

## Settled behaviours (hard-won on the live site — all mandatory, do not re-litigate)
1. **Paper View** = Top/Bottom only (sheet above, typing box below). NO tracing/highlight of any
   kind on the sheet — it is a plain static print. Sheet + box both auto-scroll; on entering
   Paper View the whole stage (timer, sheet, box) aligns visible together.
2. **Sheet scroll = PROPORTIONAL glide**: target = round(typedChars/targetChars × sheetMaxScroll),
   2px deadband; manual scroll is held (paperHold) until the target closes within 48px. The sheet
   must never jump a full line. Final line fully visible at 100% (bottom padding).
3. **Typing box follow**: caret line rests with one line of margin (the old scrollCursorIntoView
   rule); the hidden capture textarea must never re-scroll the box (re-assert follow in the
   post-input rAF; focus with preventScroll). Page never scrolls while typing.
4. **Free cursor**: click anywhere in the typed text (BOTH views) places the caret exactly there
   (Paper View: caretRangeFromPoint + text-node walk over the plain-text typed node). Arrow keys
   Left/Right/Home/End/Up/Down work in both views (Paper View line maths from real layout rects).
5. **NO input cap.** Typed text may exceed the passage length; extras are scored as mistakes.
   A typist can always complete the final word. Keep only a generous anti-flood ceiling
   (target + 400 chars) that genuine typing never reaches. Paste into the capture is blocked.
   Capture attrs: autocomplete/autocorrect/autocapitalize/spellcheck all off.
6. **Timer (mocks + custom tests only)**: one fixed pill, top-centre just below the header,
   "TIME LEFT" + big tabular digits + draining progress track; red in the final 60s (no blink);
   visible in Zen, while scrolling, on 390px; never overlaps any clickable control (rect-check);
   hides on result. NO WPM/accuracy/marks shown mid-test in exam contexts — results carry them.
   Drills/warm-ups keep their own count-up practice displays.
7. **Text size** S/M/L/XL (17/19/21/23px) in the stage command bar for EVERY typing context,
   scaling passage + typed text together, persisted (one key), follow re-settles after a change.
8. **Backspace session toggle** per stage: HCM/CHSL/CGL default ON, RRB default OFF; resets on
   restart/passage switch; when OFF, backspace is truly blocked.
9. **Zen Focus**: chrome fades while typing, returns on mouse move/Esc; timer pill exempt.
10. Print button prints the passage only. Restart resets text, caret, both scrolls, timer.
11. **No name anywhere** (no accounts in this build — no sign-in UI at all).
12. Home hero: auto-typing live demo (human-like: ~5% neighbour-key slips, most corrected,
    HUD accuracy ~92–98%), click takes over ("Your turn"), blur + 12s idle resumes,
    reduced-motion = static line.

## Module map & ownership
**Builder A — engine track:** `core/scoring.js` (pure: alignment, classification, per-exam
results), `core/engine.js` (the typing stage: screen + paper views, capture handling, timer
pill, command bar, Zen, all modes), `core/store.js` (localStorage), `core/stats.js` (history
aggregates: readiness, typing-time-by-day, weak keys/words, bests).
**Builder B — product track:** `index.html` (shell + importmap + fonts), `app.js` (router, nav,
theme), `styles/tokens.css`, `styles/base.css`, `styles/stage.css`, `styles/pages.css`,
`features/home.js`, `features/arena.js` (hubs, hub page, custom-test builder),
`features/studio.js`, `features/progress.js`, `features/ncrtc.js`.

### Interface contract (both builders code against exactly this)
- Router: hash routes `#/` home, `#/arena`, `#/hub/<examId>`, `#/studio`, `#/progress`,
  `#/ncrtc`, `#/play/<slug>` (stage). app.js renders a page component into `#view`.
- Stage launch: `openStage(config)` exported from core/engine.js; config =
  `{ examId, mode: 'mock'|'custom'|'drill'|'warmup'|'revision', title, text, durationMin,
     backspaceDefault, testId, onDone }`. engine.js renders the full stage into `#view` and
  calls `store.addResult(entry)` + `config.onDone(entry)` at finish. Result screen is part of
  engine.js (shared by all modes; exam vs practice presentation by mode/examId).
- History entry shape (store.js): `{ id, ts, dateStr, examId, mode, name, testId, gross, net,
  acc, errs, marks, qualified, durSec, min, chars, words, bs, errCat, weakKeys, weakWords }`.
- store.js API: `addResult`, `history()`, `bestFor(testId)`, `setting(k, v)`, `goal()/setGoal`,
  `theme()/setTheme`, `fontStep()/setFontStep`.
- stats.js: pure functions over a history array: `readiness(hist, examId)`,
  `typingTimeByDay(hist)`, `weakKeys(hist)`, `nextStep(hist, examId)`.
- Features never touch engine internals; engine never imports features. Data modules are
  imported by features (to build configs) and dynamically by ncrtc.js.

## Design direction — OPEN, plan-first (frontend-design skill process is mandatory)
Name, identity, palette, typography, layout: all open. The design track MUST work the
frontend-design way: (1) ground the design in the subject — competitive-exam typing for Indian
aspirants (Delhi Police HCM, SSC, RRB), an audience that practises daily under time pressure;
(2) write a compact design plan into `DESIGN.md` in this workspace BEFORE building — name
(2–3 candidates, pick one with a reason), 4–6 named palette hexes, typefaces + roles, layout
concept, and the principles that make this site itself and no one else's; (3) review the plan
against the generic AI defaults listed in the frontend-design skill (cream+serif+terracotta,
near-black+acid accent, broadsheet, SaaS card kit, template chrome) and revise anything that
reads as a default rather than a choice; (4) then build to the plan.
Functional constraints that are NOT open (substance, not style):
- Dark + light themes, both first-class; `prefers-reduced-motion` respected; focus visible.
- All numbers tabular (`font-variant-numeric: tabular-nums`) — stats are read at a glance.
- Fonts via Google Fonts with strong local fallbacks (site must still look right offline).
- Motion only in answer to action (view transitions, pane glides, result reveals); nothing
  decorative looping except the hero demo typing.
- The stage is sacred: passage and typing surfaces get the best contrast and the calmest
  surroundings; chrome recedes (Zen pushes this further).
- Spend boldness in ONE place; everything around it quiet and disciplined.

## Definition of done (per track, evidence required)
- Track A: golden-scenario replay diff = identical; a scripted dirty-typing run (extras,
  corrections) completes a full passage and scores extras; all settled behaviours 1–10 verified
  in a real headless browser with real keystrokes; helper processes killed.
- Track B: every route renders; hub → stage → result → progress loop works end-to-end with
  Track A's engine via the contract; design holds at 390px and 1440px, both themes;
  no console errors on any route.
- Both: no edits to data/ content values; report exact file lists + verification evidence.
