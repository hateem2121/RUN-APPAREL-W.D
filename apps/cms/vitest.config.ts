import { coverage } from '../../vitest.coverage.mjs'
import { defineConfig } from 'vitest/config'

// Node-environment unit tests for the pure, security-critical logic
// (publish gating + the public API projection). No Payload/Next bootstrap.
export default defineConfig({
  // The cms tsconfig sets `jsx: preserve` for Next, which leaves JSX untransformed and
  // makes any test that imports a .tsx component fail vite's import analysis with
  // "invalid JS syntax". SiteFooter.test.ts renders components with react-dom/server,
  // so vitest compiles JSX itself. ⚠️ `oxc`, NOT `esbuild`: this is Vite 8, which
  // transforms with oxc and IGNORES esbuild options when both are present — the first
  // attempt set `esbuild.jsx` and changed nothing. Added 2026-09-05.
  oxc: { jsx: { runtime: 'automatic' } },
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
