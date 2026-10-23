import { defineConfig, devices } from '@playwright/test'

// Optional pre-installed Chromium (CI/dev containers) instead of a download.
//
// SCOPED TO THE CHROMIUM PROJECTS ONLY. This used to sit in the top-level `use`,
// which was harmless while every project was Chromium — but handing a Chromium
// executablePath to WebKit or Firefox launches the wrong browser or fails
// outright, so the moment those projects were added it had to move.
const chromiumPath = process.env.PLAYWRIGHT_CHROMIUM_PATH
const baseLaunch = chromiumPath ? { executablePath: chromiumPath } : {}

/**
 * Everything except the specs that need a real WebGL context, which are
 * Chromium-only by necessity: webgl.spec.ts and the other `*-webgl.spec.ts` files, which
 * wait on <model-viewer>'s `load` event and read its drawn frames — undetectable without
 * actually decoding a Meshopt-compressed model. (`render.spec.ts` and `window.__RENDER_READY`
 * were removed with the /render route, commit 1197364e, 2026-08-17; the `render` in the
 * pattern below matches no spec file today.)
 *
 * camera-settle.spec.ts joined them on 2026-09-07 for the same reason: it drags the
 * garment and measures where the camera comes to rest, and without a GL context the
 * stage is in poster fallback, so the drag lands on an image and the probe measures a
 * settle of zero — which reads as an excellent result. It skips itself in that state
 * rather than reporting one, but it belongs where the context actually exists.
 */
const DOM_SUITE = /(webgl|render|camera-settle)\.spec\.ts/

/**
 * `fontSwap.spec.ts` (TY-02) needs two engines, not four: Chromium, the only one with the
 * Layout Instability API, and desktop WebKit, which counts the headline's lines — Mac only
 * (owner ruling, 2026-09-23): `system-ui` only reads as an iPhone's on a Mac, so the WebKit
 * half skips itself on CI's Linux image and runs locally, before every push, on this project.
 * It lays out every live headline several times, and CI's `e2e` job already measured about 21
 * of its 30 minutes on 2026-09-07; Firefox and mobile Safari would add minutes and no reading
 * these two do not give.
 */
const TWO_ENGINE_SUITE = /fontSwap\.spec\.ts/

/**
 * The e2e server's port, in ONE place and passed explicitly to the server.
 *
 * Passing it via `webServer.env` means the config DICTATES the port, so a mismatch
 * cannot end as `Error: Timed out waiting 120000ms from config.webServer`: the same
 * misleading two-minute signature as the `pnpm`-not-on-PATH trap in CLAUDE.md.
 */
