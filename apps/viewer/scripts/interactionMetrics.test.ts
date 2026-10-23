import { describe, expect, it } from 'vitest'
import {
  evaluateInteractionWalkthrough,
  evaluateRepeatedWalkthroughs,
  median,
  totalBlockingTime,
  worstInteraction,
  worstLongTask,
} from './interaction-metrics.mjs'

/**
 * PF-04 + PF-05 — see the e2e specs (`apps/viewer/e2e/perfBudgets.spec.ts`,
 * `apps/cms/e2e/perfBudgets.spec.ts`) for the live interaction walkthrough that
 * collects the raw samples these pure functions judge.
 */
describe('totalBlockingTime', () => {
  it('is zero when every task is at or under 50ms', () => {
    expect(totalBlockingTime([10, 30, 50])).toBe(0)
  })

  it('counts only the portion past 50ms for each task', () => {
    expect(totalBlockingTime([80, 120])).toBe(30 + 70)
  })

  it('is zero for no tasks at all', () => {
    expect(totalBlockingTime([])).toBe(0)
  })
})

describe('worstLongTask', () => {
  it('is the longest single task', () => {
    expect(worstLongTask([60, 420, 90])).toBe(420)
  })

  it('is zero when there are no long tasks', () => {
    expect(worstLongTask([])).toBe(0)
  })
})

describe('worstInteraction', () => {
  it('is the slowest single interaction', () => {
    expect(worstInteraction([40, 210, 65])).toBe(210)
  })

  it('is zero when no interaction was measured', () => {
    expect(worstInteraction([])).toBe(0)
  })
})

describe('evaluateInteractionWalkthrough', () => {
  const CEILINGS = { tbtCeilingMs: 500, inpCeilingMs: 200 }

  it('passes a clean walkthrough', () => {
    const r = evaluateInteractionWalkthrough({ longTasks: [60, 70], events: [50, 90] }, CEILINGS)
    expect(r.ok).toBe(true)
    expect(r.problems).toEqual([])
  })

  it('flags total blocking time over its ceiling', () => {
    const r = evaluateInteractionWalkthrough({ longTasks: [600, 600], events: [50] }, CEILINGS)
    expect(r.ok).toBe(false)
    expect(r.problems.join(' ')).toContain('blocking time')
  })

  it('flags the worst interaction over the INP-proxy ceiling', () => {
    const r = evaluateInteractionWalkthrough({ longTasks: [60], events: [50, 350] }, CEILINGS)
    expect(r.ok).toBe(false)
    expect(r.problems.join(' ')).toContain('worst interaction')
  })
})

describe('median', () => {
  it('is the middle value of an odd count, whatever the order', () => {
    expect(median([610, 40, 90, 300, 70])).toBe(90)
  })

  it('is the mean of the two middle values of an even count', () => {
    expect(median([10, 40, 60, 90])).toBe(50)
  })

  it('refuses an empty list rather than reporting 0, which would read as fast', () => {
    expect(() => median([])).toThrow(/at least one/)
  })
})

describe('evaluateRepeatedWalkthroughs', () => {
  const CEILINGS = { tbtCeilingMs: 240, inpCeilingMs: 240 }
  const walk = (task: number, event: number) => ({ longTasks: [task], events: [event] })

  it('passes when one slow walkthrough sits among fast ones: the median ignores an outlier', () => {
    const r = evaluateRepeatedWalkthroughs(
      [walk(80, 60), walk(700, 650), walk(90, 70), walk(60, 50), walk(100, 80)],
      CEILINGS,
    )
    expect(r.ok).toBe(true)
    expect(r.tbt).toBe(40)
    expect(r.perWalk.map((w) => w.tbt)).toEqual([30, 650, 40, 10, 50])
  })

  it('fails when every walkthrough carries the same freeze: the median moves with it', () => {
    const frozen = [380, 360, 400, 370, 390].map((t) => walk(t, t))
    const r = evaluateRepeatedWalkthroughs(frozen, CEILINGS)
    expect(r.ok).toBe(false)
    expect(r.problems.join(' ')).toContain('median total blocking time 330ms')
    expect(r.problems.join(' ')).toContain('median worst interaction 380ms')
  })

  it('refuses to judge no walkthroughs at all', () => {
    expect(() => evaluateRepeatedWalkthroughs([], CEILINGS)).toThrow(/at least one/)
  })
})
