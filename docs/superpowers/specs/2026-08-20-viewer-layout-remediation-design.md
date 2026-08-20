# Viewer layout remediation — design

**Date:** 2026-08-20
**Status:** approved by the owner 2026-08-20; implementation plan to follow
**Scope:** `apps/viewer` only. No CMS, pipeline or shrink changes.

## Why this exists

A read-only UI/UX audit on 2026-08-20 measured the live product page
(`viewer.wear-run.help/rxps/wine`) at nine viewport sizes. It found two defects that
are live today, four desktop findings, and six smaller ones. Every number below was
measured with `getBoundingClientRect()` on the live site with `[data-reveal]` forced
to its settled state — **not** calculated. That distinction is the whole reason this
document exists; see "The pattern this fixes".

## The pattern this fixes

`apps/viewer/src/styles/page.css` sizes the garment with a hand-computed subtrahend:
`height: min(62vh, 640px, calc(100svh - 364px))`. That number is the sum of the
header, two paddings, a gap, the plinth, the colourway rail and the action bar.

Its own comment records it being **wrong four times** — 208 → 280 → 316 → 282 on
desktop, and a fourth failure on the phone rule where a live-page sweep was polluted
by a `[data-reveal]` transform. Each correction was a person re-adding six numbers.

The 320×640 defect below is the fifth failure, and it has a new shape: the subtrahend
is correct, and a `min-height: 300px` floor overrides it.

**A number that six independent values must agree with is not a constant. It is a
computation the browser should be doing.** Part A replaces it.

## Measured findings this design addresses

| ID | Screen | Finding | Measured |
|----|--------|---------|----------|
| G-01 | 320×640 | Colourways 04 Lime and 05 Black sit under the fixed action bar | tabs end y=598, bar starts y=568 — **57% covered** |
| G-02 | 844×390 | Landscape: no usable scroll surface, and no contact control at all | **4px** below the canvas against a 140px floor; `.contact-rail` and `.action-bar` both `display: none` |
| G-03 | 320×256 | At 400% zoom the sticky header takes 45.7% of the viewport | header 117px of 256px |
| D-01 | 1440 / 2560 | The only conversion control is the quietest element on the page | spec callouts 31,790px² vs contact pill 10,606px² — **3.0×** |
| D-02 | 2560×1440 | Nothing scales past ~1200px | **399px** (27.7%) empty band; 720px unused each side; garment ≈7.8% of screen |
| D-04 | 1440×900 | A garment with ~9+ colourways would place a swatch under the floating pill | list box reaches x=1284, pill starts x=1223.6 — **60px** overlap |
| M-03 | 375 / 402 | The colour picker is two rows where one would fit | 402px: 70.8px available vs 67.2px needed. 375px: 65.7px vs 67.2px — **misses by 1.5px** |
| G-04 | 768 | `Email Us` / `WhatsApp Us` appear twice in the tab order with identical names | tab stops 14–17 |
| G-07 | all | The "these colourways are examples" note sits 1px under the action bar | hint 710→741, bar top 740 |
| G-08 | all | `.colourway-tab__num` renders at 8.5px | computed font-size |
| G-09 | all | Footer catalogue link is the smallest target on the page | 105×20.1px |
| G-10 | all | `--target-min: 44px` is declared then overridden to 40px in three rules | `page.css` header button, camera buttons, contact rail |

Two findings are deliberately **out of scope**:

- **Product-name casing.** The `<h1>` renders `x-milo PRO SKIN-SUIT` while the plinth
  and `<title>` render `X-MILO PRO SKIN-SUIT`. This is `headingWithAccent(…, 'first')`
  working as designed (`apps/viewer/src/components/SerifAccent.tsx`), and is an
  editorial decision, not a defect.
- **The missing scroll affordance.** Measured today: `.content` starts at y=656 while
  the action bar covers from y=642, so nothing peeks above the fold. Parts A and B both
  move the fold. Fixing it now would be tuning against a layout that is about to
  change. **Re-measure after Part B and open it separately.**

## Decisions taken by the owner

| Question | Decision |
|----------|----------|
| Phone garment height | Safe option — free space first, let the garment absorb it. Do **not** push the colour picker below the fold. |
| Large desktop screens | Two columns: garment left, spec facts and contact right. |
| Landscape phones | Same two-column treatment, triggered by screen shape rather than device. |
| The "examples" note | Move it into the product panel. |
| Narrow-and-short screens | Replace the hand-computed height with a self-sizing layout. |

