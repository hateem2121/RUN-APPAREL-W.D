import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * The heartbeat's Sentry cron monitor is configured from inside the workflow that
 * feeds it, so two values in one file have to agree: the `cron:` GitHub fires on,
 * and the `schedule` the check-in upserts into Sentry. Nothing else compares them.
 *
 * WHY IT IS A GATE. On 2026-08-26 the monitor had been alerting on every cycle
 * since it was created — `missed` at :44, then the real check-in 19 to 90 minutes
 * later — because it carried Sentry's default `checkin_margin` of ONE minute while
 * GitHub's scheduled runs are queued rather than punctual. The workflow was healthy
 * the whole time; only the alarm was wrong. A watchdog that is wrong every cycle is
 * worse than no watchdog, and the failure is invisible from the repository because
 * the offending number lived in a dashboard.
 *
 * Moving it into the workflow fixed that and created this new way to be wrong:
 * change the `cron:` and forget the payload, and Sentry starts expecting a ping at
 * a time nothing sends one — the same false alarm, arrived at from the other side.
 */
const REPO_ROOT = join(import.meta.dirname, '..', '..', '..')
const HEARTBEAT = join(REPO_ROOT, '.github', 'workflows', 'heartbeat.yml')

/** The `cron:` the `schedule:` trigger fires on. */
const workflowCron = (yaml: string) => yaml.match(/^\s*-\s*cron:\s*'([^']+)'/m)?.[1]

/** The `monitor_config` the check-in POSTs to Sentry. */
const monitorConfig = (yaml: string) => {
  const payload = yaml.match(/^\s*payload='(\{.*\})'$/m)?.[1]
  return payload
    ? (JSON.parse(payload).monitor_config as {
        schedule: { value: string }
        checkin_margin: number
      })
    : undefined
}

describe('heartbeat Sentry cron monitor', () => {
  const yaml = readFileSync(HEARTBEAT, 'utf8')

  it('sends a monitor_config at all, so the config lives here and not in a dashboard', () => {
    expect(monitorConfig(yaml)).toBeDefined()
    // Upsert is what makes this file authoritative: a hand-edit in Sentry's UI is
    // corrected on the next ping instead of silently outliving the repo.
    expect(yaml).toContain('"schedule":{"type":"crontab"')
  })

  it('tells Sentry the same schedule GitHub actually fires on', () => {
    expect(monitorConfig(yaml)?.schedule.value).toBe(workflowCron(yaml))
  })

  it('the schedule check can actually fail (negative control)', () => {
    const drifted = yaml.replace('"value":"43 */6 * * *"', '"value":"0 * * * *"')
    expect(monitorConfig(drifted)?.schedule.value).not.toBe(workflowCron(drifted))
  })

  it("allows more grace than GitHub's measured scheduling delay", () => {
    // MEASURED 2026-08-26 across the last 11 scheduled runs of this workflow:
    // 19, 33, 34, 36, 46, 50, 53, 60, 84, 88 and 90 minutes late. Every one late.
    // The floor is the worst observed delay; the shipped value carries headroom
    // above it. Re-measure before lowering either:
    //   gh run list --workflow=heartbeat.yml --json createdAt,event
    const WORST_OBSERVED_DELAY_MINUTES = 90
    expect(monitorConfig(yaml)?.checkin_margin).toBeGreaterThanOrEqual(WORST_OBSERVED_DELAY_MINUTES)
  })
})
