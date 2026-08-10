import { describe, expect, it } from 'vitest'
import { Products } from './Products'

/** A field as this test needs to see it — name plus whatever hooks it carries. */
interface NamedField {
  name: string
  type?: string
  hooks?: {
    beforeValidate?: ((args: never) => unknown)[]
    beforeDuplicate?: ((args: never) => unknown)[]
  }
  fields?: unknown[]
  tabs?: { fields?: unknown[] }[]
}

/**
 * Products nests almost every field inside `{ type: 'tabs', tabs: [...] }`, so a
 * flat `.find` (as colourways.test.ts uses) cannot reach `productCode`, `slug`,
 * `glbAsset`, `fileColours` or `fileColourDetails`. This walks both `fields` and
 * `tabs[].fields` so the test does not care which tab a field lives on.
 *
 * Deliberately does NOT descend into an `array`/`blocks` field's own `.fields`.
 * `colourwaysField` has a row-level `slug` field of its own (Part B), a
 * different field in a different, row-scoped namespace — not a second
 * definition of the product's `slug`. Recursing into it made this collector
 * overwrite the product-level `slug` entry with the colour row's `slug` (no
 * `beforeDuplicate`), because both share the name `slug` and the array field
 * is declared after the product-level one. Caught by this test failing with
 * the colour row's hook shape instead of the product's.
 */
function collectNamedFields(fields: unknown[], out: Map<string, NamedField>): void {
  for (const raw of fields) {
    const field = raw as NamedField
    if (typeof field.name === 'string') out.set(field.name, field)
    if (field.type !== 'array' && field.type !== 'blocks' && Array.isArray(field.fields)) {
      collectNamedFields(field.fields, out)
    }
    if (Array.isArray(field.tabs)) {
      for (const tab of field.tabs) {
        if (Array.isArray(tab.fields)) collectNamedFields(tab.fields, out)
      }
    }
  }
}

const namedFields = new Map<string, NamedField>()
collectNamedFields(Products.fields as unknown[], namedFields)

const fieldNamed = (name: string): NamedField => {
  const field = namedFields.get(name)
  if (!field) throw new Error(`No field named "${name}" found on Products`)
  return field
}

const runDuplicate = (name: string, args: unknown) =>
  fieldNamed(name).hooks?.beforeDuplicate?.[0]?.(args as never)

describe('Products beforeDuplicate hooks', () => {
  // productCode and slug are both `unique: true`, and Payload copies a field's
  // value verbatim into the duplicate unless a beforeDuplicate hook says
  // otherwise — so without these, saving a duplicate hits the same
  // `products_product_code_idx` / `products_slug_idx` UNIQUE index the original
  // row already occupies. Confirmed by reading Payload 3.86.0's own
  // duplicateDocument/index.js and fields/hooks/beforeDuplicate/promise.js, and
  // the CREATE UNIQUE INDEX statements in migrations/20260729_070548_inline_colourways.ts.
  it('suffixes the product code so the unique index cannot collide', () => {
    expect(runDuplicate('productCode', { value: 'N001' })).toBe('N001-COPY')
  })
  it('leaves a non-string product code alone', () => {
    expect(runDuplicate('productCode', { value: null })).toBe(null)
  })

  it('suffixes the slug so the unique index cannot collide', () => {
    expect(runDuplicate('slug', { value: 'n001' })).toBe('n001-copy')
  })
  it('leaves a non-string slug alone', () => {
    // A number, not `undefined` — a field with no hook at all also returns
    // `undefined` here, which would make this pass without the hook existing.
    expect(runDuplicate('slug', { value: 123 })).toBe(123)
  })
  // Part A put a `beforeValidate` hook on this same field. The brief is explicit
  // that this hook merges into that SAME hooks object rather than replacing it —
  // losing beforeValidate here would silently turn off the create-time slug
  // suggestion for every ordinary new product, not just duplicates.
  it('keeps the create-time slug suggestion — beforeDuplicate must not replace it', () => {
    expect(fieldNamed('slug').hooks?.beforeValidate?.[0]).toBeTypeOf('function')
    expect(fieldNamed('slug').hooks?.beforeDuplicate?.[0]).toBeTypeOf('function')
  })

  // A copy must not inherit the original's model or colour mappings: those
  // describe one specific CLO file, and the copy has not had one uploaded yet.
  it('clears the attached model', () => {
    expect(runDuplicate('glbAsset', { value: 42 })).toBe(null)
  })
  it('clears the colours found inside the file', () => {
    expect(runDuplicate('fileColours', { value: [{ variantId: 'a' }] })).toBe(null)
  })
  it('clears what colour each one actually is', () => {
    expect(runDuplicate('fileColourDetails', { value: [{ variantId: 'a' }] })).toBe(null)
  })

  // A copy must never arrive published — it has no model and no verified colours.
  it('always arrives as a draft, even duplicating a published product', () => {
    expect(runDuplicate('status', { value: 'published' })).toBe('draft')
  })
})
