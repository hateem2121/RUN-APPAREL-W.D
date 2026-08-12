import type { FileColour } from '@run-apparel/shared'
import { describe, expect, it } from 'vitest'
import { type ProductState, planColourImport } from './colourImport'

/**
 * The shrink worker writes to a product the owner may already have published,
 * so the two refusals in `planColourImport` are security-critical in the same
 * sense `planModelAttach`'s are: getting either wrong re-creates a live
 * incident rather than a cosmetic bug. Tested here without a queue, a
 * container or a database — see attach.test.ts for the fuller argument, which
 * applies unchanged.
 */

const colour = (over: Partial<FileColour> = {}): FileColour => ({
  variantId: 'Colorway 5',
  hex: '#004D24',
  name: 'Forest Green',
  slug: 'forest-green',
  deltaE: 5.07,
  confidence: 'high',
  ...over,
})

const draft = (over: Partial<ProductState> = {}): ProductState => ({
  status: 'draft',
  colourwayCount: 0,
  ...over,
})

describe('planColourImport', () => {
  it('gives an empty draft one row per file colour — the whole point', () => {
    const plan = planColourImport(draft(), [
      colour(),
      colour({ variantId: 'Colorway 6', slug: 'navy', name: 'Navy' }),
    ])
    expect(plan.rows).toHaveLength(2)
  })

  it('REFUSES a published product, because the write would re-run the publish gate', () => {
    // colourways is in the CMS's GATED_FIELDS. On a draft assertPublishable
    // returns on its first line; on a live product it can throw, and a gate
    // rejecting the robot's own write is the 2026-07-29 bug GATED_FIELDS exists
    // to prevent.
    const plan = planColourImport(draft({ status: 'published' }), [colour()])
    expect(plan.rows).toBeNull()
    expect(plan.note).toMatch(/already live/i)
  })

  it('REFUSES a product that already has colour rows', () => {
    // Appending to a product the owner has already set up is a surprise, not a
    // convenience — the "Add the ticked colours" button stays for this case.
    const plan = planColourImport(draft({ colourwayCount: 3 }), [colour()])
    expect(plan.rows).toBeNull()
    expect(plan.note).toMatch(/already has colours/i)
  })

  it('treats archived like any other non-published status', () => {
    // Only `published` is dangerous. Archived is off the website, so importing
    // is as safe as it is on a draft.
    const plan = planColourImport(draft({ status: 'archived' }), [colour()])
    expect(plan.rows).not.toBeNull()
    expect(plan.rows).toHaveLength(1)
  })

  it('every returned row arrives switched OFF', () => {
    const plan = planColourImport(draft(), [colour(), colour({ variantId: 'Colorway 6' })])
    expect(plan.rows).not.toBeNull()
    for (const row of plan.rows ?? []) {
      expect(row.active).toBe(false)
    }
  })

  it('leaves a low-confidence colour with no name, but keeps its measured hex', () => {
    // A confident wrong name is how "Navy" ended up on a maroon garment. An
    // empty box the owner must fill is the safer failure — buildImportedRow's
    // rule, reused rather than re-implemented here.
    const plan = planColourImport(draft(), [
      colour({ confidence: 'low', name: 'Lime', slug: 'lime' }),
    ])
    const row = plan.rows?.[0]
    expect(row?.displayName).toBe('')
    expect(row?.slug).toBe('')
    expect(row?.hexSwatch).toBe('#004D24')
  })

  it('refuses quietly when the file held no colours — nothing happened, nothing to say', () => {
    const plan = planColourImport(draft(), [])
    expect(plan.rows).toBeNull()
    expect(plan.note).toBe('')
  })

  it('refuses quietly when the product could not be verified', () => {
    // Cannot check either refusal above without it, so refuse — but this
    // cannot tell "read failed" apart from "no target product on this upload
    // at all", and the attach write already reports a read failure for the
    // same job. Silence here avoids a second note that risks being wrong.
    const plan = planColourImport(null, [colour()])
    expect(plan.rows).toBeNull()
    expect(plan.note).toBe('')
  })

  it('gives two file colours resolving to the same slug distinct slugs', () => {
    // buildImportedRow's existing suffix behaviour (see importColours.test.ts
    // in packages/shared) — asserted here so it is known to survive the move.
    const plan = planColourImport(draft(), [
      colour({ variantId: 'Colorway 5', slug: 'forest-green' }),
      colour({ variantId: 'Colorway 6', slug: 'forest-green' }),
    ])
    const slugs = (plan.rows ?? []).map((row) => row.slug)
    expect(slugs).toEqual(['forest-green', 'forest-green-2'])
  })

  it('every refusal that says anything points at the fallback button', () => {
    const refusals = [
      planColourImport(draft({ status: 'published' }), [colour()]),
      planColourImport(draft({ colourwayCount: 1 }), [colour()]),
    ]
    for (const plan of refusals) {
      expect(plan.rows).toBeNull()
      expect(plan.note).toMatch(/add the ticked colours/i)
    }
  })
})
