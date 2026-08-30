import { existsSync, readFileSync, readdirSync } from 'node:fs'
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

  // Hours between firings, for the crontab forms this repo uses. A bare `*` in the
  // hour field is hourly, a `*/N` step is every N hours, a single number is daily.
  //
  // ⚠️ Deliberately a LINE comment: a `*/N` step written inside a /** */ block closes
  // the comment at the slash, and the parse error then surfaces twenty lines later on
  // a line that is perfectly fine.
  const intervalHours = (cron?: string): number | undefined => {
    const hour = cron?.split(/\s+/)[1]
    if (!hour) return undefined
    if (hour === '*') return 1
    const step = /^\*\/(\d+)$/.exec(hour)
    if (step) return Number(step[1])
    return /^\d+$/.test(hour) ? 24 : undefined
  }

  /**
   * ⚠️ THIS USED TO DEMAND THE TWO SCHEDULES BE IDENTICAL, AND THAT RULE HAD TO GO.
   *
   * Identical is the wrong invariant. What makes Sentry false-alarm is expecting a
   * check-in SOONER than one can arrive; being told to expect one less often is
   * harmless, because a healthy run simply pings more than once per window. Since
   * 2026-08-30 the workflow deliberately runs every 6 hours while telling Sentry to
   * expect every 12 — see the long comment in heartbeat.yml for the measurement.
   *
   * So the rule is one-directional, and it still catches the drift the equality
   * check was built for: slow the `cron:` down past what Sentry expects and this
   * fails, which is the case that manufactures alarms nobody can act on.
   */
  it('never expects a check-in sooner than the cron can deliver one', () => {
    const cron = intervalHours(workflowCron(yaml))
    const sentry = intervalHours(monitorConfig(yaml)?.schedule.value)
    expect(cron, 'could not parse the workflow cron').toBeDefined()
    expect(sentry, 'could not parse the monitor_config schedule').toBeDefined()
    expect(sentry).toBeGreaterThanOrEqual(cron as number)
  })

  it('fails when Sentry is told to expect pings FASTER than the cron (negative control)', () => {
    // The direction that actually hurts: Sentry expecting hourly against a 6-hourly
    // job would mark five of every six windows missed, forever.
    const drifted = yaml.replace('"value":"43 */12 * * *"', '"value":"43 * * * *"')
    const cron = intervalHours(workflowCron(drifted)) as number
    expect(intervalHours(monitorConfig(drifted)?.schedule.value)).toBeLessThan(cron)
  })

  it('the parser is not vacuous (negative control)', () => {
    // If intervalHours returned undefined for everything, the assertion above would
    // pass on nonsense. Pin the three forms it must actually decode.
    expect(intervalHours('43 */6 * * *')).toBe(6)
    expect(intervalHours('43 */12 * * *')).toBe(12)
    expect(intervalHours('43 * * * *')).toBe(1)
    expect(intervalHours('43 7 * * *')).toBe(24)
  })

  it('tolerates the worst GAP between check-ins, not merely the worst delay', () => {
    // ⚠️ THE DELAY IS THE WRONG NUMBER, AND USING IT IS WHY THIS ALARM WAS WRONG.
    //
    // A margin sized against "how late is a run" assumes every run happens. GitHub
    // also DROPS scheduled runs: measured 2026-08-30 over 39 scheduled runs of this
    // workflow (2026-08-19 to 08-30), three were skipped outright, and the worst gap
    // between consecutive check-ins was 818 minutes against a 6-hour cron — far past
    // the worst single delay of 331. Median gap 364, i.e. usually fine.
    //
    // So the quantity that must exceed the worst gap is the FULL window Sentry
    // allows: its expected interval plus the margin.
    //   6h + 120 (the setting that alarmed from 2026-08-26) =  480 -> too small
    //   6h + 355 (the most a 6h schedule can carry)         =  715 -> still too small
    //  12h + 360 (shipped)                                  = 1080 -> 262 min headroom
    //
    // Re-measure the GAP before lowering either number:
    //   gh run list --workflow=heartbeat.yml --limit 40 --json createdAt,event
    const WORST_OBSERVED_GAP_MINUTES = 818
    const config = monitorConfig(yaml)
    const window =
      (intervalHours(config?.schedule.value) as number) * 60 + (config?.checkin_margin ?? 0)
    expect(window).toBeGreaterThan(WORST_OBSERVED_GAP_MINUTES)
  })

  it('the tolerance check can fail (negative control)', () => {
    // Reproduce the state this repo was actually in on 2026-08-30: 6h + 120.
    const previous = yaml
      .replace('"value":"43 */12 * * *"', '"value":"43 */6 * * *"')
      .replace('"checkin_margin":360', '"checkin_margin":120')
    const config = monitorConfig(previous)
    const window =
      (intervalHours(config?.schedule.value) as number) * 60 + (config?.checkin_margin ?? 0)
    expect(window).toBeLessThan(818)
  })
})

