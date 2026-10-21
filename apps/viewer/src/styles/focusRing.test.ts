import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * The shared keyboard-focus rule (packages/ui audit, 2026-10-21), read as text. An outline
 * already follows the element's own corners (MDN, outline), so a `border-radius` in this rule
 * never shaped the ring: it reshaped the FOCUSED ELEMENT. Until 2026-10-21 it held a 6px
 * `--radius-chip`, and a filled box with no radius of its own (the skip link) took rounded
 * corners only while focused. The rendered check is the website's e2e/focusRing.spec.ts, which
 * compares every focusable element's corners at rest and in focus.
 */

const REPO = join(import.meta.dirname, '..', '..', '..', '..')
const stripComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, ' '))

const BASE = stripComments(readFileSync(join(REPO, 'packages/ui/src/base.css'), 'utf8'))

/** Every rule whose selector list is exactly the bare `:focus-visible`, as its declaration blocks. */
function sharedFocusRules(css: string): string[] {
  return [...css.matchAll(/(?:^|\})\s*:focus-visible\s*\{([^}]*)\}/g)].map((m) => m[1] ?? '')
}

/** The property names a declaration block sets. */
const properties = (block: string) =>
  block
    .split(';')
    .map((d) => d.split(':')[0]?.trim() ?? '')
    .filter(Boolean)

describe('the shared :focus-visible rule', () => {
  const rules = sharedFocusRules(BASE)

  it('exists once in base.css', () => {
    expect(rules).toHaveLength(1)
  })

  it('draws the 2px solid ring at a 2px offset', () => {
    const block = rules[0] ?? ''
    expect(block).toMatch(/outline:\s*2px solid var\(--focus-ring\);/)
    expect(block).toMatch(/outline-offset:\s*2px;/)
  })

  it('sets no radius, so the ring takes each element its own corners', () => {
    const radii = properties(rules[0] ?? '').filter((p) => /radius/.test(p))
    expect(radii).toEqual([])
  })

  // Negative control: the check above must see the line that shipped until 2026-10-21.
  it('would catch the radius line coming back', () => {
    const planted = BASE.replace(
      /(:focus-visible\s*\{)/,
      '$1\n  border-radius: var(--radius-chip);',
    )
    const radii = properties(sharedFocusRules(planted)[0] ?? '').filter((p) => /radius/.test(p))
    expect(radii).toContain('border-radius')
  })
})
