import { defineConfig } from '@playwright/test'

// Optional pre-installed Chromium (CI/dev containers) instead of a download.
const chromiumPath = process.env.PLAYWRIGHT_CHROMIUM_PATH
const baseLaunch = chromiumPath ? { executablePath: chromiumPath } : {}

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  use: {
    baseURL: 'http://localhost:4173',
    // Force reduced motion so the Phase 7 motion layer (CSS + JS, which both
    // branch on prefers-reduced-motion) collapses to instant — selectors and
    // timing stay stable regardless of animation.
    reducedMotion: 'reduce',
    launchOptions: baseLaunch,
  },
  projects: [
    {
      // The DOM-level suite: runs against the poster-first fallback (no GPU).
      name: 'viewer',
      testIgnore: /webgl\.spec\.ts/,
    },
    {
      // The real-3D suite: force software WebGL so model-viewer gets a context.
      name: 'webgl',
      testMatch: /webgl\.spec\.ts/,
      use: {
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
