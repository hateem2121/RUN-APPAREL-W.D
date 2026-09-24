import { expect, test } from '@playwright/test'
import { SITE_MENU_ID, SITE_MENU_NAME, SITE_NAV_LABEL } from '../../../packages/shared/src/siteBar'
import { contrastOf, parseCssColour, relativeLuminance } from '../../../scripts/contrast-rules.mjs'

const MENU = `#${SITE_MENU_ID}`
const OPEN = `${MENU}:popover-open`

/**
 * The notch — every case here is a defect this audit found and fixed.
 *
 * These belong in a browser and nowhere else. The source-text gates in
 * `src/publicSite.test.ts` can assert that a rule EXISTS; only a rendered page can say
 * whether it applies, and three of the five defects below looked perfectly correct in
 * the source at the moment they were broken.
 */

const PHONE_WIDTHS = [320, 360, 375, 390, 414, 430]

test.describe('navigation without JavaScript', () => {
  test.use({ javaScriptEnabled: false })

  for (const [path, width] of [
    ['/', 320],
    ['/', 390],
    ['/definitely-not-a-page', 390],
  ] as const) {
    test(`the phone menu opens and both links navigate with scripting off: ${path} at ${width}px`, async ({
      page,
    }) => {
      /*
       * ⚠️ THE DEFECT THIS GUARDS. The menu deleted on 2026-09-05 kept its open state in
       * React: with scripting disabled at 390px, 0 of 2 links were reachable, and the same
       * for the second or two before the bundle lands. The owner asked for a menu again on
       * 2026-09-11, on condition it works without JavaScript; this one is the browser's own
       * popover, declared in the server's HTML (measured three engines, 2026-09-23).
       */
      await page.setViewportSize({ width, height: 800 })
      await page.goto(path)
      const links = page.locator(`${MENU} a`)
      await expect(links).toHaveCount(2)
      // ⚠️ BUG 1, DESIGNED OUT: an author `display` beat the browser's hide rule, so the "closed"
      // menu showed its links. Closed must really be closed.
      await expect(page.locator(OPEN)).toHaveCount(0)
      for (let index = 0; index < 2; index++) await expect(links.nth(index)).toBeHidden()

      const button = page.getByRole('button', { name: SITE_MENU_NAME, exact: true })
      await expect(button).toBeVisible()
      await button.click()
      await expect(page.locator(OPEN)).toHaveCount(1)
      for (let index = 0; index < 2; index++) await expect(links.nth(index)).toBeVisible()
      // and they must actually navigate, not merely be painted
      await links.first().click()
      await expect(page).toHaveURL(/\/products$/)
    })
  }

  test('at 1280px both links sit in the bar and there is no button, with scripting off', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/')
    const links = page.locator(`${MENU} a`)
    await expect(links).toHaveCount(2)
    for (let index = 0; index < 2; index++) await expect(links.nth(index)).toBeVisible()
    await expect(page.locator('.notch__menu-btn')).toBeHidden()
    await links.first().click()
    await expect(page).toHaveURL(/\/products$/)
  })
})

test.describe('the phone menu before the page hydrates', () => {
  test('opens and navigates with scripting on and the app bundle refused', async ({ page }) => {
    // Scripting ON, every Next chunk refused: a slow connection before hydration, which is
    // exactly when the 2026-09-05 menu failed.
    const refused: string[] = []
    page.on('requestfailed', (request) => {
      if (/\/_next\/static\/chunks\/.+\.js(\?|$)/.test(request.url())) refused.push(request.url())
    })
    // Scripts only: the stylesheet still loads, so the page measured is the styled one.
    await page.route(/\/_next\/static\/chunks\/.+\.js(\?|$)/, (route) => route.abort())
    await page.setViewportSize({ width: 390, height: 800 })
    await page.goto('/')
    await page.getByRole('button', { name: SITE_MENU_NAME, exact: true }).click()
    await expect(page.locator(OPEN)).toHaveCount(1)
    expect(
      refused.length,
      'no chunk was refused, so this measured a hydrated page',
    ).toBeGreaterThan(0)
    await page.locator(`${MENU} a`).first().click()
    await expect(page).toHaveURL(/\/products$/)
  })
})

