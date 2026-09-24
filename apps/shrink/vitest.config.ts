import { coverage } from '../../vitest.coverage.mjs'
import { defineConfig } from 'vitest/config'

/**
 * The queue-consumer Worker that drives the container processing every real garment.
 * `src/index.ts` is the Worker entrypoint — a `fetch`/`queue` handler whose branches
 * are the Cloudflare runtime's, not ours; every decision it makes is delegated to the
 * tested modules beside it, which is the reason it is excluded rather than the excuse.
 *
 * ⚠️ THAT SENTENCE WAS ASPIRATIONAL UNTIL 2026-08-29, AND IT MATTERED.
 *
 * The dead-letter fork, the ack-versus-retry decision, the failure report text, both
 * CRITICAL fallbacks and all three blocking gates were inside the 760 excluded lines.
 * So these thresholds — the strictest in the repo — measured 75 lines and none of the
 * code deciding whether a customer's garment is refused, retried or abandoned. A 100%
 * floor over a denominator that small reads as the strongest gate here while checking
 * almost nothing, and nobody re-reads a green number.
 *
 * Made true rather than relaxed, because floors in this repo are MEASURED and lowering
 * one to go green is forbidden: `specGate.ts`, `queueDecisions.ts` and
 * `permanentJobError.ts` now hold what `index.ts` used to decide inline. The
 * denominator went 52 → 81 lines at 100%.
 *
 * SINCE 2026-09-03 (fix plan Rank 13, audit Q-01) every VERDICT is out of index.ts:
 * `refusals.ts` (size, torn artwork, see-through artwork, the stripped colour map),
 * `specGate.ts`, `containerFailure.ts` (the expired upload), `orphanGuard.ts`,
 * `attach.ts`, `colourImport.ts`, `queueDecisions.ts`. What index.ts
 * still holds is TRANSPORT — the container call, the CMS reads and writes, the R2
 * streams — and the order they run in. It cannot be imported under plain Node at all
 * (`@cloudflare/containers` pulls in `cloudflare:workers`), so covering the transport
 * needs `@cloudflare/vitest-pool-workers`, a dependency decision, not a test one. The
 * rule stands: a new decision goes in a module beside these, never inline.
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
