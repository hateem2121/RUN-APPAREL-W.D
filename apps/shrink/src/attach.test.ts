import { describe, expect, it } from 'vitest'
import { type ProductState, describeModel, planModelAttach } from './attach'

/**
 * The shrink worker writes to a product the owner may already have published, so
 * the two refusals in `planModelAttach` are security-critical in the same sense
 * the CMS's publish gate is: getting either wrong re-creates a live incident
 * rather than a cosmetic bug. They are tested here without a queue, a container
 * or a database — see the module header for why they were moved out of index.ts.
 */

const draft = (over: Partial<ProductState> = {}): ProductState => ({
  productCode: 'N002',
  status: 'draft',
  hasGlbAsset: false,
  ...over,
})

describe('planModelAttach', () => {
  it('attaches to a draft that has no model yet — the whole point', () => {
    expect(planModelAttach(7, draft())).toEqual({ attach: true })
  })

  it('REFUSES a published product, because the write would re-run the publish gate', () => {
    // glbAsset is in the CMS's GATED_FIELDS. On a draft assertPublishable returns
    // on its first line; on a live product it can throw, and a gate rejecting the
    // robot's own write is the 2026-07-29 bug GATED_FIELDS exists to prevent.
    const plan = planModelAttach(7, draft({ status: 'published' }))
    expect(plan.attach).toBe(false)
    expect(plan.attach === false && plan.note).toMatch(/already live/i)
  })

  it('REFUSES to replace a model the owner has already chosen', () => {
    const plan = planModelAttach(7, draft({ hasGlbAsset: true }))
    expect(plan.attach).toBe(false)
    expect(plan.attach === false && plan.note).toMatch(/already has a finished 3D file/i)
  })

  it('treats archived like any other non-published status', () => {
    // Only `published` is dangerous. Archived is off the website, so attaching is
    // as safe as it is on a draft — and refusing would strand a re-run.
    expect(planModelAttach(7, draft({ status: 'archived' }))).toEqual({ attach: true })
  })

  it('says something when the product could not be read, rather than going quiet', () => {
    // "The robot used to do this and today it didn't" reads as a bug when it is a
    // degraded read. Not attaching is correct; not saying so is not.
    const plan = planModelAttach(7, null)
    expect(plan.attach).toBe(false)
    expect(plan.attach === false && plan.note).toMatch(/could not check the product/i)
  })

  it('stays silent when there is no product at all', () => {
    // targetProduct is required, so this is only reachable on a row created
    // before it was. There is nothing to tell the owner.
    expect(planModelAttach(null, null)).toEqual({ attach: false, note: '' })
    expect(planModelAttach(undefined, draft())).toEqual({ attach: false, note: '' })
  })

  it('every refusal tells the owner where to go next', () => {
    const refusals = [
      planModelAttach(7, null),
      planModelAttach(7, draft({ status: 'published' })),
      planModelAttach(7, draft({ hasGlbAsset: true })),
    ]
    for (const plan of refusals) {
      expect(plan.attach).toBe(false)
      expect(plan.attach === false && plan.note).toMatch(/3D file/)
    }
  })
})

/**
 * On 2026-08-09 the live media library held five GLBs whose descriptions were
 * byte-identical — "Auto-processed 3D model (cycling-all-colours-optimized.glb)"
 * — because `suggestedFilename` is derived from the raw export and so repeats on
 * every re-run. Four were superseded and one was a pre-2026-08-05 build with the
 * old artwork damage, and the picker gave the owner no way to tell them apart.
 */
describe('describeModel', () => {
  const base = {
    productCode: 'N002',
    detail: 'balanced',
    sizeBytes: 28_271_780,
    suggestedFilename: 'cycling-all-colours-optimized.glb',
    now: new Date('2026-08-09T10:30:00Z'),
  }

  it('leads with the product code, so the list groups by garment', () => {
    expect(describeModel(base)).toMatch(/^N002 3D model/)
  })

  it('carries the three things that separate one re-run from the next', () => {
    const text = describeModel(base)
    expect(text).toContain('2026-08-09')
    expect(text).toContain('27.0 MB')
    expect(text).toContain('Balanced')
  })

  it('distinguishes two runs of the SAME file at different settings', () => {
    // The exact failure: same garment, same source filename, same day. Only the
    // Detail level and the resulting size differ, and that has to be enough.
    const a = describeModel(base)
    const b = describeModel({ ...base, detail: 'fidelity', sizeBytes: 37_500_000 })
    expect(a).not.toBe(b)
  })

  it('falls back to a plain name when the product could not be read', () => {
    const text = describeModel({ ...base, productCode: null })
    expect(text).toMatch(/^3D model/)
    expect(text).not.toContain('null')
  })

  it('keeps the source filename, which is what ties it back to the upload', () => {
    expect(describeModel(base)).toContain('cycling-all-colours-optimized.glb')
  })

  it('prints an unknown Detail level rather than swallowing it', () => {
    // A job enqueued before a level was renamed must still describe itself.
    expect(describeModel({ ...base, detail: 'small' })).toContain('small')
  })
})