/**
 * The WATCHED list is a second copy of the repository's schedule, and until
 * 2026-08-30 nothing checked it.
 *
 * TWO WAYS IT WAS SILENTLY WRONG. `perf-watch.yml` was not in the list at all, so it
 * could have stopped running for weeks unnoticed — the absence of a watcher is
 * invisible by construction. And every entry asked `--status success`, which is the
 * wrong question for `uptime.yml`: that workflow is now allowed to FAIL when the site
 * is genuinely down, so a real outage lasting past the budget would have made the
 * heartbeat open a second issue claiming the check "is not running" while it was
 * running and correctly reporting the outage.
 *
 * The existence check lives here rather than in the workflow because `heartbeat.yml`
 * checks nothing out — deliberately, see the `permissions:` comment in that file — so
 * it cannot read `.github/workflows/` at run time.
 */
const WORKFLOW_DIR = join(REPO_ROOT, '.github', 'workflows')

type Watched = { file: string; hours: number; mode: string; cadence: string }

/** Parse the `file:hours:mode:cadence` lines out of the WATCHED heredoc. */
const watchedEntries = (yaml: string): Watched[] => {
  const block = yaml.match(/WATCHED="\n([\s\S]*?)\n\s*"/)?.[1] ?? ''
  return block
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      // `cadence` is last on purpose so it may contain colons ("daily at 07:23 UTC").
      const [file = '', hours = '', mode = '', ...rest] = line.split(':')
      return { file, hours: Number(hours), mode, cadence: rest.join(':') }
    })
}

describe('heartbeat WATCHED list', () => {
  const yaml = readFileSync(HEARTBEAT, 'utf8')
  const entries = watchedEntries(yaml)

  it('parses, and guards against parsing nothing', () => {
    // Without this, every assertion below would vacuously pass if the heredoc moved
    // or its format changed. Deliberately NOT an exact count — that would fail when
    // a workflow is legitimately retired, which is a false alarm, not a finding.
    // The "watches every scheduled workflow" test below is what catches an omission.
    expect(entries.length).toBeGreaterThanOrEqual(3)
  })

  it('watches only workflows that exist — a rename must not go quiet', () => {
    const missing = entries.filter((e) => !existsSync(join(WORKFLOW_DIR, e.file)))
    expect(
      missing.map((e) => e.file),
      'heartbeat watches a workflow that no longer exists. It would report "has not ' +
        'run at all" forever, which is indistinguishable from a genuinely dead check.',
    ).toEqual([])
  })

  it('watches every scheduled workflow, so none can stop running unnoticed', () => {
    const scheduled = readdirSync(WORKFLOW_DIR)
      .filter((file) => file.endsWith('.yml'))
      .filter((file) =>
        /^on:[\s\S]*?^\s+schedule:/m.test(readFileSync(join(WORKFLOW_DIR, file), 'utf8')),
      )
      // heartbeat cannot watch itself: if it stops running, nothing runs to notice.
      .filter((file) => file !== 'heartbeat.yml')

    const watched = new Set(entries.map((e) => e.file))
    const unwatched = scheduled.filter((file) => !watched.has(file))
    expect(
      unwatched,
      'A scheduled workflow nothing watches can stop running in silence — which is ' +
        'how perf-watch.yml sat unwatched until 2026-08-30.',
    ).toEqual([])
  })

  it.each(['success', 'completed'])('accepts only known gh --status values (%s)', (mode) => {
    expect(['success', 'completed']).toContain(mode)
  })

  it('uses a valid mode on every entry', () => {
    for (const entry of entries) {
      expect(['success', 'completed'], `$entry.filehas mode "${entry.mode}"`).toContain(entry.mode)
    }
  })

  it('asks whether uptime.yml RAN, not whether it passed', () => {
    // uptime.yml is allowed to fail: that is the point of the fix landed 2026-08-30.
    // Asking `success` here would turn a real outage into a second, false alert
    // claiming the watcher itself is broken.
    const uptime = entries.find((e) => e.file === 'uptime.yml')
    expect(uptime?.mode).toBe('completed')
  })

  it('gives every entry a budget above its own cadence', () => {
    for (const entry of entries) {
      expect(Number.isFinite(entry.hours), `$entry.filehas no numeric budget`).toBe(true)
      // GitHub delivers schedules 19-90 minutes late (measured, n=11), so a budget
      // equal to the cadence is a false alarm waiting to happen.
      expect(entry.hours).toBeGreaterThanOrEqual(24)
    }
  })
})
