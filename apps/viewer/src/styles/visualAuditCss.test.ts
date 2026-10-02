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

describe('VA-08: the camera views show their state in forced colours', () => {
  // e2e/forced-colors-camera.spec.ts measures the buttons under the browser's own emulation.
  const forced = ['@media (forced-colors: active)']
  const chosen = '.camera-btn[aria-pressed="true"]'

  it('gives every view an edge, in a system colour', () => {
    expect(declared(rules, '.camera-btn', 'border', forced)).toBe('1px solid ButtonText')
  })

  it('fills the chosen view with the system selection pair, also while the pointer is on it', () => {
    // The hover selector is a second one, not a nicety: the page's own hover rule outweighs
    // `chosen` and would take the fill away exactly while the pointer is on the button. It sits
    // under the same pointer gate as that rule (tokens.test.ts requires every :hover to).
    const gate = '@media (hover: hover) and (pointer: fine)'
    const cases = [
      { selector: chosen, within: forced },
      { selector: `${chosen}:hover`, within: [...forced, gate] },
    ]
    for (const { selector, within } of cases) {
      expect(declared(rules, selector, 'background-color', within), selector).toBe('Highlight')
      expect(declared(rules, selector, 'color', within), selector).toBe('HighlightText')
    }
  })

  it('keeps the 3px ring the chosen view already had (CO-09 pins it in a browser)', () => {
    expect(declared(rules, chosen, 'outline', forced)).toBe('3px solid Highlight')
  })

  it('writes only system colours inside any forced-colors block', () => {
    // Author colours are replaced there, so a hex, rgb(), hsl() or var() in these blocks
    // would be a rule that looks like it works and does nothing.
    const colourProperties = [
      'color',
      'background',
      'background-color',
      'border',
      'border-color',
      'outline',
      'outline-color',
    ]
    const offenders = rules
      .filter((rule) => rule.atRules.includes('@media (forced-colors: active)'))
      .flatMap((rule) =>
        colourProperties
          .map((property) => [property, rule.declarations[property]] as const)
          .filter(
            ([, value]) =>
              value !== undefined &&
              /#[0-9a-f]{3,8}\b|\b(?:rgb|hsl|oklch|oklab|color-mix|light-dark)\(|var\(/i.test(
                value,
              ),
          )
          .map(([property, value]) => `${rule.selectors.join(', ')} { ${property}: ${value} }`),
      )
    expect(offenders).toEqual([])
  })
})

describe('VA-18: the garment description keeps a comfortable line length', () => {
  // e2e/description-measure.spec.ts counts the characters on each real line.
  it('is capped at 50ch, in the logical property', () => {
    expect(declared(rules, '.product-info__statement', 'max-inline-size')).toBe('50ch')
  })

  it('has no second, physical cap beside it to fight the first', () => {
    // Both name the same axis in a horizontal script, and the later one wins: a stray
    // `max-width: 60ch` put back would quietly undo the fix.
    expect(declared(rules, '.product-info__statement', 'max-width')).toBeUndefined()
  })
})

describe('VA-56: with scripting off the loading screen is not drawn over the page', () => {
  // e2e/noscript-message.spec.ts hit-tests the message in a real browser with JavaScript off,
  // and holds the loading screen on for a visitor who has it on.
  it('hides the loading screen under scripting: none, and only there', () => {
    expect(
      declared(rules, '.preloader', 'display', ['@media (scripting: none)']),
      'with scripts off nothing ever removes the loading screen, so it must not be drawn',
    ).toBe('none')
    expect(
      declared(rules, '.preloader', 'display'),
      'everyone else still gets the loading screen while the garment loads',
    ).toBe('grid')
  })
})

describe('VA-59: the Performance features are a plain list', () => {
  // e2e/spec-features.spec.ts measures one feature to a line in a real browser.
  it('has no bullets and no indent, so it reads as the same text broken by line', () => {
    expect(declared(rules, '.spec-list__features', 'list-style')).toBe('none')
    expect(declared(rules, '.spec-list__features', 'margin')).toBe('0')
    expect(declared(rules, '.spec-list__features', 'padding')).toBe('0')
  })
})
