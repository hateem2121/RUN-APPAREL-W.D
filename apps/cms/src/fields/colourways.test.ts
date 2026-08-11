import { describe, expect, it } from 'vitest'
import { colourwaysField } from './colourways'

const fieldNamed = (name: string) =>
  colourwaysField.fields.find((f) => 'name' in f && f.name === name) as {
    hooks?: { beforeValidate?: ((args: never) => unknown)[] }
    validate?: (value: unknown, args: { data?: unknown }) => unknown
    required?: boolean
  }

const run = (name: string, args: unknown) =>
  fieldNamed(name).hooks?.beforeValidate?.[0]?.(args as never)

const validate = (name: string, value: unknown, data: unknown = {}) =>
  fieldNamed(name).validate?.(value, { data })

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
