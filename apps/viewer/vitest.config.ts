import { defineConfig } from 'vitest/config'

// jsdom-environment unit tests for the viewer's browser logic
// (theme, capabilities, router, api, telemetry).
export default defineConfig({
  test: {
    environment: 'jsdom',
    // `scripts/` is included because the CSP builder lives there and ships in every
    // response header. It had no tests at all until 2026-08-05, having already
    // caused two production incidents on its own.
    //
    // `.tsx` is matched as well as `.ts`. It was `.ts` only until 2026-08-07, which
    // meant a test file for a COMPONENT could be added, be syntactically valid, and
    // never run — vitest reports "no test files found" for the glob it was given and
    // says nothing about the file you wrote. Every component test would have been
    // silently absent.
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'scripts/**/*.test.ts'],
    // Installs a working localStorage/sessionStorage. Required from Node 25+,
    // where Node's own Web Storage global suppresses jsdom's — see the setup
    // file for the full explanation.
    setupFiles: ['./vitest.setup.ts'],
  },
})
