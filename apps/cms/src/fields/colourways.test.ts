import { describe, expect, it } from 'vitest'
import { colourwaysField } from './colourways'

const fieldNamed = (name: string) =>
  colourwaysField.fields.find((f) => 'name' in f && f.name === name) as {
    hooks?: { beforeValidate?: ((args: never) => unknown)[] }
    validate?: (value: unknown, args: { data?: unknown; siblingData?: unknown }) => unknown
    required?: boolean
  }

const run = (name: string, args: unknown) =>
  fieldNamed(name).hooks?.beforeValidate?.[0]?.(args as never)

const validate = (name: string, value: unknown, data: unknown = {}) =>
  fieldNamed(name).validate?.(value, { data })

const validateSibling = (name: string, value: unknown, siblingData: unknown = {}) =>
  fieldNamed(name).validate?.(value, { siblingData })

describe('colour row auto-fill', () => {
  it('suggests a slug into a blank field', () => {
    expect(run('slug', { siblingData: { displayName: 'Powder Blue' }, value: '' })).toBe(
      'powder-blue',
    )
  })
  it('NEVER rewrites an existing slug — it is on a printed QR tag', () => {
    expect(run('slug', { siblingData: { displayName: 'Powder Blue' }, value: 'navy' })).toBe('navy')
  })
  it('writes a photo description from the product and colour name', () => {
    expect(
      run('altText', {
        data: { productName: 'Velocity Tee' },
        siblingData: { displayName: 'Wine' },
        value: '',
      }),
    ).toBe('Velocity Tee in Wine')
  })
  it('leaves a written description alone', () => {
    expect(
      run('altText', {
        data: { productName: 'Velocity Tee' },
        siblingData: { displayName: 'Wine' },
        value: 'Front three-quarter view',
      }),
    ).toBe('Front three-quarter view')
  })
  it('leaves the description blank when it has nothing to build one from', () => {
    expect(run('altText', { data: {}, siblingData: {}, value: '' })).toBe('')
  })
})

/**
 * displayName and slug stopped being `required` at the field level on
 * 2026-08-11: a swatch-only row from a low-confidence colour import
 * (buildImportedRow in packages/shared/src/importColours.ts) must be SAVEABLE
 * with both blank, for a human to fill in later — see apps/shrink/src/
 * colourImport.ts. Verified against a real local Payload+D1 instance that a
 * `required: true` displayName made the shrink robot's automated PATCH fail
 * outright (`ValidationError`) the moment any file colour matched with low
 * confidence, which is one of planColourImport's own required test cases.
 *
 * `slug`'s blank-rejection came entirely from its own custom `validate` (a
 * custom validate replaces Payload's default required check, so the `required`
 * flag alone was never what blocked it) — so the fix is in the function itself,
 * pinned here. Everything else that function already checked (bad characters, a
 * collision with another row's slug) must still be rejected once the slug is
 * non-blank; only "blank" changed.
 */
describe('displayName and slug are not required — the publish gate enforces them instead', () => {
  it('displayName has no `required` flag any more', () => {
    expect(fieldNamed('displayName').required).not.toBe(true)
  })

  it('slug accepts a blank value — a swatch-only imported row must be saveable', () => {
    expect(validate('slug', '')).toBe(true)
    expect(validate('slug', '   ')).toBe(true)
  })

  it('slug still rejects invalid characters once it is not blank', () => {
    expect(validate('slug', 'Navy Blue!')).not.toBe(true)
  })

  it('slug still refuses to collide with another row on the same product', () => {
    const data = { colourways: [{ slug: 'navy' }, { slug: 'navy' }] }
    expect(validate('slug', 'navy', data)).not.toBe(true)
  })
})

/**
 * Found in review of the change above: displayName/slug being saveable blank
 * made "switched ON and blank" reachable on a DRAFT for the first time — the
 * publish gate never runs there (collectPublishProblems no-ops for any
 * non-published status), so nothing stopped a human ticking "Show this colour
 * on the website" on an unnamed imported row. apps/cms/src/endpoints/
 * pipelinePlan.ts (the offline `pipeline merge --from-cms` tool's data source)
 * queries with no status filter and keeps any row with `active !== false`, so
 * it would have picked up exactly that state and fed a blank slug into
 * buildVariantId, producing "N001-" with nothing to catch it.
 *
 * Guarded at the row itself — active's own `validate` — rather than in every
 * reader, so the next reader gets this for free instead of re-deriving it.
 * `planColourImport` always writes `active: false`, so the robot's own write
 * is provably unaffected by this: only a human-driven switch-on is checked.
 */
describe('a colour cannot be switched on while it has no name or no slug', () => {
  it('allows switching OFF regardless of name/slug — retiring a row is always safe', () => {
    expect(validateSibling('active', false, { displayName: '', slug: '' })).toBe(true)
  })

  it('allows switching ON a fully named colour', () => {
    expect(validateSibling('active', true, { displayName: 'Navy', slug: 'navy' })).toBe(true)
  })

  it('refuses to switch ON a swatch-only row with neither name nor slug', () => {
    // Exactly buildImportedRow's low-confidence shape.
    const result = validateSibling('active', true, { displayName: '', slug: '' })
    expect(result).not.toBe(true)
    expect(result).toMatch(/no name or web address word/)
  })

  it('refuses to switch ON a row with a name but no slug', () => {
    const result = validateSibling('active', true, { displayName: 'Navy', slug: '' })
    expect(result).not.toBe(true)
    expect(result).toMatch(/no web address word/)
  })

  it('refuses to switch ON a row with a slug but no name', () => {
    const result = validateSibling('active', true, { displayName: '', slug: 'navy' })
    expect(result).not.toBe(true)
    expect(result).toMatch(/no name/)
  })

  it('treats whitespace-only as blank, same as everywhere else in this file', () => {
    const result = validateSibling('active', true, { displayName: '   ', slug: '   ' })
    expect(result).not.toBe(true)
  })
})