test.describe('the open phone menu', () => {
  for (const width of [320, 390]) {
    test(`keeps a 12px gutter on BOTH sides and meets the bar at ${width}px`, async ({ page }) => {
      /*
       * ⚠️ BUG 2, DESIGNED OUT. The browser styles [popover] `width: fit-content`, so two insets
       * alone left the panel 153-157px wide in all three engines (measured 2026-09-23), and
       * the old rule's `calc(100vw - 24px)` sat flush against the right edge. `width: auto`
       * restores the two-inset stretch.
       */
      await page.setViewportSize({ width, height: 800 })
      await page.goto('/')
      // At rest, and after the scroll condense has made the bar up to 8px shorter (Chromium
      // and WebKit; Firefox keeps the resting bar).
      for (const scrollY of [0, 240]) {
        await page.evaluate((y) => window.scrollTo(0, y), scrollY)
        await page.evaluate(
          () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))),
        )
        await page.getByRole('button', { name: SITE_MENU_NAME, exact: true }).click()
        await expect(page.locator(OPEN)).toHaveCount(1)
        const m = await page.evaluate((selector) => {
          const panel = document.querySelector(selector)?.getBoundingClientRect()
          const bar = document.querySelector('.notch')?.getBoundingClientRect()
          if (!panel || !bar) return null
          return {
            left: panel.left,
            right: document.documentElement.clientWidth - panel.right,
            gap: panel.top - bar.bottom,
          }
        }, MENU)
        if (!m) throw new Error('no open menu or no bar to measure')
        expect(Math.round(m.left), `left gutter at scrollY ${scrollY}`).toBe(12)
        expect(
          Math.round(m.right),
          `right gutter at scrollY ${scrollY}: the old rule sat flush`,
        ).toBe(12)
        expect(Math.round(m.gap), 'the menu overlaps the bar').toBeGreaterThanOrEqual(0)
        expect(Math.round(m.gap), 'the menu hangs detached from the bar').toBeLessThanOrEqual(8)
        await page.keyboard.press('Escape')
        await expect(page.locator(OPEN)).toHaveCount(0)
      }
    })
  }

  test('Escape closes it and returns focus to the button; a tap outside closes it', async ({
    page,
    browserName,
  }) => {
    await page.setViewportSize({ width: 390, height: 800 })
    await page.goto('/')
    const button = page.getByRole('button', { name: SITE_MENU_NAME, exact: true })
    await button.click()
    await expect(page.locator(OPEN)).toHaveCount(1)
    await page.locator(`${MENU} a`).first().focus()
    await page.keyboard.press('Escape')
    await expect(page.locator(OPEN)).toHaveCount(0)
    /*
     * ⚠️ WEBKIT DOES NOT FOCUS A BUTTON FROM A MOUSE CLICK (measured 2026-09-23, matches the
     * platform default `page.mouse`/`.click()` exercises: `document.activeElement` stayed on
     * BODY after `button.click()`, before Escape was ever pressed). The popover's native
     * focus-restore has nothing to give back, so this assertion cannot hold in WebKit without
     * the "Full Keyboard Access" preference — the same root cause as the `test.skip` a few
     * tests below for Tab order. Escape still closes the menu, which the assertion above and
     * the tap-outside assertion below both cover in every engine.
     */
    if (browserName !== 'webkit') {
      await expect(button, 'focus did not come back to the button').toBeFocused()
    }

    await button.click()
    await expect(page.locator(OPEN)).toHaveCount(1)
    const point = await page.evaluate((selector) => {
      const panel = document.querySelector(selector)?.getBoundingClientRect()
      if (!panel) return null
      for (let y = Math.ceil(panel.bottom) + 16; y < innerHeight - 8; y += 8) {
        const hit = document.elementFromPoint(24, y)
        if (hit && !hit.closest('a, button, input, textarea, select, label')) return { x: 24, y }
      }
      return null
    }, MENU)
    if (!point) throw new Error('found no inert point under the open menu to tap')
    await page.mouse.click(point.x, point.y)
    await expect(page.locator(OPEN), 'a tap outside did not close the menu').toHaveCount(0)
  })

  test("the browser reports a collapsed, then expanded 'Menu' button (Chromium's real tree)", async ({
    page,
    context,
    browserName,
  }) => {
    test.skip(browserName !== 'chromium', 'only Chromium exposes its real accessibility tree (CDP)')
    await page.setViewportSize({ width: 390, height: 800 })
    await page.goto('/')
    type AxNode = {
      ignored?: boolean
      role?: { value?: string }
      name?: { value?: string }
      properties?: { name: string; value: { value?: unknown } }[]
    }
    const cdp = await context.newCDPSession(page)
    const read = async () => {
      const { nodes } = (await cdp.send('Accessibility.getFullAXTree')) as { nodes: AxNode[] }
      const button = nodes.find(
        (node) => node.role?.value === 'button' && node.name?.value === SITE_MENU_NAME,
      )
      // Chromium's raw CDP tree reflects `.nav-link`'s `text-transform: uppercase` in the
      // computed name (measured 2026-09-23: PRODUCTS, not the label text) — a real
      // difference from Playwright's own accessible-name computation, allowed by the
      // accessible-name spec, which is why toMatchAriaSnapshot elsewhere in this file
      // compares "Products" and passes.
      const products = nodes.filter(
        (node) =>
          !node.ignored &&
          node.role?.value === 'link' &&
          node.name?.value?.toUpperCase() === 'PRODUCTS',
      ).length
      return {
        found: Boolean(button),
        expanded: button?.properties?.find((property) => property.name === 'expanded')?.value.value,
        products,
      }
    }
    const closed = await read()
    expect(closed.found, 'no button named "Menu" in the real tree').toBe(true)
    expect(closed.expanded).toBe(false)
    await page.getByRole('button', { name: SITE_MENU_NAME, exact: true }).click()
    const open = await read()
    expect(open.expanded).toBe(true)
    // The footer's own Products link is there throughout; the menu's appears only when open.
    expect(open.products).toBe(closed.products + 1)
  })

  test('Tab reaches the skip link, the name and the button; Enter opens; Tab continues into the list', async ({
    page,
    browserName,
  }) => {
    test.skip(
      browserName === 'webkit',
      'WebKit leaves LINKS out of the Tab order unless a Safari preference is on; Chromium and Firefox cover this',
    )
    await page.setViewportSize({ width: 390, height: 800 })
    await page.goto('/')
    const order: string[] = []
    for (let index = 0; index < 3; index++) {
      await page.keyboard.press('Tab')
      order.push(await page.evaluate(() => document.activeElement?.className ?? ''))
    }
    expect(order).toEqual(['skip-link', 'notch__wordmark', 'notch__menu-btn'])
    await page.keyboard.press('Enter')
    await expect(page.locator(OPEN)).toHaveCount(1)
    await page.keyboard.press('Tab')
    await expect(
      page.locator(`${MENU} a`).first(),
      'the open list is not next in the Tab order',
    ).toBeFocused()
    await page.keyboard.press('Shift+Tab')
    await expect(page.getByRole('button', { name: SITE_MENU_NAME, exact: true })).toBeFocused()
  })

  test('every control in the bar and the open menu clears the 44px floor, both ways', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    for (const path of ['/', '/products', '/contact']) {
      await page.goto(path)
      await page.getByRole('button', { name: SITE_MENU_NAME, exact: true }).click()
      await expect(page.locator(OPEN)).toHaveCount(1)
      // ⚠️ The click itself shrinks the button (`:active` → `scale: 0.97`, notch.css) and it
      // eases back afterwards. getBoundingClientRect counts `scale`, so a read mid-ease
      // measured 43.9px on CI's WebKit (2026-09-24, passed on retry). Let every running
      // TRANSITION land before measuring; the 44px floor itself stays exact. Transitions
      // only: the bar's scroll-driven animation never "finishes", so waiting on it hangs.
      await page.evaluate(() =>
        Promise.all(
          document
            .getAnimations()
            .filter((animation) => animation instanceof CSSTransition)
            .map((animation) => animation.finished),
        ),
      )
      const m = await page.evaluate(() => {
        const shown = [...document.querySelectorAll('.notch a[href], .notch button')].filter(
          (element) => element.getBoundingClientRect().height > 0,
        )
        return {
          shown: shown.length,
          small: shown
            .filter((element) => {
              const box = element.getBoundingClientRect()
              return box.height < 43.95 || box.width < 43.95
            })
            .map((element) => {
              const box = element.getBoundingClientRect()
              return `${element.className} ${Math.round(box.width)}x${Math.round(box.height)}`
            }),
        }
      })
      // the name, the button and both links — or the measurement proves nothing
      expect(m.shown, `${path}: the open menu showed too few controls`).toBeGreaterThanOrEqual(4)
      expect(m.small, `${path}: a control in the bar or the open menu is under 44px`).toEqual([])
    }
  })

  test('the Speed Lines fold into an X while the menu is open', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/')
    const lines = page.locator('.notch__menu-btn .notch__icon-line')
    await expect(lines).toHaveCount(3)
    const read = () =>
      lines.evaluateAll((elements) =>
        elements.map((element) => {
          const style = getComputedStyle(element)
          const numbers = (style.transform.match(/-?[\d.]+/g) ?? []).map(Number)
          return { width: style.width, opacity: style.opacity, b: numbers[1] ?? 0 }
        }),
      )
    // closed: three uneven lines (owner's pick, Option B)
    expect((await read()).map((line) => line.width)).toEqual(['12px', '20px', '16px'])
    await page.getByRole('button', { name: SITE_MENU_NAME, exact: true }).click()
    await expect
      .poll(async () => (await read()).map((line) => `${line.width}/${line.opacity}`))
      .toEqual(['20px/1', '20px/0', '20px/1'])
    const [top, , bottom] = await read()
    // the matrix's second number is sin(angle): +0.707 for 45deg, -0.707 for -45deg
    expect(top?.b ?? 0, 'the top line did not turn').toBeGreaterThan(0.7)
    expect(bottom?.b ?? 0, 'the bottom line did not turn').toBeLessThan(-0.7)
  })
})

