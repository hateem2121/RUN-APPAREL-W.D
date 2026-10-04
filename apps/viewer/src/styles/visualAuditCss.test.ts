import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { TWO_COLUMN_QUERY } from '../lib/useIdentityInAside'
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

describe('VA-54: the phone bar steps aside for the page’s own Email and WhatsApp', () => {
  // e2e/action-bar-steps-aside.spec.ts measures it in a real browser; lib/actionBarStepsAside.test.ts
  // holds when the attribute is set.
  const tucked = '.action-bar[data-tucked]:not(:focus-within)'

  it('fades out and leaves the Tab order and the accessibility tree, unless focus is inside it', () => {
    // The `:not(:focus-within)` is in the selector itself, so finding the rule proves the
    // exemption: a bar a keyboard visitor is standing on must not vanish under them.
    expect(declared(rules, tucked, 'opacity')).toBe('0')
    expect(declared(rules, tucked, 'visibility')).toBe('hidden')
  })

  it('fades over --fast; visibility flips after the fade going out and at once coming back', () => {
    // Going out the bar uses the tucked list: `visibility` has the fade's own duration, so it stays
    // `visible` until the fade ends. Coming back it uses the base list, which names opacity only,
    // so `visibility` is `visible` at once. No raw duration anywhere: tokens.test.ts forbids one.
    expect(declared(rules, '.action-bar', 'transition')).toBe('opacity var(--fast) var(--ease)')
    expect(declared(rules, tucked, 'transition')).toBe(
      'opacity var(--fast) var(--ease), visibility var(--fast) linear',
    )
  })

  it('leaves the cookie card’s own step-aside instant, and the bar hands over where the aside’s buttons appear', () => {
    // A `visibility` in the base transition would have delayed this one by the fade.
    expect(declared(rules, ':root:has(.consent) .action-bar', 'visibility')).toBe('hidden')
    expect(declared(rules, ':root:has(.consent) .action-bar', 'transition')).toBeUndefined()
    // viewer-layout.md: `.contact-rail` and `.action-bar` breakpoints must stay equal. Since polish
    // F11 (2026-10-04) the hand-over is the two-column query itself, imported rather than copied,
    // so the bar and the aside's `.stage__contact` cannot drift apart: an upright tablet of 900px
    // and up is one column, and the old `min-width: 900px` would have left it with neither.
    expect(declared(rules, '.action-bar', 'display', [`@media ${TWO_COLUMN_QUERY}`])).toBe('none')
    expect(declared(rules, '.stage__contact', 'display', [`@media ${TWO_COLUMN_QUERY}`])).toBe(
      'flex',
    )
    expect(declared(rules, '.action-bar', 'display', ['@media (min-width: 900px)'])).toBeUndefined()
    expect(declared(rules, '.action-bar', 'display', ['@media (max-height: 500px)'])).toBe('none')
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

describe('VA-59 and D10: each group of facts is a list drawn by its own bullets', () => {
  // e2e/spec-features.spec.ts measures one feature to a line in a real browser.
  it('has no browser bullets and no indent: the lime ring is the bullet', () => {
    expect(declared(rules, '.spec-group__items', 'list-style')).toBe('none')
    expect(declared(rules, '.spec-group__items', 'margin')).toBe('0')
    expect(declared(rules, '.spec-group__items', 'padding')).toBe('0')
  })
})
