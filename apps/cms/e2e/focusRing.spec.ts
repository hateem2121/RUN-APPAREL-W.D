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
      const result = await page.evaluate(async (selector) => {
        // ⚠️ READ THE CORNERS TWO FRAMES AFTER focus(), NOT AT ONCE (2026-10-21). Read in the
        // same task, Chromium reported the skip link's focused radius as its resting 0px while
        // it already matched :focus-visible and still held focus; two frames later it reported
        // the 6px the old rule gave it. So the first version of this test missed the skip link,
        // the plain links and the form fields, and caught only the footer tab. Firefox did the
        // same intermittently after ONE frame (2 of 5 runs) and never after two (10 of 10).
        // A wait that gets no frames within 2s is counted, not trusted: a stale read is the
        // resting value, which would pass silently. One combined run timed out in Chromium on
        // `/` and `/contact` and did not recur in four reruns; this turns that into a named
        // failure instead of a 30-second hang.
        let unsettled = 0
        const settle = () =>
          new Promise<void>((resolve) => {
            const giveUp = setTimeout(() => {
              unsettled++
              resolve()
            }, 2000)
            requestAnimationFrame(() =>
              requestAnimationFrame(() => {
                clearTimeout(giveUp)
                resolve()
              }),
            )
          })
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
          await settle()
          const focused = corners(el)
          if (focused !== rest) {
            const name = el.tagName.toLowerCase() + [...el.classList].map((c) => `.${c}`).join('')
            moved.push(`${name}: ${rest} -> ${focused}`)
          }
          el.blur()
        }
        return { moved, checked, notVisible, unsettled }
      }, FOCUSABLE)

      // The check applied: elements were focused, and focused in keyboard modality.
      expect(result.checked, 'no element took focus').toBeGreaterThan(5)
      expect(result.notVisible, 'focus was not :focus-visible, so the rule never applied').toBe(0)
      expect(
        result.unsettled,
        'the page drew no frames after a focus, so a read could be stale',
      ).toBe(0)
      expect(result.moved).toEqual([])
    })
  }
})

test.describe("links keep their rounded ring (owner, 2026-10-21), and it rounds no link's box", () => {
  for (const [path, selector] of [
    ['/', 'footer li > a'],
    ['/', '.notch .nav-link'],
    ['/policies/workplace-conduct', 'nav.crumbs > a'],
    ['/faq/orders-and-samples', 'details summary'],
  ] as const) {
    test(`${path}: a focused ${selector} has 6px corners`, async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await page.goto(path)
      await page.keyboard.press('Shift')
      const link = page.locator(selector).first()
      await link.evaluate((el) => (el as HTMLElement).focus({ preventScroll: true }))
      await expect(link).toHaveCSS('border-top-left-radius', '6px')
      await expect(link).toHaveCSS('border-bottom-right-radius', '6px')
    })
  }

  // The rounding is set at rest, so it must stay invisible at rest: removing the rule from the
  // page must leave every link or toggle that paints a box (a fill, a border, a divider line)
  // exactly as it was. Measured 2026-10-21: the two FAQ lists' divider lines and the footer tab's
  // foot failed this until they stated their own corners. An element clipped to 1px at rest
  // (the skip link) shows no corners to anyone until it is focused, so it is not checked here;
  // its focused corners are the keyboard test's business.
  for (const path of ['/', '/products', '/contact', '/faq', '/faq/orders-and-samples']) {
    test(`${path}: the rounding rule changes no painted link`, async ({ page }) => {
      await page.goto(path)
      const result = await page.evaluate(() => {
        const painted = [...document.querySelectorAll<HTMLElement>('a, summary')].filter((el) => {
          const c = getComputedStyle(el)
          const box = el.getBoundingClientRect()
          if (box.width <= 1 || box.height <= 1) return false
          return (
            c.backgroundColor !== 'rgba(0, 0, 0, 0)' ||
            c.backgroundImage !== 'none' ||
            c.boxShadow !== 'none' ||
            ['Top', 'Right', 'Bottom', 'Left'].some(
              (side) =>
                Number.parseFloat(c.getPropertyValue(`border-${side.toLowerCase()}-width`)) > 0,
            )
          )
        })
        const corners = (el: Element) => {
          const c = getComputedStyle(el)
          return `${c.borderTopLeftRadius} ${c.borderTopRightRadius} ${c.borderBottomRightRadius} ${c.borderBottomLeftRadius}`
        }
        const before = painted.map(corners)
        let removed = 0
        for (const sheet of document.styleSheets) {
          let rules: CSSRuleList
          try {
            rules = sheet.cssRules
          } catch {
            continue
          }
          for (let i = rules.length - 1; i >= 0; i--) {
            const rule = rules[i]
            if (
              rule instanceof CSSStyleRule &&
              /^:where\(a,\s*summary\)$/.test(rule.selectorText)
            ) {
              sheet.deleteRule(i)
              removed++
            }
          }
        }
        const changed = painted
          .map((el, i) => ({ el, was: before[i], now: corners(el) }))
          .filter((row) => row.was !== row.now)
          .map(
            (row) =>
              `${row.el.tagName.toLowerCase()}.${[...row.el.classList].join('.')}: ${row.was} (without the rule ${row.now})`,
          )
        return { removed, painted: painted.length, changed }
      })
      // The control applied: the rule was found and taken out.
      expect(
        result.removed,
        'the :where(a, summary) rule was not found on the page',
      ).toBeGreaterThan(0)
      expect(result.changed).toEqual([])
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

  // The footer's status dot is a filled circle. Forced colours repainted its fill in the page's
  // own colour, so it vanished in both themes (2026-10-21); it must take the text's colour.
  // The line exists only once the owner has set opening hours, and only in the browser
  // (FooterClock.tsx); the seeded site has no hours, because those claims carry no defaults. So
  // the test adds the element FooterClock draws to the footer and measures the stylesheet on it.
  for (const state of ['open', 'closed']) {
    test(`the footer's status dot, ${state}, is drawn in the text's colour`, async ({ page }) => {
      const paint = await page.evaluate((state) => {
        const footer = document.querySelector('.site-footer')
        if (!footer) return null
        const status = document.createElement('span')
        status.className = 'footer-status'
        status.dataset.state = state
        status.textContent = state === 'open' ? 'Open now' : 'Opens Mon 08:00'
        footer.append(status)
        return {
          dot: getComputedStyle(status, '::before').backgroundColor,
          width: getComputedStyle(status, '::before').width,
          text: getComputedStyle(document.body).color,
        }
      }, state)
      expect(paint, 'no .site-footer to hold the status line').not.toBeNull()
      // The setup applied: the footer's own rules drew the 7px dot.
      expect(paint?.width).toBe('7px')
      expect(paint?.dot).toBe(paint?.text)
    })
  }
})
