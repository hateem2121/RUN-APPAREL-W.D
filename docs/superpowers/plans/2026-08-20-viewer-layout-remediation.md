# Viewer Layout Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the viewer's hand-computed stage-height number with a self-sizing layout, give wide screens a two-column layout, and clear ten smaller findings — fixing two defects that are live today.

**Architecture:** `.stage-block` becomes a flex column exactly one screen tall minus the sticky header, reserving the fixed action bar's height as real space. The canvas takes the remainder. On screens wide enough for it, the stage band becomes two columns with the controls and contact buttons on the right. Every layout number is confirmed by the Playwright suite rather than derived by addition.

**Tech Stack:** Vite + React 19, hand-written CSS (`apps/viewer/src/styles/`), `@google/model-viewer` 4.3.1, Playwright (Chromium / WebKit / mobile Safari), Vitest.

**Source spec:** `docs/superpowers/specs/2026-08-20-viewer-layout-remediation-design.md`

## Global Constraints

- `pnpm` is **not** on PATH. Every `pnpm` below means `npx --yes pnpm@10.33.0`.
- Run `env | grep -E 'NODE_ENV|PORT'` before believing any build or e2e failure. Both have caused a `Timed out waiting 120000ms from config.webServer` here.
- `pkill -f e2e/serve.mjs` before running e2e — a stray fixture server on 4173 causes the same timeout.
- **No Tailwind, no shadcn/ui, no component library.** Appearance is hand-written CSS. A `className` containing utility strings is the tell that something went wrong. See `docs/DECISION-UI-LIBRARIES.md`.
- **No raw hex, no raw spacing values.** Components read semantic tokens from `apps/viewer/src/styles/tokens.css`. `apps/viewer/src/styles/tokens.test.ts` enforces the spacing set.
- **`docs/DESIGN.md` outranks every vendored design skill** on duration and easing. `--settle` is 500ms and `--slow` is 800ms by decision; do not "fix" them to sub-300ms.
- **No node builtins** in `apps/viewer/src` or `apps/viewer/worker` — lint-enforced via `biome.jsonc` `noRestrictedImports`.
- **Biome rejects the duplicate-property CSS fallback idiom.** Use `@supports` blocks, never two `height:` declarations.
- **Coverage floors are measured, not chosen.** Never lower one to go green. `apps/viewer` sits at 42% deliberately.
- Do not commit or push unless the owner asks. Do not merge to `main` without the D1 backup and before/after payload capture in `docs/BACKUP-RESTORE.md`.

## Ground Rules For Every Layout Number In This Plan

1. **Never compute a layout number by addition.** The number this plan removes was wrong four times that way.
2. **Never sweep the live page.** `.colourways` sits under `transform: translateY(24px)` until its reveal finishes, so live readings are 24px out in a direction that depends on how long the page has been open.
3. **Tune against the e2e suite.** `apps/viewer/playwright.config.ts` sets `reducedMotion: 'reduce'` and `apps/viewer/src/styles/base.css` gates the reveal on `prefers-reduced-motion: no-preference`, so there is no transform to pollute the measurement, and three engines are measured at once.
4. **A desktop browser at a phone's width measures the stage wrong** unless its viewport height is the device's `svh` value. 402×714 is an iPhone 17.

## File Structure

| File | Responsibility | Change |
|------|---------------|--------|
| `apps/viewer/e2e/motion-and-layout.spec.ts` | Layout invariants across viewports | Extend guards; add landscape; add a rendered-garment assertion |
| `apps/viewer/src/styles/tokens.css` | Semantic tokens | Add `--header-h`; reconcile `--action-bar-h` |
| `apps/viewer/src/styles/page.css` | All page layout | Replace the stage-height rules with a flex band; add the two-column layout |
| `apps/viewer/src/styles/tokens.test.ts` | Token/spacing gate | Admit the new token values |
| `apps/viewer/src/components/ColourwayTabs.tsx` | Colourway rail + its caption | Move the "examples" note out |
| `apps/viewer/src/components/ProductPanel.tsx` | Product facts | Receive the "examples" note |
| `apps/viewer/src/components/Footer.tsx` | Footer | Give the catalogue link a real target |
| `apps/viewer/src/components/CustomisationSection.tsx` | The four build steps | Default-open decision |

---

# PART A — The stage band sizes itself

> **Gate:** Part A must be fully verified — including in the iOS simulator — before Part B or C begins. It carries the `378 × 0` risk described in `apps/viewer/CLAUDE.md`.

### Task A1: Prove the two live defects with failing tests

The clearance guard currently runs at one viewport and the thumb guard at four others, so **no screen size receives both checks**. That gap is why both defects shipped. Close it first, and watch it fail.

**Files:**
- Modify: `apps/viewer/e2e/motion-and-layout.spec.ts`

**Interfaces:**
- Produces: two parameterised test loops later tasks must keep passing. No exported symbols.

- [ ] **Step 1: Read the two existing guards**

Open `apps/viewer/e2e/motion-and-layout.spec.ts` and find:
- `test('the colourway rail clears the action bar by a real margin', …)` — hard-codes `375, 812`
- the `for (const { name, width, height } of [...])` loop containing `a thumb can always scroll the page at …`

Note the shared shape: `setViewportSize`, `goto('/n001/wine')`, `await expect(page.getByRole('heading', { level: 1 })).toBeVisible()`, then `page.evaluate`.

- [ ] **Step 2: Add the shared viewport matrix**

Insert above the existing thumb-guard loop:

```ts
/**
 * ⚠️ ONE MATRIX, BOTH GUARDS — and the split is why two defects shipped.
 *
 * Until 2026-08-20 the clearance guard ran only at 375x812 and the thumb guard
 * only at four portrait sizes, so no screen received both checks. Measured on the
 * live site that day: at 320x640 the colourway rail ended at y=598 against an
 * action bar starting at y=568, leaving 04 Lime and 05 Black **57% covered**; and
 * at 844x390 there were **4px** of scrollable strip below the canvas against this
 * suite's own 140px floor.
 *
 * Landscape is in the list because a phone turned sideways is a normal way to look
 * at a garment, and nothing here had ever visited one.
 */
const LAYOUT_VIEWPORTS = [
  { name: 'small mobile', width: 320, height: 640 },
  { name: 'mobile', width: 375, height: 812 },
  { name: 'iphone 17', width: 402, height: 714 },
  { name: 'large mobile', width: 414, height: 896 },
  { name: 'phone landscape', width: 844, height: 390 },
] as const
```

- [ ] **Step 3: Replace the single-viewport clearance guard with a parameterised one**

Delete the existing `test('the colourway rail clears the action bar by a real margin', …)` body and replace with:

```ts
for (const { name, width, height } of LAYOUT_VIEWPORTS) {
  test(`the colourway rail clears the action bar at ${name} (${width}x${height})`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height })
    await page.goto('/n001/wine')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

    const measured = await page.evaluate(() => {
      const bar = document.querySelector('.action-bar')
      const rail = document.querySelector('[role="tablist"]')
      if (!rail) return null
      // The bar is display:none at some sizes; an absent bar cannot cover anything.
      const barTop =
        bar && getComputedStyle(bar).display !== 'none'
          ? Math.round(bar.getBoundingClientRect().top)
          : window.innerHeight
      return { barTop, railBottom: Math.round(rail.getBoundingClientRect().bottom) }
    })

    expect(measured, 'no colourway tablist on the page').not.toBeNull()
    const { barTop, railBottom } = measured as { barTop: number; railBottom: number }

    expect(
      barTop - railBottom,
      `the colourway rail has ${barTop - railBottom}px of clearance under the ` +
        `fixed action bar (rail ends ${railBottom}, bar starts ${barTop}). ` +
        `Raise the subtrahend in .stage__canvas — do not lower this threshold.`,
    ).toBeGreaterThanOrEqual(8)
  })
}
```

- [ ] **Step 4: Point the thumb guard at the shared matrix**

Replace the inline array in the existing thumb-guard `for` loop with `LAYOUT_VIEWPORTS`, leaving its body untouched.

- [ ] **Step 5: Run the two guards and confirm they FAIL for the right reasons**

```bash
pkill -f e2e/serve.mjs; npx --yes pnpm@10.33.0 --filter @run-apparel/viewer test:e2e -- -g "clears the action bar|thumb can always scroll"
```

Expected — these exact failures, and no others:
- `clears the action bar at small mobile (320x640)` → FAIL, roughly `-34px of clearance`
- `a thumb can always scroll the page at phone landscape (844x390)` → FAIL, roughly `4px of the screen below the garment`

If a different test fails, stop and read it. Do not proceed with an unexplained failure.

- [ ] **Step 6: Commit the failing tests**

```bash
git add apps/viewer/e2e/motion-and-layout.spec.ts
git commit -m "test(viewer): guard rail clearance and thumb strip at every viewport

Both guards existed; neither ran at the size the other covered, so no screen
received both checks. Measured live 2026-08-20: 320x640 buries 04 Lime and
05 Black 57% under the action bar, and 844x390 leaves 4px of scrollable
strip against this suite's own 140px floor. Both now fail."
```

---

### Task A2: Assert the garment actually rendered

`apps/viewer/CLAUDE.md` records a measured **378 × 0** garment — blueprint grid, no product — caused by `model-viewer` being `height: 100%` of a parent whose height resolved to `auto`. Task A4 can reach that state. A `min-height` floor on the canvas passes happily while the model inside it is zero-height, so the model must be asserted directly.

**Files:**
- Modify: `apps/viewer/e2e/motion-and-layout.spec.ts`

**Interfaces:**
- Consumes: `LAYOUT_VIEWPORTS` from Task A1.

- [ ] **Step 1: Write the test**

Add after the clearance loop:

```ts
/**
 * ⚠️ THE CANVAS HAVING A HEIGHT DOES NOT MEAN THE GARMENT DOES.
 *
 * `apps/viewer/CLAUDE.md` records a measured **378 x 0** box: `.stage__canvas`
 * survived at its `min-height` while `model-viewer.stage__model` — `height: 100%`
 * of a parent that had become `auto` — resolved to zero. The visitor got the
 * blueprint grid and no product, and every height assertion in this file passed.
 *
 * So assert the MODEL's own box, at every viewport, in both axes.
 */
for (const { name, width, height } of LAYOUT_VIEWPORTS) {
  test(`the garment element has a real box at ${name} (${width}x${height})`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height })
    await page.goto('/n001/wine')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

    const box = await page.evaluate(() => {
      const model = document.querySelector('model-viewer.stage__model')
      if (!model) return null
      const r = model.getBoundingClientRect()
      return { w: Math.round(r.width), h: Math.round(r.height) }
    })

    expect(box, 'no model-viewer.stage__model on the page').not.toBeNull()
    const { w, h } = box as { w: number; h: number }

    expect(w, `garment width is ${w}px`).toBeGreaterThan(100)
    expect(
      h,
      `garment height is ${h}px (width ${w}px). A zero height here with a ` +
        `non-zero canvas is the 378x0 failure in apps/viewer/CLAUDE.md: the ` +
        `model is height:100% of a parent that resolved to auto.`,
    ).toBeGreaterThan(100)
  })
}
```

- [ ] **Step 2: Run it and confirm it PASSES today**

```bash
npx --yes pnpm@10.33.0 --filter @run-apparel/viewer test:e2e -- -g "garment element has a real box"
```