The last decision **supersedes** part of the first. With a self-sizing band there is no
subtrahend to retune, so "collapse the picker, then re-tune the height" becomes one
step instead of two, and the step that has historically gone wrong disappears.

---

## Part A — The stage band sizes itself

### Rule

The stage band is one screen tall, minus the sticky header above it, with the fixed
action bar's height reserved as real layout space rather than something that floats
over the content. Within the band, the plinth and the colourway rail take their
intrinsic height and the canvas takes the remainder.

```
.stage-block
  display: flex; flex-direction: column
  min-height: calc(100svh - var(--header-h))
  padding-bottom: var(--action-bar-h)      /* the bar no longer overlaps content */

.stage__canvas   flex: 1 1 auto;  min-height: <floor — see below>
.stage__plinth   flex: 0 0 auto
.colourways      flex: 0 0 auto
```

**The floor is the one number this design still needs, and it must be measured.**
Today it is `300px` below 900px wide and `380px` at desktop, chosen as "the smallest a
garment can be and still read as a garment on a 600px-tall phone". Carry those values
in unchanged as the starting point and let the extended e2e guards confirm or move
them. Do not re-derive a floor by addition — that is the exact habit this part exists
to remove.

### What this deletes

- `.stage__canvas`'s three-term `min()` and its `@supports (height: 1svh)` twin
- The `@media (max-width: 899px)` override and its `@supports` twin
- The `@media (max-width: 359px)` override and its `@supports` twin
- The `44vh` pre-`svh` fallback — a flex column needs no viewport-unit fallback at all,
  because it never depends on `svh` resolving for the *canvas*. The band's own
  `min-height` still uses `svh`; if that declaration is dropped on an ancient browser
  the band falls back to content height and the garment renders at its floor rather
  than at **378 × 0**, which is the current failure mode recorded in
  `apps/viewer/CLAUDE.md`.

Six rules and two magic numbers become one rule and two named values.

### Tokens

`--action-bar-h: 72px` already exists in `apps/viewer/src/styles/tokens.css`.
`--header-h` is new. It is **two measured values, not one**: 69px at 360px and above,
119px below 360px, where the catalogue button deliberately wraps to a second flex row
(see the block comment above `@media (max-width: 699px)` in
`apps/viewer/src/styles/page.css` — that wrap is an accepted trade, not a bug, because
fitting one row at 320px needs a 13.9px wordmark).

Both values must be added to the spacing set that `apps/viewer/src/styles/tokens.test.ts`
enforces, or introduced as documented exceptions.

### The property that fixes G-01

On a screen too short for everything to fit, the canvas stops at its `min-height` and
the band grows past one screen. The colourway rail then sits **below the fold** —
scrollable and fully tappable — instead of **underneath a fixed bar** — covered and
half-tappable. Overflow degrades into scrolling rather than into hidden product.

This is the difference between the current failure and the new one, and it is the whole
justification for Part A.

### Known failure mode — verify this first

`apps/viewer/CLAUDE.md` records a measured **378 × 0** garment: `model-viewer` is
`height: 100%` of a parent whose height became `auto`. The same class of failure is
reachable here two ways:

1. A flex child's default `min-height: auto` refusing to shrink. Mitigated by setting
   `min-height` explicitly on `.stage__canvas` rather than relying on `auto`.
2. `height: 100%` on `model-viewer.stage__model` failing to resolve against a
   flex-sized parent.

**Neither is provable by reasoning.** Both must be confirmed in a real browser and in
the iOS simulator before any other part of this work proceeds.

### Verification

- The existing guards in `apps/viewer/e2e/motion-and-layout.spec.ts` must still pass:
  "the colourway rail clears the action bar by a real margin" (≥8px) and "a thumb can
  always scroll the page" (≥140px).
- **Both guards must be extended.** They are the reason G-01 and G-02 shipped: the
  clearance guard runs only at 375×812, the thumb guard runs at four portrait sizes,
  and no size receives both checks. New coverage:
  - clearance guard at 320×640, 402×714 and 414×896 as well as 375×812
  - a landscape case (844×390) added to both guards
