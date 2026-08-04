import { defineConfig, devices } from '@playwright/test'

// Optional pre-installed Chromium (CI/dev containers) instead of a download.
//
// SCOPED TO THE CHROMIUM PROJECTS ONLY. This used to sit in the top-level `use`,
// which was harmless while every project was Chromium — but handing a Chromium
// executablePath to WebKit or Firefox launches the wrong browser or fails
// outright, so the moment those projects were added it had to move.
const chromiumPath = process.env.PLAYWRIGHT_CHROMIUM_PATH
const baseLaunch = chromiumPath ? { executablePath: chromiumPath } : {}

/** Everything except the real-WebGL spec, which is Chromium-only by necessity. */
const DOM_SUITE = /webgl\.spec\.ts/

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
    baseURL: 'http://localhost:4173',
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
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          ...baseLaunch,
          args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist'],
        },
      },
    },
  ],
  webServer: {
    // prepare.mjs builds the viewer (empty api base → mock) + generates
    // fixtures, so the suite runs from a cold checkout. It runs before the
    // readiness poll, so dist/ always exists by the time serve.mjs answers.
    command: 'node e2e/prepare.mjs && node e2e/serve.mjs',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
