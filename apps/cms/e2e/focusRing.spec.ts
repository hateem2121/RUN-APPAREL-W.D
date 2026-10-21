import { expect, type Page, test } from './offlineMedia'

/**
 * Keyboard focus and forced colours on the shared component layer (packages/ui audit,
 * 2026-10-21).
 *
 * 1. FOCUS NEVER RESHAPES AN ELEMENT. The shared `:focus-visible` rule set a 6px radius until
 *    2026-10-21. An outline already follows the element's own corners, so that line shaped the
 *    focused ELEMENT: any element without a radius of its own, the skip link's ink box included,
 *    turned 6px-cornered only while focused. Here every focusable element on three pages is
 *    focused in keyboard modality, and its four corners must match its corners at rest.
 *    Unit twin: apps/viewer/src/styles/focusRing.test.ts.
 * 2. FORCED COLOURS KEEP AN EDGE. Windows High Contrast replaces backgrounds and sets
 *    `box-shadow` to none (MDN, forced-colors), so the light label chip lost its volt block and
 *    the menu bar and cookie card their shadow. Each must keep a solid border there.
 */

const PAGES = ['/', '/products', '/contact']
const FOCUSABLE =
  'a[href], button, input, select, textarea, summary, [tabindex]:not([tabindex="-1"])'

/** Playwright sets navigator.webdriver, and the cookie question honours it (consent.spec.ts). */
const liftAutomationGate = (page: Page) =>
  page.context().addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false })
  })

test.describe('keyboard focus keeps each element its own corners', () => {
  for (const path of PAGES) {
    test(`${path}: no element changes shape when it takes focus`, async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await page.goto(path)
      // A key press puts the page in keyboard modality, so a scripted focus() matches
      // :focus-visible in Chromium and Firefox alike, and every element can be reached
      // rather than only those a Tab walk reaches before it loops.
      await page.keyboard.press('Shift')
      const result = await page.evaluate((selector) => {
        const corners = (el: Element) => {
          const c = getComputedStyle(el)
          return [
            c.borderTopLeftRadius,
            c.borderTopRightRadius,
            c.borderBottomRightRadius,
            c.borderBottomLeftRadius,
          ].join(' ')
        }
        const moved: string[] = []
        let checked = 0
        let notVisible = 0
        for (const el of document.querySelectorAll<HTMLElement>(selector)) {
          if (!el.getClientRects().length || el.closest('[inert]')) continue
          const rest = corners(el)
          el.focus({ preventScroll: true })
          if (document.activeElement !== el) continue
          if (!el.matches(':focus-visible')) notVisible++
          checked++
          const focused = corners(el)
          if (focused !== rest) {
            const name = el.tagName.toLowerCase() + [...el.classList].map((c) => `.${c}`).join('')
            moved.push(`${name}: ${rest} -> ${focused}`)
          }
          el.blur()
        }
        return { moved, checked, notVisible }
      }, FOCUSABLE)

      // The check applied: elements were focused, and focused in keyboard modality.
      expect(result.checked, 'no element took focus').toBeGreaterThan(5)
      expect(result.notVisible, 'focus was not :focus-visible, so the rule never applied').toBe(0)
      expect(result.moved).toEqual([])
    })
  }
})

test.describe('forced colours: surfaces whose edge is a fill or a shadow keep a border', () => {
  test.beforeEach(async ({ page, browserName }) => {
    await page.emulateMedia({
      forcedColors: 'active',
      colorScheme: 'light',
      reducedMotion: 'reduce',
    })
    await page.setViewportSize({ width: 1280, height: 900 })
    await liftAutomationGate(page)
    await page.goto('/')
    const active = await page.evaluate(() => window.matchMedia('(forced-colors: active)').matches)
    test.skip(!active, `${browserName} does not emulate forced-colors`)
  })

  for (const [name, selector] of [
    ['the label chip', '.label'],
    ['the menu bar', '.notch'],
    ['the cookie card', '.consent__card'],
  ] as const) {
    test(`${name} has a solid border and no shadow to rely on`, async ({ page }) => {
      const element = page.locator(selector).first()
      await expect(element).toBeVisible()
      const edge = await element.evaluate((el) => {
        const c = getComputedStyle(el)
        return {
          width: Number.parseFloat(c.borderTopWidth),
          style: c.borderTopStyle,
          colour: c.borderTopColor,
          shadow: c.boxShadow,
        }
      })
      // Forced colours removed the shadow, so the border is the only edge left.
      expect(edge.shadow).toBe('none')
      expect(edge.style).toBe('solid')
      expect(edge.width).toBeGreaterThanOrEqual(1)
      expect(edge.colour).not.toMatch(/rgba\(.*,\s*0\)$|transparent/)
    })
  }
})
