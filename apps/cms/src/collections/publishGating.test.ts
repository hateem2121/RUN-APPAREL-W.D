import { describe, expect, it } from 'vitest'
import {
  type GateColourway,
  type PublishGateInput,
  assertPublishable,
  deriveVariantsVerified,
  toGateColourways,
} from './publishGating'

/**
 * Rewritten when colours moved inline onto the Product. Four cases from the old
 * suite are gone on purpose, not by oversight — they asserted invariants the new
 * shape makes unrepresentable: "requires a default colourway", "requires exactly
 * one active default", "product default == marked default" (there is now one
 * place to state it — row order), and "variantId starts with the product code"
 * (a variantId is now whatever CLO called it). The last one is replaced by a
 * stronger check: the name must exist inside the processed file.
 */

const input = (o: Partial<PublishGateInput> = {}): PublishGateInput => ({
  id: 1,
  status: 'published',
  variantMode: 'single-glb-variants',
  glbAsset: 10,
  variantsVerified: true,
  ...o,
})

const cw = (o: Partial<GateColourway> = {}): GateColourway => ({
  displayName: 'Navy',
  active: true,
  variantId: 'Colorway 1',
  hasPoster: true,
  hasAltText: true,
  hasOwnGlb: false,
  ...o,
})

describe('toGateColourways', () => {
  it('returns an empty list for a product with no colours', () => {
    expect(toGateColourways(undefined)).toEqual([])
    expect(toGateColourways(null)).toEqual([])
    expect(toGateColourways('nonsense')).toEqual([])
  })

  it('treats a missing `active` as switched on', () => {
    expect(toGateColourways([{ displayName: 'Navy' }])[0]!.active).toBe(true)
    expect(toGateColourways([{ displayName: 'Navy', active: false }])[0]!.active).toBe(false)
  })

  it('accepts uploads as a bare id or a populated doc', () => {
    const [byId, byDoc, empty] = toGateColourways([
      { posterPreview: 7 },
      { posterPreview: { id: 7, url: '/x.webp' } },
      { posterPreview: null },
    ])
    expect(byId!.hasPoster).toBe(true)
    expect(byDoc!.hasPoster).toBe(true)
    expect(empty!.hasPoster).toBe(false)
  })

  it('falls back to a readable name so error messages are never blank', () => {
    expect(toGateColourways([{ slug: 'navy' }])[0]!.displayName).toBe('navy')
    expect(toGateColourways([{}])[0]!.displayName).toBe('Untitled colour')
  })
})

describe('deriveVariantsVerified', () => {
  it('is false before a file has been processed', () => {
    expect(deriveVariantsVerified([cw()], undefined)).toBe(false)
    expect(deriveVariantsVerified([cw()], [])).toBe(false)
  })

  it('is false while any shown colour is unmatched', () => {
    expect(deriveVariantsVerified([cw(), cw({ variantId: '' })], ['Colorway 1'])).toBe(false)
  })

  it('is false when a colour points at a name that is not in the file', () => {
    expect(deriveVariantsVerified([cw({ variantId: 'Colorway 9' })], ['Colorway 1'])).toBe(false)
  })

  it('ignores switched-off colours', () => {
    expect(
      deriveVariantsVerified([cw(), cw({ active: false, variantId: '' })], ['Colorway 1']),
    ).toBe(true)
  })

  it('is true when every shown colour matches a name in the file', () => {
    expect(
      deriveVariantsVerified(
        [cw({ variantId: 'Colorway 1' }), cw({ displayName: 'Black', variantId: 'Colorway 2' })],
        ['Colorway 1', 'Colorway 2', 'Colorway 3'],
      ),
    ).toBe(true)
  })

  it('is false when there are no colours at all', () => {
    expect(deriveVariantsVerified([], ['Colorway 1'])).toBe(false)
  })
})

describe('assertPublishable', () => {
  it('is a no-op for non-published saves', () => {
    expect(() => assertPublishable(input({ status: 'draft' }), [])).not.toThrow()
    expect(() => assertPublishable(input({ status: 'archived' }), [])).not.toThrow()
  })

  it('allows publishing on create — colours arrive with the document now', () => {
    expect(() => assertPublishable(input({ id: undefined }), [cw()])).not.toThrow()
  })

  it('requires at least one colour', () => {
    expect(() => assertPublishable(input(), [])).toThrow(/no colours yet/)
  })

  it('requires at least one colour switched on', () => {
    expect(() => assertPublishable(input(), [cw({ active: false })])).toThrow(
      /Every colour is switched off/,
    )
  })

  it('names the colours missing a photo', () => {
    expect(() =>
      assertPublishable(input(), [cw(), cw({ displayName: 'Crimson', hasPoster: false })]),
    ).toThrow(/“Crimson” has no photo/)
  })

  it('ignores switched-off colours when checking photos', () => {
    expect(() =>
      assertPublishable(input(), [cw(), cw({ displayName: 'Crimson', hasPoster: false, active: false })]),
    ).not.toThrow()
  })

  it('names the colours missing a photo description', () => {
    expect(() =>
      assertPublishable(input(), [cw({ displayName: 'Black', hasAltText: false })]),
    ).toThrow(/“Black” needs a photo description/)
  })

  it('blocks a single-file product with no finished 3D file', () => {
    // The exact hole that left N001 published with an empty 3D stage.
    expect(() => assertPublishable(input({ glbAsset: null }), [cw()])).toThrow(
      /no finished 3D file yet/,
    )
  })

  it('explains which colours are unmatched when the file colours are not picked', () => {
    expect(() =>
      assertPublishable(input({ variantsVerified: false }), [
        cw(),
        cw({ displayName: 'Crimson', variantId: '' }),
      ]),
    ).toThrow(/“Crimson” has no colour picked from your CLO file/)
  })

  it('explains a mismatch when every colour is picked but verification still failed', () => {
    expect(() => assertPublishable(input({ variantsVerified: false }), [cw()])).toThrow(
      /do not match what is inside the processed file/,
    )
  })

  it('separate-file mode names the colours missing their own 3D file', () => {
    expect(() =>
      assertPublishable(input({ variantMode: 'separate-glb-per-colour', glbAsset: null }), [
        cw({ displayName: 'Navy', hasOwnGlb: false }),
      ]),
    ).toThrow(/“Navy” is missing one/)
  })

  it('separate-file mode does not need a product-level file or matched colours', () => {
    expect(() =>
      assertPublishable(
        input({ variantMode: 'separate-glb-per-colour', glbAsset: null, variantsVerified: false }),
        [cw({ hasOwnGlb: true, variantId: '' })],
      ),
    ).not.toThrow()
  })

  it('accepts a valid single-file product', () => {
    expect(() => assertPublishable(input(), [cw()])).not.toThrow()
  })
})
