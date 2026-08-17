import { defaultRichTextValue } from '@payloadcms/richtext-lexical'
import { describe, expect, it } from 'vitest'
import { DEFAULT_RETIRED_MESSAGE, Products } from './Products'

/** A field as this test needs to see it — name plus whatever hooks it carries. */
interface NamedField {
  name: string
  type?: string
  hooks?: {
    beforeValidate?: ((args: never) => unknown)[]
    beforeDuplicate?: ((args: never) => unknown)[]
  }
  // The field's own `validate` (e.g. isValidProductCode / isValidSlug). Used
  // below to prove a *duplicated* value survives the same check a *typed* one
  // would have to — see the productCode round-trip test for why that is not
  // free.
  validate?: (value: unknown, ctx?: unknown) => unknown
  // catalogueUrl / retiredMessage / customisationIntro / customisationSteps —
  // each reads the CatalogueDefaults global. Untyped `req` here on purpose:
  // this file has no Payload bootstrap (see vitest.config.ts), so the tests
  // below hand in the minimal fake shape each function actually touches.
  defaultValue?: (args: { req: unknown }) => unknown
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

const runDefaultValue = (name: string, req: unknown) => fieldNamed(name).defaultValue?.({ req })

/** A fake req whose req.payload.findGlobal resolves to the given document. */
const reqWithGlobal = (globalDoc: Record<string, unknown>) => ({
  payload: { findGlobal: async () => globalDoc },
})

/** A fake req whose req.payload.findGlobal always throws — the D1-hiccup case. */
const reqWhereGlobalReadFails = () => ({
  payload: {
    findGlobal: async () => {
      throw new Error('D1 unavailable')
    },
  },
})

// Payload calls a field's defaultValue function only when the document has no
// existing value for that field yet — confirmed against Payload 3.86.0's own
// fields/hooks/beforeValidate/getFallbackValue.js AND empirically against a
// real local D1 (see task-9-report.md): a fresh create inherits the global,
// re-reading the same product after the global changes still shows the
// original value, and a plain update that omits the field also leaves it
// unchanged. None of that machinery is Payload's own to test here — these
// tests exercise exactly the function Payload would call in the one situation
// where it does fire, standing in for req.payload.findGlobal the way
// runDuplicate above stands in for Payload's beforeDuplicate call.
describe('Products defaultValue — inherits from CatalogueDefaults on create only', () => {
  it('catalogueUrl reads the global', async () => {
    await expect(
      runDefaultValue(
        'catalogueUrl',
        reqWithGlobal({ catalogueUrl: 'https://custom.example/catalogue' }),
      ),
    ).resolves.toBe('https://custom.example/catalogue')
  })
  it('catalogueUrl fails open to the literal default if the global cannot be read', async () => {
    await expect(runDefaultValue('catalogueUrl', reqWhereGlobalReadFails())).resolves.toBe(
      'https://wear-run.help/catalogue',
    )
  })
  // The global's own catalogueUrl is required and has a schema default, but
  // Payload returns `{}` — not the field-level defaults — when a global has no
  // saved row yet (see globals/operations/findOne.js: `hasDoc` is false and
  // `doc` falls through to `{}`). That is the real state of this global
  // immediately after this migration deploys and before anyone opens Settings
  // → Catalogue defaults, so it has to fail open exactly like a read error.
  it('catalogueUrl fails open to the literal default if the global has never been saved', async () => {
    await expect(runDefaultValue('catalogueUrl', reqWithGlobal({}))).resolves.toBe(
      'https://wear-run.help/catalogue',
    )
  })
  it('catalogueUrl treats an empty string from the global the same as unset', async () => {
    await expect(
      runDefaultValue('catalogueUrl', reqWithGlobal({ catalogueUrl: '' })),
    ).resolves.toBe('https://wear-run.help/catalogue')
  })

  it('retiredMessage reads the global', async () => {
    await expect(
      runDefaultValue(
        'retiredMessage',
        reqWithGlobal({ retiredMessage: 'Custom retired message.' }),
      ),
    ).resolves.toBe('Custom retired message.')
  })
  it('retiredMessage fails open to DEFAULT_RETIRED_MESSAGE if the global cannot be read', async () => {
    await expect(runDefaultValue('retiredMessage', reqWhereGlobalReadFails())).resolves.toBe(
      DEFAULT_RETIRED_MESSAGE,
    )
  })
  it('retiredMessage fails open to DEFAULT_RETIRED_MESSAGE if the global has never been saved', async () => {
    await expect(runDefaultValue('retiredMessage', reqWithGlobal({}))).resolves.toBe(
      DEFAULT_RETIRED_MESSAGE,
    )
  })

  it('customisationIntro reads the global', async () => {
    const value = { root: { type: 'root', children: [], version: 1 } }
    await expect(
      runDefaultValue('customisationIntro', reqWithGlobal({ customisationIntro: value })),
    ).resolves.toBe(value)
  })
  // No prior default existed for this field on Products — it was simply
  // absent, and that has to remain the effective behaviour when the global is
  // unreadable. The fallback cannot literally be undefined/null though:
  // Payload's own DefaultValue function type returns SerializableValue
  // (boolean | number | object | string), which excludes both, so a function
  // returning either would fail `pnpm typecheck`. defaultRichTextValue is
  // richtext-lexical's own exported empty document for exactly this situation
  // — not a hand-rolled guess at Lexical's internal shape.
  it('customisationIntro fails open to an empty Lexical document if the global cannot be read', async () => {
    const result = await runDefaultValue('customisationIntro', reqWhereGlobalReadFails())
    expect(result).toEqual(defaultRichTextValue)
  })
  it('customisationIntro fails open to an empty Lexical document if the global has never been saved', async () => {
    const result = await runDefaultValue('customisationIntro', reqWithGlobal({}))
    expect(result).toEqual(defaultRichTextValue)
  })

  it('customisationSteps reads the global', async () => {
    const steps = [{ number: 1, title: 'Step one', body: 'Body' }]
    await expect(
      runDefaultValue('customisationSteps', reqWithGlobal({ customisationSteps: steps })),
    ).resolves.toBe(steps)
  })
  it('customisationSteps fails open to an empty array if the global cannot be read', async () => {
    await expect(runDefaultValue('customisationSteps', reqWhereGlobalReadFails())).resolves.toEqual(
      [],
    )
  })
  it('customisationSteps fails open to an empty array if the global has never been saved', async () => {
    await expect(runDefaultValue('customisationSteps', reqWithGlobal({}))).resolves.toEqual([])
  })
})

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

