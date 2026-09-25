import { describe, expect, it } from 'vitest'
import {
  evaluateInteractionWalkthrough,
  totalBlockingTime,
  worstInteraction,
  worstLongTask,
} from '../scripts/interaction-metrics.mjs'

/**
 * PF-04 + PF-05 — see `apps/cms/e2e/perfBudgets.spec.ts` for the live interaction
 * walkthrough that collects the raw samples these pure functions judge. Mirrors
 * `apps/viewer/scripts/interactionMetrics.test.ts` — the two `interaction-metrics.mjs`
 * copies are kept in step by hand (see that file's own header for why they are not
 * shared via one module).
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
