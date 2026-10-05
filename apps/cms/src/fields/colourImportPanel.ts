import {
  buildImportedRow,
  type ExistingRow,
  type FileColour,
  type ImportedRow,
  themedColourName,
  toFileColours,
  unmappedFileColours,
} from '@run-apparel/shared'

import { rowsFromFormState } from './formStateRows'

/**
 * The pure half of ImportColoursFromFile.tsx, split out so it can be tested against the form
 * state Payload REALLY holds (colourImportPanel.test.ts).
 *
 * ⚠️ The rows come from `rowsFromFormState`, never from the `colourways` field's own value.
 * For an array field that value is the ROW COUNT (Payload 3.90.2 useField: a field with rows
 * is `typeof value === 'number'`). Until 2026-09-30 the panel read it as the rows, saw none,
 * and told the owner every colour in the file was "not on your website yet", on every product.
 */

type FormFields = Record<string, { value?: unknown } | undefined> | undefined

/** File colours that no colour row points at yet. */
export function missingFileColours(fields: FormFields): FileColour[] {
  const existing = rowsFromFormState(fields, 'colourways') as ExistingRow[]
  return unmappedFileColours(toFileColours(fields?.fileColourDetails?.value), existing)
}

/**
 * The product's category as the form holds it now, so a category chosen but not yet saved
 * already names the colours (polish N2: packages/shared/src/colourNames.ts).
 */
export function formCategory(fields: FormFields): string | undefined {
  const value = fields?.category?.value
  return typeof value === 'string' && value !== '' ? value : undefined
}

/**
 * What the panel calls a file colour: the very name the row will be given, in the category's
 * style. A low-confidence match shows its swatch and says so, rather than offering a name:
 * suggesting one confidently is exactly how a maroon garment came to be called Navy.
 */
export function fileColourLabel(colour: FileColour, category: string | undefined): string {
  return colour.confidence === 'high'
    ? themedColourName(colour.name, category)
    : 'Colour needs a name'
}

/**
 * One new row per ticked colour, each checked against the rows already there AND the ones
 * given out just before it, so two imports can never share a slug (slugs are printed on QR
 * tags). Every row arrives switched off: buildImportedRow sets `active: false`. The name is in
 * the product category's style; the slug stays the namer's measured word (buildImportedRow).
 */
export function rowsToAdd(
  chosen: FileColour[],
  existing: ExistingRow[],
  category?: string,
): ImportedRow[] {
  const taken: ExistingRow[] = [...existing]
  return chosen.map((colour) => {
    const row = buildImportedRow(colour, taken, category)
    taken.push(row)
    return row
  })
}

/**
 * A row as the `subFieldState` of Payload's ADD_ROW action: keyed by the row's own field names
 * (Payload adds the `colourways.N.` prefix), each with its value as value AND initialValue.
 * That action is how Payload's own "Add Colour" button adds a row (fields/Array → addFieldRow).
 */
export function toSubFieldState(row: ImportedRow) {
  return Object.fromEntries(
    Object.entries(row).map(([name, value]) => [name, { initialValue: value, valid: true, value }]),
  )
}
