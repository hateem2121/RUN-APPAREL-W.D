import { describe, expect, it } from 'vitest'
import {
  GATED_FIELDS,
  type GateColourway,
  altTextNamesProduct,
  type PublishGateInput,
  assertPublishable,
  becameUnverifiedWhilePublished,
  changesAnything,
  collectPublishProblems,
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
  // M2: the default is a CORRECT label, so every pre-existing case keeps its
  // meaning and only the tests that opt in exercise the mismatch.
  altTextNamesProduct: true,
  hasOwnGlb: false,
  hasDisplayName: true,
  hasSlug: true,
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

  it('reports the RAW displayName/slug presence, not the coalesced display label', () => {
    // A row with a slug but no name still falls back to a readable `displayName`
    // above ("navy") — that must not be mistaken for actually having a name.
    const [slugOnly] = toGateColourways([{ slug: 'navy' }])
    expect(slugOnly!.hasDisplayName).toBe(false)
    expect(slugOnly!.hasSlug).toBe(true)

    const [neither] = toGateColourways([{}])
    expect(neither!.hasDisplayName).toBe(false)
    expect(neither!.hasSlug).toBe(false)

    const [both] = toGateColourways([{ displayName: 'Navy', slug: 'navy' }])
    expect(both!.hasDisplayName).toBe(true)
    expect(both!.hasSlug).toBe(true)
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

  it('refuses to publish a switched-on colour with no name', () => {
    // Reachable since 2026-08-11: displayName stopped being `required` at the
    // field level so a swatch-only imported row (buildImportedRow) can be
    // SAVED blank — this is what stops one reaching a live page still blank.
    // `displayName` here is the raw form value, still 'Crimson' even though
    // hasDisplayName says the ROW should be treated as nameless — cw() builds a
    // GateColourway directly rather than through toGateColourways's own
    // coalescing fallback, which is covered separately above.
    expect(() =>
      assertPublishable(input(), [cw(), cw({ displayName: 'Crimson', hasDisplayName: false })]),
    ).toThrow(/“Crimson” has no colour name/)
  })

  it('ignores switched-off colours when checking for a name', () => {
    expect(() =>
      assertPublishable(input(), [
        cw(),
        cw({ displayName: 'Crimson', hasDisplayName: false, active: false }),
      ]),
    ).not.toThrow()
  })

  it('refuses to publish a switched-on colour with no web address word', () => {
    // slug's own custom `validate` allows blank now for the same reason; this is
    // the other half of the same fix.
    expect(() =>
      assertPublishable(input(), [cw(), cw({ displayName: 'Crimson', hasSlug: false })]),
    ).toThrow(/“Crimson” has no web address word/)
  })

  it('ignores switched-off colours when checking for a web address word', () => {
    expect(() =>
      assertPublishable(input(), [
        cw(),
        cw({ displayName: 'Crimson', hasSlug: false, active: false }),
      ]),
    ).not.toThrow()
  })

  // Owner decision 2026-08-21: a colour no longer needs a photo to publish. This
  // used to assert `/“Crimson” has no photo/` was thrown.
  it('PUBLISHES a colour with no photo at all', () => {
    expect(() =>
      assertPublishable(input(), [cw(), cw({ displayName: 'Crimson', hasPoster: false })]),
    ).not.toThrow()
  })

  it('does not demand a photo DESCRIPTION for a colour that has no photo', () => {
    // Demanding alt text for an image that does not exist would block publishing on
    // an accessibility rule with nothing to describe, and invites a sentence about a
    // missing picture — worse for a screen reader than no sentence at all.
    expect(() =>
      assertPublishable(input(), [
        cw({ displayName: 'Crimson', hasPoster: false, hasAltText: false }),
      ]),
    ).not.toThrow()
  })

  it('STILL demands a description when a colour DOES have a photo', () => {
    // The accessibility requirement is unchanged wherever it still applies.
    expect(() =>
      assertPublishable(input(), [
        cw({ displayName: 'Crimson', hasPoster: true, hasAltText: false }),
      ]),
    ).toThrow(/photo description/)
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

describe('collectPublishProblems', () => {
  const published = {
    id: 1,
    status: 'published',
    variantMode: 'single-glb-variants',
    glbAsset: null,
    variantsVerified: false,
  }
  const row = (over = {}) => ({
    displayName: 'Wine',
    active: true,
    variantId: '',
    hasPoster: false,
    hasAltText: false,
    // M2: true means "no mismatch to report". These rows have no label at all,
    // which the hasAltText check already covers — a row cannot be both missing a
    // description and naming the wrong product.
    altTextNamesProduct: true,
    hasOwnGlb: false,
    // This row already "has" a name and a slug (just missing everything else) —
    // the dedicated hasDisplayName/hasSlug tests above override these instead of
    // this default, so the counts below stay about the problems they were before.
    hasDisplayName: true,
    hasSlug: true,
    ...over,
  })

  it('returns every problem, not just the first', () => {
    const problems = collectPublishProblems(published, [row()])
    // Was 4 until 2026-08-21 — a photo and its description are no longer required.
    expect(problems).toHaveLength(2) // no model, no colour picked
    expect(problems.join(' ')).toContain('Wine')
  })

  it('also counts a missing name and a missing slug among the problems', () => {
    const problems = collectPublishProblems(published, [
      row({ hasDisplayName: false, hasSlug: false }),
    ])
    expect(problems).toHaveLength(4) // + no colour name, no web address word
  })

  it('is empty for a publishable product', () => {
    expect(
      collectPublishProblems({ ...published, glbAsset: 5, variantsVerified: true }, [
        row({ variantId: 'Colorway 1', hasPoster: true, hasAltText: true }),
      ]),
    ).toEqual([])
  })

  it('is empty for a draft', () => {
    expect(collectPublishProblems({ ...published, status: 'draft' }, [])).toEqual([])
  })

  it('reports only the no-colours problem when there are none', () => {
    expect(collectPublishProblems(published, [])).toHaveLength(1)
  })

  it('assertPublishable throws one message unchanged when there is one problem', () => {
    expect(() =>
      assertPublishable({ ...published, glbAsset: 5, variantsVerified: true }, [
        row({ variantId: 'C1', hasPoster: true, hasAltText: false }),
      ]),
    ).toThrow(/photo description/)
  })

  it('assertPublishable numbers them when there are several', () => {
    expect(() => assertPublishable(published, [row()])).toThrow(/2 things need fixing/)
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
      altTextNamesProduct: true,
      hasOwnGlb: true,
      hasDisplayName: true,
      hasSlug: true,
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

describe('a colourway label must name the garment it belongs to', () => {
  // M2, 2026-08-18. Measured on the live API: product X-MILO PRO SKIN-SUIT
  // (productCode R-XPS, slug rxps) served SIX text alternatives all reading
  // "Velocity Performance Skinsuit" — five colourway labels and the product
  // poster. Every screen-reader user, and everyone whose model failed to load and
  // saw the poster, was told the wrong garment. WCAG 1.1.1.
  it('accepts a label that names the product', () => {
    expect(altTextNamesProduct('X-MILO PRO SKIN-SUIT in Wine', 'X-MILO PRO SKIN-SUIT')).toBe(true)
  })

  it('REPRODUCES THE LIVE BUG: rejects a label naming a different garment', () => {
    expect(
      altTextNamesProduct('Velocity Performance Skinsuit in Wine', 'X-MILO PRO SKIN-SUIT'),
    ).toBe(false)
  })

  it('normalises punctuation — RXPS vs R-XPS cost a post-deploy gate on 2026-08-17', () => {
    expect(altTextNamesProduct('XMILO PRO SKINSUIT in Wine', 'X-MILO PRO SKIN-SUIT')).toBe(true)
  })

  it('is case-insensitive', () => {
    expect(altTextNamesProduct('x-milo pro skin-suit in wine', 'X-MILO PRO SKIN-SUIT')).toBe(true)
  })

  it('treats an empty product name as unverifiable, not failed', () => {
    // 66 of the 67 products in the CMS are drafts. A check about naming must not
    // block a product that has no name yet.
    expect(altTextNamesProduct('anything at all', '')).toBe(true)
  })

  it('reports the mismatch as a publish problem, naming the colour', () => {
    const problems = collectPublishProblems(input(), [
      cw({ displayName: 'Wine', hasAltText: true, altTextNamesProduct: false }),
    ])
    expect(problems.join(' ')).toMatch(/Wine/)
    expect(problems.join(' ')).toMatch(/different product/)
  })

  it('does not double-report a colour that has no description at all', () => {
    // A row cannot be both missing a description and naming the wrong product;
    // hasAltText already covers the first, and reporting both would be noise.
    const problems = collectPublishProblems(input(), [
      cw({ displayName: 'Wine', hasAltText: false, altTextNamesProduct: true }),
    ])
    expect(problems.filter((p) => /different product/.test(p))).toEqual([])
  })

  it('toGateColourways derives it from the row and the product name', () => {
    const rows = [{ displayName: 'Wine', altText: 'Velocity Performance Skinsuit in Wine' }]
    expect(toGateColourways(rows, 'X-MILO PRO SKIN-SUIT')[0]?.altTextNamesProduct).toBe(false)
    expect(toGateColourways(rows, 'Velocity Performance Skinsuit')[0]?.altTextNamesProduct).toBe(
      true,
    )
  })
})
