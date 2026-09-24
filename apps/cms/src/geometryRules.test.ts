import { describe, expect, it } from 'vitest'
import {
  MEASURED_TOLERANCE_PX,
  MIN_TARGET_PX,
  isWithinTargetFloor,
} from '../../../scripts/geometry-rules.mjs'

/**
 * The tap-target floor every geometry robot shares.
 *
 * ⚠️ NOTHING COUNTS THIS FILE'S SUBJECT IN COVERAGE, so the doctrine has to do the work
 * instead — the same rule `contrastRules.test.ts` states, for the same reason:
 * `apps/cms` counts `src/**`, the repo-root `scripts/` is in neither package's summary, and
 * a helper that returns a comfortable answer for everything passes every robot built on it.
 * So every case below is shown catching its fault AND passing clean input.
 */

describe('MIN_TARGET_PX / MEASURED_TOLERANCE_PX', () => {
  it('match the design system and the measured slack', () => {
    // packages/ui/src/tokens.css:120 `--target-min: 44px`; docs/DESIGN.md "Targets".
    expect(MIN_TARGET_PX).toBe(44)
    // The exact figure navbar.spec.ts measured 2026-09-07 (43.999969482421875 rounds away
    // at the boundary this module exists to hold steady) — see this module's own header.
    expect(MEASURED_TOLERANCE_PX).toBe(43.95)
  })
})

describe('isWithinTargetFloor — at the default 44px floor', () => {
  it('passes exactly at the measured tolerance', () => {
    expect(isWithinTargetFloor(43.95)).toBe(true)
  })

  it('fails one hundredth of a pixel below it — negative control', () => {
    // This is the case a strict `< 44` comparison gets wrong: 43.94 is a real miss (not
    // the ~3.1e-5 floating-point artefact this module tolerates), so it must still fail.
    expect(isWithinTargetFloor(43.94)).toBe(false)
  })

  it('passes the nominal floor itself', () => {
    expect(isWithinTargetFloor(44.0)).toBe(true)
  })

  it('fails a real, thumb-sized miss', () => {
    // The smallest genuine miss this codebase has shipped, per navbar.spec.ts's own
    // comment — nowhere near the tolerance boundary, so this is not a fluke pass.
    expect(isWithinTargetFloor(19)).toBe(false)
  })
})

describe('isWithinTargetFloor — a different floor carries the same absolute slack', () => {
  it('passes at the 24px desktop-control floor (SZ-04) minus the same 0.05px slack', () => {
    expect(isWithinTargetFloor(23.95, 24)).toBe(true)
  })

  it('fails one hundredth of a pixel below the 24px floor’s tolerance', () => {
    expect(isWithinTargetFloor(23.94, 24)).toBe(false)
  })

  it('an explicit tolerance overrides the derived one', () => {
    expect(isWithinTargetFloor(10, 24, 5)).toBe(true)
  })
})