- A rendered garment must be asserted non-zero in both dimensions at every tested size.
  A `min-height` floor alone passes while the model is 378 × 0.

---

## Part B — Two columns when the screen is wide

### Rule

When the viewport has width to spare, the garment occupies a left column and the
controls occupy a right column: camera buttons, colourway rail, the spec facts, and the
Email / WhatsApp buttons.

Trigger on **shape**, not device:

- `min-width: 900px` — desktop. 900px is deliberately the existing seam where
  `.contact-rail` appears and `.action-bar` disappears; reusing it avoids introducing a
  fourth breakpoint into a file that already pairs these two.
- `min-width: 700px and min-aspect-ratio: 3/2` — a phone in landscape. 844×390 is 2.16.

Verified against the audit's viewport matrix: 1440×900 (1.60) and 2560×1440 (1.78)
match on width; 844×390 matches on shape; 768×1024 (0.75), 402×714 (0.56) and 320×256
(1.25, but 320px wide) correctly do **not** match.

### What this resolves

- **D-01 / D-02** — the contact buttons move into the reading column, and the right
  column fills the 399px dead band.
- **D-04** — `.contact-rail`'s floating pill is removed on these screens, so the
  colourway rail can no longer collide with it.
- **G-02** — the right column is not the 3D model, so it is a large surface a thumb can
  drag. The landscape scroll trap disappears without touching `touch-action`.

### Invariant that must not break

`apps/viewer/CLAUDE.md` records that `.contact-rail` and `.action-bar` breakpoints were
once 1100px and 900px, leaving 900–1099px with **no persistent contact control on the
only conversion path in the product**. Part B changes which element carries that
control at which size, so the invariant must be re-asserted, not assumed:

> At every viewport in the test matrix, at least one contact control is present and
> reachable without scrolling.

The existing 950px test proves the seam. Landscape sizes must be added to it.

### Explicitly not in Part B

Raising the 760px canvas cap. The cap exists because the camera radius and field of
view are fixed, so the garment always fills 86.3% of the canvas height. Changing it
changes the garment's apparent size at every desktop width and belongs in its own
change with its own before/after screenshots.

---

## Part C — The small changes

Each is independent and none depends on A or B.

1. **Colour picker to one row where it fits.** The rule is
   `grid-template-columns: repeat(auto-fit, minmax(92px, 1fr))` in
   `apps/viewer/src/styles/page.css`'s `@media (max-width: 767px)` block. Lowering the
   92px admits five tabs on one row at 402px, releasing 60.5px which — with Part A
   landed — flows to the garment automatically.

   ⚠️ **There is no single `minmax` value that is right at both 375px and 402px, and the
   plan must choose deliberately.** Measured, with an 8px gap:

   | `minmax` floor | 402px (385.9 available) | 375px (360.5 available) |
   |----------------|-------------------------|-------------------------|
   | 92px (today) | 3 columns → **3+2** | 3 columns → **3+2** |
   | 85px | 4 columns → 4+1 | 3 columns → 3+2 |
   | 68px | **5 columns → one row** ✅ | 4 columns → **4+1** |

   So the one-row win at 402px costs 375px a 4+1 layout, where a single tab sits alone
   against three empty cells. Three ways out, for the plan to decide with a rendered
   comparison rather than by argument: accept 4+1; add an explicit rule that forces five
   columns only in the width band where five fit; or switch the mobile rail from grid to
   `flex-wrap` with `flex: 1 1 <basis>` so a partial row stretches to fill instead of
   leaving holes. **Look at all three rendered before choosing** — this is a question
   about how a control looks, and the repo's own history says file-size-style reasoning
   about visual output is how bad choices ship.

   ⚠️ **Must also be verified against a product with long colour names.** The longest in
   `tools/asset-pipeline/src/colour-name.ts` is "Forest Green" (12 characters); it wraps
   to two line-boxes on a narrow tab and eats part of the saving. RXPS's five names —
   Wine, Blush, Butter, Lime, Black — are all short, so testing on RXPS alone **cannot
   exhibit the failure.** This is the root `CLAUDE.md` fixtures pattern exactly.
2. **Move the "examples" note.** Out of `.colourways` in
   `apps/viewer/src/components/ColourwayTabs.tsx`, into the product panel
   (`apps/viewer/src/components/ProductPanel.tsx`). Tidying, **not** a height saving —
   it sits below the picker and below the guard's measurement point.
