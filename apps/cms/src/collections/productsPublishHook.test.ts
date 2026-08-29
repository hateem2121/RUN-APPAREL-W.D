import { describe, expect, it, vi } from 'vitest'
import { Products } from './Products'

/**
 * The publish gate's WIRING, which nothing tested until 2026-08-29.
 *
 * ⚠️ HOW THIS GAP LOOKED FROM THE OUTSIDE. `publishGating.ts` has 63 tests and ~100%
 * coverage, and every one of them calls a pure helper directly. Not one reached the
 * hook that calls those helpers in production. Replacing the entire `beforeChange`
 * hook with a no-op left 439 of 439 CMS tests passing.
 *
 * The coverage report said so all along and nobody read it: `Products.ts` sat at
 * 37.28% lines with every uncovered line inside this hook, while the rules modules it
 * delegates to sat at 98-100%. `Media.ts` was at 14.28% lines and 0% FUNCTIONS.
 *
 * So what is tested here is deliberately NOT the rules — those are covered, and
 * duplicating them would just move the same blind spot. It is the glue: the
 * `{...originalDoc, ...data}` merge, the `variantsVerified` overwrite, the Events
 * write and its swallowed catch, the `changesAnything` early return, the conditional
 * artwork read, and the APIError rethrow. Every one of those is a decision made in
 * `Products.ts` and nowhere else.
 */

type HookArgs = {
  data: Record<string, unknown>
  originalDoc?: Record<string, unknown>
  req: unknown
}

const beforeChange = Products.hooks?.beforeChange?.[0] as
  | ((args: HookArgs) => Promise<Record<string, unknown>>)
  | undefined

/** A req that records Events writes and can stand in for the media lookup. */
const fakeReq = (over: { media?: unknown; createThrows?: boolean } = {}) => {
  const created: Record<string, unknown>[] = []
  return {
    created,
    req: {
      payload: {
        create: vi.fn(async (args: Record<string, unknown>) => {
          if (over.createThrows) throw new Error('D1 unavailable')
          created.push(args)
          return {}
        }),
        findByID: vi.fn(async () => over.media ?? null),
      },
    },
  }
}

/** The minimum shape that satisfies every rule, so a test can break ONE thing. */
const publishable = () => ({
  status: 'published',
  productName: 'X-MILO PRO BIB',
  productCode: 'R-XMP',
  variantMode: 'single-glb',
  glbAsset: 42,
  fileColours: ['Colorway 2'],
  colourways: [{ displayName: 'Wine', slug: 'wine', active: true, variantId: 'Colorway 2' }],
})

describe('the publish hook is reachable at all', () => {
  it('exists as a collection-level beforeChange hook', () => {
    /*
     * The guard for the whole file. If Payload's hook shape changes, or the hook is
     * moved to a field, every test below would silently stop exercising production —
     * which is the exact failure this file exists to close.
     */
    expect(typeof beforeChange).toBe('function')
  })
})

describe('variantsVerified is DERIVED, never trusted', () => {
  it('overwrites whatever the operator sent', async () => {
    /*
     * "Colours checked" stopped being a box the owner ticks. If this line is ever
     * removed, a product could be published as verified while its colour buttons point
     * at colours that are not in the file — which is what the derivation exists to stop.
     */
    const { req } = fakeReq()
    const data: Record<string, unknown> = { ...publishable(), variantsVerified: true }
    // fileColours does NOT contain the mapped variantId, so the honest answer is false.
    data.fileColours = ['Something Else']

    await expect(beforeChange?.({ data, originalDoc: {}, req })).rejects.toThrow()
    expect(data.variantsVerified).toBe(false)
  })

  it('derives true when every active colour maps into the file', async () => {
    const { req } = fakeReq()
    const data: Record<string, unknown> = { ...publishable(), variantsVerified: false }

    await beforeChange?.({ data, originalDoc: {}, req })

    expect(data.variantsVerified).toBe(true)
  })
})

describe('the becameUnverifiedWhilePublished report', () => {
  it('writes an Events row when a live product loses its colour mapping', async () => {
    /*
     * ⚠️ THIS PATH IS NAMED IN THE ROOT CLAUDE.md AS A COMPENSATING CONTROL. `fileColours`
     * is deliberately NOT in GATED_FIELDS, because gating it once blocked the shrink
     * robot's own recovery write on a published-but-model-less product. The note says
     * "the gap it leaves is covered by reporting instead". That reporting had never
     * executed in a test.
     */
    const { req, created } = fakeReq()
    const data: Record<string, unknown> = { ...publishable(), fileColours: ['Renamed'] }

    await expect(
      beforeChange?.({ data, originalDoc: { variantsVerified: true }, req }),
    ).rejects.toThrow()

    expect(created).toHaveLength(1)
    expect(created[0]?.collection).toBe('events')
    const row = created[0]?.data as Record<string, unknown>
    expect(row.event).toBe('variants-unverified-while-published')
    expect(row.product).toBe('R-XMP')
    // Events are endpoint-only by access control, so a system write must say so.
    expect(created[0]?.overrideAccess).toBe(true)
  })

  it('does NOT write one when the product was already unverified', async () => {
    // Only the true -> false transition on a PUBLISHED product is newsworthy.
    const { req, created } = fakeReq()
    const data: Record<string, unknown> = { ...publishable(), fileColours: ['Renamed'] }

    await expect(
      beforeChange?.({ data, originalDoc: { variantsVerified: false }, req }),
    ).rejects.toThrow()

    expect(created).toHaveLength(0)
  })

  it('⚠️ survives a failed Events write rather than losing the real write', async () => {
    /*
     * Best-effort ON PURPOSE. Losing the note must never cost the robot its colour-list
     * write, which is the thing that repairs the broken state. If this catch were ever
     * tightened, a D1 hiccup would turn a recoverable product into an unsaveable one.
     */
    const { req } = fakeReq({ createThrows: true })
    const data: Record<string, unknown> = { ...publishable(), fileColours: ['Renamed'] }

    // Rejects for the PUBLISH reason, not for the Events failure.
    await expect(
      beforeChange?.({ data, originalDoc: { variantsVerified: true }, req }),
    ).rejects.toThrow(/colour/i)
  })
})

