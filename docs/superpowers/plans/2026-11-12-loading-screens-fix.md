# Loading Screens Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every loading screen on wear-run.com plays its whole short show, ends only when the page under it is ready, never traps a keyboard or a tap, and is proved by tests that fail on today's code.

**Architecture:** The website curtain's inline driver is rewritten around a clock that starts when the curtain first paints, a displayed progress that rolls toward real progress (never jumps), and a "ready" that means the first-screen pictures are decoded. Its timing rules become small pure functions that both the unit tests and the shipped inline script use, and a simulation test runs the exact shipped string. The garment opening screen waits for the stage's first picture and wipes with compositor-only transforms. Smaller fixes cover the 3D counter, the page-to-page weave, an optional loader-timing event and an owner-gated picture-quality change.

**Tech Stack:** Next 16 + Payload (apps/cms), React 19 + Vite + `<model-viewer>` (apps/viewer), Vitest, Playwright 1.64.1 (Chromium, Firefox, WebKit), Cloudflare Workers.

**Spec:** the loader investigation of 2026-11-12 (findings A1–A10, B1–B3, C1–C2, D1, E3, F1–F4) and the owner's answers the same day:
curtain percent kept and smoothed; weave waits 0.4 s; 3D mark rests after 5 s; extras = loader timings to PostHog, a native `<progress>` for the 3D bar, lighter card pictures (gated, Task 9).

## Global Constraints

- One branch, one PR: `loaders/full-fix-2026-11-12`, cut from `main` in its own worktree. Never commit on `main`.
- Commit messages: plain English, `Area — what changed`, ending with the attribution line.
- Durations come from `packages/ui/src/tokens.css` only: `--ui` 220 ms, `--slow` 800 ms, `--showpiece` 1400 ms, `--stagger`. `docs/DESIGN.md` outranks the motion skills on duration and easing.
- Curtain numbers: on screen at least `PRELOADER_SHOWPIECE_MS` = 1400 ms and at most `PRELOADER_CEILING_MS` = 3000 ms **counted from the curtain's first paint**; a capped finish rolls the remaining years in `PRELOADER_FINISH_MS` = 220 ms; the CSS fallback lifts at `PRELOADER_CEILING_MS + PRELOADER_FINISH_MS + 600` = 3820 ms after the curtain appears.
- The curtain still stores nothing, still shows only on arrival from outside, never under reduced motion or automation (owner, 2026-10-09). No template holes in the inline script (nonce stamping, `preloader.test.ts`).
- Animate only `transform`/`translate`/`opacity` in every loader exit.
- Every new behaviour is guarded by `prefers-reduced-motion` exactly as today: the curtain and weave do not appear under reduced motion; the garment screen shows its words without motion.
- Tests that need a loader must lift `navigator.webdriver` (both loaders hide under automation by design); `reducedMotion: 'no-preference'` is set explicitly.
- No new npm dependency. Nothing new is stored on the device. PostHog events are sent only after Accept (`packages/shared/src/consent.ts` rules).
- Never touch the LIVE contact or template forms; test forms on localhost:4174 only.
- Card picture quality changes only after the owner picks a value from Task 9's comparison, and only together with the Cloudflare rule "Only the card picture sizes may be resized" (ask before any Cloudflare change).

## Review Focus

1. **A visitor who opens the site in a background tab** then switches to it — expect: no flash, the curtain either plays its full show or does not show. Test in Task 1 (simulation with a hidden-then-visible clock).
2. **A page with no first-screen pictures** (a guide or policy page) — expect: ready as soon as fonts and stylesheets are in; the roll still lasts 1400 ms. Test in Task 1.
3. **A first-screen picture that fails to load** — expect: counted as finished (not waited for until the cap). Test in Task 1.
4. **A garment whose colourway has no poster** — expect: the opening screen does not wait for a picture that will never come. Test in Task 4.
5. **A visitor who presses Tab or taps during the curtain** — expect: the curtain finishes within 220 ms and the tap does not activate a hidden link. Test in Task 3.

---