test.describe('the menu closes itself when the page moves on', () => {
  test('a link inside the menu closes it on the page it opens', async ({ page }) => {
    // Next keeps the layout — and this header — mounted across a navigation, and a tap
    // INSIDE a popover is not a tap outside it, so without NavLinks' effect the menu stays
    // open over the next page.
    await page.setViewportSize({ width: 390, height: 800 })
    await page.goto('/')
    await page.getByRole('button', { name: SITE_MENU_NAME, exact: true }).click()
    await page.locator(`${MENU} a`, { hasText: 'Products' }).click()
    await expect(page).toHaveURL(/\/products$/)
    await expect(page.locator(OPEN), 'the menu stayed open over the next page').toHaveCount(0)
  })

  test('widening past the phone layout closes it, and the links return to the bar', async ({
    page,
  }) => {
    // Measured 2026-09-23 in all three engines: a menu left open while the window widens
    // stays in the top layer at the top-left corner, position computed `absolute`.
    await page.setViewportSize({ width: 390, height: 800 })
    await page.goto('/')
    await page.getByRole('button', { name: SITE_MENU_NAME, exact: true }).click()
    await expect(page.locator(OPEN)).toHaveCount(1)
    await page.setViewportSize({ width: 1280, height: 800 })
    await expect(page.locator(OPEN)).toHaveCount(0)
    const inBar = await page.evaluate((selector) => {
      const bar = document.querySelector('.notch')?.getBoundingClientRect()
      const links = [...document.querySelectorAll(`${selector} a`)]
      return (
        Boolean(bar) &&
        links.length === 2 &&
        links.every((link) => {
          const box = link.getBoundingClientRect()
          return bar && box.width > 0 && box.top >= bar.top && box.bottom <= bar.bottom
        })
      )
    }, MENU)
    expect(inBar, 'the links did not come back into the bar').toBe(true)
  })
})

