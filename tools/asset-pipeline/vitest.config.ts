import { coverage } from '../../vitest.coverage.mjs'
import { defineConfig } from 'vitest/config'

/**
 * The pipeline's coverage floor is the one number here that is NOT an argument for
 * more tests. Read CLAUDE.md before raising it: the three blocking gates do not
 * catch decimation damage, and neither does a coverage percentage. What guards the
 * printed artwork is `pnpm eval:artwork`, which renders the wordmark before and
 * after the real chain — a line-coverage number would have been 100% green through
 * the entire 2026-08-05 incident.
 *
 * Coverage here protects the argument parsing, the validators and the colour
 * naming. It says nothing about whether the letters survived.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'],
    coverage: coverage({
      include: ['src/**/*.ts'],
      exclude: [
        // Argument dispatch + process.exit; exercised for real by `pnpm pipeline`
        // in seed:assets on every CI run, which is stronger than a unit test of it.
        'src/cli.ts',
        // Heavy binary I/O against glTF-Transform and Playwright. `render.ts` and
        // `io.ts` are covered where their pure helpers are; driving the encoders
        // under vitest would duplicate what eval:artwork already does end to end.
        'src/io.ts',
        'src/placeholders.ts',
      ],
      // Measured 2026-08-13. Read the note above before treating this number as a
      // statement about artwork safety — it is not one.
      thresholds: { lines: 91, functions: 87, branches: 75, statements: 88 },
    }),
  },
})