### Task 1: Curtain timing rules as pure functions, and a simulation of the shipped script (A1, A2, A3, A4, A6, A7, A10)

**Files:**
- Modify: `apps/cms/src/lib/preloader.ts` (whole driver)
- Modify: `apps/cms/src/lib/preloader.test.ts`
- Create: new file preloaderSimulation.test.ts beside preloader.ts

**Interfaces:**
- Produces (exported from `preloader.ts`):
  - `PRELOADER_SHOWPIECE_MS = 1400`, `PRELOADER_CEILING_MS = 3000`, `PRELOADER_FINISH_MS = 220`, `PRELOADER_FALLBACK_MS = 3820` (replaces `PRELOADER_FLOOR_MS`; `preloaderLiftAt` is deleted).
  - `stepShown(shown: number, target: number, dtMs: number, capped: boolean): number` — moves `shown` toward `target`, never backwards, at most `dtMs / PRELOADER_SHOWPIECE_MS` per call, or `dtMs / PRELOADER_FINISH_MS` when `capped`.
  - `liftReason(input: { sinceAppearMs: number; ready: boolean; shown: number; interacted: boolean }): 'ready' | 'cap' | 'interaction' | null` — `'interaction'` when interacted and shown is 1; `'ready'` when ready, shown is 1 and `sinceAppearMs >= PRELOADER_SHOWPIECE_MS`; `'cap'` when `sinceAppearMs >= PRELOADER_CEILING_MS` and shown is 1; else `null`.
  - `counterYear` (kept, now fed `shown`), `curtainPercent(shown: number): number` = `Math.round(shown * 100)`.
  - `PRELOADER_BOOT_SCRIPT` — built from `stepShown`, `liftReason`, `counterYear` via `Function.prototype.toString`, so the shipped script runs the tested code.
  - Writes `window.__runCurtain = { appearedAt, liftedAt, reason }` (in memory only) for Task 8.

- [ ] **Step 1: Write the failing unit tests** in `preloader.test.ts`: `stepShown` never decreases and needs ≥ 1400 ms of 16 ms steps to go 0→1 uncapped; capped it finishes in ≤ 220 ms; `liftReason` table covering ready-before-showpiece (null), ready-after (`'ready'`), not-ready at 3000 ms with shown < 1 (null), not-ready at 3000 ms with shown = 1 (`'cap'`), interacted (`'interaction'`); CSS fallback delay in `site.css` equals `PRELOADER_FALLBACK_MS`. Delete the "never past 2.2 s" test with `preloaderLiftAt`.
- [ ] **Step 2: Write the failing simulation test** `preloaderSimulation.test.ts`: run `PRELOADER_BOOT_SCRIPT` with `new Function` against a fake document (eager images with `complete`/`decode()`, `document.fonts.status`, stylesheet performance entries) and a fake clock driving `requestAnimationFrame`/`setTimeout`/`performance.now`. Cases and assertions:
  - fast page (all ready at 200 ms, curtain appears at 150 ms): lift at ≥ 1550 ms; ≥ 20 distinct years shown; last year shown before lift = current year; percent shown before lift = `100%`.
  - slow page (ready at 6400 ms, appears at 1700 ms): lift between 4700 and 4920 ms with reason `'cap'`; current year shown before lift.
  - picture decoded at 3750 ms, appears at 1700 ms: lift ≥ 3750 ms, reason `'ready'` (A3).
  - hidden tab: clock frozen 0–5000 ms, visible after: either no curtain painted or full ≥ 1400 ms show (Review Focus 1).
  - no eager pictures: ready from fonts + stylesheets; lift at ≥ 1400 ms after appearance (Review Focus 2).
  - an eager image with `complete` true and `naturalWidth` 0 counts as finished (Review Focus 3).
  - the driver never calls `getBoundingClientRect` (A6): the fake throws if it is called.
