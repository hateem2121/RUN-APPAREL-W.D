import { describe, expect, it } from 'vitest'
import { renderRows, swapProblems } from '../../../scripts/live-garment-writes-lib.mjs'

/**
 * The two writes the 2026-09-27 rollout makes to garments that are ALREADY LIVE: pointing a
 * product at a re-processed model, and attaching an HD render to each colour. Both touch a
 * page buyers are looking at, and `colourways` is an inline array a PATCH replaces whole —
 * so each refusal here is tested against the input that would break a live page.
 */

const live = {
  status: 'published',
  glbAsset: 45,
  colourways: [
    {
      id: 'a',
      variantId: 'Default Colorway',
      slug: 'blush',
      displayName: 'Blush',
      posterPreview: 7,
    },
    { id: 'b', variantId: 'Colorway 1', slug: 'butter', displayName: 'Butter', posterPreview: 8 },
  ],
}

describe('swapProblems', () => {
  const ok = {
    product: live,
    mediaId: 200,
    media: { filesize: 4_229_000, mimeType: 'model/gltf-binary' },
    servedBytes: 4_229_000,
    fileColours: ['Default Colorway', 'Colorway 1'],
  }

  it('accepts a model whose colours are exactly the live ones', () => {
    expect(swapProblems(ok)).toEqual([])
  })

  it('refuses a product that is not live — a draft goes through publish-garment.mjs', () => {
    expect(swapProblems({ ...ok, product: { ...live, status: 'draft' } })).toEqual([
      expect.stringContaining('not published'),
    ])
  })

  it('refuses a model whose colour names differ from the live variantIds, either way', () => {
    // variantsVerified would flip and every colour tab would lose its mapping.
    expect(swapProblems({ ...ok, fileColours: ['Default Colorway'] })[0]).toContain('Colorway 1')
    expect(
      swapProblems({ ...ok, fileColours: ['Default Colorway', 'Colorway 1', 'Colorway 9'] })[0],
    ).toContain('Colorway 9')
  })

  it('refuses a model that is not served at its stored size, or is already the live one', () => {
    expect(swapProblems({ ...ok, servedBytes: 84 })[0]).toContain('84')
    expect(swapProblems({ ...ok, media: { ...ok.media, mimeType: 'image/webp' } })[0]).toContain(
      'image/webp',
    )
    expect(swapProblems({ ...ok, mediaId: 45 })[0]).toContain('already')
  })
})

describe('renderRows', () => {
  it('moves ONLY renderImage, keeps order and every other field byte-identical', () => {
    const rows = renderRows(live.colourways, { blush: 301, butter: 302 })
    if ('error' in rows) throw new Error(rows.error)
    expect(rows).toEqual([
      { ...live.colourways[0], renderImage: 301 },
      { ...live.colourways[1], renderImage: 302 },
    ])
  })

  it('leaves a colour with no render alone rather than guessing one', () => {
    const rows = renderRows(live.colourways, { butter: 302 })
    if ('error' in rows) throw new Error(rows.error)
    expect(rows[0]).toEqual(live.colourways[0])
    expect(rows[1]?.renderImage).toBe(302)
  })

  it('refuses a render named for a colour the product does not have', () => {
    // A typo would otherwise attach nothing and report success.
    expect(renderRows(live.colourways, { blush: 301, butterr: 302 })).toHaveProperty(
      'error',
      expect.stringContaining('butterr'),
    )
  })

  it('refuses rows that carry no id — sending them would re-create, not update', () => {
    const noId = live.colourways.map(({ id: _id, ...row }) => row)
    expect(renderRows(noId, { blush: 301 })).toHaveProperty('error')
  })
})
