# Viewer — product identity in the stage aside

Date: 2026-08-21 · Owner decision, measured first.

## The problem, measured

`.stage__aside` holds a colourway rail and two buttons, vertically centred in a
column that stretches the full height of the stage band. Measured on the live
payload at three viewports:

| Viewport  | Aside height | Content in it | Empty     |
| --------- | ------------ | ------------- | --------- |
| 1280x720  | 650px        | 124px         | 526 (81%) |
| 1920x1080 | 1010px       | 100px         | 910 (90%) |
| 2560x1440 | 1370px       | 100px         | 1270 (93%)|

The emptiness grows with the screen, because the column stretches and its content
does not. Meanwhile the product's name and description sit below the fold in
`.content`, and a third copy of the name (`.stage__caption`) sits under the
garment.

Two further defects were found in the same pass:

- The four spec facts render **twice** above 1000px — as `.stage__callouts` over
  the canvas and again as `.spec-list` in `.content`, word for word.
- `.colourway-tab__dot` is a redundant selected-state cue. Measured: the selected
  tab also inverts its fill, 14.47:1 in light and 13.11:1 in dark, and greyscale
  luminance flips 0.864 -> 0.013 (light) / 0.013 -> 0.775 (dark). That is a fill
  change, not a hue change, so WCAG 1.4.1 does not depend on the dot; and
  `aria-selected` already carries the state for assistive technology.

## What changes

### 1. One identity block, two positions

The labels, `<h1>`, statement and colour note move into a `ProductIdentity`
component. **One instance exists at a time**, placed by a `useIdentityInAside()`
hook.

⚠️ **THE DESIGN SAID THIS HOOK WOULD USE THE TWO-COLUMN QUERY. IT CANNOT, AND
BUILDING IT THAT WAY BROKE A REAL VIEWPORT.** Two wrong floors were built and
measured before the third was measured first:

| Query tried | What it did |
| --- | --- |
| `TWO_COLUMN_QUERY` alone | 844x390 (landscape phone): band grew to **726px in a 390px viewport**. Garment cut off at the fold, colourway rail and both buttons underneath it. |
| `+ (min-height: 700px)` | 900x700: band **729px**. The floor had been extrapolated from one sample at 1024x768; the requirement is not width-independent. |
| `(min-width: 1100px) and (min-height: 720px)` | Clean at all 14 viewports measured. |

The two-column layout deliberately includes a landscape phone so the *controls*
can sit beside the garment in a ~320px band. A 312-character paragraph is a
different question. **The layout query and the content query are not the same
query**, which is why there are now two constants.

The floor is measured, not chosen — the viewport height the aside's stack needs:

| Viewport width | Column | Identity | Rail | Needs |
| --- | --- | --- | --- | --- |
| 900 | 260px | 484px | 113px | 797px |
| 1024 | 289px | 439px | 113px | 758px |
| 1100 | 310px | 416px | 53px | **677px** |
| 1280+ | 360px | 399px | 53px | **664px** |

The cliff between 1024 and 1100 is the colourway rail's own container query
wrapping five swatches onto two rows below a ~300px column. 1024x768 fits by 10px
and is deliberately excluded: a ten-pixel margin on a layout whose inputs are a
CMS textarea and a font is a coincidence, not an invariant.

Both queries are exported constants, and `useIdentityInAside.test.tsx` asserts
that `page.css` declares `TWO_COLUMN_QUERY` verbatim AND that
`IDENTITY_IN_ASIDE_QUERY` is strictly narrower — a conjunction with a
greater-or-equal width floor, never a comma list. If it were ever wider, the
identity would render where `.product-info--aside`'s styles do not apply: a 69px
viewport-sized heading in a 260px column.

`useSyncExternalStore`, not `useState` + `useEffect`, for the reason
`useCoarsePointer.ts` records: the value is read during render and must not be
able to disagree with the DOM for a frame.

### 2. The heading is sized by its container, not the viewport

