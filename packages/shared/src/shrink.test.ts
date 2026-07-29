import { describe, expect, it } from 'vitest'
import { GLB_HARD_MAX_BYTES, formatMb } from './media'
import {
  DEFAULT_SHRINK_DETAIL,
  SHRINK_DETAIL_LEVELS,
  type ShrinkDetailLevel,
  nextDetailAdvice,
  shrinkFlagsFor,
} from './shrink'

const LEVELS: ShrinkDetailLevel[] = ['fidelity', 'balanced', 'small']

/** Read a numeric flag value out of a CLI argv array. */
function flagValue(args: string[], flag: string): number {
  const i = args.indexOf(flag)
  expect(i).toBeGreaterThanOrEqual(0)
  return Number(args[i + 1])
}

describe('shrinkFlagsFor', () => {
  it('covers every level offered in the CMS, and defaults to one of them', () => {
    expect(SHRINK_DETAIL_LEVELS.map((l) => l.value).sort()).toEqual([...LEVELS].sort())
    expect(LEVELS).toContain(DEFAULT_SHRINK_DETAIL)
  })

  it('falls back to the default for a missing level (older queued messages)', () => {
    expect(shrinkFlagsFor(undefined)).toEqual(shrinkFlagsFor(DEFAULT_SHRINK_DETAIL))
  })

  it('always asks for meshopt geometry and some decimation', () => {
    for (const level of LEVELS) {
      const args = shrinkFlagsFor(level)
      expect(args).toContain('--meshopt')
      expect(flagValue(args, '--simplify')).toBeGreaterThan(0)
      expect(flagValue(args, '--simplify')).toBeLessThan(1)
    }
  })

  // The error budget is THE aggression dial: it must grow strictly as the levels
  // get smaller, because that is what actually removes triangles.
  it('loosens the error budget strictly as the levels get smaller', () => {
    const err = LEVELS.map((l) => flagValue(shrinkFlagsFor(l), '--simplify-error'))
    expect(err[0]).toBeLessThan(err[1] as number)
    expect(err[1]).toBeLessThan(err[2] as number)
  })

  // UV weight is NOT an aggression dial — it is the artwork guard. It may only
  // ever be relaxed to buy *extra* quality at the top end, never to buy a smaller
  // file at the bottom.
  //
  // This assertion used to require uv weight to fall strictly across all three
  // levels, which baked in the very bug it was meant to prevent: "small" shipped
  // at 0.5, half of "balanced", so asking for a smaller file silently halved the
  // protection on printed logos. The measured table in
  // tools/asset-pipeline/src/simplify-textured.test.ts shows the two knobs are
  // independent — at uv weight 1, a 10x looser error budget removes 5x more
  // triangles with the artwork guard untouched. So: never increasing, and never
  // below what "balanced" uses.
  it('never trades away artwork protection to get a smaller file', () => {
    const uv = LEVELS.map((l) => flagValue(shrinkFlagsFor(l), '--uv-weight') as number)
    expect(uv[0]).toBeGreaterThanOrEqual(uv[1] as number)
    expect(uv[1]).toBeGreaterThanOrEqual(uv[2] as number)
    // The floor: the smallest level must guard artwork at least as hard as the
    // recommended default does.
    const balanced = flagValue(shrinkFlagsFor('balanced'), '--uv-weight') as number
    expect(flagValue(shrinkFlagsFor('small'), '--uv-weight')).toBeGreaterThanOrEqual(balanced)
  })

  it('never passes --uv-weight 0, which would disable texture-aware decimation', () => {
    for (const level of LEVELS) {
      expect(flagValue(shrinkFlagsFor(level), '--uv-weight')).toBeGreaterThan(0)
    }
  })
})

describe('nextDetailAdvice', () => {
  it('points at the smaller setting, except when already there', () => {
    expect(nextDetailAdvice('balanced')).toMatch(/Smallest file/)
    expect(nextDetailAdvice('fidelity')).toMatch(/Smallest file/)
    // No point telling someone to try a setting they already used.
    expect(nextDetailAdvice('small')).toMatch(/re-exported from CLO/)
  })
})

describe('media constants', () => {
  it('formats sizes the way both the CMS and the shrink worker report them', () => {
    expect(formatMb(GLB_HARD_MAX_BYTES)).toBe('40.0 MB')
    expect(formatMb(58.3 * 1024 * 1024)).toBe('58.3 MB')
  })
})