3. **Footer catalogue link.** `apps/viewer/src/components/Footer.tsx` — give the bare
   `<a>` padding so its smallest dimension clears 24px. It currently passes WCAG 2.5.8
   only via the spacing exception.
4. **The 44px target rule.** `--target-min: 44px` in `apps/viewer/src/styles/tokens.css`
   is overridden to 40px by three rules in `page.css`. Decide once: either the token is
   the floor and the three rules change, or the token documents an aspiration and its
   comment says so. Do not leave it contradicted.
5. **The 8.5px colour numbers.** `.colourway-tab__num` is `aria-hidden` decoration,
   confirmed by the owner 2026-08-14 as appearing on no tag, catalogue or order form.
   Either raise it to a legible size or remove it.
6. **Duplicate tab stops.** `Email Us` / `WhatsApp Us` appear twice with identical
   accessible names. Part B removes one pair on wide screens; decide whether the mobile
   duplication is acceptable, and record the reason either way.
7. **The customisation accordion default.** `useState(false)` in
   `apps/viewer/src/components/CustomisationSection.tsx` hides the four steps that
   explain the business to a first-time B2B buyer. Consider defaulting open on wide
   screens.

---

## Sequencing and risk

Three pull requests, in order, each independently revertible:

| PR | Contents | Risk | Gate |
|----|----------|------|------|
| A | Self-sizing stage band + extended guards | **High** — touches the most-tuned CSS in the repo | Full e2e on three engines, plus the iOS simulator |
| B | Two-column wide layout | Medium — new layout, existing invariant to re-prove | Full e2e including new landscape sizes |
| C | Seven small fixes | Low | Full e2e; one long-colour-name product checked by hand |

Each merge to `main` deploys CMS and viewer. Per the root `CLAUDE.md` and
`docs/BACKUP-RESTORE.md`, each release needs a D1 backup and a captured
`GET /api/public/viewer/rxps/wine` before and after.

### Measurement discipline

This is the rule the four previous failures broke:

- **Do not compute a layout number on paper.** Tune against
  `npx --yes pnpm@10.33.0 --filter @run-apparel/viewer test:e2e`, which runs with
  `reducedMotion: 'reduce'` (set in `apps/viewer/playwright.config.ts`) so no
  `[data-reveal]` transform pollutes the measurement, and which covers Chromium, WebKit
  and mobile Safari at once.
- **Do not sweep the live page.** `.colourways` sits under `transform: translateY(24px)`
  until its reveal finishes, so every reading taken that way is 24px out in a direction
  that depends on how long the page has been open.
- **A desktop browser at a phone's width measures the stage wrong** unless its viewport
  height is set to the device's `svh` value, because it has no URL bar. The audit used
  402×714 for an iPhone 17 and reproduced the repo's own simulator figure of 350px
  exactly.

### What cannot be verified here

Recorded so a green result is not read as more than it is:

- **Frame rate and perceived smoothness.** The Browser pane reports the page as hidden,
  so rAF is throttled and timing is unobtainable.
- **Real touch gestures.** Synthetic `PointerEvent`s produce zero `camera-change` events
  on `model-viewer`. Only the iOS simulator exercises real touch.
- **Browsers older than Safari 15.4.** Xcode's oldest downloadable runtime is iOS 16.4,
  whose Safari already supports `svh`.

## Doc corrections found while investigating

`apps/viewer/src/components/Stage.tsx` and `apps/viewer/CLAUDE.md` both state that
`touch-action: pan-y` has *"no heuristic and no threshold — the browser claims the touch
on the first move."* Read against the installed `@google/model-viewer` 4.3.1, that is
incomplete: `touchModeRotate` compares the first move's horizontal and vertical
magnitude and yields to the page only when the motion is **more vertical than
horizontal**. A sideways drag still rotates the garment.

This changes nothing in this design — `pan-y` is still declined, because
`min-camera-orbit="auto 20deg auto"` / `max-camera-orbit="auto 160deg 200%"` gives the
camera a real 140° vertical range that `pan-y` would cost. It is recorded because that
sentence is the stated reason the option was ruled out, and a future session should
re-measure rather than trust it.