Expected: PASS at all five viewports. This is a **negative control** — a guard that already fails before the change it protects against tells you nothing.

- [ ] **Step 3: Commit**

```bash
git add apps/viewer/e2e/motion-and-layout.spec.ts
git commit -m "test(viewer): assert the garment's own box, not just its container

A min-height on .stage__canvas passes while model-viewer inside it is 0px tall.
That is the 378x0 failure recorded in apps/viewer/CLAUDE.md, and Part A can
reach it. Passes today; it is the control for the flex conversion."
```

---

### Task A3: Add `--header-h`, pinned to the real header

The band's height depends on the sticky header above it. That is one measured value, not a guess — and it must not be allowed to drift, which is exactly what happened to the number this plan is removing.

**Files:**
- Modify: `apps/viewer/src/styles/tokens.css`
- Modify: `apps/viewer/src/styles/tokens.test.ts`
- Modify: `apps/viewer/e2e/motion-and-layout.spec.ts`

**Interfaces:**
- Produces: `--header-h`, consumed by `.stage-block` in Task A4.

- [ ] **Step 1: Measure the header at both breakpoints**

```bash
npx --yes pnpm@10.33.0 --filter @run-apparel/viewer build
pkill -f e2e/serve.mjs
```

Then read the height off the built app at 320 and at 402 rather than trusting any recorded number — `page.css`'s comment says 119px at 320px while a live reading on 2026-08-20 gave 117px, and only one of those can be right. Record both measured values before writing the token.

- [ ] **Step 2: Add the token**

In `apps/viewer/src/styles/tokens.css`, after the `--action-bar-h` block:

```css
  /* The sticky header's own height, which the stage band below it must subtract.
     TWO values, because below 360px the catalogue button deliberately wraps to a
     second flex row — see the block comment above `@media (max-width: 699px)` in
     page.css, where that wrap is an accepted trade rather than a bug (fitting one
     row at 320px needs a 13.9px wordmark).

     ⚠️ These are MEASURED, and 69px was read off the live site on 2026-08-20 at
     375, 402, 768 and 1440. `motion-and-layout.spec.ts` -> "the header token
     matches the real header" fails if either drifts. That test is the whole point
     of the token: the number it replaces was re-derived by hand four times and was
     wrong every time. */
  --header-h: 69px;
```

And in `page.css`'s existing `@media (max-width: 359px)` block:

```css
  :root {
    /* ⚠️ 117px, NOT the 119px recorded in this file's own header comment — those
       two disagree and only one can be right. 117 is what a live reading at
       320x640 gave on 2026-08-20. If your Step 1 measurement differs, YOUR number
       wins: change this, not the test. */
    --header-h: 117px;
  }
```

⚠️ **Both values above are the 2026-08-20 readings, carried in so the branch is never
in a broken intermediate state. They are a starting point, not an authority.** If Step 1
measured something different on your machine, use your number — the drift guard in
Step 3 is what decides, and a value it rejects is wrong no matter who wrote it down.

- [ ] **Step 3: Write the drift guard**

In `apps/viewer/e2e/motion-and-layout.spec.ts`:

```ts
/**
 * The token must equal the thing it describes.
 *
 * `--header-h` is subtracted from the stage band's height. If the header changes
 * and the token does not, the band is wrong by the difference and the colourway
 * rail slides under the action bar — the 2026-08-20 defect, with a new cause.
 * This is the guard the number it replaced never had.
 */
for (const { name, width, height } of LAYOUT_VIEWPORTS) {
  test(`the header token matches the real header at ${name} (${width}x${height})`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height })
    await page.goto('/n001/wine')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

    const measured = await page.evaluate(() => {
      const header = document.querySelector('.header')
      if (!header) return null
      const token = getComputedStyle(document.documentElement).getPropertyValue('--header-h')
      return {
        real: Math.round(header.getBoundingClientRect().height),
        token: Math.round(Number.parseFloat(token)),
      }
    })

    expect(measured, 'no .header on the page').not.toBeNull()
    const { real, token } = measured as { real: number; token: number }

    expect(
      Math.abs(real - token),
      `--header-h is ${token}px but the header renders ${real}px. Re-measure and ` +
        `update the token in tokens.css (or its 359px override in page.css).`,
    ).toBeLessThanOrEqual(1)
  })
}
```

- [ ] **Step 4: Run it and confirm it passes**

```bash
npx --yes pnpm@10.33.0 --filter @run-apparel/viewer test:e2e -- -g "header token matches"
```

Expected: PASS at all five viewports. If it fails, the Step 1 measurement was wrong — fix the token, not the test.

- [ ] **Step 5: Satisfy the spacing gate**

```bash
npx --yes pnpm@10.33.0 --filter @run-apparel/viewer test -- tokens
```

If `tokens.test.ts` rejects the new values, add them to the documented set with the reason — do **not** round a measured header height to fit a spacing scale. A measurement that is bent to match a scale is no longer a measurement.

- [ ] **Step 6: Commit**

```bash
git add apps/viewer/src/styles/tokens.css apps/viewer/src/styles/page.css apps/viewer/src/styles/tokens.test.ts apps/viewer/e2e/motion-and-layout.spec.ts
git commit -m "feat(viewer): add --header-h, pinned to the rendered header by a test

The stage band must subtract the sticky header's height. Two measured values
(the catalogue button wraps below 360px, deliberately). The drift guard is the
point: the six-part number this replaces was re-derived by hand four times."
```

---

### Task A4: Convert the stage band to a flex column

**Files:**
- Modify: `apps/viewer/src/styles/page.css` — `.stage-block`, `.stage`, `.stage__inner`, `.stage__canvas`, `.stage__plinth`, `.colourways`