describe('the changesAnything early return', () => {
  it('skips the publish checks when the write touches no gated field', async () => {
    /*
     * The performance AND correctness reason the gate is not run on every save. A write
     * that changes none of status / variantMode / glbAsset / colourways cannot make a
     * product more or less publishable — and running the checks anyway would block the
     * shrink robot's own writes on a product that is already in a bad state.
     */
    const { req } = fakeReq()
    const original = { ...publishable(), fileColours: ['Something Else'] }
    // Same gated fields, only an ungated one differs — so it must NOT throw, even
    // though this product would fail the publish checks if they ran.
    const data: Record<string, unknown> = { shortDescription: 'new copy' }

    await expect(beforeChange?.({ data, originalDoc: original, req })).resolves.toBeDefined()
  })

  it('DOES run them when a gated field changes', async () => {
    const { req } = fakeReq()
    const original = { ...publishable(), status: 'draft', fileColours: ['Something Else'] }
    const data: Record<string, unknown> = { status: 'published' }

    await expect(beforeChange?.({ data, originalDoc: original, req })).rejects.toThrow()
  })
})

describe('the artwork verdict read', () => {
  it('refuses a published product whose artwork is damaged', async () => {
    const { req } = fakeReq({ media: { artworkVerdict: 'damaged' } })
    const data: Record<string, unknown> = publishable()

    await expect(beforeChange?.({ data, originalDoc: {}, req })).rejects.toThrow(/artwork/i)
  })

  it('allows it through with an override reason recorded', async () => {
    const { req } = fakeReq({
      media: { artworkVerdict: 'damaged', artworkOverrideReason: 'checked by eye, it is fine' },
    })
    const data: Record<string, unknown> = publishable()

    await expect(beforeChange?.({ data, originalDoc: {}, req })).resolves.toBeDefined()
  })

  it('⚠️ is not read at all for a DRAFT, so drafts never hit the database', async () => {
    /*
     * Deliberate: the verdict is only consulted when publishing. A draft save must not
     * pay for a media lookup, and must not fail because one is unavailable.
     */
    const { req } = fakeReq({ media: { artworkVerdict: 'damaged' } })
    const data: Record<string, unknown> = { ...publishable(), status: 'draft' }

    await beforeChange?.({ data, originalDoc: {}, req })

    expect(req.payload.findByID as ReturnType<typeof vi.fn>).not.toHaveBeenCalled()
  })

  it('⚠️ FAILS OPEN when the media read throws, so a D1 hiccup cannot lock the catalogue', async () => {
    /*
     * The alternative is that a transient database problem makes every product
     * unpublishable with an error about artwork — both wrong and baffling. The verdict
     * blocks a KNOWN-damaged file; it is not an availability dependency for publishing.
     */
    const req = {
      payload: {
        create: vi.fn(async () => ({})),
        findByID: vi.fn(async () => {
          throw new Error('D1 unavailable')
        }),
      },
    }
    const data: Record<string, unknown> = publishable()

    await expect(beforeChange?.({ data, originalDoc: {}, req })).resolves.toBeDefined()
  })
})

describe('the APIError rethrow', () => {
  it('⚠️ turns a refusal into a message the owner can actually read', async () => {
    /*
     * WITHOUT THE RETHROW EVERY CAREFULLY-WORDED REFUSAL BECOMES "Something went wrong."
     * Payload swallows a plain Error into its generic 500 message; only an APIError
     * carries text and a 400 to the admin UI. Every sentence in publishGating.ts was
     * written for a non-technical owner, and all of it was one `throw` away from being
     * invisible.
     */
    const { req } = fakeReq()
    const data: Record<string, unknown> = { ...publishable(), glbAsset: null }

    const error = await beforeChange?.({ data, originalDoc: {}, req }).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).not.toBe('Something went wrong.')
    expect((error as Error).message.length).toBeGreaterThan(20)
    // APIError carries an HTTP status; a bare Error does not.
    expect((error as { status?: number }).status).toBe(400)
  })
})
