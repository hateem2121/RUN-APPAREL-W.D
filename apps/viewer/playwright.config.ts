import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  use: {
    baseURL: 'http://localhost:4173',
    // In environments with a pre-installed Chromium (e.g. this repo's CI/dev
    // containers), point Playwright at it instead of downloading a build.
    ...(process.env.PLAYWRIGHT_CHROMIUM_PATH
      ? { launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } }
      : {}),
  },
  webServer: {
    command: 'node e2e/serve.mjs',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
  },
})