**Interfaces:**
- Consumes: `--header-h` (A3), `--action-bar-h` (existing, `tokens.css`).
- Produces: a `.stage__canvas` whose height is resolved by layout, not by `min()`.

**The DOM chain matters.** Measured 2026-08-20, `.stage-block`'s descendants are:

```
.stage-block
  └ div[role="tabpanel"]      (App.tsx — has an id, no className)
      └ section.stage         (Stage.tsx:744)
          └ div.stage__inner  (Stage.tsx:748)
              ├ div.stage__canvas   (Stage.tsx:749)
              └ div.stage__plinth   (Stage.tsx:951)
  └ section.colourways        (ColourwayTabs.tsx)
```

Flex sizing does not cross a non-flex ancestor, so all three intermediates must pass it down. The tabpanel has no class; `.stage-block > [role="tabpanel"]` selects it without touching JSX.

- [ ] **Step 1: Add the flex band**

Replace the `.stage-block` rule in `apps/viewer/src/styles/page.css`:

```css
/*
 * ⚠️ THE HEIGHT IS NO LONGER A NUMBER SOMEBODY ADDED UP.
 *
 * This band used to size the garment with `min(62vh, 640px, calc(100svh - 364px))`,
 * where 364 was the sum of the header, two paddings, a gap, the plinth, the rail
 * and the action bar. That sum was re-derived by hand and was WRONG FOUR TIMES
 * (208 -> 280 -> 316 -> 282 on desktop, and a fourth failure on the phone rule
 * where a live sweep was polluted by a `[data-reveal]` transform). The fifth
 * failure was measured on 2026-08-20 and had a new shape: the sum was right and a
 * `min-height: 300px` floor overrode it, burying two colourways under the bar at
 * 320x640.
 *
 * A number six independent values must agree with is a computation, not a
 * constant. The browser does it now: the band is one screen tall minus the header,
 * the plinth and rail take what they need, the canvas takes the rest.
 *
 * ⚠️ `padding-bottom`, NOT a subtracted term. The action bar is `position: fixed`
 * and used to float over the bottom of this band; reserving its height as real
 * space is what makes covering impossible rather than merely unlikely. Mirrors
 * `.page`'s own rule at the top of this file.
 *
 * WHAT HAPPENS WHEN IT STILL DOES NOT FIT, which is the property that fixes the
 * 320x640 defect: the canvas stops at its `min-height` and this band grows past
 * one screen, so the rail lands BELOW THE FOLD — scrollable, fully tappable —
 * instead of UNDERNEATH A FIXED BAR. Overflow degrades into scrolling rather than
 * into hidden product.
 */
.stage-block {
  --stage-gutter: clamp(8px, 3vw, 40px);
  display: flex;
  flex-direction: column;
  min-height: calc(100svh - var(--header-h));
  padding-bottom: var(--action-bar-h);
  background: var(--bg);
  border-bottom: 1px solid var(--line);
}

/* No action bar above 900px, so no space to reserve — same seam and same shape as
   `.page`'s padding-bottom rule at the top of this file. */
@media (min-width: 900px) {
  .stage-block {
    padding-bottom: 0;
  }
}

/* The bar also removes itself on short screens; see the `max-height: 500px` rule
   below, which this must stay in step with. */
@media (max-height: 500px) {
  .stage-block {
    padding-bottom: 0;
  }
}

/*
 * Flex sizing does not cross a non-flex ancestor. These three sit between
 * `.stage-block` and `.stage__canvas` and exist for other reasons (ARIA, stacking
 * context, measure and gutter); each simply forwards the growth.
 *
 * ⚠️ `min-height: 0` is load-bearing on every one of them. A flex item defaults to
 * `min-height: auto`, which refuses to shrink below its content — the same trap
 * recorded for grid items in apps/viewer/CLAUDE.md, where a poster overflowed its
 * stage by 926px because `min-height: auto` beat `max-height: 100%`.
 */
.stage-block > [role="tabpanel"],
.stage,
.stage__inner {
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  min-height: 0;
}
```

- [ ] **Step 2: Make the canvas the flexible child**

Replace the `.stage__canvas` rule — deleting its `height`, its `@supports (height: 1svh)` twin, the whole `@media (max-width: 899px)` canvas override with its `@supports` twin, and the `@media (max-width: 359px)` canvas override with its `@supports` twin. Keep `.stage__plinth`'s `margin-top` and `.stage__inner`'s `padding-bottom` from the 899px block.

```css
.stage__canvas {
  position: relative;
  /* Takes what the plinth and the rail did not. See the block comment on
     `.stage-block` for why this is not a `min()` of three terms any more. */
  flex: 1 1 auto;
  /* The floor, carried over unchanged from the rule this replaces: the smallest a
     garment can be and still read as a garment. Explicit rather than `auto`,
     which as a flex item would refuse to shrink at all. */
  min-height: 300px;
  border-radius: var(--radius-panel);
  overflow: hidden;
  background-color: var(--surface);
  background-image:
    radial-gradient(60% 50% at 50% 42%, var(--glow) 0%, transparent 70%),
    linear-gradient(var(--grid) 1px, transparent 1px),
    linear-gradient(90deg, var(--grid) 1px, transparent 1px);
  background-size:
    100% 100%,
    26px 26px,
    26px 26px;
}

/* Desktop keeps its own taller floor and its cap. The cap is NOT removed here:
   the camera radius and field of view are fixed, so the garment always fills
   86.3% of the canvas height and changing the cap changes the garment's apparent
   size at every desktop width. That belongs in its own change with its own
   before/after screenshots. */
@media (min-width: 900px) {
  .stage__canvas {
    min-height: 380px;
    max-height: 760px;
  }
}

.stage__plinth,
.colourways {
  flex: 0 0 auto;
}
```

- [ ] **Step 3: Remove the fourth disagreeing copy of the bar's height**

