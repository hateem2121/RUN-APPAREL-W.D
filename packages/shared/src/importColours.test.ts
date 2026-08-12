import { describe, expect, it } from 'vitest'
import { type FileColour, buildImportedRow, unmappedFileColours } from './importColours'

/**
 * The rules here are not style preferences. A colourway `slug` is printed on a
 * physical QR tag and cannot be recalled, and the FIRST switched-on row decides
 * what a bare /n001 link resolves to. An automated action that touched either
 * would silently repoint printed tags at the wrong garment — whether that
 * action is the owner's own "Add the ticked colours" button or the shrink
 * robot's `planColourImport` (apps/shrink/src/colourImport.ts), which reuses
 * `buildImportedRow` rather than re-implementing it for exactly this reason.
 *
 * So: append only, never rewrite, never reorder, and everything arrives switched
 * off until a human turns it on.
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

describe('unmappedFileColours', () => {
  it('lists colours in the file that no row points at', () => {
    // N001 exactly: five in the file, three mapped, two invisible to buyers.
    const file = [
      colour({ variantId: 'Colorway 2' }),
      colour({ variantId: 'Colorway 3' }),
      colour({ variantId: 'Colorway 4' }),
      colour({ variantId: 'Colorway 5' }),
      colour({ variantId: 'Colorway 6' }),
    ]
    const rows = [
      { variantId: 'Colorway 2' },
      { variantId: 'Colorway 3' },
      { variantId: 'Colorway 4' },
    ]

    expect(unmappedFileColours(file, rows).map((c) => c.variantId)).toEqual([
      'Colorway 5',
      'Colorway 6',
    ])
  })

  it('ignores blank and whitespace mappings', () => {
    const file = [colour({ variantId: 'Colorway 2' })]
    expect(unmappedFileColours(file, [{ variantId: '  ' }, { variantId: undefined }])).toHaveLength(
      1,
    )
  })

  it('is empty when everything is already mapped', () => {
    expect(unmappedFileColours([colour()], [{ variantId: 'Colorway 5' }])).toEqual([])
  })

  it('copes with a product that has no colours yet', () => {
    expect(unmappedFileColours([colour()], [])).toHaveLength(1)
  })
})

describe('buildImportedRow', () => {
  it('arrives switched OFF, so nothing reaches the live page unattended', () => {
    expect(buildImportedRow(colour(), []).active).toBe(false)
  })

  it('carries the suggested name, slug and swatch', () => {
    expect(buildImportedRow(colour(), [])).toMatchObject({
      displayName: 'Forest Green',
      slug: 'forest-green',
      hexSwatch: '#004D24',
      variantId: 'Colorway 5',
    })
  })

  it('never reuses a slug that already exists — QR tags are printed', () => {
    const row = buildImportedRow(colour(), [{ slug: 'forest-green' }])
    expect(row.slug).not.toBe('forest-green')
    expect(row.slug).toMatch(/^forest-green-\d+$/)
  })

  it('keeps stepping until the slug is genuinely free', () => {
    const row = buildImportedRow(colour(), [
      { slug: 'forest-green' },
      { slug: 'forest-green-2' },
      { slug: 'forest-green-3' },
    ])
    expect(row.slug).toBe('forest-green-4')
  })

  it('leaves the name blank rather than guessing when the match was poor', () => {
    // A confident wrong name is how "Navy" ended up on a maroon garment. An
    // empty box the owner must fill is the safer failure.
    const row = buildImportedRow(colour({ confidence: 'low', name: 'Lime', slug: 'lime' }), [])
    expect(row.displayName).toBe('')
    expect(row.slug).toBe('')
    // The swatch still comes through — it is measured, not guessed.
    expect(row.hexSwatch).toBe('#004D24')
  })
})