  /**
   * Typing `rx-ps` must not be met with an error about capital letters.
   *
   * `isValidProductCode` rejects lowercase on purpose — mixed case would let two
   * codes collide on the unique index while looking different to a person — so
   * without this hook the machine refuses something it could obviously fix
   * itself. The owner reported exactly that.
   *
   * ⚠️ Deliberately NOT the same rule as the slug field's hook two blocks down.
   * That one is create-only and fills a BLANK, never corrects a value, because a
   * colourway slug is printed on physical QR tags. A product code is on neither
   * a tag nor a URL, so normalising it on every write is safe.
   */
  const runProductCodeBeforeValidate = (value: unknown) =>
    fieldNamed('productCode').hooks?.beforeValidate?.[0]?.({ value } as never)

  it('accepts a lowercase product code and stores it in capitals', () => {
    expect(runProductCodeBeforeValidate('rx-ps')).toBe('RX-PS')
    expect(runProductCodeBeforeValidate('  n001  ')).toBe('N001')
    // And what it produced must satisfy the field's OWN validate — the pairing,
    // not the transformation, is what actually has to hold.
    expect(fieldNamed('productCode').validate?.(runProductCodeBeforeValidate('rx-ps'), {})).toBe(
      true,
    )
  })
  it('leaves a non-string product code alone before validation', () => {
    expect(runProductCodeBeforeValidate(null)).toBe(null)
  })

  it('accepts a hyphenated product code', () => {
    expect(fieldNamed('productCode').validate?.('RX-PS', {})).toBe(true)
  })

  /**
   * The slug field stays strict — it is in the URL a printed QR code points at —
   * so its error does the work instead of only naming the rule.
   */
  it('suggests a usable web address word instead of only refusing one', () => {
    const message = fieldNamed('slug').validate?.('X Milo Pro')
    expect(message).toContain('x-milo-pro')
  })
  // ⚠️ THE SUFFIX WAS `COPY` WITH NO HYPHEN UNTIL 2026-08-17, and the comment
  // here explained at length that `-COPY` failed productCode's own validate:
  // the pattern was /^[A-Z][A-Z0-9]*$/, and beforeChange/index.js throws a
  // ValidationError the instant any field's validate returns a string, so a
  // hyphenated suffix would have traded the unique-constraint error this hook
  // exists to fix for a different, equally blocking one.
  //
  // The pattern now accepts a hyphen between groups (the owner asked for codes
  // like RX-PS), so that reasoning expired and the suffix is readable again.
  // The PAIRING is the thing worth keeping, and it is what the test below
  // asserts: it runs the field's REAL validate against the REAL suffix, so a
  // future change to either one that breaks the other fails here rather than on
  // the first duplicate someone tries to save.
  it('the duplicated product code still passes its own validation', () => {
    const duplicated = runDuplicate('productCode', { value: 'N001' })
    expect(fieldNamed('productCode').validate?.(duplicated, {})).toBe(true)
  })

  it('suffixes the slug so the unique index cannot collide', () => {
    expect(runDuplicate('slug', { value: 'n001' })).toBe('n001-copy')
  })
  it('leaves a non-string slug alone', () => {
    // A number, not `undefined` — a field with no hook at all also returns
    // `undefined` here, which would make this pass without the hook existing.
    expect(runDuplicate('slug', { value: 123 })).toBe(123)
  })
  // Unlike productCode, isValidSlug's pattern allows internal hyphens, so
  // `-copy` is fine — but pin it the same way, against the field's own real
  // validate function, so the two suffixes cannot silently drift apart again.
  it('the duplicated slug still passes its own validation', () => {
    const duplicated = runDuplicate('slug', { value: 'n001' })
    expect(fieldNamed('slug').validate?.(duplicated)).toBe(true)
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