`.page` at the top of `apps/viewer/src/styles/page.css` reserves a raw `76px` for a bar
that measures `72px`, while `--action-bar-h` is `72px`. `tokens.css` says that height
"was re-derived by hand in three places that disagreed" — this is a fourth, still
disagreeing. Owner decision 2026-08-20: **make them match.**

```css
.page {
  min-height: 100svh;
  display: flex;
  flex-direction: column;
  /* The token, not a raw number. `--action-bar-h` exists because this height was
     re-derived by hand in three places that disagreed; a raw 76px here against a
     72px bar was the fourth. Nothing on screen moves — the 4px was never doing a
     job anyone recorded. */
  padding-bottom: calc(var(--action-bar-h) + env(safe-area-inset-bottom, 0px));
}
```

Note this also changes `min-height: 100dvh` to `100svh`. `dvh` on `.page` has the same
defect the canvas was cured of on 2026-08-19: it tracks the collapsing URL bar, so the
page's own minimum height changes while the visitor scrolls.

- [ ] **Step 4: Run the full layout suite**

```bash
pkill -f e2e/serve.mjs; npx --yes pnpm@10.33.0 --filter @run-apparel/viewer test:e2e
```

Expected: every test from A1, A2 and A3 passes at all five viewports, including the two that failed in A1 Step 5.

⚠️ **If `the garment element has a real box` fails, you have reproduced the 378×0 bug.** The cause is one of the two named in the A4 comment: a missing `min-height: 0` on one of the three forwarding elements, or `model-viewer.stage__model`'s `height: 100%` failing to resolve against a flex-sized parent. Fix it before anything else — a `min-height` on the canvas will keep every other assertion green while the product is invisible.

- [ ] **Step 5: Verify on a real device**

Boot the iOS simulator and drive the built app. The Browser pane cannot measure anything time-based (it reports the page as hidden), and synthetic pointer events do nothing to `model-viewer`, so smoothness and gestures are only observable here.

Confirm: the garment renders; a one-finger drag rotates it; the page scrolls from below the canvas; nothing resizes while scrolling.

- [ ] **Step 6: Run every gate**

```bash
npx --yes pnpm@10.33.0 lint && npx --yes pnpm@10.33.0 typecheck && npx --yes pnpm@10.33.0 test:coverage && npx --yes pnpm@10.33.0 seed:assets && npx --yes pnpm@10.33.0 build && node scripts/check-bundle-budget.mjs
```

- [ ] **Step 7: Commit**

```bash
git add apps/viewer/src/styles/page.css
git commit -m "fix(viewer): let the browser size the stage band

Replaces a six-part hand-computed subtrahend that was wrong four times with a
flex column: one screen minus the header, the action bar's height reserved as
real space, the canvas taking the remainder.

Fixes 04 Lime and 05 Black being 57% covered at 320x640, and the 4px scroll
strip in landscape. When it still does not fit, the rail lands below the fold
instead of under a fixed bar."
```

---

### Task A5: Delete what the flex band made dead

**Files:**
- Modify: `apps/viewer/src/styles/page.css`

- [ ] **Step 1: Remove the pre-`svh` fallback**

The `44vh` fallback existed because a dropped `height` declaration left `model-viewer` at `height: 100%` of an `auto` parent — the 378×0 failure. A flex band cannot reach that state: if `min-height: calc(100svh - …)` is dropped on an ancient browser the band falls back to content height and the canvas renders at its `min-height` floor. Delete the `44vh` rules and their `@supports` wrappers, and record why in a comment at the deletion site.

- [ ] **Step 2: Confirm nothing else referenced the deleted rules**

```bash
grep -n "44vh\|62vh\|72vh\|100svh - " apps/viewer/src/styles/page.css
```

Expected: only the `.stage-block` `min-height` remains.

- [ ] **Step 3: Re-run the full e2e suite and confirm still green**

```bash
pkill -f e2e/serve.mjs; npx --yes pnpm@10.33.0 --filter @run-apparel/viewer test:e2e
```

- [ ] **Step 4: Commit**

```bash
git add apps/viewer/src/styles/page.css
git commit -m "refactor(viewer): drop the pre-svh stage fallback, now unreachable

The 44vh fallback guarded a dropped height declaration leaving model-viewer at
height:100% of an auto parent. A flex band degrades to the canvas min-height
instead, so the failure it protected against no longer exists."
```

- [ ] **Step 5: STOP. Part A ships as its own pull request.**

Open the PR, take the D1 backup, capture `GET /api/public/viewer/rxps/wine`, merge, then re-capture and diff. Do not begin Part B until Part A is live and verified.

---

# PART B — Two columns when the screen is wide

### Task B1: Prove the contact-control invariant, including landscape

`apps/viewer/CLAUDE.md` records that `.contact-rail` and `.action-bar` were once 1100px and 900px, leaving 900–1099px with **no persistent contact control on the only conversion path in the product**. Part B changes which element carries that control at which size, so the invariant must be re-proved rather than assumed — and it is already false in landscape today.

**Files:**
- Modify: `apps/viewer/e2e/motion-and-layout.spec.ts`

- [ ] **Step 1: Write the test**

