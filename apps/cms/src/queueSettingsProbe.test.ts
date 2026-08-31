import { describe, expect, it } from 'vitest'
import {
  CLOUDFLARE_DEFAULT_SECONDS,
  EXPECTED_RETENTION_SECONDS,
  REQUIRED_QUEUES,
  evaluateQueues,
} from '../../../scripts/queue-settings-probe.mjs'

/**
 * Tests for the queue-settings probe.
 *
 * WHAT IT GUARDS. `message_retention_period` on both queues is 14 days, and a
 * repo-wide grep for `1209600` or `message_retention` finds it in NO shipping code —
 * audit 2026-08-30 PM, finding L7-01. The value is correct and completely unguarded:
 * anyone with dashboard access can restore Cloudflare's 345600 s default and nothing
 * here would notice. That is the same shape as this repository's headline incident, a
 * Worker hand-edited in the dashboard that no test could see.
 *
 * ⚠️ THE MOST IMPORTANT TEST IN THIS FILE IS THE EMPTY-LIST ONE, AND IT IS THE LEAST
 * OBVIOUS. `GET /accounts/<id>/queues` with a token scoped away from Queues can answer
 * `200 {"success":true,"result":[]}` — a successful call that measured nothing. Written
 * the obvious way, the probe would find no drift in that list and exit 0, converting
 * "I cannot see the queues" into "the queues are correct". The pass path exists only
 * for a list that actually contains them.
 *
 * WHY THESE ARE FIXTURES rather than a live call: the probe's two failure controls can
 * be run directly (no credentials, bad token — both exit 2), but its SUCCESS path needs
 * an account-scoped token the dev machine does not have. A probe whose green path has
 * never executed is exactly the instrument this repo keeps being burned by, so the
 * judgement was lifted into a pure function that these drive.
 */

const ok = (name: string) => ({
  queue_name: name,
  settings: { message_retention_period: EXPECTED_RETENTION_SECONDS },
})

describe('evaluateQueues', () => {
  it('passes when both queues retain for 14 days', () => {
    const verdict = evaluateQueues(REQUIRED_QUEUES.map(ok))
    expect(verdict.ok).toBe(true)
    expect(verdict.inconclusive).toBeNull()
    expect(verdict.failures).toEqual([])
    expect(verdict.checked).toBe(REQUIRED_QUEUES.length)
  })

  it('is INCONCLUSIVE on an empty list, never a pass', () => {
    // A token scoped away from Queues returns exactly this: success, and nothing.
    const verdict = evaluateQueues([])
    expect(verdict.ok).toBe(false)
    expect(verdict.inconclusive).toMatch(/ZERO queues/)
    // And it must NOT be reported as a drift either — nothing was measured.
    expect(verdict.failures).toEqual([])
  })

  it('fails when a queue has been reset to Cloudflare’s default, and says so', () => {
    const verdict = evaluateQueues([
      ok('glb-shrink'),
      {
        queue_name: 'glb-shrink-dlq',
        settings: { message_retention_period: CLOUDFLARE_DEFAULT_SECONDS },
      },
    ])
    expect(verdict.ok).toBe(false)
    expect(verdict.failures).toHaveLength(1)
    expect(verdict.failures[0]).toContain('glb-shrink-dlq')
    expect(verdict.failures[0]).toContain('4.0 days')
    // Naming the default distinguishes "someone lowered it deliberately" from "it was
    // reset", which are different conversations.
    expect(verdict.failures[0]).toMatch(/default/)
  })

  it('fails when a queue is missing, rather than silently checking one of two', () => {
    const verdict = evaluateQueues([ok('glb-shrink')])
    expect(verdict.ok).toBe(false)
    expect(verdict.failures[0]).toContain('glb-shrink-dlq')
    expect(verdict.failures[0]).toContain('NOT FOUND')
  })

  it('ignores unrelated queues on the same account', () => {
    const verdict = evaluateQueues([
      { queue_name: 'someone-elses-queue', settings: { message_retention_period: 60 } },
      ...REQUIRED_QUEUES.map(ok),
    ])
    expect(verdict.ok).toBe(true)
  })

  it('treats a missing settings block as drift, not as a pass', () => {
    // The API omits `settings` in some shapes. `undefined !== 1209600`, so this must
    // fail — but the message has to stay readable rather than printing "undefined s".
    const verdict = evaluateQueues([ok('glb-shrink'), { queue_name: 'glb-shrink-dlq' }])
    expect(verdict.ok).toBe(false)
    expect(verdict.failures[0]).toContain('unreadable')
  })

  it('pins the expected value and its unit', () => {
    // 1209600 s = 14 days = Cloudflare's documented MAXIMUM on Workers Paid. The free
    // tier maxes at 24 h, so this number cannot simply be copied onto a new account.
    expect(EXPECTED_RETENTION_SECONDS).toBe(14 * 24 * 60 * 60)
    expect(CLOUDFLARE_DEFAULT_SECONDS).toBe(4 * 24 * 60 * 60)
    expect(REQUIRED_QUEUES).toEqual(['glb-shrink', 'glb-shrink-dlq'])
  })
})
