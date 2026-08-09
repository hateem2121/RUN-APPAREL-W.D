import { describe, expect, it } from 'vitest'
import {
  GATED_FIELDS,
  type GateColourway,
  type PublishGateInput,
  assertPublishable,
  becameUnverifiedWhilePublished,
  changesAnything,
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
      assertPublishable(input(), [
        cw(),
        cw({ displayName: 'Crimson', hasPoster: false, active: false }),
      ]),
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

describe('changesAnything — which writes the gate applies to', () => {
  /**
   * A save that cannot change the answer must not be gated. On 2026-07-29 the
   * shrink robot's `fileColours` write was rejected because N001 was published
   * without a model — the gate blocked the one write that populates the colour
   * dropdown, i.e. it prevented recovery from the state it was objecting to. A
   * human editing that product's fabric text hit the same wall.
   *
   * The first attempt at this guard asked "did the caller send a gated field?"
   * by checking key presence. That can never work: Payload merges the ENTIRE
   * existing document into `data` before the collection hook runs, so a one-field
   * PATCH arrives carrying all 27 keys and the check was always true. Comparing
   * values against `originalDoc` is the only thing that distinguishes them.
   */
  const doc = (o: Record<string, unknown> = {}) => ({
    status: 'published',
    variantMode: 'single-glb-variants',
    glbAsset: 10,
    colourways: [{ id: 'row1', slug: 'navy', variantId: 'Colorway 2', active: true }],
    gsm: '160 GSM',
    fileColours: ['Colorway 2'],
    ...o,
  })
  const changed = (data: Record<string, unknown>, original = doc()) =>
    changesAnything(GATED_FIELDS, data, original)

  it('ignores a write that only sets the machine-written colour list', () => {
    // Exactly the robot's PATCH, as Payload presents it: whole doc, one new value.
    expect(changed(doc({ fileColours: ['Colorway 2', 'Colorway 3', 'Colorway 4'] }))).toBe(false)
  })

  it('ignores ordinary copy edits', () => {
    expect(changed(doc({ gsm: '175 GSM' }))).toBe(false)
  })

  it('ignores a no-op save', () => {
    expect(changed(doc())).toBe(false)
  })

  it('catches an actual publish', () => {
    expect(changed(doc({ status: 'published' }), doc({ status: 'draft' }))).toBe(true)
  })

  it('catches the 3D file being removed or swapped', () => {
    expect(changed(doc({ glbAsset: null }))).toBe(true)
    expect(changed(doc({ glbAsset: 11 }))).toBe(true)
  })

  it('catches a colour being switched off or removed', () => {
    expect(
      changed(
        doc({ colourways: [{ id: 'row1', slug: 'navy', variantId: 'Colorway 2', active: false }] }),
      ),
    ).toBe(true)
    expect(changed(doc({ colourways: [] }))).toBe(true)
  })

  it('treats a populated upload and a bare id as the same value', () => {
    // Depth differences must not read as a change, or every write would be gated.
    expect(changed(doc({ glbAsset: { id: 10, url: '/media/x.glb', filename: 'x.glb' } }))).toBe(
      false,
    )
  })

  it('ignores array-row ids, which Payload regenerates freely', () => {
    expect(
      changed(
        doc({
          colourways: [{ id: 'DIFFERENT', slug: 'navy', variantId: 'Colorway 2', active: true }],
        }),
      ),
    ).toBe(false)
  })

  it('fails safe on a create, where there is nothing to compare', () => {
    expect(changesAnything(GATED_FIELDS, doc(), undefined)).toBe(true)
  })
})

/**
 * The gate deliberately does NOT re-run on a `fileColours` write — see the long
 * comment in Products.ts. Gating it once blocked the robot's own write on a
 * published-but-model-less product, i.e. it prevented recovery from the state it
 * was complaining about.
 *
 * But that leaves a real gap: a re-upload whose colours are named differently
 * silently flips a LIVE product's mapping to unverified, its colour buttons stop
 * matching the file, and nothing anywhere says so. Refusing the write is the
 * wrong answer. Noticing it is the right one.
 */
describe('becameUnverifiedWhilePublished', () => {
  it('fires when a live product loses its verified colour mapping', () => {
    expect(becameUnverifiedWhilePublished('published', true, false)).toBe(true)
  })

  it('stays quiet for a draft, which is allowed to be half-finished', () => {
    expect(becameUnverifiedWhilePublished('draft', true, false)).toBe(false)
  })

  it('stays quiet when the mapping was already broken — not news', () => {
    expect(becameUnverifiedWhilePublished('published', false, false)).toBe(false)
  })

  it('stays quiet when the mapping is being repaired', () => {
    expect(becameUnverifiedWhilePublished('published', false, true)).toBe(false)
  })

  it('stays quiet on a create, where there is no previous state', () => {
    expect(becameUnverifiedWhilePublished('published', undefined, false)).toBe(false)
  })
})

/**
 * The artwork verdict.
 *
 * The shrink worker now refuses to save a model whose printed artwork lost its
 * UV protection, so the common path never produces a damaged Media row at all.
 * This clause covers the two cases that bypass the worker entirely: a GLB
 * uploaded to Media by hand, and a file whose damage was only *suspected*
 * (the crushed-texture measurement warns, it does not block).
 *
 * A verdict of null means "nobody checked", which is the status quo for every
 * file already in the system. It must not block — turning unknown into a refusal
 * would make every existing product unpublishable on deploy.
 */
describe('assertPublishable — artwork verdict', () => {
  const ok: GateColourway[] = [
    {
      displayName: 'Navy',
      active: true,
      variantId: 'Colorway 2',
      hasPoster: true,
      hasAltText: true,
      hasOwnGlb: true,
    },
  ]
  const base: PublishGateInput = {
    id: 1,
    status: 'published',
    variantMode: 'single-glb-variants',
    glbAsset: 'media-1',
    variantsVerified: true,
  }

  it('refuses a model whose artwork came back damaged', () => {
    expect(() => assertPublishable({ ...base, artworkVerdict: 'damaged' }, ok)).toThrow(
      /printed artwork/i,
    )
  })

  it('allows it once someone has written down why it is acceptable', () => {
    expect(() =>
      assertPublishable(
        { ...base, artworkVerdict: 'damaged', artworkOverrideReason: 'Plain garment, no print.' },
        ok,
      ),
    ).not.toThrow()
  })

  it('ignores whitespace as an override reason', () => {
    expect(() =>
      assertPublishable({ ...base, artworkVerdict: 'damaged', artworkOverrideReason: '   ' }, ok),
    ).toThrow(/printed artwork/i)
  })

  it('does not block an unchecked file — that is every file that predates the check', () => {
    expect(() => assertPublishable({ ...base, artworkVerdict: null }, ok)).not.toThrow()
    expect(() => assertPublishable(base, ok)).not.toThrow()
  })

  it('does not block a file that passed', () => {
    expect(() => assertPublishable({ ...base, artworkVerdict: 'ok' }, ok)).not.toThrow()
  })
})