```ts
/**
 * There is always a way to make contact, without scrolling.
 *
 * This product has no cart and no form: a buyer taps one of these two controls or
 * they leave. The rail and the bar were once gated at 1100px and 900px, leaving
 * 900-1099px with neither — see apps/viewer/CLAUDE.md. Measured 2026-08-20, the
 * same hole exists at 844x390: the bar hides itself below 500px tall and the rail
 * needs 900px of width, so a phone in landscape carries no contact control at all.
 */
for (const { name, width, height } of [
  ...LAYOUT_VIEWPORTS,
  { name: 'the 950 seam', width: 950, height: 900 },
  { name: 'desktop', width: 1280, height: 800 },
] as const) {
  test(`a contact control is reachable without scrolling at ${name} (${width}x${height})`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height })
    await page.goto('/n001/wine')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

    const reachable = await page.evaluate(() => {
      const links = [...document.querySelectorAll('a[href^="mailto:"], a[href*="wa.me"]')]
      return links.some((a) => {
        const cs = getComputedStyle(a)
        if (cs.display === 'none' || cs.visibility === 'hidden') return false
        const r = a.getBoundingClientRect()
        return r.width > 0 && r.height > 0 && r.top >= 0 && r.bottom <= window.innerHeight
      })
    })

    expect(
      reachable,
      `no email or WhatsApp control is on screen at ${width}x${height} without ` +
        `scrolling. This is the only conversion path in the product.`,
    ).toBe(true)
  })
}
```

- [ ] **Step 2: Run it and confirm it fails at landscape only**

```bash
npx --yes pnpm@10.33.0 --filter @run-apparel/viewer test:e2e -- -g "contact control is reachable"
```

Expected: FAIL at `phone landscape (844x390)`. PASS everywhere else — that spread is the negative control proving the test measures the hole rather than always failing.

- [ ] **Step 3: Commit**

```bash
git add apps/viewer/e2e/motion-and-layout.spec.ts
git commit -m "test(viewer): a contact control must be reachable at every viewport

Fails at 844x390: the action bar hides below 500px tall and the rail needs
900px of width, so a phone in landscape carries no contact control at all.
Same shape as the 900-1099px hole recorded in apps/viewer/CLAUDE.md."
```

---

### Task B2: Build the two-column band

**Files:**
- Modify: `apps/viewer/src/styles/page.css`
- Modify: `apps/viewer/src/components/Contact.tsx` — render the rail's buttons inside the band on two-column screens

**Interfaces:**
- Consumes: the flex band from Task A4.
- Produces: a `.stage-block--split` layout mode; `.contact-rail` no longer used on wide screens.

- [ ] **Step 1: Add the two-column rules**

```css
/*
 * TWO COLUMNS WHEN THE SCREEN HAS WIDTH TO SPARE — triggered by SHAPE, not device.
 *
 * Measured 2026-08-20 at 2560x1440: 720px of unused space on EACH side of the
 * canvas, a 399px empty band (27.7% of the screen) below the stage, and the
 * garment at roughly 7.8% of the screen against 18% on a laptop. The floating
 * contact pill sat alone in that empty band at 196x54px — 0.29% of the screen,
 * 1,064px right of centre, and never scaling. The four spec callouts occupied
 * 31,790px2 against the pill's 10,606: the facts were 3.0x louder than the only
 * control that starts a conversation.
 *
 * The second condition is a phone in landscape (844x390 is an aspect ratio of
 * 2.16), which is wide and short and therefore closer to a desktop than to a
 * portrait phone. It is the same problem and takes the same answer, which is why
 * this is one rule rather than two.
 *
 * ⚠️ 900px IS THE EXISTING SEAM where `.contact-rail` appears and `.action-bar`
 * disappears, and those two must stay equal — see apps/viewer/CLAUDE.md. Reusing
 * it rather than inventing a fourth breakpoint is deliberate.
 *
 * Verified against the audit matrix: 1440x900 and 2560x1440 match on width;
 * 844x390 matches on shape; 768x1024, 402x714 and 320x256 correctly do not.
 */
@media (min-width: 900px), (min-width: 700px) and (min-aspect-ratio: 3 / 2) {
  .stage__inner {
    flex-direction: row;
    align-items: stretch;
    gap: var(--stage-gutter);
  }

  .stage__canvas {
    flex: 1 1 62%;
    min-width: 0;
  }

  .stage__aside {
    flex: 0 1 clamp(280px, 32%, 420px);
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 20px;
    min-width: 0;
  }

  /* The floating pill is gone on these screens: its contents live in the column
     now, on the reading path rather than 464px right of it. */
  .contact-rail {
    display: none;
  }
}
```

- [ ] **Step 2: Move the controls into the aside**

In `apps/viewer/src/components/Stage.tsx`, wrap `.stage__plinth` and add a `.stage__aside` container that also receives the colourway rail and the contact buttons on two-column screens. Keep DOM order such that the tablist still precedes its own tabpanel content per the existing ARIA wiring in `apps/viewer/src/App.tsx` — do **not** reorder the tablist relative to `COLOURWAY_PANEL_ID` without re-reading that file's comment.

- [ ] **Step 3: Run the full suite**

```bash
pkill -f e2e/serve.mjs; npx --yes pnpm@10.33.0 --filter @run-apparel/viewer test:e2e
```

Expected: B1's landscape failure now passes; every Part A test still green.

- [ ] **Step 4: Look at it**

Screenshot 1440×900, 2560×1440 and 844×390 in both themes. **This is a layout change; a passing test says nothing about whether it looks right.** The repo's most expensive lesson is that only a rendered view catches visual damage.

- [ ] **Step 5: Run every gate, then commit**

---

### Task B3: Raise the desktop garment cap

Owner decision 2026-08-20, overriding the recommendation to defer this. It lands **in
Part B**, which means two visual changes ship together — so this task carries its own
before/after isolation. Do not skip Step 1; it is the whole reason the override is safe.

**Files:**
- Modify: `apps/viewer/src/styles/page.css` — the `@media (min-width: 900px)` `.stage__canvas` rule

**Interfaces:**
- Consumes: the two-column band from Task B2.

**Why a cap exists at all.** The camera radius and field of view are fixed, so the
garment always fills **86.3%** of the canvas height at every viewport. Canvas height
alone decides how big the garment looks. Measured 2026-08-20 at 2560×1440 the garment
is roughly **7.8%** of the screen against **18%** on a 1440×900 laptop — the cap is why.

