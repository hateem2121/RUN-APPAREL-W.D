/**
 * Shared coverage settings for all five vitest workspaces.
 *
 * WHY THIS FILE EXISTS RATHER THAN FIVE COPIES. The per-package `include` lists
 * genuinely differ and belong next to the package — but the REPORTERS must not.
 * `scripts/check-coverage.mjs` reads every package's `coverage/coverage-summary.json`
 * and fails the build on a shortfall; a package that quietly stops emitting
 * `json-summary` would vanish from that check while its own test run stayed green.
 * That is the same shape as the gitleaks-in-its-own-workflow bug (CLAUDE.md): a gate
 * that cannot fail because nothing reaches it.
 *
 * WHY `include` IS MANDATORY AND NOT DEFAULTED. v8 coverage without an explicit
 * `include` reports only files a test already imported, so a source file with no test
 * at all is not 0% — it is ABSENT, and the percentage goes UP when you add untested
 * code. That is precisely the measurement the 2026-08-08 scorecard said was missing
 * ("nobody measures how much of the code the tests actually cover"), and defaulting it
 * would have reproduced the gap under a green badge.
 */

/** Never counted, in any package. */
const ALWAYS_EXCLUDE = [
  '**/*.test.ts',
  '**/*.test.tsx',
  '**/*.d.ts',
  '**/node_modules/**',
  '**/dist/**',
  '**/output/**',
  '**/*.config.ts',
  '**/*.config.mjs',
]

/**
 * @param {{ include: string[], exclude?: string[], thresholds: Record<string, number> }} opts
 * @returns {import('vitest/node').CoverageV8Options}
 */
export function coverage({ include, exclude = [], thresholds }) {
  return {
    provider: 'v8',
    // `text-summary` is what a human reads in CI logs; `json-summary` is what
    // scripts/check-coverage.mjs reads. Keep both.
    reporter: ['text-summary', 'json-summary'],
    reportsDirectory: './coverage',
    include,
    exclude: [...ALWAYS_EXCLUDE, ...exclude],
    // Vitest's own threshold check runs per package and fails that package's `test`
    // script directly, so a shortfall stops `pnpm test` rather than waiting for the
    // aggregate step. The aggregate step exists for the repo-wide floor and for the
    // one thing per-package thresholds cannot express: a package disappearing.
    thresholds,
    // A file with zero executed lines still counts. Without this, deleting the last
    // test for a module RAISES the reported percentage.
    all: true,
  }
}
