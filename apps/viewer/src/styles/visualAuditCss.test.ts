import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { declared, readRules } from './cssRules'

/**
 * Declarations the visual audit of 2026-10-02 fixed in `page.css`, held where a unit run can
 * see them. These are TRIPWIRES, not measurements: a stylesheet read cannot see a layout. The
 * browser specs named in each block are what measure the visitor's result; this file is what
 * fails first, on a machine with no browsers installed, when a declaration is deleted or a
 * "tidy-up" moves it.
 */

const rules = readRules(readFileSync(join(import.meta.dirname, 'page.css'), 'utf8'))

describe('VA-07: the gesture hint is as wide as its own text', () => {
  // e2e/gesture-hint.spec.ts measures the text against the pill in a real browser.
  it('sizes itself to its content, not to the room `left: 50%` leaves it', () => {
    expect(declared(rules, '.stage__hint', 'width')).toBe('max-content')
  })

  it('is still centred at the bottom of the stage — that position is the owner’s decision', () => {
    expect(declared(rules, '.stage__hint', 'left')).toBe('50%')
    expect(declared(rules, '.stage__hint', 'transform')).toBe('translateX(-50%)')
    expect(declared(rules, '.stage__hint', 'bottom')).toBe('10px')
  })
})
