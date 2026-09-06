import { describe, expect, it } from 'vitest'
import { INTERACTIVE, isInteractive, ringTransform, trail } from './cursorMath'

describe('cursorMath', () => {
  it('trail closes a fixed fraction of the remaining gap', () => {
    expect(trail(0, 100, 0.22)).toBeCloseTo(22)
    expect(trail(22, 100, 0.22)).toBeCloseTo(39.16)
    expect(trail(100, 100, 0.22)).toBe(100)
  })

  it('puts translate BEFORE scale in one transform string', () => {
    // The viewer's ring once carried scale as a standalone property while its position
    // lived in transform; CSS composes those in a fixed order and the ring landed 1.53×
    // away from the pointer. One string, translate first, is the fix and this pins it.
    const t = ringTransform(800, 400, 1.53)
    expect(t).toBe('translate3d(800px, 400px, 0) translate(-50%, -50%) scale(1.53)')
    expect(t.indexOf('translate3d')).toBeLessThan(t.indexOf('scale('))
  })

  it('names the same interactive targets the viewer inflates over', () => {
    expect(INTERACTIVE).toBe('a, button, [role="tab"], [data-cursor="pointer"]')
    const a = { closest: (s: string) => (s === INTERACTIVE ? {} : null) } as unknown as Element
    expect(isInteractive(a)).toBe(true)
    expect(isInteractive(null)).toBe(false)
  })
})
