import { coverage } from '../../vitest.coverage.mjs'
import { defineConfig } from 'vitest/config'

/**
 * This package had no vitest config at all until coverage was added — it ran on
 * vitest's defaults, which worked. `include` is stated explicitly here anyway,
 * because the default glob is `**` and would start matching a test file added
 * outside `src/` without anyone deciding that it should.
 *
 * This is the repo's strictest package (`exactOptionalPropertyTypes` is on here and
 * in the pipeline only) and it is the contract three Workers agree on, so its
 * coverage floor is the highest of the five.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: coverage({
      include: ['src/**/*.ts'],
      exclude: [
        // Pure type declarations and the barrel re-export: no statements to run.
        'src/types.ts',
        'src/index.ts',
      ],
      // Measured 2026-08-13, rounded DOWN to the integer. A ratchet, not a target:
      // v8 coverage is deterministic for the same source, so exact floors are safe
      // and any regression fails the package's own `test` script. Raise these when
      // you add tests; never lower one to make a build green.
      thresholds: { lines: 84, functions: 92, branches: 68, statements: 81 },
    }),
  },
})