const PORT = 4173
const ORIGIN = `http://localhost:${PORT}`

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  // One retry in CI, none locally.
  //
  // This suite GATES THE DEPLOY (the `e2e` job in .github/workflows/ci.yml),
  // so a single flaky run blocks a release. Observed on 2026-08-03: the very
  // first run after a cold build failed on the poster-visible assertion in
  // "direct QR URL loads product…", then passed in isolation and passed 66/66 on
  // two consecutive full runs — a cold-start timing artefact, not a regression.
  //
  // A retry does NOT hide it. Playwright reports a test that fails then passes as
  // **flaky** in its own section, so it stays visible and countable, while a real
  // failure still fails both attempts and still stops the deploy. Zero retries
  // gives the opposite trade: flakes and genuine breakage are indistinguishable,
  // and the usual response to a red deploy nobody trusts is to stop reading it.
  retries: process.env.CI ? 1 : 0,
  // TEST-PARALLEL, SO CI CAN SPLIT THE SUITE ACROSS MACHINES EVENLY (2026-09-29). File-
  // parallel, `--shard` hands out whole files, and motion-and-layout.spec.ts is 146 of
  // the 283 tests in each browser project — one shard would carry half the suite. Safe
  // because e2e/serve.mjs holds no state one test can set and another read (its only
  // map, STALL_COUNTS, is keyed per test and per retry) and no spec depends on order.
  // The `webgl` project opts back out below.
  fullyParallel: true,
  // CI writes a `blob` report per shard, which ci.yml's `e2e` job merges into ONE HTML
  // report (traces and screenshots included) and keeps for 14 days; `line` keeps the log
  // readable. Locally, the default list reporter.
  reporter: process.env.CI ? [['blob'], ['line']] : 'list',
  // A stray `test.only` must FAIL in CI, not shrink the suite. Measured 2026-09-29: one
  // probe file holding `test.only` made `CI=1 playwright test --project=viewer` run
  // "1 test using 1 worker" instead of 283 and pass green, while `biome check` only
  // WARNS on it (noFocusedTests, exit 0). apps/cms/playwright.config.ts already had this.
  forbidOnly: !!process.env.CI,
  use: {
    baseURL: ORIGIN,
    // Force reduced motion so the Phase 7 motion layer (CSS + JS, which both
    // branch on prefers-reduced-motion) collapses to instant — selectors and
    // timing stay stable regardless of animation.
    reducedMotion: 'reduce',
    // EVIDENCE FOR A FAILURE, WITHOUT SLOWING A PASS. Until 2026-09-29 a red run left
    // only text. A trace is recorded on the RETRY only (`retries: 1` in CI), because
    // recording every test adds work to timing-sensitive specs — firstPaint's 3 s
    // budget, perfBudgets' heap ceiling, placeholder-webgl's 800 ms bound — and a
    // genuine failure fails its retry too, so the retry's trace is the one to read.
    // A screenshot costs nothing until a test has already failed.
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      // The DOM-level suite: runs against the poster-first fallback (no GPU).
      name: 'viewer',
      testIgnore: DOM_SUITE,
      use: { ...devices['Desktop Chrome'], launchOptions: baseLaunch },
    },
    {
      // WebKit — the engine behind iOS Safari, which is where a QR code scanned
      // off a garment tag actually opens. Until 2026-08-03 the entire suite was
      // Chromium twice over, so the single most likely browser for this product
      // had never run a line of it.
      name: 'viewer-webkit',
      testIgnore: DOM_SUITE,
      use: { ...devices['Desktop Safari'] },
    },
    {
      // iPhone viewport on the same engine: catches layout that only breaks at
      // 390px with a notch, which desktop WebKit will not show.
      name: 'viewer-mobile-safari',
      testIgnore: [DOM_SUITE, TWO_ENGINE_SUITE],
      use: { ...devices['iPhone 13'] },
    },
    {
      name: 'viewer-firefox',
      testIgnore: [DOM_SUITE, TWO_ENGINE_SUITE],
      use: { ...devices['Desktop Firefox'] },
    },
    {
      // The real-3D suite: force software WebGL so model-viewer gets a context.
      // Chromium-only — SwiftShader is a Chromium flag, and there is no
      // equivalent way to guarantee a WebGL context in headless WebKit.
      name: 'webgl',
      testMatch: DOM_SUITE,
      /**
       * ⚠️ A LONGER BUDGET FOR THIS PROJECT ONLY, AND IT IS A MEASUREMENT RATHER THAN A
       * RAISE TO GO GREEN.
       *
       * These tests render a real garment through SwiftShader — 3D in SOFTWARE, on the
       * CPU. Timed locally on an M1 2026-09-07, the heaviest of them ("3D model loads and
       * switching colourway changes the KHR material variant") takes **9.9 s**, and the
       * whole file 30.0 s. A GitHub runner is several times slower at CPU-bound
       * rasterisation, so the suite-wide 30 s ceiling was never a margin — it was a
       * coin-flip, and it lost twice in a row (runs 34121278710 and 34124770667, both
       * attempts each, always at `page.waitForFunction` waiting for the model). It had
       * passed on the two runs before that with nothing relevant changed between them.
       *
       * ⚠️ THE ROOT `.github/CLAUDE.md` SAYS RAISING A CEILING IS THE WRONG FIX, AND THAT
       * RULE IS ABOUT A DIFFERENT CASE. There, a degraded Ubuntu mirror ate whole job
       * budgets and lifting one ceiling only moved which job died — the ceiling was never
       * the problem. Here the ceiling IS the problem: it is smaller than the measured cost
       * of the work on the machine that does it. Scoped to this project so the other five
       * keep the 30 s ceiling, which is generous for everything they do.
       *
       * ⚠️ 120 s AND NOT 60, DELIBERATELY, THOUGH 60 WOULD COVER THE MEASURED COST.
       * A timeout only bounds a FAILURE — a passing test costs its real duration and
       * nothing more — so a generous ceiling is free on every green run and buys one
       * thing that matters: at 120 s a failure can no longer be explained away as "the
       * runner was slow". If this times out again the model is BROKEN, not slow, and the
       * next person is spared the round trip I just spent deciding which. The price is
       * four extra minutes on a genuinely broken run, twice, because of `retries`.
       *
       * A broken model also shows up in `webgl.spec.ts`'s own context assertions. Do not
       * raise this again without measuring which of the two it is.
       */
      timeout: 120_000,
      /**
       * ⚠️ AND A LONGER `expect` WAIT, ALSO A MEASUREMENT (11 Oct 2026). Under these SwiftShader
       * flags three.js spends ~2.6 s of main thread in the model-viewer chunk before
       * `<model-viewer>` enters the page (CPU profile: two functions, 1,516 + 1,105 ms); plain
       * headless Chromium 153 does the same in ~80 ms, so this is the harness's cost, never a
       * visitor's. Measured on this Mac: the element arrived at 2.5–2.7 s idle and at 3.9 s at a
       * load average of 36, where `reduced-motion-live-webgl.spec.ts` missed the default 5 s in 2
       * of 8 full-suite runs. 15 s covers the loaded reading with the margin the note above gives a
       * GitHub runner ("several times slower"); a stage that never mounts still fails, in 15 s.
       * The lighter switches below (12 Oct) dropped that cost to ~80 ms. Both limits stay as they
       * are (owner, 12 Oct): a limit costs nothing on a green run, and lowering one needs its own
       * measurement under the new switches, not "it is faster now".
       */
      expect: { timeout: 15_000 },
      // Stays FILE-parallel, as the whole suite was until 2026-09-29: two of these
      // software-rendered tests at once on one runner's CPU is the contention the 30 s
      // coin-flip above describes. The other projects went test-parallel (see the top).
      fullyParallel: false,
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          ...baseLaunch,
          /**
           * ⚠️ SOFTWARE 3D FOR WEBGL ONLY, NOT FOR THE WHOLE BROWSER (12 Oct 2026).
           *
           * These were `--enable-unsafe-swiftshader --use-angle=swiftshader --ignore-gpu-blocklist`.
           * `--use-angle=swiftshader` makes SwiftShader the browser's whole OpenGL ES driver, so
           * every paint of the page went through software 3D too. Chromium's own page
           * (chromium.googlesource.com/chromium/src/+/main/docs/gpu/swiftshader.md, read 12 Oct)
           * gives the WebGL-only mode used here; both report the same renderer ("SwiftShader
           * driver"), so the garment is drawn by the same engine.
           *
           * Measured 12 Oct, Playwright 1.64.0, the 24 tests of this project 3 times each:
           *   CI's image (v1.64.0-noble, 4 CPUs like a GitHub runner): 204 s → 94 s, and the old
           *     switches timed out once in 72 (placeholder-webgl, LIVE-10); 72 of 72 passed now.
           *   This Mac: 85 s → 72 s. `<model-viewer>` enters the page at ~80 ms instead of ~2.1 s,
           *     and the model loads at ~1.0 s instead of ~2.4 s.
           * With WebGL switched off (`--disable-webgl`), 21 of the 24 fail in both places, so a
           * switch that loses 3D cannot pass quietly (webgl.spec.ts also fails on no context).
           *
           * Not "no switches", though it measured the same: Chromium is removing the silent
           * SwiftShader fallback that bare headless relies on, and these switches opt in by name.
           */
          args: ['--use-gl=angle', '--use-angle=swiftshader-webgl', '--enable-unsafe-swiftshader'],
        },
      },
    },
  ],
  webServer: {
    // prepare.mjs builds the viewer (empty api base → mock) + generates
    // fixtures, so the suite runs from a cold checkout. It runs before the
    // readiness poll, so dist/ always exists by the time serve.mjs answers.
    command: 'node e2e/prepare.mjs && node e2e/serve.mjs',
    url: ORIGIN,
    // Pinned, not inherited. See PORT above — an unrelated `PORT` in the shell
    // silently moves the server and the only symptom is the timeout below.
    env: { PORT: String(PORT) },
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