- [ ] **Step 3: Run both test files; expect FAIL** (`pnpm --filter @run-apparel/cms exec vitest run preloader`).
- [ ] **Step 4: Implement.** Driver outline: on the first `requestAnimationFrame` after `data-preload="on"`, record `appearedAt`; each frame compute `sinceAppear`, step `shown` toward `target` (`target` = real fraction capped at 0.95 until ready, 1 when ready or capped), write year + percent + the five mark bands from `shown`, check `liftReason`. Real fraction is recomputed every 250 ms from a list captured once: `link[rel=stylesheet]`, `script[src]`, `img:not([loading=lazy])` (no geometry reads). Ready = all those finished (an image counts when `complete`, then awaits `decode()` once) and `document.fonts.status === 'loaded'`. On lift: set `lifting`, record `__runCurtain`, remove the attribute after 600 ms.
- [ ] **Step 5: Run both test files; expect PASS.** Negative control: set `PRELOADER_SHOWPIECE_MS` to 0 locally and confirm the fast-page case fails, then restore.
- [ ] **Step 6: Commit** — `Website — the first-arrival curtain counts from when it appears, rolls every year and waits for the first-screen pictures`.

### Task 2: Curtain styles: fallback clock, fade of the year, curtain catches taps (A7, A8, A9)

**Files:**
- Modify: `apps/cms/src/app/(frontend)/site.css` (curtain block near `@keyframes preloader-out-a`)
- Test: `apps/cms/src/lib/preloader.test.ts` (fallback assertion from Task 1)

**Interfaces:** Consumes `PRELOADER_FALLBACK_MS` (Task 1).

- [ ] **Step 1:** The fallback test from Task 1 Step 1 is already failing (3000 ≠ 3820).
- [ ] **Step 2: Implement:** `animation-delay: 3820ms` on the `on` rules; `.preloader__lockup` in `lifting` fades with `opacity` over `var(--ui)` then `visibility: hidden` (no instant pop); `html[data-preload="on"] .preloader { pointer-events: auto; }` so a tap lands on the curtain, not on a hidden link; `lifting` returns `pointer-events: none`.
- [ ] **Step 3: Run** the CMS unit tests for `preloader.test.ts` and `publicSite.test.ts`; expect PASS.
- [ ] **Step 4: Commit** — `Website — the curtain's backup timer and its year fade on the curtain's own clock`.

### Task 3: A visitor who acts ends the curtain (A5, A8)

**Files:**
- Modify: `apps/cms/src/lib/preloader.ts` (driver listens once for `keydown`, `pointerdown`, `wheel`, `touchstart`, passive, removed on lift)
- Modify: `apps/cms/e2e/firstArrival.spec.ts`

**Interfaces:** Consumes `liftReason` (`interacted: true` → finish roll in `PRELOADER_FINISH_MS`).

- [ ] **Step 1: Write failing e2e tests** in `firstArrival.spec.ts` (Chromium, webdriver lifted): `pressing Tab during the curtain lifts it within 400 ms and focus is never on a covered element` — press Tab twice, for each focus assert `document.elementFromPoint` at the focused element's centre is the element or inside it once `data-preload` is gone; `a tap during the curtain does not follow a hidden link` — click the screen centre while `on`, assert the URL is unchanged.
- [ ] **Step 2: Run** `pnpm --filter @run-apparel/cms exec playwright test e2e/firstArrival.spec.ts --project=chromium` with `CI=1`; expect FAIL.
- [ ] **Step 3: Implement** the listeners; a `pointerdown` on the curtain calls `preventDefault()` so the tap does not pass through.
- [ ] **Step 4: Run again; expect PASS.**
- [ ] **Step 5: Commit** — `Website — a key or a tap during the curtain finishes it instead of reaching a hidden link`.

### Task 4: Garment opening screen waits for the stage's first picture (B2)

**Files:**
- Create: new files firstPicture.ts and firstPicture.test.ts in apps/viewer/src/lib
- Modify: `apps/viewer/src/App.tsx` (the `done` prop of `<Preloader>`), `apps/viewer/src/lib/motion.ts`

