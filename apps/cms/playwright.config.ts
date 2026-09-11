import { defineConfig, devices } from '@playwright/test'

/**
 * Browser tests for the PUBLIC marketing site.
 *
 * ⚠️ WHY THIS EXISTS. Until 2026-09-05 nothing in this repo loaded these pages in a
 * browser. All 54 CMS test files read source text or exercise pure functions, and the
 * viewer's suite never touches `/`, `/products` or `/contact` — so if all three pages
 * had rendered completely blank, every gate in CI would have stayed green. That is the
 * single largest finding in the 2026-09-05 site-pages audit (kept privately).
 *
 * ⚠️ THE PORT IS OWNED BY THIS FILE AND PASSED EXPLICITLY. apps/viewer's config carries
 * the full account: a `PORT` exported for an unrelated project moved its server while
 * Playwright polled the original, and the only symptom was a two-minute timeout naming
 * nothing. Passing it through `webServer.env` means the environment cannot reach it.
 * 4174, one above the viewer's 4173, so both suites can run at once.
 */
const PORT = 4174
const ORIGIN = `http://localhost:${PORT}`

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'line' : 'list',
  use: {
    baseURL: ORIGIN,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    /*
     * Firefox earns its place here rather than doubling the runtime for symmetry: it is
     * the one engine that does NOT support the scroll-driven animation the bar uses, and
     * it renders broken-image alt text differently from the other two. Both behaviours
     * are asserted, so a regression in the fallback path is caught in the engine that
     * actually takes it.
     */
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    /*
     * WebKit, for ONE file: `e2e/fontSwap.spec.ts`. The stand-in font metrics differ between
     * engines (`scripts/calibrate-fallback.mjs` prints the per-engine table), and WebKit is the
     * engine behind iOS Safari, where a QR code scanned off a garment tag opens — and it ignores
     * `ascent-override`. Adding it to every file would double this suite's runtime for no other
     * test's benefit, for the same reason Firefox earns its place above rather than by symmetry.
     */
    {
      name: 'fontswap-webkit',
      testMatch: /fontSwap\.spec\.ts/,
      use: { ...devices['Desktop Safari'] },
    },
  ],
  webServer: {
    command: 'node e2e/prepare.mjs && node e2e/serve.mjs',
    url: ORIGIN,
    // Pinned, not inherited — see PORT above.
    env: { CMS_E2E_PORT: String(PORT) },
    reuseExistingServer: !process.env.CI,
    // The build runs inside this command from a cold checkout, so the budget covers a
    // full `next build`, not just a server start.
    timeout: 240_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
})
