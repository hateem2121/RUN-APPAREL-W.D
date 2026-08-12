import { describe, expect, it } from 'vitest'
import { collectPublishProblems, toGateColourways } from '../collections/publishGating'
import { rowsFromFormState } from './formStateRows'

/**
 * The fixture below is REAL. It is the shape probed out of the running admin on
 * 2026-08-11 for a live product with three complete colours — not a shape
 * invented to match the implementation. That distinction is the whole point:
 * the bug this pins existed because every fixture in the suite fed
 * `toGateColourways` a plain array, which is exactly what the admin never
 * supplies.
 */
const field = (value: unknown) => ({ value })

/** One row as Payload actually flattens it into form state. */
const rowState = (i: number, over: Record<string, unknown> = {}) => ({
  [`colourways.${i}.id`]: field(`6a78c2ace256c578fa64096${i}`),
  [`colourways.${i}.displayName`]: field('Navy'),
  [`colourways.${i}.slug`]: field('navy'),
  [`colourways.${i}.variantId`]: field('N001-NAVY'),
  [`colourways.${i}.posterPreview`]: field(9),
  [`colourways.${i}.altText`]: field('Velocity Performance Tee in Navy'),
  [`colourways.${i}.hexSwatch`]: field('#22314E'),
  [`colourways.${i}.glbAsset`]: field(undefined),
  [`colourways.${i}.active`]: field(true),
  [`colourways.${i}.note`]: field(null),
  ...Object.fromEntries(Object.entries(over).map(([k, v]) => [`colourways.${i}.${k}`, field(v)])),
})

describe('rowsFromFormState', () => {
  it('rebuilds a row from the flattened paths the admin really uses', () => {
    const rows = rowsFromFormState(rowState(0), 'colourways')
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      displayName: 'Navy',
      slug: 'navy',
      variantId: 'N001-NAVY',
      posterPreview: 9,
      active: true,
    })
  })

  it('orders rows by index, not by key order', () => {
    // Object.keys order puts row 1 first here on purpose.
    const rows = rowsFromFormState(
      { ...rowState(1, { displayName: 'Black' }), ...rowState(0, { displayName: 'Navy' }) },
      'colourways',
    )
    expect(rows.map((r) => r.displayName)).toEqual(['Navy', 'Black'])
  })

  it('returns nothing when there are no rows, and never throws on odd input', () => {
    expect(rowsFromFormState({}, 'colourways')).toEqual([])
    expect(rowsFromFormState(undefined, 'colourways')).toEqual([])
    expect(rowsFromFormState({ colourways: field(3) }, 'colourways')).toEqual([])
    expect(rowsFromFormState({ 'colourways.x.slug': field('a') }, 'colourways')).toEqual([])
  })

  it('ignores a different array on the same form', () => {
    const rows = rowsFromFormState(
      { ...rowState(0), 'customisationSteps.0.title': field('Step one') },
      'colourways',
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]).not.toHaveProperty('title')
  })

  it('skips a deeper nested path rather than inventing a dotted property', () => {
    const rows = rowsFromFormState(
      { ...rowState(0), 'colourways.0.nested.deeper': field('x') },
      'colourways',
    )
    expect(rows[0]).not.toHaveProperty('nested.deeper')
  })
})

/**
 * THE REGRESSION THIS FILE EXISTS FOR.
 *
 * Before 2026-08-11 ReadinessPanel read `f.colourways.value` — a key Payload
 * never creates — so a complete, live product was reported as having no colours
 * at all. Asserting through `toGateColourways` + `collectPublishProblems`, the
 * two functions the panel actually composes, is what makes this a test of the
 * panel's behaviour rather than of a helper in isolation.
 */
describe('the panel reads a real form state correctly', () => {
  const complete = { ...rowState(0), ...rowState(1, { displayName: 'Black', slug: 'black' }) }

  it('reports READY for a product whose colours are all complete', () => {
    const problems = collectPublishProblems(
      {
        id: 1,
        status: 'published',
        variantMode: 'single-glb-variants',
        glbAsset: 8,
        variantsVerified: true,
      },
      toGateColourways(rowsFromFormState(complete, 'colourways')),
    )
    expect(problems).toEqual([])
  })

  it('does NOT claim a product with colours has none', () => {
    const problems = collectPublishProblems(
      {
        id: 1,
        status: 'published',
        variantMode: 'single-glb-variants',
        glbAsset: 8,
        variantsVerified: true,
      },
      toGateColourways(rowsFromFormState(complete, 'colourways')),
    )
    expect(problems.join(' ')).not.toContain('no colours yet')
  })

  it('still names the colour at fault when one is genuinely incomplete', () => {
    const missingPhoto = {
      ...rowState(0),
      ...rowState(1, { displayName: 'Black', slug: 'black', posterPreview: undefined }),
    }
    const problems = collectPublishProblems(
      {
        id: 1,
        status: 'published',
        variantMode: 'single-glb-variants',
        glbAsset: 8,
        variantsVerified: true,
      },
      toGateColourways(rowsFromFormState(missingPhoto, 'colourways')),
    )
    expect(problems.join(' ')).toContain('Black')
    expect(problems.join(' ')).toContain('no photo')
  })
})
