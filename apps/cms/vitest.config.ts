import { coverage } from '../../vitest.coverage.mjs'
import { defineConfig } from 'vitest/config'

// Node-environment unit tests for the pure, security-critical logic
// (publish gating + the public API projection). No Payload/Next bootstrap.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: coverage({
      // Only the code these node-environment tests can actually reach. The admin
      // UI (`.tsx`), the Payload config and the seed scripts all need a Payload or
      // Next bootstrap that this suite deliberately does not perform — counting
      // them would produce a number describing the bootstrap gap rather than the
      // tests, and the honest way to raise it is an integration suite, not an
      // include pattern.
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.tsx',
        // Payload GENERATES both of these; biome.jsonc excludes them for the same
        // reason.
        'src/migrations/**',
        'src/payload-types.ts',
        // Bootstrap + I/O shells with no branch of their own.
        'src/payload.config.ts',
        'src/seed/**',
        'src/app/**',
        // Repo-wide guards that assert about FILES, not about this app's runtime.
        // They have no source of their own to cover.
        'src/instrumentation.ts',
      ],
      // Measured 2026-08-13, after the endpoint and access-control handlers gained
      // tests (57.88% → 76.25% lines). What remains uncovered is largely Payload
      // COLLECTION CONFIG — declarative field definitions whose behaviour is already
      // extracted into publishGating.ts, mediaRules.ts and rawRules.ts, all at ~100%.
      thresholds: { lines: 84, functions: 80, branches: 74, statements: 84 },
    }),
  },
})
