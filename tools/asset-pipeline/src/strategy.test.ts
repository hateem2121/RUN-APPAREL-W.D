import { describe, expect, it } from 'vitest'
import { shrinkFlagsFor } from '../../../packages/shared/src/shrink'
import { refineFlagsForFamily } from './strategy'

const BALANCED = shrinkFlagsFor('balanced')

describe('refineFlagsForFamily', () => {
  it('leaves the GEOMETRY family byte-identical', () => {
    // Twelve garments must not move at all. Identical by construction beats
    // verified afterwards.
    expect(refineFlagsForFamily(BALANCED, 'geometry')).toEqual([...BALANCED])
  })

  it('leaves the MIXED family byte-identical too', () => {
    // Mantra Ray Proflex is the only file in that band and carries a material at
    // 396x410 UV repeats. Nothing here is calibrated for it; do not guess.
    expect(refineFlagsForFamily(BALANCED, 'mixed')).toEqual([...BALANCED])
  })

  it('KEEPS --simplify for the texture family', () => {
    // ⚠️ THE DESIGN DOCUMENT SAID TO DROP IT, AND THAT WAS MEASURED WRONG.
    // Dropping --simplify costs +0.0% on women athlatic dress (9,980 triangles —
    // a byte-identical file) and +13% on X-MILO, which still carries 1.77 M
    // triangles despite being 95% textures by size. 80.2 MB against 71.0 MB.
    // Triangle count decides geometry; texture fraction decides textures.
    const out = refineFlagsForFamily(BALANCED, 'texture')
    expect(out).toContain('--simplify')
    expect(out).toContain('--simplify-error')
    expect(out[out.indexOf('--simplify-error') + 1]).toBe('0.001')
  })

  it('KEEPS --stitch for the texture family', () => {
    // KINETIC SPLATTER SPORTS BRA is texture-heavy AND 98.5% topstitch.
    const out = refineFlagsForFamily(BALANCED, 'texture')
    expect(out).toContain('--stitch')
    expect(out[out.indexOf('--stitch') + 1]).toBe('0.03')
  })

  it('reduces the FABRIC texture budget and exempts artwork', () => {
    // Measured: X-MILO 71.0 MB -> 24.8 MB with the artwork textures BYTE-IDENTICAL
    // (3169x476 at 29.3 KB in both). Only the 4096x3195 fabric atlases shrink.
    const out = refineFlagsForFamily(BALANCED, 'texture')
    expect(out[out.indexOf('--max-texture') + 1]).toBe('2048')
    expect(out[out.indexOf('--data-max-texture') + 1]).toBe('1024')
    expect(out[out.indexOf('--quality') + 1]).toBe('70')
    expect(out[out.indexOf('--artwork-quality') + 1]).toBe('95')
  })

  it('keeps the geometry codec — --draco does not load on the deployed viewer', () => {
    expect(refineFlagsForFamily(BALANCED, 'texture')).toContain('--meshopt')
    expect(refineFlagsForFamily(BALANCED, 'texture')).not.toContain('--draco')
  })

  it('emits only flags and their values, never a bare positional', () => {
    // assertFlagsOnly runs after this in the container. A stray token would become
    // the INPUT PATH inside parseOptimizeArgs — the /etc/passwd shape recorded there.
    const out = refineFlagsForFamily(BALANCED, 'texture')
    for (let i = 0; i < out.length; i++) {
      if (out[i]!.startsWith('--')) continue
      expect(out[i - 1]).toMatch(/^--/)
    }
  })

  it('never returns the caller array, and never mutates it', () => {
    const input = [...BALANCED]
    const out = refineFlagsForFamily(input, 'texture')
    expect(out).not.toBe(input)
    expect(input).toEqual([...BALANCED])
  })

  it('is stable — refining twice changes nothing further', () => {
    const once = refineFlagsForFamily(BALANCED, 'texture')
    expect(refineFlagsForFamily(once, 'texture')).toEqual(once)
  })
})
