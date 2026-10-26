import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { declared, readRules } from './cssRules'

/**
 * The №02 steps on a wide screen (owner, 2026-10-26, site check). One column of four steps used
 * only the left ~60% of its 1,104px card at 1440px wide: each step's words stop at the paragraph
 * measure (60ch), and the rest of the card was empty. From the garment page's two-column seam the
 * four lie in two columns, no word changed. A tripwire on the declarations, not a measurement:
 * `e2e/motion-and-layout.spec.ts` ("the №02 steps lie in two columns") measures the result.
 */

const rules = readRules(readFileSync(join(import.meta.dirname, 'page.css'), 'utf8'))
const WIDE = ['@media (min-width: 900px)']

describe('the №02 steps in two columns on a wide screen', () => {
  it('is one column by default, which is what a phone gets', () => {
    expect(declared(rules, '.steps', 'grid-template-columns')).toBeUndefined()
  })

  it('is two equal columns from the 900px seam, able to shrink below their words', () => {
    // minmax(0, 1fr), not 1fr: a column's minimum is its content's, and a long word would widen it.
    expect(declared(rules, '.steps', 'grid-template-columns', WIDE)).toBe(
      'repeat(2, minmax(0, 1fr))',
    )
  })

  it('draws the dividers for two columns: a rule between them and one under the first row', () => {
    // The one-column rule gives every step but the first a dashed top edge, which would hang
    // step 2 from the card's top edge, beside step 1.
    expect(declared(rules, '.step + .step', 'border-top')).toBe('1px dashed var(--line)')
    expect(declared(rules, '.step:nth-child(2)', 'border-top', WIDE)).toBe('0')
    expect(declared(rules, '.step:nth-child(even)', 'border-left', WIDE)).toBe(
      '1px dashed var(--line)',
    )
  })

  it('lets a last step that has no partner take the whole row, so no empty cell is left', () => {
    expect(declared(rules, '.step:last-child:nth-child(odd)', 'grid-column', WIDE)).toBe('1 / -1')
  })
})