**Interfaces:**
- Produces: `PRELOADER_PICTURE_WAIT_MS = 1500` in `motion.ts`; `waitForFirstPicture(url: string | null, maxMs: number, load?: (url: string) => Promise<void>): Promise<'decoded' | 'timeout' | 'none' | 'failed'>` — resolves `'none'` at once for a null URL, `'failed'` on error, `'timeout'` after `maxMs`.
- Consumes: the selected colourway's placeholder URL, the same one `Stage.tsx` passes to `.stage__placeholder`.

- [ ] **Step 1: Write failing unit tests** for the four outcomes, with a fake `load`.
- [ ] **Step 2: Run** `pnpm --filter @run-apparel/viewer exec vitest run firstPicture`; expect FAIL.
- [ ] **Step 3: Implement** with `new Image()` + `decode()`; in `App.tsx`, `done` becomes `state.kind === 'ready' && pictureSettled`, where `pictureSettled` flips when `waitForFirstPicture(...)` resolves.
- [ ] **Step 4: Write an e2e test** in `apps/viewer/e2e/` (`openingWaitsForPicture.spec.ts`): delay the poster response 1000 ms with `page.route`; assert `.preloader--exit` appears only after `.stage__placeholder` is `complete`; and with the poster route aborted, the exit still happens within 1500 ms of data ready (Review Focus 4 covers the no-poster fixture case with a colourway whose `poster` is null).
- [ ] **Step 5: Run unit + that e2e spec on all viewer projects; expect PASS** (negative control: revert `done` and see the spec fail).
- [ ] **Step 6: Commit** — `Garment pages — the opening screen leaves once the garment's first picture is ready`.

### Task 5: Garment wipe on compositor-only transforms (B1)

**Files:**
- Modify: `apps/viewer/src/styles/page.css` (`.preloader`, `.preloader--exit`), `apps/viewer/src/components/Preloader.tsx` (one inner wrapper), `apps/viewer/index.html` (static markup copy)
- Test: `apps/viewer/src/components/staticPreloader.test.tsx`, a new openingWipe.spec.ts in apps/viewer/e2e

**Interfaces:** Keeps `view-transition-name: garment-opening` on `.preloader` and `PRELOADER_WIPE_MS` = 800.

- [ ] **Step 1: Write the failing e2e test:** during `.preloader--exit`, the computed transition property list of `.preloader` contains `transform`/`translate` and not `clip-path`; and with a forced 300 ms main-thread block (`page.evaluate` busy loop) started 200 ms into the wipe, sampled screenshots show the wipe position still advancing (compare two frames 100 ms apart inside the block).
- [ ] **Step 2: Run on viewer-chromium; expect FAIL.**
- [ ] **Step 3: Implement** the same look with opposing transforms: `.preloader` `overflow: clip` and on exit `translate: 0 -100%`; its new child `.preloader__sheet` gets `translate: 0 100%`, both over `var(--slow)` with `var(--ease-out-expo)`. Mirror the wrapper in `index.html`; `staticPreloader.test.tsx` keeps the two in step.
- [ ] **Step 4: Run** the spec, `staticPreloader.test.tsx` and `cardOpening.test.ts`; expect PASS.
- [ ] **Step 5: Commit** — `Garment pages — the opening wipe keeps moving while the 3D engine works`.

### Task 6: 3D counter: mark rests after 5 s, native progress bar (C1, C2)

