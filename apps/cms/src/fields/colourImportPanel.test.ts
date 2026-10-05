import { describe, expect, it } from 'vitest'
import {
  fileColourLabel,
  formCategory,
  missingFileColours,
  rowsToAdd,
  toSubFieldState,
} from './colourImportPanel'

/**
 * The "We found colours in your file that are not on your website yet" panel.
 *
 * MEASURED 2026-09-30 on the live R-AJM (product 68): the panel listed all five of its file's
 * colours as missing, while the saved product's five rows point at exactly those colours
 * (read back from /api/products/68?depth=0). The panel read `colourways` with `useField`,
 * whose value for an array field is the ROW COUNT — Payload 3.90.2's own useField treats a
 * field with rows as `typeof value === 'number'`. The same mistake was fixed in
 * ReadinessPanel by commit 2a7ff20a; this panel was never moved over.
 *
 * The fixtures below are therefore Payload's FLATTENED form state, the shape production
 * really hands the panel — not a tidy array of rows, which is what let the bug pass.
 */

const FILE_COLOURS = [
  {
    variantId: 'Colorway 2',
    hex: '#1B6C53',
    name: 'Bottle Green',
    slug: 'bottle-green',
    confidence: 'high',
  },
  {
    variantId: 'Colorway 3',
    hex: '#D37779',
    name: 'Terracotta',
    slug: 'terracotta',
    confidence: 'high',
  },
  { variantId: 'Colorway 4', hex: '#F18554', name: 'Coral', slug: 'coral', confidence: 'high' },
]

/** R-AJM's form state as Payload holds it: a count on `colourways`, one entry per cell. */
function formState(rows: Array<{ variantId: string; slug: string }>) {
  const state: Record<string, { value?: unknown }> = {
    fileColourDetails: { value: FILE_COLOURS },
    colourways: { value: rows.length },
  }
  rows.forEach((row, index) => {
    state[`colourways.${index}.id`] = { value: `row-${index}` }
    state[`colourways.${index}.variantId`] = { value: row.variantId }
    state[`colourways.${index}.slug`] = { value: row.slug }
  })
  return state
}

describe('missingFileColours — which file colours no row points at yet', () => {
  it('finds nothing missing when every file colour already has a row (the live R-AJM case)', () => {
    const state = formState([
      { variantId: 'Colorway 2', slug: 'bottle-green' },
      { variantId: 'Colorway 3', slug: 'terracotta' },
      { variantId: 'Colorway 4', slug: 'coral' },
    ])
    // The shape that fooled the old panel: this is a number, not the rows.
    expect(state.colourways?.value).toBe(3)
    expect(missingFileColours(state)).toEqual([])
  })

  it('lists only the file colours with no row', () => {
    const state = formState([{ variantId: 'Colorway 3', slug: 'terracotta' }])
    expect(missingFileColours(state).map((colour) => colour.variantId)).toEqual([
      'Colorway 2',
      'Colorway 4',
    ])
  })

  it('lists every file colour on a product with no rows yet', () => {
    expect(missingFileColours(formState([]))).toHaveLength(3)
  })
})

describe('rowsToAdd — the rows appended for the ticked colours', () => {
  it('never reuses a slug already on the product, nor one it has just given out', () => {
    const existing = [{ variantId: 'Colorway 9', slug: 'bottle-green' }]
    const chosen = [FILE_COLOURS[0], { ...FILE_COLOURS[1], slug: 'bottle-green' }]
    const rows = rowsToAdd(chosen as never, existing)
    expect(rows.map((row) => row.slug)).toEqual(['bottle-green-2', 'bottle-green-3'])
    expect(rows.every((row) => row.active === false)).toBe(true)
  })
})

describe("the product's category names the colours (polish N2)", () => {
  // R-AJM is Teamwear & Uniforms, whose style uses sport words (packages/shared/src/colourNames.ts).
  it('adds each ticked colour under its category name, keeping the measured slug', () => {
    const rows = rowsToAdd(FILE_COLOURS as never, [], 'Teamwear & Uniforms')
    expect(rows.map((row) => [row.displayName, row.slug])).toEqual([
      ['Grass Court', 'bottle-green'],
      ['Clay Court', 'terracotta'],
      ['Rally', 'coral'],
    ])
  })

  it('shows the owner the same name the row will get, before it is added', () => {
    expect(fileColourLabel(FILE_COLOURS[0] as never, 'Teamwear & Uniforms')).toBe('Grass Court')
    expect(fileColourLabel(FILE_COLOURS[0] as never, undefined)).toBe('Bottle Green')
    expect(
      fileColourLabel({ ...FILE_COLOURS[0], confidence: 'low' } as never, 'Teamwear & Uniforms'),
    ).toBe('Colour needs a name')
  })

  it('reads the category the form holds right now, unsaved changes included', () => {
    expect(formCategory({ ...formState([]), category: { value: 'Outerwear' } })).toBe('Outerwear')
    expect(formCategory(formState([]))).toBeUndefined()
    expect(formCategory(undefined)).toBeUndefined()
  })
})

describe('toSubFieldState — one new row in the shape Payload’s ADD_ROW expects', () => {
  it('gives each field its value as both value and initialValue, and marks it valid', () => {
    const [row] = rowsToAdd([FILE_COLOURS[0]] as never, [])
    expect(toSubFieldState(row as never)).toEqual({
      displayName: { initialValue: 'Bottle Green', valid: true, value: 'Bottle Green' },
      slug: { initialValue: 'bottle-green', valid: true, value: 'bottle-green' },
      hexSwatch: { initialValue: '#1B6C53', valid: true, value: '#1B6C53' },
      variantId: { initialValue: 'Colorway 2', valid: true, value: 'Colorway 2' },
      active: { initialValue: false, valid: true, value: false },
    })
  })
})
