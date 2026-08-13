import { coverage } from '../../vitest.coverage.mjs'
import { defineConfig } from 'vitest/config'

/**
 * The queue-consumer Worker that drives the container processing every real
 * garment. `src/index.ts` is the Worker entrypoint — a `fetch`/`queue` handler
 * whose branches are the Cloudflare runtime's, not ours; every decision it makes
 * is delegated to the tested modules beside it, which is the reason it is
 * excluded rather than the excuse.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: coverage({
      include: ['src/**/*.ts'],
      exclude: ['src/index.ts'],
      // Measured 2026-08-13. This package is at 100% lines and it should stay there:
      // it is the Worker that decides whether a shrunk garment is written back onto
      // a live product, and every branch it has is one a real upload can take.
      thresholds: { lines: 100, functions: 100, branches: 98, statements: 100 },
    }),
  },
})
