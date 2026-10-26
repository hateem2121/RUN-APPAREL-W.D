import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { declared, readRules } from './cssRules'

/**
 * Where the name line over the garment shows (owner, 2026-10-26, site check): on a phone, in
 * the first screen, and nowhere else. A tripwire on the declarations, not a measurement of the
 * layout: `e2e/motion-and-layout.spec.ts` ("the name line over a phone's garment") measures
 * what the visitor gets, and this fails first on a machine with no browsers installed.
 */

const rules = readRules(readFileSync(join(import.meta.dirname, 'page.css'), 'utf8'))
const PHONE = '@media (max-width: 699px) and (min-height: 501px)'

describe('the phone name line', () => {
  it('is hidden by default, so a tablet and a computer, which show the real heading, never get it', () => {
    expect(declared(rules, '.stage-block__title', 'display')).toBe('none')
  })

  it('shows from a phone’s width, and only when the screen is upright-tall (501px and over)', () => {
    // 699px is the widest phone, 700px the narrowest upright tablet, which already has its name
    // on the first screen (polish F11). 501px is the action bar's own line: below it the band is
    // a sideways phone's, with no row to spare.
    expect(declared(rules, '.stage-block__title', 'display', [PHONE])).toBe('flex')
  })

  it('is set in the page’s own label type, from tokens and not from literals', () => {
    const within = [PHONE]
    expect(declared(rules, '.stage-block__title', 'font-family', within)).toBe('var(--font-mono)')
    expect(declared(rules, '.stage-block__title', 'font-size', within)).toBe('var(--text-mono-lg)')
    expect(declared(rules, '.stage-block__title', 'letter-spacing', within)).toBe(
      'var(--tracking-caps)',
    )
    expect(declared(rules, '.stage-block__title', 'text-transform', within)).toBe('uppercase')
  })

  it('is off the printed sheet', () => {
    // A narrow sheet could match the phone query; the print block's list hides it for good.
    expect(declared(rules, '.stage-block__title', 'display', ['@media print'])).toBe(
      'none !important',
    )
  })
})