test.describe('wide screens: the same list, inline (research check C3)', () => {
  for (const javaScriptEnabled of [true, false]) {
    test.describe(`scripting ${javaScriptEnabled ? 'on' : 'off'}`, () => {
      test.use({ javaScriptEnabled })

      test('the links are painted, focusable and in the accessibility tree at 1280px', async ({
        page,
        context,
        browserName,
      }) => {
        /*
         * ⚠️ THE <details> LESSON. On 2026-09-05 a closed <details> revealed by CSS LOOKED
         * right and its links were absent from the Tab order and the accessibility tree. A
         * closed popover forced inline is a different mechanism (a plain UA `display: none`,
         * no shadow slot, no `content-visibility`), measured visible, in the Tab order and in
         * the snapshot in three engines on 2026-09-23 — and re-measured here on every change.
         */
        await page.setViewportSize({ width: 1280, height: 800 })
        await page.goto('/')
        await expect(page.locator('.notch__nav')).toMatchAriaSnapshot(
          `- navigation "${SITE_NAV_LABEL}":\n  - link "Products"\n  - link "Contact"`,
        )
        if (browserName === 'chromium') {
          const cdp = await context.newCDPSession(page)
          const { nodes } = (await cdp.send('Accessibility.getFullAXTree')) as {
            nodes: { ignored?: boolean; role?: { value?: string }; name?: { value?: string } }[]
          }
          // Chromium's raw CDP tree reflects `.nav-link`'s `text-transform: uppercase` in the
          // computed name (measured 2026-09-23: PRODUCTS) — the toMatchAriaSnapshot above
          // already proved the label text itself; this only counts occurrences.
          const products = nodes.filter(
            (node) =>
              !node.ignored &&
              node.role?.value === 'link' &&
              node.name?.value?.toUpperCase() === 'PRODUCTS',
          ).length
          // the bar's link AND the footer's
          expect(products, "the bar's Products link is not in Chromium's real tree").toBe(2)
        }
        if (browserName !== 'webkit') {
          await page.keyboard.press('Tab')
          await expect(page.locator('.skip-link')).toBeFocused()
          await page.keyboard.press('Tab')
          await expect(page.locator('.notch__wordmark')).toBeFocused()
          await page.keyboard.press('Tab')
          await expect(page.locator(`${MENU} a`).first()).toBeFocused()
          await page.keyboard.press('Tab')
          await expect(page.locator(`${MENU} a`).nth(1)).toBeFocused()
        }
      })
    })
  }
})

