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
 * Chromium-only by necessity: webgl.spec.ts, and render.spec.ts (task 13/14)
 * since it waits on `window.__RENDER_READY`, which only fires after
 * <model-viewer>'s `load` event — undetectable without actually decoding a
 * Meshopt-compressed model.
 *
 * camera-settle.spec.ts joined them on 2026-09-07 for the same reason: it drags the
 * garment and measures where the camera comes to rest, and without a GL context the
 * stage is in poster fallback, so the drag lands on an image and the probe measures a
 * settle of zero — which reads as an excellent result. It skips itself in that state
 * rather than reporting one, but it belongs where the context actually exists.
 */
const DOM_SUITE = /(webgl|render|camera-settle)\.spec\.ts/

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
  // This suite GATES THE DEPLOY (the `verify` job in .github/workflows/ci.yml),
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
  use: {
    baseURL: ORIGIN,
    // Force reduced motion so the Phase 7 motion layer (CSS + JS, which both
    // branch on prefers-reduced-motion) collapses to instant — selectors and
    // timing stay stable regardless of animation.
    reducedMotion: 'reduce',
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
      testIgnore: DOM_SUITE,
      use: { ...devices['iPhone 13'] },
    },
    {
      name: 'viewer-firefox',
      testIgnore: DOM_SUITE,
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
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          ...baseLaunch,
          args: [
            '--enable-unsafe-swiftshader',
            '--use-angle=swiftshader',
            '--ignore-gpu-blocklist',
          ],
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