`.display--hero` is `clamp(34px, 5.4vw, 72px)` — 69px at 1280px wide. That is
correct across a 1104px measure and wrong in a 360px column. In the aside the
heading is sized in `cqi` against a container query on `.stage__aside`, so it
scales with the column it is actually in. Nothing outside the aside changes.

### 3. `data-reveal` comes off the product panel

Not cosmetic. `startReveals()` scans `[data-reveal]` **once**, at startup, and
observes what it finds. An element that moves between parents on a resize is a
NEW element, created after that scan, so it is never observed and never receives
`.is-inview` — leaving the product description permanently at opacity 0. The
reveal is also the wrong effect for the page's own product name, which should be
present on arrival rather than fading in. `.customise` and `.contact` keep theirs.

### 4. `.stage__caption` is deleted

The garment's name under the garment is redundant once the `<h1>` sits beside it.
Markup, CSS and the e2e test that pinned its desktop-only visibility all go; the
"exactly one `<h1>`" assertion in that test is kept and re-homed, because that
property is still true and still worth pinning.

### 5. `.spec-list` hides where the callouts show

`display: none` at `min-width: 1000px` — **the same breakpoint** `.stage__callouts`
uses to appear, so the facts render exactly once at every width. Below 1000px the
list is the only rendering and stays. A test asserts the two breakpoints match, so
moving one without the other cannot ship.

### 6. `.colourway-tab__dot` is deleted

Markup and CSS, plus the `page.css` comment claiming the dot is what keeps the
selected state from being colour-only — that claim is superseded by the fill
measurement above and would otherwise argue the next reader into restoring it.

### 7. Performance

The two measured causes of the lag the owner reports are **out of scope by owner
decision**: Lenis' 1.1s scroll interpolation (measured: one wheel notch is 50%
resolved at 225ms, 90% at 590ms, 99% at 850ms) and the model's geometry
(2,419,902 triangles, of which 2,392,912 — 98.9% — is decorative topstitch
against 10,234 for the garment itself).

What remains in the viewer was measured, and **neither produced a change worth
shipping**. Measured at 1440x900, DPR 2, 4x CPU throttle:

**The soft shadow costs nothing.** Median frame time over 2.5s of continuous
orbiting, three configurations:

| Configuration | Median frame | p95 | Long tasks |
| --- | --- | --- | --- |
| `shadow-intensity 0.6, softness 0.8` (shipped) | 33.4ms | 34.9ms | 0 |
| `shadow-intensity 0` (no shadow at all) | 33.3ms | 34.8ms | 0 |
| `shadow-intensity 0.6, softness 0` (hard) | 33.4ms | 34.9ms | 0 |

Identical. Removing the shadow buys nothing and loses the grounding, so **no
change was made**. The 33.4ms floor is the geometry — 2.4M triangles — which is
out of scope by the decision above.

**A colourway swap blocks the main thread for 121-131ms**, on three of five swaps
(BUTTER and the return to WINE produced no long task at all). That is one
rebinding of 200 materials on a 2.4M-triangle model; it is not addressable from
the viewer, and it is recorded here so the next session does not re-measure it.

## Not doing

- **Widening the aside.** 360px is already a good reading measure, and the
  canvas `max-height: 980px` is derived from the 800px canvas width the current
  `flex-basis` produces. Widening the column silently invalidates that number.
- **Moving `.stage__callouts` into the column.** A documented decision; they are
  what makes the desktop stage read as a technical drawing.
- **Any change to the single-column layout.** The phone layout was rebuilt on
  2026-08-20 against measured height budgets and is not touched here.

## Verification

`pnpm lint`, `pnpm typecheck`, `pnpm test:coverage`, `pnpm build`,
`node scripts/check-bundle-budget.mjs`, and the viewer e2e suite — plus rendered
screenshots at 320x640, 375x667, 393x852, 768x1024, 844x390, 1024x768, 1440x900,
1920x1080 and 2560x1440, since a layout change that only passes assertions is the
failure mode this repo records most often.
