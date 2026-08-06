import { defineConfig } from 'vitest/config'

// jsdom-environment unit tests for the viewer's browser logic
// (theme, capabilities, router, api, telemetry).
export default defineConfig({
  test: {
    environment: 'jsdom',
    // `scripts/` is included because the CSP builder lives there and ships in every
    // response header. It had no tests at all until 2026-08-05, having already
    // caused two production incidents on its own.
    include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'],
    // Installs a working localStorage/sessionStorage. Required from Node 25+,
    // where Node's own Web Storage global suppresses jsdom's — see the setup
    // file for the full explanation.
    setupFiles: ['./vitest.setup.ts'],
  },
})
