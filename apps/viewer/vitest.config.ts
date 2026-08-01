import { defineConfig } from 'vitest/config'

// jsdom-environment unit tests for the viewer's browser logic
// (theme, capabilities, router, api, telemetry).
export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
    // Installs a working localStorage/sessionStorage. Required from Node 25+,
    // where Node's own Web Storage global suppresses jsdom's — see the setup
    // file for the full explanation.
    setupFiles: ['./vitest.setup.ts'],
  },
})
