import { describe, expect, it } from 'vitest'
import { type PosterColourway, type PosterProduct, planPosters } from './posters'

/**
 * The shrink worker writes to a product the owner may already have
 * published, so the two refusals in `planPosters` are security-critical in
 * the same sense `planModelAttach`'s and `planColourImport`'s are: getting
 * either wrong re-creates the 2026-07-29 incident rather than a cosmetic bug.
 * Tested here without a queue, a browser or a database — see attach.test.ts
 * for the fuller argument, which applies unchanged.
 */

const product = (over: Partial<PosterProduct> = {}): PosterProduct => ({
  code: 'N001',
  status: 'draft',
  ...over,
})

const colourway = (over: Partial<PosterColourway> = {}): PosterColourway => ({
  slug: 'navy',
  variantId: 'N001-NAVY',
  hasPoster: false,
  ...over,
})

describe('planPosters', () => {
  it('photographs a colour with a variant, a slug and no photo yet — the whole point', () => {
    const plan = planPosters(product(), [colourway()])
    expect(plan).toEqual([
      { slug: 'navy', variantId: 'N001-NAVY', filename: 'n001-navy-poster.png' },
    ])
  })

  it('REFUSES a published product entirely, because the write would re-run the publish gate', () => {
    // colourways is in the CMS's GATED_FIELDS. On a draft assertPublishable
    // returns on its first line; on a live product it can throw, and a gate
    // rejecting the robot's own write is the 2026-07-29 bug GATED_FIELDS
    // exists to prevent.
    const plan = planPosters(product({ status: 'published' }), [
      colourway(),
      colourway({ slug: 'black', variantId: 'N001-BLACK' }),
    ])
    expect(plan).toEqual([])
  })

  it('treats archived like any other non-published status', () => {
    // Only `published` is dangerous. Archived is off the website, so
    // photographing is as safe as it is on a draft.
    const plan = planPosters(product({ status: 'archived' }), [colourway()])
    expect(plan).toHaveLength(1)
  })

  it('never replaces a photo the owner already supplied', () => {
    const plan = planPosters(product(), [colourway({ hasPoster: true })])
    expect(plan).toEqual([])
  })

  it('skips a row with no variantId — there is nothing to show', () => {
    const plan = planPosters(product(), [colourway({ variantId: '' })])
    expect(plan).toEqual([])
  })

  it('skips a row whose variantId is only whitespace', () => {
    const plan = planPosters(product(), [colourway({ variantId: '   ' })])
    expect(plan).toEqual([])
  })

  it('skips a row with a blank slug', () => {
    // A low-confidence colour import arrives this way on purpose
    // (colourImport.ts / buildImportedRow) — a swatch with no name or web
    // address word yet, for a human to fill in.
    const plan = planPosters(product(), [colourway({ slug: '' })])
    expect(plan).toEqual([])
  })

  it('refuses the WHOLE product when the product code is blank, not just one row', () => {
    const plan = planPosters(product({ code: '' }), [
      colourway(),
      colourway({ slug: 'black', variantId: 'N001-BLACK' }),
    ])
    expect(plan).toEqual([])
  })

  it('refuses when the product code is null', () => {
    const plan = planPosters(product({ code: null }), [colourway()])
    expect(plan).toEqual([])
  })

  it('refuses when the product code is only whitespace', () => {
    const plan = planPosters(product({ code: '  ' }), [colourway()])
    expect(plan).toEqual([])
  })

  it('photographs every eligible colour, skipping only the ones that already have one', () => {
    const plan = planPosters(product(), [
      colourway(),
      colourway({ slug: 'black', variantId: 'N001-BLACK', hasPoster: true }),
      colourway({ slug: 'crimson', variantId: 'N001-CRIMSON' }),
    ])
    expect(plan.map((t) => t.slug)).toEqual(['navy', 'crimson'])
  })

  it('returns an empty plan for a product with no colourways at all', () => {
    expect(planPosters(product(), [])).toEqual([])
  })

  it('builds a filename that satisfies checkMediaUpload’s safe-filename regex', () => {
    // A colourway slug is already validated to lowercase-and-hyphens
    // (isValidSlug, packages/shared/src/slugs.ts) and a product code to
    // capital letters and digits (isValidProductCode, packages/shared/src/
    // variants.ts), so this join is safe by construction — asserted here
    // rather than trusted, per the task 14 brief.
    const plan = planPosters(product({ code: 'N001' }), [
      colourway({ slug: 'forest-green', variantId: 'Colorway 5' }),
    ])
    expect(plan[0]?.filename).toMatch(/^[A-Za-z0-9._-]+$/)
    expect(plan[0]?.filename).toBe('n001-forest-green-poster.png')
  })

  it('lowercases the product code in the filename', () => {
    const plan = planPosters(product({ code: 'TW12' }), [colourway()])
    expect(plan[0]?.filename).toBe('tw12-navy-poster.png')
  })

  it('every target names the FILE variant, not the slug, as variantId', () => {
    // The two are easy to swap by accident — variantId is what /render sends
    // as `variant=`, and it must be the name inside the CLO file (e.g.
    // "Colorway 5"), never the web-address slug.
    const plan = planPosters(product(), [
      colourway({ slug: 'forest-green', variantId: 'Colorway 5' }),
    ])
    expect(plan[0]).toEqual({
      slug: 'forest-green',
      variantId: 'Colorway 5',
      filename: 'n001-forest-green-poster.png',
    })
  })
})