- [ ] **Step 1: Screenshot the two-column layout BEFORE touching the cap**

```bash
npx --yes pnpm@10.33.0 --filter @run-apparel/viewer build
```

Capture 1440×900 and 2560×1440, both themes, with Task B2 landed and the cap still at
760px. **These are the reference images.** Without them, a later "the garment looks
wrong" report cannot be attributed to the columns or to the cap, which is exactly the
cost the deferral was avoiding. Save them next to the PR.

- [ ] **Step 2: Measure what removing the cap would actually give**

In the built app at 2560×1440, read `.stage__canvas`'s height with the `max-height`
disabled. In the two-column band it is bounded by the band, which is one screen minus
the header — so expect roughly 1371px, and a garment near 1183px.

Record the number. Then read the WebGL drawing-buffer size, because this is the one
place where a layout change has a runtime cost:

```js
// In the page console. Height x width x devicePixelRatio^2 is what the GPU allocates.
const c = document.querySelector('model-viewer.stage__model').getBoundingClientRect()
;({ css: [Math.round(c.width), Math.round(c.height)], dpr: devicePixelRatio })
```

⚠️ At DPR 2 a 1371px-tall canvas allocates roughly **3× the pixels** of a 760px one, on
a page already holding a 27 MB model. If that number looks alarming, an aspect-ratio
cap is the alternative to a height cap — say the canvas after Step 3.

- [ ] **Step 3: Render three candidate caps and choose by looking**

Candidates: `760px` (today), `1000px`, and no cap (bounded by the band). Screenshot each
at 1440×900 and 2560×1440.

**Choose from the pictures, not from the numbers.** A garment that fills a 27″ screen
may read as impressive or as overbearing, and that is not decidable in a table. Record
the choice and the reason in a comment on the rule.

- [ ] **Step 4: Confirm the aside column still reads correctly**

The right-hand column is `justify-content: center`. A much taller canvas makes the
column much taller too, so its contents float in a large empty space. If that looks
wrong at the chosen cap, change the aside's alignment — do **not** reach back and lower
the cap you just chose by looking.

- [ ] **Step 5: Run the full suite and every gate**

```bash
pkill -f e2e/serve.mjs; npx --yes pnpm@10.33.0 --filter @run-apparel/viewer test:e2e
npx --yes pnpm@10.33.0 lint && npx --yes pnpm@10.33.0 typecheck && npx --yes pnpm@10.33.0 test:coverage && npx --yes pnpm@10.33.0 build && node scripts/check-bundle-budget.mjs
```

- [ ] **Step 6: Commit, then ship Part B as its own PR**

Attach the Step 1 reference images and the Step 3 comparison to the PR description, so a
reviewer can separate the two visual changes that landed together.

```bash
git add apps/viewer/src/styles/page.css
git commit -m "feat(viewer): raise the desktop garment cap

The camera radius and field of view are fixed, so the garment always fills 86.3%
of the canvas height — the cap alone decided that a 27in screen showed the same
garment as a laptop (7.8% of screen against 18%). Chosen from rendered
comparisons at 1440x900 and 2560x1440, not from arithmetic."
```

---

# PART C — The small changes

Each task here is independent. None depends on another. Ship them together as one PR.

### Task C1: Colour picker to one row where it fits

**Files:**
- Modify: `apps/viewer/src/styles/page.css` — the `@media (max-width: 767px)` block

⚠️ **There is no single value that is right at both 375px and 402px.** Measured 2026-08-20 with an 8px gap:

| `minmax` floor | 402px (385.9 available) | 375px (360.5 available) |
|---|---|---|
| 92px (today) | 3 columns → 3+2 | 3 columns → 3+2 |
| 85px | 4 columns → 4+1 | 3 columns → 3+2 |
| 68px | **5 columns → one row** | 4 columns → **4+1** |

- [ ] **Step 1: Build all three candidates and screenshot them**

Render 320, 375, 402 and 414 for: today's 92px; 68px; and a `flex-wrap` variant with `flex: 1 1 68px` where a partial row stretches to fill rather than leaving holes.

- [ ] **Step 2: Choose from the screenshots, not from the table**

A 4+1 grid leaves one tab against three empty cells. Whether that is worse than today's 3+2 is a question about how a control looks. **Decide by looking.** Record the choice and the reason in a comment at the rule.

- [ ] **Step 3: Verify against a long-named product**

The longest name in `tools/asset-pipeline/src/colour-name.ts` is "Forest Green" (12 characters), which wraps to two line-boxes on a narrow tab. RXPS's five names are all short, so **RXPS cannot exhibit this failure.** Open a second product before accepting the change.

- [ ] **Step 4: Run the suite, confirm the rail clearance guard still passes at all five viewports, commit**

### Task C2: Move the "examples" note into the product panel

**Files:**
- Modify: `apps/viewer/src/components/ColourwayTabs.tsx` — remove `.colourways__hint`
- Modify: `apps/viewer/src/components/ProductPanel.tsx` — add it there
- Modify: `apps/viewer/src/styles/page.css` — move the `.colourways__hint` rule

This is tidying, **not** a height saving. Measured: the note sits at 710→741 against a bar top of 740, i.e. already 1px underneath it, and it is below the picker and below the guard's measurement point. Do not claim height for it.

- [ ] Move the element, move its style, run `test:e2e` and the unit suite, commit.

### Task C3: Footer catalogue link target size

**Files:**
- Modify: `apps/viewer/src/components/Footer.tsx` or the `.footer__meta a` rule in `page.css`

Measured 105 × 20.1px — the smallest target on the page, against the same destination as a 40px button in the header. It passes WCAG 2.5.8 only via the spacing exception, which is why the automated scan did not flag it.

