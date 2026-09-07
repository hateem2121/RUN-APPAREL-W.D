import { describe, expect, it } from 'vitest'
import { FRAME_MS, INTERACTIVE, isInteractive, ringTransform, trail } from './cursorMath'

describe('cursorMath', () => {
  it('trail closes a fixed fraction of the remaining gap', () => {
    expect(trail(0, 100, 0.22)).toBeCloseTo(22)
    expect(trail(22, 100, 0.22)).toBeCloseTo(39.16)
    expect(trail(100, 100, 0.22)).toBe(100)
  })

  /**
   * ⚠️ THE FRAME-RATE CORRECTION, ASSERTED AS THE THING IT IS FOR: two displays running
   * for the same WALL-CLOCK time must land the ring in the same place.
   *
   * The old signature took no `dt`, so 0.22 was applied once per call and the ring was
   * a different cursor on every monitor — twice as fast at 120Hz, laggy on a dropped
   * frame. Audit FA-H-03. The negative control is the third case: pinning `dt` to one
   * frame regardless of elapsed time (which is what the old code did) reproduces the
   * defect, and these expectations reject it.
   */
  describe('trail is frame-rate independent', () => {
    const after = (steps: number, dt: number) => {
      let v = 0
      for (let i = 0; i < steps; i += 1) v = trail(v, 100, 0.22, dt)
      return v
    }

    it('reduces to k exactly at one 60Hz frame', () => {
      expect(trail(0, 100, 0.22, FRAME_MS)).toBeCloseTo(22, 10)
    })

    it('lands in the same place at 60Hz and at 120Hz over the same 100ms', () => {
      const at60 = after(6, FRAME_MS) // 6 frames x 16.67ms
      const at120 = after(12, FRAME_MS / 2) // 12 frames x 8.33ms
      expect(at120).toBeCloseTo(at60, 6)
    })

    it('the uncorrected behaviour it replaces would NOT agree', () => {
      // Exactly what the old two-argument form did: 0.22 per call, elapsed time ignored.
      const uncorrected = (steps: number) => {
        let v = 0
        for (let i = 0; i < steps; i += 1) v += (100 - v) * 0.22
        return v
      }
      expect(uncorrected(12)).not.toBeCloseTo(uncorrected(6), 1)
      // ...and it is the 120Hz half of the pair that runs away.
      expect(uncorrected(12)).toBeGreaterThan(after(12, FRAME_MS / 2) + 5)
    })

    it('a long gap lands on the pointer rather than crawling', () => {
      expect(trail(0, 100, 0.22, 5000)).toBeCloseTo(100, 3)
    })

    it('treats a non-positive dt as no elapsed time', () => {
      expect(trail(40, 100, 0.22, 0)).toBe(40)
      expect(trail(40, 100, 0.22, -8)).toBe(40)
    })
  })

  it('puts translate BEFORE scale in one transform string', () => {
    // The viewer's ring once carried scale as a standalone property while its position
    // lived in transform; CSS composes those in a fixed order and the ring landed 1.53×
    // away from the pointer. One string, translate first, is the fix and this pins it.
    const t = ringTransform(800, 400, 1.53)
    expect(t).toBe('translate3d(800px, 400px, 0) scale(1.53)')
    expect(t.indexOf('translate3d')).toBeLessThan(t.indexOf('scale('))
  })

  /**
   * ⚠️ THE CENTRING OFFSET MUST NOT BE IN THIS STRING.
   *
   * `.cursor-dot, .cursor-ring` in packages/ui/src/base.css set `translate: -50% -50%`,
   * a standalone property applied outside this transform. Emitting `translate(-50%, -50%)`
   * here as well applied it twice and drew the ring 17px up and left of the pointer —
   * half of its own 34px box — on every page of the public site (audit FA-R-04).
   *
   * That base.css declaration is the LIVE VIEWER's only centring: Motion writes its ring
   * position as `translateX(…) translateY(…) scale(…)` with no offset. So the fix had to
   * be here, and this assertion is what stops someone "restoring symmetry" later.
   */
  it('carries no centring offset of its own — base.css owns that', () => {
    expect(ringTransform(800, 400, 1)).not.toContain('-50%')
  })

  it('names the same interactive targets the viewer inflates over', () => {
    expect(INTERACTIVE).toBe('a, button, [role="tab"], [data-cursor="pointer"]')
    const a = { closest: (s: string) => (s === INTERACTIVE ? {} : null) } as unknown as Element
    expect(isInteractive(a)).toBe(true)
    expect(isInteractive(null)).toBe(false)
  })
})
