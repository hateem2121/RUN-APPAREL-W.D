import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Two defects fixed on 2026-08-30, and the invariant that keeps the first fix safe.
 *
 * 1. THE CONTAINER ID WAS PER-JOB. `getContainer(env.SHRINK, String(job.rawUploadId))`
 *    against `max_instances: 1` meant a second garment arriving while the first
 *    instance was still warm (containers idle ~3 minutes before sleeping) could not
 *    get an instance at all. It failed, retried twice into the same wall, and
 *    dead-lettered WITHOUT EVER BEING ATTEMPTED.
 *
 * 2. `container.fetch()` HAD NO TIMEOUT. A hung container produced no error and no
 *    report — the fetch waited until the queue's 15-minute invocation ceiling killed
 *    it, and the message retried into the same hang. The owner saw a garment that
 *    never appeared, with nothing anywhere saying why.
 *
 * ⚠️ THIS TEST READS THE SOURCE RATHER THAN IMPORTING IT, deliberately. `src/index.ts`
 * imports `@cloudflare/containers`, which needs the `cloudflare:workers` runtime and
 * throws under plain vitest — which is also why that file is the one entry in this
 * package's coverage `exclude`. A source assertion is what is available here, and it
 * is enough to catch the regression: both defects were a single expression.
 *
 * ⚠️ THE THIRD TEST IS THE IMPORTANT ONE. The shared id is only safe because jobs are
 * serialised, and the fix and its precondition live in DIFFERENT FILES — index.ts and
 * wrangler.jsonc — so nothing else connects them.
 */
const HERE = import.meta.dirname
const INDEX = join(HERE, 'index.ts')
const WRANGLER = join(HERE, '..', 'wrangler.jsonc')

/** The queue's hard invocation ceiling. A timeout at or above it can never fire. */
const QUEUE_INVOCATION_CEILING_MS = 15 * 60 * 1000

describe('shrink container lifecycle', () => {
  const source = readFileSync(INDEX, 'utf8')

  it('uses a STABLE container id, not one derived from the job', () => {
    expect(
      source,
      'The container id is derived from the job again. With max_instances: 1 that ' +
        'dead-letters the second garment without ever attempting it.',
    ).not.toMatch(/getContainer\([^)]*job\./)
    expect(source).toContain('getContainer(env.SHRINK, SHRINK_CONTAINER_ID)')
  })

  it('passes a timeout to the container fetch — not merely declaring one', () => {
    // A constant nothing uses is the failure shape this repo keeps recording.
    expect(source).toContain('signal: AbortSignal.timeout(CONTAINER_TIMEOUT_MS)')
  })

  it('times out below the queue ceiling, so the abort is REPORTED not killed', () => {
    const declared = source.match(/const CONTAINER_TIMEOUT_MS = ([\d_]+)/)?.[1]
    expect(declared, 'CONTAINER_TIMEOUT_MS is no longer a literal this test can read').toBeDefined()
    const ms = Number(String(declared).replace(/_/g, ''))
    expect(ms).toBeGreaterThan(0)
    expect(
      ms,
      'A timeout at or above the queue ceiling can never fire — the platform kills ' +
        'the invocation first, with nothing reported.',
    ).toBeLessThan(QUEUE_INVOCATION_CEILING_MS)
  })

  it('keeps the consumer serialised — the precondition for sharing one instance', () => {
    const config = readFileSync(WRANGLER, 'utf8')
    const consumer = config.slice(config.indexOf('"consumers"'))
    const concurrency = consumer.match(/"max_concurrency":\s*(\d+)/)?.[1]

    expect(concurrency, 'Could not read max_concurrency — this guard would be inert.').toBeDefined()
    expect(
      Number(concurrency),
      'max_concurrency rose above 1, which makes the SHARED container id in index.ts ' +
        'unsafe: two jobs could reach one instance at once. Either restore it to 1, or ' +
        'give each job its own id AND raise max_instances to match.',
    ).toBe(1)
  })
})
