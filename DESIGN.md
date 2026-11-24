# Design Plan — the new typing-practice site

Process: frontend-design skill, plan-first. Written before building; reviewed
against the generic-default traps at the end and revised where noted.

## Grounding — the subject

Indian government-exam aspirants (Delhi Police HCM, SSC CHSL/CGL, RRB NTPC)
who practise typing every day, often on a family laptop, chasing a fixed
number: 30 net WPM, a marks band, a name on a merit list. Their world is the
examination hall — a printed paper sheet, blue-black ink, ruled answer pages,
a wall clock — and the register: attendance lines, roll numbers, entries made
daily in the same hand. The product's job is to make daily practice feel like
an entry in that register: measured, cumulative, and visibly moving toward
"qualified". Typing here is not a game; it is *riyaz* — disciplined daily
practice, the word every aspirant's family uses for what singers and wrestlers
do before dawn.

## Name

Candidates:
1. **Riyaz** — Urdu/Hindi for disciplined daily practice. Instantly understood
   by the audience, warm without being soft, and it names the *method*
   (show up daily) rather than a metric. Ownable as a product name; no exam
   site uses it.
2. **Ank** (अंक, "marks") — names the outcome every aspirant chases. Short and
   sharp, but abstract as a brand and harder to say in a sentence ("open Ank").
3. **Gati** (गति, "speed") — accurate for typing, but speed is the one thing
   this product teaches *second*; accuracy and discipline come first.

**Chosen: Riyaz.** Tagline: "Roz ka riyaz. Pakki selection." (Daily practice.
Certain selection.) — used once, in the footer; the interface itself stays
English, like the exams. The name does the cultural work so the UI doesn't
have to decorate.

## Palette (named hexes)

- **Midnight Ink** `#0B1220` — dark-theme ground. Fountain-pen ink at night,
  blue — not neutral black.
- **Register Navy** `#121E36` — dark surface; **Ledger Line** `rgba(234,240,249,.10)`
  hairlines throughout.
- **Answer Green** `#2FBF8F` (dark) / `#0B7A55` (light) — the colour of a tick,
  of "qualified". The ONLY accent: primary actions, progress, the caret, the
  timer track. Green is never decoration; green means *earned or actionable*.
- **Sheet Paper** `#FDFCF7` — the exam sheet itself, near-white in both themes;
  ink on it is **Hall Ink** `#182238`.
- **Correction Red** `#F2767B` (dark) / `#C23B47` (light) — errors and the final
  minute only. The red pen of the examiner, used as sparingly.
- Light ground: **Answer-Sheet White** `#F6F8F5`, a white with a breath of
  green, like the paper of a checked answer book.

## Typefaces

- **Archivo** (500–800) — display, headlines, big numbers. A grotesque with
  the strength of print on a government form; tight tracking, tabular figures.
- **Public Sans** — UI text. Literally designed for government forms; plain,
  trustworthy, invisible in the best way.
- **Source Serif 4** — the paper sheet and passage text ONLY. Print is serif;
  the screen around it is not. Serif anywhere else is banned by this plan.
- Fallbacks: system grotesque / system sans / Georgia — the layout must hold
  with zero webfonts loaded.

## Layout concept

**The daily register.** One column, ruled like a register page: hairline rules
separate entries instead of boxes around them. Lists (mocks, drills, history)
are register lines — a big index numeral, the entry, its measured result
right-aligned in tabular figures. Stats are ledger readouts, never cards.

The hero spends the plan's one boldness: **the hero is the answer sheet
itself.** A full-width sheet panel, paper in both themes, ruled header block
like a real exam paper ("English Typing — Practice Sheet", duration, target),
and inside it the live demo typing in serif on the paper, with the candidate's
live figures (WPM, accuracy) written into the sheet's own header. You don't
read about the product; the product is already open on the desk in front of
you, mid-line. Click it and it's yours to type.

Result verdicts are **stamps**: a double-ruled, slightly rotated mark —
QUALIFIED in Answer Green, BELOW THE BAR in Correction Red — the examiner's
stamp on a checked sheet. Nothing else in the product rotates or shouts.

## Principles

1. **The sheet is sacred.** The exam-paper aesthetic governs the stage; the
   register (chrome) stays quiet around it. Zen is the register closing.
2. **Green means earned.** Accent appears only on actions, progress, and
   success — never as decoration, never on a label.
3. **Numbers like a merit list.** Big, tabular, ruled off; a stat you can't
   read at arm's length is a stat designed wrong.
4. **One stamp moment.** Verdicts stamp; everything else speaks at room volume.
5. **Warmth lives in the name and one line of copy**, not in illustration,
   mascots, or Hinglish sprinkled over the interface.

## Trap review (against the frontend-design defaults) — and revisions made

- *Warm cream + serif display + terracotta:* avoided. Light ground is a cool
  green-white, the accent is examiner green, serif is confined to the sheet.
  (First sketch had a warm paper light theme — revised to Answer-Sheet White.)
- *Near-black + acid accent:* avoided. Dark ground is ink-navy, accent is a
  deep emerald, not acid.
- *Broadsheet newspaper:* the register uses rules, but spacing is generous,
  one column, grotesque headlines — a ledger, not a newspaper.
- *SaaS card kit:* no card grids anywhere; ruled rows and ledger lines only.
  (The earlier build's "today strip" cells survive as a ruled ledger row —
  borders between entries, no boxes, no shadows.)
- *Template chrome:* no eyebrow labels as decoration, no all-caps tracked
  labels except functional ones (the timer's TIME LEFT, palette counts),
  no "→" CTA suffixes, no middle-dot meta strings as house style — meta
  information sits in ruled columns instead.

## Delight layer (v2 addendum)

One measured dose of life, added after v1: Piixpal pixel pals, self-hosted
under `vendor/piixpal/` (MIT; see that folder's README). The register stays
serious; the pals are small, hue-rotated into the palette (toward Answer
Green), and confined to exactly these places:

- **Bitbug** crawls the Home headline — the one playful moment on the page.
- **Pip** perches on Home's primary call to action.
- **Lurk** peeks over the Progress empty state — the page with nothing to
  report yet gets the shy one.
- **Munshi**, a custom pal drawn for Riyaz (ink body, Answer-Green cap and
  pen, an open register in both hands, `mind` behaviour), keeps the footer
  brand line — and exists only while Home is the active route. (`mind` is
  defined by the moss pal file, so that file is loaded as a behaviour pack;
  the moss pal itself is never placed.)

Rules that outrank the charm: pals never appear on the typing stage, the
NCRTC runner, Arena or Studio — the stage is sacred (Principle 1) — and
their scripts load lazily, only from Home and from the Progress empty
state. They respect `prefers-reduced-motion`, pause off-screen, and never
intercept a click meant for the interface.