test.describe('the focus ring in the dark bar (volt, both themes)', () => {
  for (const scheme of ['light', 'dark'] as const) {
    test(`${scheme}: every ring in the bar and the open menu reaches 4.5:1`, async ({
      page,
      browserName,
    }) => {
      /*
       * The global ring is --focus-ring, volt-deep in light mode: 3.16:1 on the bar's ink
       * (measured 2026-09-17 on the wordmark, 2026-09-23 inside the open menu). WCAG's
       * floor is 3:1, so a 3:1 test would pass the defect; 4.5:1 is what the rest of this
       * system clears, and volt reaches 13.06:1 light and 8.95:1 dark.
       */
      test.skip(browserName === 'webkit', 'WebKit leaves links out of the Tab order by preference')
      await page.goto('/')
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' })
      await page.setViewportSize({ width: 390, height: 800 })
      await page.goto('/')
      const ground = await page.evaluate(() => getComputedStyle(document.body).backgroundColor)
      const luminance = relativeLuminance(parseCssColour(ground).rgb)
      if (scheme === 'dark') expect(luminance, `not dark: ${ground}`).toBeLessThan(0.2)
      else expect(luminance, `not light: ${ground}`).toBeGreaterThan(0.5)

      const ring = () =>
        page.evaluate(() => {
          const element = document.activeElement as HTMLElement
          const behind =
            element.closest('.notch__menu:popover-open') ??
            element.closest('.notch') ??
            document.body
          const style = getComputedStyle(element)
          return {
            name: element.className,
            style: style.outlineStyle,
            colour: style.outlineColor,
            behind: getComputedStyle(behind).backgroundColor,
          }
        })
      const rings = []
      await page.keyboard.press('Tab') // the skip link, on the page
      await page.keyboard.press('Tab')
      rings.push(await ring()) // the wordmark
      await page.keyboard.press('Tab')
      rings.push(await ring()) // the menu button
      await page.keyboard.press('Enter')
      await expect(page.locator(OPEN)).toHaveCount(1)
      await page.keyboard.press('Tab')
      rings.push(await ring()) // the first link, in the open menu
      expect(rings.map((entry) => entry.name)).toEqual([
        'notch__wordmark',
        'notch__menu-btn',
        'nav-link',
      ])
      const failing = rings
        .filter((entry) => entry.style !== 'solid' || contrastOf(entry.colour, entry.behind) < 4.5)
        .map(
          (entry) =>
            `${entry.name}: ${entry.style} ${entry.colour} on ${entry.behind} = ` +
            `${contrastOf(entry.colour, entry.behind).toFixed(2)}:1`,
        )
      expect(failing, `${scheme}: a ring in the dark bar is too faint`).toEqual([])
    })
  }
})

test.describe('the bar never covers the page', () => {
  for (const width of PHONE_WIDTHS) {
    test(`clears the first line at ${width}px`, async ({ page }) => {
      /*
       * ⚠️ MEASURED, NOT RECALCULATED. The bar's bottom sat at 68px while the hero's
       * first line began at 64px, so it covered the opening line on EVERY phone width on
       * all three pages — while tablets and desktops had 24-103px of clearance, which is
       * why nothing looked wrong anywhere anyone checks. The cause was two independent
       * numbers that had to agree and nothing making them.
       *
       * This repo has had a height budget come out wrong three times by recalculating it
       * and a fourth from an unaccounted transform, so this asserts the RENDERED gap.
       */
      await page.setViewportSize({ width, height: 800 })
      for (const path of ['/', '/products', '/contact']) {
        await page.goto(path)
        const gap = await page.evaluate(() => {
          const bar = document.querySelector('.notch')?.getBoundingClientRect()
          const first =
            document.querySelector('.site-hero .label') ?? document.querySelector('.site-hero h1')
          const content = first?.getBoundingClientRect()
          if (!bar || !content) return Number.NaN
          return Math.round(content.top - bar.bottom)
        })
        expect(gap, `${path} at ${width}px: bar overlaps the first line`).toBeGreaterThanOrEqual(16)
      }
    })
  }

  test('the bar stays one line tall whatever the wordmark says', async ({ page }) => {
    // A long CMS wordmark wrapped the bar to 112px against an 84px clearance, silently
    // reintroducing the overlap from a text field with nothing failing.
    await page.setViewportSize({ width: 320, height: 800 })
    await page.goto('/')
    const heights = await page.evaluate(() => {
      const bar = document.querySelector('.notch') as HTMLElement
      const mark = document.querySelector('.notch__wordmark') as HTMLElement
      const before = Math.round(bar.getBoundingClientRect().height)
      mark.textContent = 'RUN APPAREL INTERNATIONAL MANUFACTURING LIMITED'
      const after = Math.round(bar.getBoundingClientRect().height)
      return { before, after }
    })
    expect(heights.after).toBe(heights.before)
  })
})

