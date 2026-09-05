import { describe, expect, it } from 'vitest'
import { isAuthenticatedFieldLevel } from '../access/roles'
import { Media } from './Media'

/**
 * Media access, at both the collection and the field level.
 *
 * ⚠️ THIS DOCBLOCK OPENED WITH "`Media.access.read` is `() => true` on purpose" UNTIL
 * 2026-09-05. It is `isAuthenticated` now, and the premise was wrong — the files are
 * served from R2, not through this API, so the collection never had to be anonymous.
 * See the collection test below for the measurement that ended it, and Media.ts for
 * why narrowing it cannot affect the viewer.
 *
 * The field-level half below still stands exactly as written, and it is the reason
 * the collection-level hole survived an audit: framing the 2026-08-30 leak as "a
 * public collection is not the same as public fields" fixed the three fields and
 * treated the enumeration itself as harmless.
 *
 * ⚠️ "THE COLLECTION IS PUBLIC" WAS READ AS "EVERY FIELD ON IT IS PUBLIC", and three
 * reviewer-only fields rode along for months. Measured 2026-08-30 against production:
 *
 *     GET https://cms.wear-run.help/api/media?limit=2   (no credentials)
 *     -> totalDocs: 21, each with artworkVerdict, artworkOverrideReason, sizeWarning
 *
 * That is the QA verdict on a garment's printed artwork, the free-text reason someone
 * published a damaged one anyway, and an internal size flag — none of which a visitor
 * has any business reading. The FILES were always meant to be public; the review
 * metadata never was, and the collection's own comment asserted it "contains nothing
 * sensitive".
 *
 * This test is the guard, and it is deliberately written as a LIST that must be
 * covered rather than three individual assertions: a fourth reviewer field added
 * later is the actual risk, and a per-field test would not notice one.
 */

/** Fields that exist for reviewers, not for visitors. */
const INTERNAL_FIELDS = ['sizeWarning', 'artworkVerdict', 'artworkOverrideReason'] as const

type FieldLike = { name?: string; access?: { read?: unknown } }

const topLevelFields = (): FieldLike[] => (Media.fields ?? []) as FieldLike[]

/** Flatten one level of tabs/rows/groups so a nested field is still found. */
const allFields = (): FieldLike[] => {
  const out: FieldLike[] = []
  const walk = (fields: unknown[]) => {
    for (const f of fields) {
      const field = f as FieldLike & { fields?: unknown[]; tabs?: { fields?: unknown[] }[] }
      if (field.name) out.push(field)
      if (Array.isArray(field.fields)) walk(field.fields)
      for (const tab of field.tabs ?? []) if (Array.isArray(tab.fields)) walk(tab.fields)
    }
  }
  walk(topLevelFields())
  return out
}

describe('Media field-level access', () => {
  it('finds the collection and its fields, so nothing below passes vacuously', () => {
    // A COUNT would be the wrong guard — Media has exactly five named fields today,
    // and any number here either breaks on a legitimate addition or is meaningless.
    // What matters is that the walk reaches the fields these tests reason about:
    // all three internal ones, plus a public one for the negative control.
    const names = allFields().map((f) => f.name)
    for (const field of [...INTERNAL_FIELDS, 'alt']) {
      expect(names, `the field walk never reached "${field}"`).toContain(field)
    }
  })

  it('refuses an anonymous read of the COLLECTION — the index is not public', () => {
    // ⚠️ THIS TEST ASSERTED THE OPPOSITE UNTIL 2026-09-05, on a stated premise that
    // was wrong: "if this ever changes, the viewer's posters stop loading for
    // anonymous visitors." They do not. The posters and models are served from R2 at
    // media.wear-run.help, which this setting does not govern, and the viewer reaches
    // its data through the LOCAL API (`req.payload.find` in publicViewer.ts, whose
    // `overrideAccess` defaults to true) — never through `GET /api/media`.
    //
    // The proof is already in production and predates this change: `Products.read`
    // has been `isAuthenticated` throughout, and all 55 public viewer states serve
    // anonymously anyway. If collection access reached that endpoint, Products would
    // already have broken it.
    //
    // What `() => true` actually published was the INDEX: 66 documents in one
    // unauthenticated request, 13 model URLs, 51.2 MB, every filename and size —
    // while the bucket itself correctly refuses to list its own contents.
    expect(typeof Media.access?.read).toBe('function')
    expect(Media.access?.read?.({ req: {} } as never)).toBe(false)
    expect(Media.access?.read?.({ req: { user: null } } as never)).toBe(false)
  })

  it('still admits a signed-in reader — the robot and the orphan finder need it', () => {
    // The other direction, and it is not decoration. `read: () => false` would pass
    // the test above and silently break the shrink robot (`cmsFetch` sends
    // `Authorization: users API-Key`) and scripts/find-orphan-media.mjs, which reads
    // the whole library to decide what is unreferenced before deleting it.
    expect(Media.access?.read?.({ req: { user: { role: 'editor' } } } as never)).toBe(true)
    expect(Media.access?.read?.({ req: { user: { role: 'admin' } } } as never)).toBe(true)
  })

  it.each(INTERNAL_FIELDS)('hides %s from unauthenticated reads', (name) => {
    const field = allFields().find((f) => f.name === name)
    expect(field, `Media has no field named ${name} — has it been renamed?`).toBeDefined()
    expect(
      field?.access?.read,
      `${name} is readable by anyone. It is reviewer-only metadata on a collection ` +
        'whose FILES are public but whose review data is not.',
    ).toBe(isAuthenticatedFieldLevel)
  })

  it('the guard itself can fail (negative control)', () => {
    // A field with no `access` must not satisfy the assertion above — otherwise the
    // three tests would pass on a collection with no field-level access at all.
    const open = allFields().find((f) => f.name === 'alt')
    expect(open, 'expected a plain public field to compare against').toBeDefined()
    expect(open?.access?.read).not.toBe(isAuthenticatedFieldLevel)
  })
})

describe('isAuthenticatedFieldLevel', () => {
  it('admits any signed-in user, not just admins', () => {
    // Deliberately NOT isAdminFieldLevel: the shrink robot authenticates as a user
    // via `users API-Key`. It only WRITES these fields today, and pinning them to
    // admin would break it the moment that changes — quietly, in a queue consumer.
    expect(isAuthenticatedFieldLevel({ req: { user: { role: 'editor' } } } as never)).toBe(true)
    expect(isAuthenticatedFieldLevel({ req: { user: { role: 'admin' } } } as never)).toBe(true)
  })

  it('refuses anonymous', () => {
    expect(isAuthenticatedFieldLevel({ req: {} } as never)).toBe(false)
    expect(isAuthenticatedFieldLevel({ req: { user: null } } as never)).toBe(false)
  })
})
