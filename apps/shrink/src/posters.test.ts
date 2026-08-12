import { describe, expect, it } from 'vitest'
import {
  type CapturedFrame,
  checkCapturedFrame,
  frameDigest,
  type PosterColourway,
  type PosterProduct,
  planPosters,
} from './posters'

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
  // Null by default on purpose: every planPosters test below passes without a
  // swatch, which is the assertion that hexSwatch takes no part in deciding
  // what to photograph. It exists only for checkCapturedFrame.
  hexSwatch: null,
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

/**
 * The gap this closes, found by the post-merge review of 8927062 (finding 3.4):
 * NOTHING checked that a captured poster shows the colour it was captured FOR.
 *
 * RenderPage.tsx already refuses to signal ready for a variant that is not in
 * the file, and capturePosters resolves each row by slug rather than by loop
 * index, so the known-bad cases were covered. What was not: `variantName` is
 * set, the variant genuinely exists, and the frame is painted before the new
 * variant's textures finish uploading — the PREVIOUS colour, photographed
 * under the new colour's name. Every gate passes; the settle is
 * jumpCameraToGoal + two rAFs, which root CLAUDE.md calls best-effort rather
 * than a convergence check.
 *
 * Detected by identity rather than by colour distance, deliberately. Workers
 * cannot run sharp (see index.ts's screenshot call), so measuring a poster's
 * mean colour would mean putting a pure-JS PNG decoder in the path that
 * photographs every garment, to produce a warning. Two colourways yielding a
 * BYTE-IDENTICAL png is the same bug stated exactly, needs no decoding, and is
 * meaningful here specifically because renders in this repo ARE byte-identical
 * for identical input — root CLAUDE.md records four such PNGs at
 * `sha256 294291db…` while calibrating the field-of-view floor.
 */
const frame = (over: Partial<CapturedFrame> = {}): CapturedFrame => ({
  slug: 'navy',
  hexSwatch: '#1B2A4A',
  digest: 'aaaa',
  ...over,
})

describe('frameDigest', () => {
  it('is stable for identical bytes and different for a single changed pixel', () => {
    const a = new Uint8Array([137, 80, 78, 71, 1, 2, 3, 4, 5])
    const b = new Uint8Array([137, 80, 78, 71, 1, 2, 3, 4, 5])
    const c = new Uint8Array([137, 80, 78, 71, 1, 2, 3, 4, 6])
    expect(frameDigest(a)).toBe(frameDigest(b))
    expect(frameDigest(a)).not.toBe(frameDigest(c))
  })

  it('separates same-length content from same-content different length', () => {
    // Length is folded in as well as the rolling hash: two PNGs of different
    // size are never the same frame, whatever the hash does.
    expect(frameDigest(new Uint8Array([1, 2, 3]))).not.toBe(
      frameDigest(new Uint8Array([1, 2, 3, 3])),
    )
    expect(frameDigest(new Uint8Array([]))).toBe(frameDigest(new Uint8Array([])))
  })
})

describe('checkCapturedFrame', () => {
  it('says nothing when every colour photographs differently — the normal case', () => {
    const seen = [frame({ slug: 'navy', digest: 'aaaa' })]
    expect(checkCapturedFrame(seen, frame({ slug: 'wine', digest: 'bbbb' }))).toBeNull()
  })

  it('says nothing for the first frame of a garment', () => {
    expect(checkCapturedFrame([], frame())).toBeNull()
  })

  it('warns when two colours produce the same image, naming both', () => {
    const seen = [frame({ slug: 'navy', hexSwatch: '#1B2A4A', digest: 'aaaa' })]
    const warning = checkCapturedFrame(
      seen,
      frame({ slug: 'wine', hexSwatch: '#6E1A2B', digest: 'aaaa' }),
    )
    expect(warning).toContain('wine')
    expect(warning).toContain('navy')
  })

  it('is emphatic when the two swatches genuinely differ — near-conclusive', () => {
    const seen = [frame({ slug: 'navy', hexSwatch: '#1B2A4A', digest: 'aaaa' })]
    const warning = checkCapturedFrame(
      seen,
      frame({ slug: 'wine', hexSwatch: '#6E1A2B', digest: 'aaaa' }),
    )
    // Different swatches + one identical image cannot both be right.
    expect(warning).toContain('different colours')
  })

  it('hedges when the swatches match, because two colours may truly look alike', () => {
    const seen = [frame({ slug: 'navy', hexSwatch: '#1B2A4A', digest: 'aaaa' })]
    const warning = checkCapturedFrame(
      seen,
      frame({ slug: 'navy-two', hexSwatch: '#1B2A4A', digest: 'aaaa' }),
    )
    expect(warning).not.toContain('different colours')
    expect(warning).toContain('same swatch')
  })

  it('hedges when a swatch is missing rather than assuming a fault', () => {
    // hexSwatch is null for any row the owner typed by hand — absence is not
    // evidence, and a false alarm on a hand-built garment teaches the owner to
    // ignore the warning, which is worse than not having it.
    const seen = [frame({ slug: 'navy', hexSwatch: null, digest: 'aaaa' })]
    const warning = checkCapturedFrame(
      seen,
      frame({ slug: 'wine', hexSwatch: '#6E1A2B', digest: 'aaaa' }),
    )
    expect(warning).not.toContain('different colours')
  })

  it('compares swatches case- and whitespace-insensitively', () => {
    const seen = [frame({ slug: 'navy', hexSwatch: '#1b2a4a', digest: 'aaaa' })]
    const warning = checkCapturedFrame(
      seen,
      frame({ slug: 'navy-two', hexSwatch: ' #1B2A4A ', digest: 'aaaa' }),
    )
    expect(warning).toContain('same swatch')
  })

  it('reports against the FIRST colour that produced the image, not the most recent', () => {
    // A stuck swap repeats one frame across several colours; naming the origin
    // every time points at the colour that is actually correct.
    const seen = [frame({ slug: 'navy', digest: 'aaaa' }), frame({ slug: 'wine', digest: 'aaaa' })]
    expect(checkCapturedFrame(seen, frame({ slug: 'lime', digest: 'aaaa' }))).toContain('navy')
  })
})