test.describe('the current page is marked', () => {
  test('exactly one link carries aria-current, and not by colour alone', async ({ page }) => {
    // The rule styling `.nav-link[aria-current="page"]` shipped from day one and had
    // never once applied, because nothing set the attribute. Turning it on then revealed
    // the cue was alpha 0.7 -> 1.0 on the same colour: a colour-only distinction.
    await page.goto('/products')
    const marked = page.locator('.notch__nav a[aria-current="page"]')
    await expect(marked).toHaveCount(1)
    await expect(marked).toHaveAttribute('href', '/products')

    const decoration = await marked.evaluate((el) => getComputedStyle(el).textDecorationLine)
    expect(decoration, 'the current page is distinguished by colour alone').toContain('underline')

    // and the home page marks nothing, because there is no Home link
    await page.goto('/')
    await expect(page.locator('.notch__nav a[aria-current="page"]')).toHaveCount(0)
  })
})

test.describe('keyboard', () => {
  test('skip link reaches main, and focus continues into the content', async ({
    page,
    browserName,
  }) => {
    test.skip(
      browserName === 'webkit',
      'WebKit leaves links out of the Tab order by preference; Chromium and Firefox cover this',
    )
    /*
     * Without `tabindex="-1"` the skip link set the hash and the next Tab DID land in
     * the content — so it worked for a sighted keyboard user — but `activeElement`
     * stayed on BODY, which is what a screen reader follows. Adding it then drew a 2px
     * ring around the entire page, which reads as a rendering fault. Both are asserted.
     */
    await page.goto('/')
    await page.keyboard.press('Tab')
    await expect(page.locator('.skip-link')).toBeFocused()

    await page.keyboard.press('Enter')
    const landed = await page.evaluate(() => ({
      onMain: document.activeElement === document.getElementById('main'),
      outline: getComputedStyle(document.getElementById('main') as HTMLElement).outlineStyle,
    }))
    expect(landed.onMain, 'skip link did not move focus to main').toBe(true)
    expect(landed.outline, 'focusing main draws a ring around the whole page').toBe('none')

    await page.keyboard.press('Tab')
    const inMain = await page.evaluate(() =>
      document.getElementById('main')?.contains(document.activeElement),
    )
    expect(inMain).toBe(true)
  })

  test('tab order is skip link, wordmark, the two nav links, then the switch', async ({
    page,
    browserName,
  }) => {
    test.skip(
      browserName === 'webkit',
      'WebKit leaves links out of the Tab order by preference; Chromium and Firefox cover this',
    )
    await page.goto('/')
    const order: string[] = []
    for (let index = 0; index < 5; index++) {
      await page.keyboard.press('Tab')
      order.push(await page.evaluate(() => document.activeElement?.className ?? ''))
    }
    expect(order).toEqual(['skip-link', 'notch__wordmark', 'nav-link', 'nav-link', 'theme-toggle'])
  })
})

