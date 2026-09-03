import { GLB_HARD_MAX_BYTES } from '@run-apparel/shared'
import { describe, expect, it } from 'vitest'
import { alphaRefusal, artworkRefusal, repairRefusal, sizeRefusal } from './refusals'

describe('the refusals, pure (fix plan Rank 13, Q-01)', () => {
  it('size: only over the ceiling, with the detail advice', () => {
    expect(sizeRefusal(GLB_HARD_MAX_BYTES, 'balanced')).toBeNull()
    expect(sizeRefusal(GLB_HARD_MAX_BYTES + 1, 'balanced')).toMatch(
      /over the .* limit for published media/,
    )
  })

  it('artwork: names the parts, silent when none', () => {
    expect(artworkRefusal([])).toBeNull()
    expect(artworkRefusal(undefined)).toBeNull()
    expect(artworkRefusal(['RUN LOGO', 'Slogan'])).toMatch(
      /artwork on RUN LOGO, Slogan was damaged/,
    )
  })

  it('alpha: blend and cutoff get different sentences, both permanent', () => {
    expect(alphaRefusal(undefined)).toBeNull()
    expect(alphaRefusal([{ material: 'RUN LOGO', problem: 'blend' }])).toMatch(
      /came out see-through/,
    )
    expect(alphaRefusal([{ material: 'RUN LOGO', problem: 'cutoff' }])).toMatch(
      /cut-out threshold on RUN LOGO is wrong/,
    )
  })
})

describe('repairRefusal (HG-06)', () => {
  it('lets a stripped shading map through — the six measured exports', () => {
    expect(repairRefusal(undefined)).toBeNull()
    expect(repairRefusal({ referencesRemoved: 0, slots: [] })).toBeNull()
    expect(repairRefusal({ referencesRemoved: 3, slots: ['metallicRoughnessTexture'] })).toBeNull()
  })

  it('refuses a stripped colour or emissive map, naming the slot', () => {
    expect(repairRefusal({ referencesRemoved: 1, slots: ['baseColorTexture'] })).toMatch(
      /missing from the file \(baseColorTexture\).*not saved/,
    )
    expect(
      repairRefusal({
        referencesRemoved: 2,
        slots: ['metallicRoughnessTexture', 'emissiveTexture'],
      }),
    ).toMatch(/\(emissiveTexture\)/)
  })
})
