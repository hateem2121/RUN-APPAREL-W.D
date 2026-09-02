import { describe, expect, it } from 'vitest'
import { shrinkFlagsFor } from '../../../packages/shared/src/shrink'
import {
  refineFlags,
  refineFlagsForFamily,
  refineFlagsForSize,
  SMALL_EXPORT_MAX_TRIANGLES,
} from './strategy'

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

/**
 * THE SMALL-EXPORT RULE, 2026-09-02 (fix plan Rank 3 D). Measured on every garment on
 * the owner's machine: the finished FIXED GLBs run 97,850–444,764 triangles, the two
 * big raw exports 10.6 M and 34.0 M. On the small ones `--simplify` saved 0.42 MB and
 * tore the prints (audit F1-02, A-01, A-04).
 */
describe('refineFlagsForSize', () => {
  const balanced = [
    '--stitch',
    '0.03',
    '--stitch-error',
    '0.0005',
    '--simplify',
    '0.05',
    '--simplify-error',
    '0.001',
    '--uv-weight',
    '1',
    '--meshopt',
    '--max-texture',
    '4096',
  ]

  it('drops --simplify, its budget and the UV weight for a small export, and nothing else', () => {
    expect(refineFlagsForSize(balanced, 97_850)).toEqual([
      '--stitch',
      '0.03',
      '--stitch-error',
      '0.0005',
      '--meshopt',
      '--max-texture',
      '4096',
    ])
  })

  it('keeps decimation for a big export — N001 at 10.6 M triangles', () => {
    expect(refineFlagsForSize(balanced, 10_616_491)).toEqual(balanced)
  })

  it('the threshold sits above every finished garment and below the exports the presets were written for', () => {
    expect(SMALL_EXPORT_MAX_TRIANGLES).toBeGreaterThan(444_764)
    expect(SMALL_EXPORT_MAX_TRIANGLES).toBeLessThan(10_616_491)
    expect(refineFlagsForSize(balanced, SMALL_EXPORT_MAX_TRIANGLES)).toEqual(balanced)
    expect(refineFlagsForSize(balanced, SMALL_EXPORT_MAX_TRIANGLES - 1)).not.toContain('--simplify')
  })

  it('a file that could not be read keeps decimation — a readout failure must not alter a garment', () => {
    expect(refineFlagsForSize(balanced, null)).toEqual(balanced)
  })

  it('never returns the caller array', () => {
    const out = refineFlagsForSize(balanced, 10_000_000)
    expect(out).not.toBe(balanced)
  })
})

describe('refineFlags — family, then size', () => {
  const description = (over: Partial<import('./describe').GlbDescription>) =>
    ({
      family: 'texture',
      triangles: 207_659,
      error: null,
      ...over,
    }) as import('./describe').GlbDescription
  const balanced = [
    '--simplify',
    '0.05',
    '--simplify-error',
    '0.001',
    '--uv-weight',
    '1',
    '--meshopt',
    '--max-texture',
    '4096',
    '--quality',
    '75',
  ]

  it('a small texture-family garment gets the texture budget and no decimation', () => {
    const out = refineFlags(balanced, description({}))
    expect(out).not.toContain('--simplify')
    expect(out).toContain('--artwork-quality')
    expect(out).toContain('--meshopt')
  })

  it('an unreadable file refines to mixed and keeps decimation', () => {
    const out = refineFlags(balanced, description({ error: 'unreadable', family: 'texture' }))
    expect(out).toContain('--simplify')
    expect(out).not.toContain('--artwork-quality')
  })
})

/**
 * `--decimate-artwork` exists so the print damage of 2026-09-01 can be re-measured
 * on demand. It must never leave a robot: both presets, every family, every size.
 */
describe('the negative-control flag never reaches the robot', () => {
  it('no preset, family or size emits --decimate-artwork', () => {
    const families = ['geometry', 'texture', 'mixed'] as const
    for (const detail of ['balanced', 'fidelity'] as const) {
      for (const family of families) {
        for (const triangles of [1000, 499_999, 500_000, 10_000_000]) {
          const description = {
            family,
            triangles,
            error: null,
          } as unknown as Parameters<typeof refineFlags>[1]
          expect(refineFlags(shrinkFlagsFor(detail), description)).not.toContain(
            '--decimate-artwork',
          )
        }
      }
    }
  })
})