test.describe('rendering', () => {
  test('no horizontal scrolling at any width', async ({ page }) => {
    for (const width of [...PHONE_WIDTHS, 768, 1024, 1280, 1920]) {
      await page.setViewportSize({ width, height: 800 })
      await page.goto('/products')
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      )
      expect(overflow, `sideways scrolling at ${width}px`).toBe(false)
    }
  })

  test('every control clears the 44px touch floor', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    for (const path of ['/', '/products', '/contact']) {
      await page.goto(path)
      /*
       * ⚠️ 43.95, NOT 44, AND THE 0.05 IS A MEASUREMENT ARTEFACT RATHER THAN A CONCESSION.
       *
       * `getBoundingClientRect().height` is `bottom - top` in floating point. Where an
       * element sits at a fractional offset — which fluid `clamp()` type above it
       * guarantees — that subtraction loses precision: measured 2026-09-07, two filter
       * chips with a computed `min-height: 44px` reported **43.999969482421875** while
       * four identical chips on later flex lines reported exactly 44. Their tops were
       * 472.8596 and 524.8596 respectively.
       *
       * Compared strictly, this test fails on elements that are 44px by declaration and
       * 3.1e-5 px short by arithmetic — a false positive that says nothing about a thumb.
       * The tolerance costs it nothing: the failure it was written for measured **19px**,
       * and the smallest real miss this codebase has shipped was 16px.
       */
      const small = await page.evaluate(() =>
        [...document.querySelectorAll('a[href], button')]
          .filter((el) => el.getBoundingClientRect().height > 0)
          .filter((el) => el.getBoundingClientRect().height < 43.95)
          .map((el) => `${(el.textContent ?? '').trim().slice(0, 24)}`),
      )
      // Both contact links measured 19px tall at every viewport — the page's only two
      // actions, thumb-sized misses on a phone.
      expect(small, `${path} has controls under 44px`).toEqual([])
    }
  })

  test('no script errors, and nothing the page itself serves is broken', async ({ page }) => {
    /*
     * ⚠️ TWO SIGNALS, DELIBERATELY SEPARATED — the first version conflated them and
     * failed for the wrong reason. A blanket "no console errors" also catches a media
     * file that happens to be missing from a developer's local R2, which is an
     * environment condition, not a code defect: the broken-poster case in pages.spec.ts
     * is what covers that, and covers it better because it forces the failure.
     *
     * So: uncaught exceptions and console errors are asserted strictly, with
     * resource-load failures excluded — and then failing requests are asserted
     * separately, scoped to THIS origin. A poster missing from local storage is
     * tolerated; a broken script, stylesheet or page on our own host is not.
     */
    const scriptErrors: string[] = []
    const brokenOwnResources: string[] = []

    page.on('pageerror', (error) => {
      /*
       * ⚠️ BENIGN PER THE RESIZEOBSERVER SPEC, AND NEW TO THIS SUITE ONLY BECAUSE WEBKIT
       * JOINED IT (2026-09-24). NavLinks.tsx observes the menu button so a widen past the
       * phone boundary can close an open menu; when that observation and the resulting
       * layout settle inside one frame, the browser defers the notification and reports it —
       * WebKit as an uncaught page error, measured 2026-09-23, where Chromium and Firefox do
       * not surface it here at all. MDN documents it as informational ("your site will not
       * break"), and every widen/resize assertion in this file still passes in all three
       * engines. A genuine uncaught exception still fails, which is what this handler is for.
       */
      if (/ResizeObserver loop/i.test(error.message)) return
      scriptErrors.push(`uncaught: ${error.message}`)
    })
    page.on('console', (message) => {
      if (message.type() !== 'error') return
      // "Failed to load resource" is the network signal, handled below.
      if (/Failed to load resource/i.test(message.text())) return
      /*
       * ⚠️ A CROSS-ORIGIN ASSET REFUSED BY ITS OWN POLICY IS NOT THIS PAGE'S SCRIPT ERROR,
       * and on a runner it is not even a defect. `media.wear-run.help` answers
       * `Cross-Origin-Resource-Policy: same-site` — read off the live wire 2026-09-07 —
       * so PRODUCTION embeds it fine (`wear-run.help` shares its registrable domain) and
       * `localhost` never can. CI resolves the media host from wrangler.jsonc, so Firefox
       * logs one console error per poster and this counted every one as a script fault.
       *
       * Narrow on purpose: only a CORP refusal, only for a host that is not this origin.
       * A genuine script error still fails, which is what the test is for.
       */
      if (/Cross-Origin-Resource-Policy/i.test(message.text())) return
      // WebKit phrases the SAME condition differently (measured 2026-09-23, when WebKit was
      // added to this file): "Cannot load image <url> due to access control
      // checks." Same narrowing — only an image, never a script or stylesheet on this origin.
      if (/Cannot load image .* due to access control checks/i.test(message.text())) return
      scriptErrors.push(message.text())
    })
    page.on('response', async (response) => {
      if (response.status() < 400) return
      const url = new URL(response.url())
      if (url.host !== new URL(page.url() || 'http://localhost').host) return
      /*
       * Media is content, not code — see above.
       *
       * ⚠️ KEYED ON WHAT THE RESOURCE IS, NOT ON WHERE IT SITS. This exempted the
       * `/api/media/` PREFIX until 2026-09-07, which stopped covering the case the moment
       * poster URLs became absolute: `e2e/serve.mjs` now supplies a `PUBLIC_MEDIA_BASE_URL`
       * so the fixture emits production's URL shape, and the posters arrive as
       * root-level filenames. The prefix check silently stopped matching and a missing
       * seed poster started reading as a broken page.
       *
       * `resourceType()` says image regardless of the path, which is what the sentence
       * above actually meant. A broken script, stylesheet or document on our own host
       * still fails, which is the point.
       */
      if (response.request().resourceType() === 'image') return
      brokenOwnResources.push(`${response.status()} ${url.pathname}`)
    })

    for (const path of ['/', '/products', '/contact']) {
      await page.goto(path)
      await page.waitForLoadState('networkidle')
    }

    expect(scriptErrors, 'the page logged a script error').toEqual([])
    expect(brokenOwnResources, 'a resource this site serves failed').toEqual([])
  })
})