**Files:**
- Modify: `apps/viewer/src/components/WorkingBlock.tsx`, `apps/viewer/src/styles/page.css` (`.stage__loading-bar`), `apps/cms/src/components/site/NavProgress.tsx` + `site.css` (the weave's hold mark gets the same 5 s rest)
- Test: a new WorkingBlock.test.tsx beside WorkingBlock.tsx, `apps/viewer/e2e/loading-readout-webgl.spec.ts`

**Interfaces:** Produces `MOTION_REST_AFTER_MS = 5000` in `apps/viewer/src/lib/motion.ts` and the same constant in `apps/cms/src/lib/navProgress.ts`.

- [ ] **Step 1: Write failing tests:** with fake timers, `working--rest` is absent at 4900 ms after waking and present at 5000 ms; the bar is a `<progress>` with `max="100"` and `value` equal to `percent` while downloading, no `value` while preparing, named "3D model download", outside the `aria-hidden` block; the `role="status"` live region text is unchanged.
- [ ] **Step 2: Run** `pnpm --filter @run-apparel/viewer exec vitest run WorkingBlock`; expect FAIL.
- [ ] **Step 3: Implement**; style `<progress>` with `appearance: none` and `::-webkit-progress-value` / `::-moz-progress-bar` so the computed size and colour match today's bar (assert in the e2e spec by bounding box ±1 px against the current bar).
- [ ] **Step 4: Run unit + `loading-readout-webgl.spec.ts`; expect PASS.**
- [ ] **Step 5: Commit** — `Garment pages — the 3D download bar is a real progress bar and its mark rests after five seconds`.

### Task 7: Page-to-page weave waits 0.4 s (D1)

**Files:**
- Modify: `apps/cms/src/components/site/NavProgress.tsx` (`layWeave` scheduled at `NAV_PROGRESS_DELAY_MS`, cancelled on arrival)
- Test: `apps/cms/e2e/navProgress.spec.ts` (or the existing weave spec found by `grep -l nav-weave apps/cms/e2e`)

- [ ] **Step 1: Write failing e2e tests:** a tap whose next page is routed to answer in 100 ms never sets `data-weave`; a tap routed to answer in 1500 ms sets `cover` at ≥ 400 ms and ends with `lift`.
- [ ] **Step 2: Run** with `CI=1` on chromium; expect FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run; expect PASS.**
- [ ] **Step 5: Commit** — `Website — a quick tap between pages is no longer woven`.

### Task 8: Loader timings to PostHog, after Accept only (F3)

**Files:**
- Modify: `packages/shared/src/consent.ts` (add `loaderTiming`), `packages/shared/src/consent.test.ts`
- Modify: `apps/cms/src/components/site/AboutPreloader.tsx` (a small client island reads `window.__runCurtain` after lift), `apps/viewer/src/components/Preloader.tsx`, `apps/viewer/src/components/WorkingBlock.tsx`
- Modify: the privacy page's PostHog paragraph if it lists PostHog's purpose (`grep -rn PostHog apps/cms/src/app/\(frontend\)/privacy`)

**Interfaces:** Produces `loaderTiming(win: TrackerWindow, loader: 'curtain' | 'garment_opening' | 'model_3d', shownMs: number, reason: string): void` — calls `win.posthog.capture('loader_timing', { loader, shown_ms, reason })` only when PostHog has started after Accept; otherwise does nothing and stores nothing.

- [ ] **Step 1: Write failing unit tests:** no call before Accept; one call with the exact properties after; never touches storage.
- [ ] **Step 2: Run** `pnpm --filter @run-apparel/shared exec vitest run src/consent.test.ts`; expect FAIL.
- [ ] **Step 3: Implement** and wire the three call sites.
- [ ] **Step 4: Run; expect PASS.** Run `apps/cms/e2e/headers.spec.ts` (a plain visit stores nothing) — expect PASS.
- [ ] **Step 5: Commit** — `Analytics — how long each loading screen showed, sent only after Accept`.

### Task 9: Lighter card pictures — owner picks first (E3)

**Files:**
- Modify (only after the owner's pick): `packages/shared/src/cardImage.ts` (`QUALITY`), `apps/cms/src/lib/cardImage.test.ts`, `docs/RUNBOOK.md` (rule change), `docs/DECISIONS-BETA-WEBSITE.md`
- Create (scratchpad, never committed): the comparison sheet

- [ ] **Step 1: Measure:** for rxps-wine, r-xmp-wine and r-atw-turquoise at the 720 card size, fetch quality 75, 80, 85, 90 (AVIF), record KB, and crop the chest-panel fabric and the print at 3x with `~/.venvs/imaging/bin/python`; compute ΔE2000 against the original render for print and fabric crops.
- [ ] **Step 2: Show the owner** the sheet; stop until he picks a value or keeps 90.
- [ ] **Step 3 (if changed): Cloudflare first** — ask, then widen the rule to allow both the old and the new quality; confirm a new-quality URL answers 200 with a plain GET.
- [ ] **Step 4:** change `QUALITY` and `cardImage.test.ts`; run the CMS unit tests and the Lighthouse floor check for /products.
- [ ] **Step 5: Commit** — `Website — card pictures at quality N (owner, 12 Nov), weighed against fabric grain`. After deploy, narrow the Cloudflare rule to the new value only (separate, asked).

### Task 10: The 1.35 s freeze when the 3D model becomes ready (B3) — measure, then fix or report

**Files:** decided by the measurement; candidates `apps/viewer/src/components/Stage.tsx`, `apps/viewer/src/lib/preload3d.ts`

- [ ] **Step 1: Measure:** Chrome DevTools trace of `/products/rxps/wine` at 4x CPU, Slow 4G, phone viewport; split the long frame at the `preparing → live` moment into shader compile, geometry upload, texture decode and our own code.
- [ ] **Step 2: Decide:** if our own code is ≥ 200 ms of it, move that work out of the frame (for example after the first drawn frame) with a test that measures the longest frame in `loading-readout-webgl.spec.ts` under 4x CPU; if it is model-viewer or the 2.4 M-triangle model itself, write the numbers into `docs/HARDENING-LOG.md` and leave the code (the topstitch treatment in memory note "Viewer lag + topstitch blocker" is the real fix and is out of scope).
- [ ] **Step 3: Commit** whichever of the two happened — `Garment pages — …` with the measured numbers.

### Task 11: Prove it end to end, then open the PR (F1, F4)

- [ ] **Step 1:** Run `node .claude/skills/gates/run-gates.mjs` (all gates in CI order). Expect every gate PASS; report any SKIPPED.
- [ ] **Step 2:** Run both e2e suites in full (`pnpm --filter @run-apparel/cms test:e2e`, `pnpm --filter @run-apparel/viewer test:e2e`). Expect PASS; re-run a known flake alone before debugging it.
- [ ] **Step 3:** Local timing proof with the scratchpad scripts against `opennextjs-cloudflare preview` (`cms-edge`, port 4174) and the viewer on 4173: curtain on screen ≥ 1400 ms and ≤ 3000 ms from first paint, ≥ 20 distinct years, ends on the current year, lift not before the hero picture is decoded unless capped; garment exit not before the stage picture; no frame gap > 100 ms during the wipe in Chromium with real graphics. Then open the garment page on the iOS simulator's Safari against the viewer on port 4173 (`PORT=4173`, `VITE_API_BASE_URL=''`) and record the opening screen's exit, the one real-WebKit-on-iPhone check this Mac can make; the website curtain cannot be reached from the simulator (port 4174), so it stays "not checked on a real iPhone".
- [ ] **Step 4:** Add the owner's 12 Nov decisions (percent kept, weave 0.4 s, mark rest 5 s, PostHog loader timings, quality outcome) to `docs/DECISIONS-BETA-WEBSITE.md`, and a "loaders hide under automation; lift `navigator.webdriver` to test them" line to `.claude/rules/tests-and-fixtures.md`, with a second line: the Awwwards motion recorder clicks live pages by itself, so it is never pointed at /contact or any form page (F2).
- [ ] **Step 5:** Push once, open the PR (`Loading screens — every loader plays its full show and waits for the page`), bind it, turn on Auto-fix and auto-merge (standing owner rule). After deploy: re-run the live timing scripts and compare with the 12 Nov numbers.

## What this removes from the live site (owner rule: name every removal)

- The curtain no longer lifts at 0.8 s on a fast page: it always shows its 1.4 s roll.
- The curtain no longer lets a tap reach the page under it; a tap or key ends it instead.
- The year no longer vanishes in one frame at the lift: it fades over 220 ms.
- Fast taps between website pages lose the weave (only taps slower than 0.4 s weave).
- The 3D download mark stops moving after 5 s; the numbers keep moving.
- The garment wipe's look is kept, but it is drawn by two sliding layers instead of a clip.
- Card pictures change only if the owner picks a new quality in Task 9.