- [ ] Give it padding so its smallest dimension clears 24px. Confirm `.footer__meta`'s flex row still reads as one line. Commit.

### Task C4: Resolve the 44px target contradiction

**Files:**
- Modify: `apps/viewer/src/styles/tokens.css` and/or `apps/viewer/src/styles/page.css`

`--target-min: 44px` is declared under a long comment about a control that once shipped 2px wide, then overridden to 40px by three rules: the header button, the camera buttons and the contact rail.

- [ ] Decide once: either 44px is the floor and the three rules change, or the token documents an aspiration and its comment says so. **Do not leave it contradicted.** Record the decision in the comment. Commit.

### Task C5: The 8.5px colour numbers

**Files:**
- Modify: `apps/viewer/src/styles/page.css` — `.colourway-tab__num`

Computed at 8.5px. Already `aria-hidden`, and confirmed by the owner on 2026-08-14 as appearing on no tag, catalogue or order form — it is `index + 1`, so removing a colourway silently renumbers every one after it.

- [ ] Either raise it to a legible size or remove it. If C1 chose a tighter tab, removing it also buys width. Commit.

### Task C6: The customisation accordion default

**Files:**
- Modify: `apps/viewer/src/components/CustomisationSection.tsx`

`useState(false)` hides the four steps that explain the business to a first-time B2B buyer.

- [ ] Default open on wide screens, closed on phones where the length costs more. Keep `aria-expanded`, `aria-controls` and `inert` exactly as they are — that wiring is already correct. Commit.

### Task C7: Record the duplicate tab stops decision

`Email Us` / `WhatsApp Us` appear twice with identical accessible names (tab stops 14–17 at 768px). Part B removes one pair on wide screens. On phones the duplication remains.

- [ ] Decide whether the mobile duplication is acceptable and **write the reason down** either way, in `apps/viewer/src/components/Contact.tsx`. An undocumented decision here becomes a defect report next time somebody audits.

### Task C8: Give the first screen an honest scroll cue

Owner decision 2026-08-20: do this in Part C. Part C is the third pull request, so the
two-column layout has already landed and the fold is where it will stay — the cue is
designed against the final layout, not a moving one.

**Files:**
- Modify: `apps/viewer/src/styles/page.css`
- Possibly modify: `apps/viewer/src/components/ColourwayTabs.tsx` or `apps/viewer/src/components/ProductPanel.tsx`

**What is true today**, measured 2026-08-20 at 402×714: `.content` starts at
`y = 656` while the fixed action bar covers from `y = 642`. **Nothing peeks above the
fold at all.** A comment in `page.css` claims the colourway caption "sits just under the
fold on purpose"; measured, it is 1px under, so it is effectively fully visible and does
no such job. The first screen therefore reads as a complete, finished page, and the
specs, the four build steps and the contact copy are invisible to anyone who does not
scroll on faith.

- [ ] **Step 1: Re-measure after Part B**

Every number above predates Parts A and B, both of which move the fold. Take fresh
readings at 320×640, 375×812, 402×714, 414×896 and 844×390 before designing anything:

```js
// In the built app, with [data-reveal] forced settled — see the Ground Rules.
const c = document.querySelector('.content').getBoundingClientRect()
const bar = document.querySelector('.action-bar')
const barTop = bar && getComputedStyle(bar).display !== 'none'
  ? bar.getBoundingClientRect().top : innerHeight
;({ contentTop: Math.round(c.top), barTop: Math.round(barTop), innerHeight })
```

If `contentTop` is now **above** `barTop`, the fold already reveals the next section and
this task is a smaller job than it looks — possibly none at all. Say so rather than
building a cue nothing needs.

- [ ] **Step 2: Choose the cue, and prefer content over ornament**

Ranked, most honest first:

1. **Let the next section peek.** A visible slice of the product panel is the only cue
   that tells the visitor *what* is below, not merely *that* something is. This is what
   `page.css` has claimed to do since 2026-08-17 and never delivered.
2. **A soft fade at the band's bottom edge**, so content is visibly cut rather than
   ending. Cheap, but says less.
3. **A chevron or "scroll" affordance.** Last resort — it is ornament that announces a
   failure of layout to be self-evident, and this design system is deliberately spare.

⚠️ **Do not animate it.** `docs/DESIGN.md` outranks the vendored animation skills here,
and a bouncing arrow on a QR-scanned product page is exactly the "gratuitous animation"
the audit dimension warns about.

- [ ] **Step 3: Verify the cue does not cost a colourway**

Whatever peeks must not push the colour rail back under the action bar. Re-run:

```bash
pkill -f e2e/serve.mjs; npx --yes pnpm@10.33.0 --filter @run-apparel/viewer test:e2e -- -g "clears the action bar"
```

Expected: PASS at all five viewports. **If this fails, the cue is too tall** — shrink
the cue, do not lower the threshold.

- [ ] **Step 4: Look at it on a phone, run every gate, commit**

---

## Decisions taken by the owner, 2026-08-20

All four open questions are answered. Recorded here so a future session does not reopen
them.

| Question | Decision | Where it lands |
|----------|----------|----------------|
| `.page` reserves a raw 76px for a 72px bar | **Make them match** — use `--action-bar-h`. The 4px was drift, not breathing room. | Task A4, Step 3 |
| Should the desktop 760px garment cap rise? | **Yes, and in Part B** rather than deferred — overriding the recommendation to wait. Mitigated by mandatory before/after captures. | Task B3 |
| Product-name casing (`x-milo` vs `X-MILO`) | **Keep as-is.** A deliberate design flourish, working as designed. Not a defect; do not "fix" it. | Not scheduled — closed |
| A scroll cue on the first screen | **Yes, in Part C.** Part C follows Part B, so it is designed against the final layout. | Task C8 |
