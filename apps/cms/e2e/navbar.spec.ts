import { expect, test } from '@playwright/test'

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

  for (const width of [390, 1280]) {
    test(`both links are reachable at ${width}px with scripting off`, async ({ page }) => {
      /*
       * ⚠️ THE DEFECT THIS REPLACES. The bar hid its links behind a button whose open
       * state lived in React, so `.notch:not([data-open="true"]) .notch__nav` stayed in
       * force until hydration: measured 0 of 2 links reachable at 390px with scripting
       * disabled, and the same for the second or two before the bundle lands on a slow
       * connection. Desktop never showed it.
       */
      await page.setViewportSize({ width, height: 800 })
      await page.goto('/')

      const links = page.locator('.notch__nav a')
      await expect(links).toHaveCount(2)
      for (let index = 0; index < 2; index++) {
        await expect(links.nth(index)).toBeVisible()
      }
      // and they must actually navigate, not merely be painted
      await links.first().click()
      await expect(page).toHaveURL(/\/products$/)
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
  test('skip link reaches main, and focus continues into the content', async ({ page }) => {
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

  test('tab order is skip link, wordmark, then the two nav links', async ({ page }) => {
    await page.goto('/')
    const order: string[] = []
    for (let index = 0; index < 4; index++) {
      await page.keyboard.press('Tab')
      order.push(await page.evaluate(() => document.activeElement?.className ?? ''))
    }
    expect(order).toEqual(['skip-link', 'notch__wordmark', 'nav-link', 'nav-link'])
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
      const small = await page.evaluate(() =>
        [...document.querySelectorAll('a[href], button')]
          .filter((el) => el.getBoundingClientRect().height > 0)
          .filter((el) => el.getBoundingClientRect().height < 44)
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

    page.on('pageerror', (error) => scriptErrors.push(`uncaught: ${error.message}`))
    page.on('console', (message) => {
      if (message.type() !== 'error') return
      // "Failed to load resource" is the network signal, handled below.
      if (/Failed to load resource/i.test(message.text())) return
      scriptErrors.push(message.text())
    })
    page.on('response', async (response) => {
      if (response.status() < 400) return
      const url = new URL(response.url())
      if (url.host !== new URL(page.url() || 'http://localhost').host) return
      // Media is content, not code — see above.
      if (url.pathname.startsWith('/api/media/')) return
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