test.describe('TY-07 / SZ-03 — the words that take a visitor anywhere are readable and reachable', () => {
  /**
   * Measured 2026-09-09/10 (audit): PRODUCTS and CONTACT at 10px, the two main buttons at
   * 11px, and the footer's "Terms" link 34px wide on a phone. The 44px floor test above
   * measures HEIGHT only, which is exactly why a 34px-wide target passed it.
   */
  test('nav links and buttons are 12px or more, legal links 44px wide or more', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    for (const path of ['/', '/products', '/contact']) {
      await page.goto(path)
      // The bar's links live in the phone menu at 390px: open it, or only the footer's are measured.
      await page.getByRole('button', { name: SITE_MENU_NAME, exact: true }).click()
      await expect(page.locator(OPEN)).toHaveCount(1)
      const m = await page.evaluate(() => {
        const px = (el: Element) => Number.parseFloat(getComputedStyle(el).fontSize)
        const name = (el: Element) => (el.textContent ?? '').trim().slice(0, 24)
        const visible = (el: Element) => (el as HTMLElement).getClientRects().length > 0
        const nav = [...document.querySelectorAll('.nav-link')].filter(visible)
        const buttons = [...document.querySelectorAll('.btn')].filter(visible)
        const legal = [...document.querySelectorAll('.footer-legal a')].filter(visible)
        return {
          nav: nav.length,
          legal: legal.length,
          small: [...nav, ...buttons]
            .filter((el) => px(el) < 12)
            .map((el) => `${name(el)} ${px(el)}px`),
          narrow: legal
            .filter((el) => el.getBoundingClientRect().width < 43.95)
            .map((el) => `${name(el)} ${el.getBoundingClientRect().width.toFixed(1)}px`),
        }
      })
      // The controls must exist, or an empty page passes both assertions below.
      expect(m.nav, `${path}: no nav links to measure`).toBeGreaterThan(0)
      expect(m.legal, `${path}: no footer legal links to measure`).toBeGreaterThan(0)
      expect(m.small, `${path}: control text under 12px`).toEqual([])
      expect(m.narrow, `${path}: footer legal links under 44px wide`).toEqual([])
    }
  })
})

test.describe('the Speed Lines move, and hold still for reduced motion (owner, 2026-09-23)', () => {
  /*
   * Read in the SAME task as the click: a transition that has finished is gone from
   * getAnimations(), so reading it a round trip later would flake on a slow runner. The
   * click is dispatched in-page for that reason; it is a real activation (a scripted click
   * runs a button's popovertarget behaviour).
   */
  const clickAndRead = () =>
    `(() => {
      document.querySelector('.notch__menu-btn').click()
      return [...document.querySelectorAll('.notch__menu-btn .notch__icon-line')].map((line) =>
        line.getAnimations().map((animation) => {
          const timing = animation.effect.getTiming()
          return animation.transitionProperty + ':' + timing.duration + ':' + timing.delay
        }).sort(),
      )
    })()`

  test('with motion: each line moves on --ui, 0 / 20 / 40ms apart, and lands on the X', async ({
    page,
  }) => {
    await page.goto('/')
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await page.setViewportSize({ width: 390, height: 800 })
    await page.goto('/')
    expect(
      await page.evaluate(() => matchMedia('(prefers-reduced-motion: no-preference)').matches),
    ).toBe(true)
    const running = await page.evaluate(clickAndRead())
    expect(running).toEqual([
      ['transform:220:0', 'width:220:0'],
      ['opacity:220:20'],
      ['transform:220:40', 'width:220:40'],
    ])
    await expect
      .poll(() =>
        page
          .locator('.notch__menu-btn .notch__icon-line')
          .evaluateAll((lines) => lines.map((line) => getComputedStyle(line).width)),
      )
      .toEqual(['20px', '20px', '20px'])
  })

  test('reduced motion: no line moves — the X arrives at once, with no in-between frame', async ({
    page,
  }) => {
    await page.goto('/')
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.setViewportSize({ width: 390, height: 800 })
    await page.goto('/')
    expect(
      await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches),
      'reduced motion never reached the page',
    ).toBe(true)
    /*
     * base.css's reduced-motion block collapses every transition to 0.01ms with no stagger,
     * reaching all three lines. Compared numerically, not against a literal string:
     * getComputedStyle serializes 0.01ms as '1e-05s' in Chromium but '0.00001s' in Firefox
     * and WebKit — same value, different notation (measured 2026-09-23, the first run of
     * this file under all three engines). The 1ms threshold sits two orders of magnitude
     * above the real 0.01ms and one below a 300ms plant, so motion that ignores the setting
     * still fails this test.
     */
    const timing = await page.locator('.notch__menu-btn .notch__icon-line').evaluateAll((lines) =>
      lines.map((line) => {
        const style = getComputedStyle(line)
        return [
          Number.parseFloat(style.transitionDuration),
          Number.parseFloat(style.transitionDelay),
        ]
      }),
    )
    for (const [duration, delay] of timing) {
      expect(duration, 'transition-duration did not collapse under reduced motion').toBeLessThan(
        0.001,
      )
      expect(delay, 'transition-delay did not collapse under reduced motion').toBe(0)
    }
    const running = await page.evaluate(clickAndRead())
    for (const line of running) {
      for (const entry of line) {
        const [, duration] = entry.split(':')
        expect(Number(duration), `${entry} still animates under reduced motion`).toBeLessThan(1)
      }
    }
  })
})
