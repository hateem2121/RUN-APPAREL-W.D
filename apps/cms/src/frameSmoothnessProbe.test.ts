import { describe, expect, it } from 'vitest'
import { frameStats, judgeFrames, LIMITS, medianRun } from '../scripts/frame-smoothness-probe.mjs'

/**
 * MO-19 + SC-10 — the pure half of `scripts/frame-smoothness-probe.mjs`. The live half
 * carries its own negative control (`--self-test`); these pin the arithmetic.
 */
const smooth = (n: number, ms = 8.3) => Array.from({ length: n }, () => ms)

describe('frameStats', () => {
  it('reads the median frame as the refresh interval, whatever the display rate', () => {
    expect(frameStats(smooth(100)).median).toBe(8.3)
    expect(frameStats(smooth(100, 16.7)).median).toBe(16.7)
  })
  it('counts a frame over 1.5 refresh intervals as dropped', () => {
    const stats = frameStats([...smooth(90), ...smooth(10, 13)])
    expect(stats.droppedPct).toBe(10)
  })
  it('refuses to judge a handful of frames', () => {
    expect(() => frameStats(smooth(5))).toThrow(/too few/)
  })
})

describe('judgeFrames', () => {
  it('passes the measured healthy shape (p95 ~1.2x the median, nothing dropped)', () => {
    expect(judgeFrames(frameStats([...smooth(95), ...smooth(5, 10.2)])).ok).toBe(true)
  })
  it('fails a p95 over twice the median', () => {
    const verdict = judgeFrames(frameStats([...smooth(90), ...smooth(10, 30)]))
    expect(verdict.ok).toBe(false)
    expect(verdict.problems.join()).toMatch(/p95/)
  })
  it(`fails more than ${LIMITS.droppedPct}% dropped frames even when p95 looks fine`, () => {
    const verdict = judgeFrames(frameStats([...smooth(94), ...smooth(6, 14)]))
    expect(verdict.ok).toBe(false)
    expect(verdict.problems.join()).toMatch(/dropped/)
  })
})

describe('medianRun', () => {
  it('takes the middle run by p95, so one noisy run neither passes nor fails a phase', () => {
    const runs = [{ p95: 30 }, { p95: 10 }, { p95: 11 }] as never[]
    expect((medianRun(runs) as { p95: number }).p95).toBe(11)
  })
})
