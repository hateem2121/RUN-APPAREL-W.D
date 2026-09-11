import { expect, test } from '@playwright/test'

/**
 * The footer, measured. Every number here was wrong at least once on the design
 * artifact before it was measured: the tab sat inside the slab instead of on its edge,
 * the wordmark ran off the right edge twice, the dimension line wrapped so its ticks
 * bracketed half of what they labelled, and the light snapped to the pointer while the
 * ring was still gliding.
 */

const SLAB = '.site-footer__slab'

/** Playwright sets navigator.webdriver; the cursor honours it, as the viewer's does. */
const liftAutomationGate = (context: { addInitScript: (fn: () => void) => Promise<void> }) =>
  context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false })
  })

test.describe('the footer geometry', () => {
  test('the tab is seated on the slab top edge, not inside it', async ({ page }) => {
    await page.goto('/contact')
    const tab = await page.locator('.site-footer__tab').boundingBox()
    const slab = await page.locator(SLAB).boundingBox()
    expect(tab && slab).toBeTruthy()
    // bottom of the tab == top of the slab, to the pixel
    expect(Math.abs((tab?.y ?? 0) + (tab?.height ?? 0) - (slab?.y ?? 0))).toBeLessThanOrEqual(1)
    // and the tab is entirely above it
    expect((tab?.y ?? 0) + (tab?.height ?? 0)).toBeLessThanOrEqual((slab?.y ?? 0) + 1)
  })

  /**
   * ⚠️ THIS TEST USED TO ASSERT `gridTemplateColumns` HAD TWO TRACKS, AND IT COULD NEVER
   * HAVE FAILED FOR A REAL REASON.
   *
   * `repeat(2, minmax(0, 1fr))` reports two tracks whatever the content is, so the
   * assertion read the CSS declaration back to itself. Meanwhile the 2x2 it was named for
   * is a state the site cannot currently reach: three of the four blocks are conditional
   * on CMS fields the owner has not filled, so ONE block renders — into a two-column grid
   * with a `border-top` drawn across the whole 640px box. The rule ran 51.9-56.4% wider
   * than anything beneath it (audit FA-D-02), on the emptiest surface on the site, and
   * this test was green throughout.
   *
   * It now measures the thing the rule is for: a hairline that underlines content should
   * be about as wide as the content. Measured after the fix, at 430/600/768/1440/1920:
   * rule 303.6px, widest ink 303.6px, overshoot 0.0% at every width.
   *
   * The 10% bound is generous on purpose — the grid gap and a block's own padding are
   * legitimate reasons for the rule to exceed the ink slightly. What it rejects is the
   * half-empty rule the audit found.
   */
  test('the rule is as wide as what it underlines', async ({ page }) => {
    for (const width of [430, 768, 1440, 1920]) {
      await page.setViewportSize({ width, height: 900 })
      await page.goto('/contact')
      const m = await page.locator('.footer-facts').evaluate((el) => {
        let ink = 0
        for (const child of el.querySelectorAll('li, h3')) {
          const range = document.createRange()
          range.selectNodeContents(child)
          for (const rect of range.getClientRects()) ink = Math.max(ink, rect.width)
        }
        return { rule: el.getBoundingClientRect().width, ink }
      })
      expect(
        m.ink,
        `no measurable content at ${width}px — the probe is reading nothing`,
      ).toBeGreaterThan(50)
      const overshoot = ((m.rule - m.ink) / m.ink) * 100
      expect(
        overshoot,
        `at ${width}px the rule is ${m.rule.toFixed(1)}px over ${m.ink.toFixed(1)}px of ink ` +
          `(${overshoot.toFixed(1)}% wider than the content it underlines)`,
      ).toBeLessThan(10)
    }
  })

  test('the facts grid uses one track per block that renders', async ({ page }) => {
    // `auto-fit` collapses empty tracks, so the count follows the content rather than a
    // hardcoded 2. With the three conditional blocks unfilled that is one; when the owner
    // fills them it becomes two at desktop, without a CSS change.
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/contact')
    const m = await page.locator('.footer-facts').evaluate((el) => ({
      tracks: getComputedStyle(el).gridTemplateColumns.trim().split(/\s+/).length,
      blocks: el.children.length,
    }))
    expect(m.tracks).toBe(Math.min(m.blocks, 2))
  })

  test('the wordmark spans the slab exactly, cropped only at the bottom', async ({ page }) => {
    await page.goto('/contact')
    await page.locator('.footer-mark').scrollIntoViewIfNeeded()
    const ratio = () =>
      page.locator('.footer-mark').evaluate((el) => {
        const base = el.querySelector('.footer-mark__layer') as HTMLElement
        return base.scrollWidth / el.clientWidth
      })
    // the fit runs after fonts load — poll for the outcome rather than waiting a fixed time
    await expect.poll(ratio).toBeGreaterThan(0.97)
    expect(await ratio()).toBeLessThanOrEqual(1)
  })

  test('the dimension line is one row, ticks on the ends of its own text', async ({ page }) => {
    await page.goto('/contact')
    const rows = await page.locator('.footer-dim').evaluate((el) => {
      const range = document.createRange()
      range.selectNodeContents(el)
      return new Set([...range.getClientRects()].map((r) => Math.round(r.top))).size
    })
    expect(rows).toBe(1)
  })

  test('the slab is one full screen from tablet up and content-sized on a phone', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1024, height: 700 })
    await page.goto('/contact')
    /*
     * ⚠️ READ IN THE PAGE, NOT WITH `boundingBox()`. Measured 2026-09-11 in CI's container
     * (mcr.microsoft.com/playwright:v1.62.1-noble): Firefox's `boundingBox().height` was
     * 699.9998779296875 while the slab's computed height, offsetHeight and
     * getBoundingClientRect().height were all exactly 700; Chromium and WebKit returned 700 from
     * the same call. The box Playwright derives lost a fraction of a pixel; the element did not.
     *
     * The rule is asserted directly too. Here the slab's content is 743px tall, so the height
     * alone would still pass with `min-height: 100svh` deleted.
     */
    const tall = await page.locator(SLAB).evaluate((el) => ({
      height: el.getBoundingClientRect().height,
      minHeight: getComputedStyle(el).minHeight,
    }))
    expect(tall.height).toBeGreaterThanOrEqual(700)
    expect(tall.minHeight, 'the slab no longer reserves one full screen from tablet up').toBe(
      '700px',
    )

    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/contact')
    const phone = await page.locator(SLAB).evaluate((el) => getComputedStyle(el).minHeight)
    expect(phone).toBe('0px')
  })
})

test.describe('claims render only from real values', () => {
  test('no block is ever empty, and no placeholder ever appears', async ({ page }) => {
    await page.goto('/contact')
    // Contact is always present; the other three depend on the CMS. Whatever is present
    // must carry real text — an empty block or an example value is the failure.
    const blocks = page.locator('.footer-block')
    expect(await blocks.count()).toBeGreaterThanOrEqual(1)
    for (let i = 0; i < (await blocks.count()); i++) {
      const items = blocks.nth(i).locator('li')
      expect(await items.count()).toBeGreaterThan(0)
      for (let j = 0; j < (await items.count()); j++) {
        expect((await items.nth(j).innerText()).trim().length).toBeGreaterThan(0)
      }
    }
    await expect(page.locator('.site-footer')).not.toContainText(/Oeko|GOTS|ISO 9001|MOQ 50/)
  })

  test('the clock ticks and the light appears only with hours', async ({ page }) => {
    await page.goto('/contact')
    await expect(page.locator('.footer-clock__time span').first()).not.toHaveText('--:--')
    const hasStatus = (await page.locator('.footer-status').count()) > 0
    const hasHours =
      (await page.locator('.footer-block--capacity li', { hasText: /PKT/ }).count()) > 0
    expect(hasStatus).toBe(hasHours)
  })
})

test.describe('the cursor and the glow', () => {
  test('present on a fine pointer once the mouse moves', async ({ page, context }) => {
    await liftAutomationGate(context)
    await page.goto('/contact')
    await expect(page.locator('html')).not.toHaveClass(/has-custom-cursor/)
    await page.mouse.move(300, 300)
    await page.mouse.move(320, 310)
    await expect(page.locator('html')).toHaveClass(/has-custom-cursor/)
    await expect(page.locator('.cursor-dot')).toHaveAttribute('data-hidden', 'false')
    // over a link the ring inflates and fills
    await page.locator('.notch__nav a').first().hover()
    await expect(page.locator('.cursor-ring')).toHaveAttribute('data-pointer', 'true')
    const t = await page
      .locator('.cursor-ring')
      .evaluate((el) => (el as HTMLElement).style.transform)
    expect(t.indexOf('translate3d')).toBeLessThan(t.indexOf('scale('))

    // and the glow lights inside the slab
    const slab = page.locator(SLAB)
    await slab.scrollIntoViewIfNeeded()
    await page.locator('.footer-block--contact a').first().hover()
    await expect(slab).toHaveAttribute('data-glow', 'true')
    await expect(slab).toHaveAttribute('data-over', 'true')
    await page.locator('.footer-grow').hover()
    await expect(slab).toHaveAttribute('data-over', 'false')
  })

  test('absent under automation, the honest default', async ({ page }) => {
    await page.goto('/contact')
    await page.mouse.move(300, 300)
    await expect(page.locator('.cursor-dot')).toHaveCount(0)
  })

  test('absent under reduced motion', async ({ page, context }) => {
    await liftAutomationGate(context)
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/contact')
    await page.mouse.move(300, 300)
    await expect(page.locator('.cursor-dot')).toHaveCount(0)
    await expect(page.locator('.footer-glow').first()).toBeHidden()
    await expect(page.locator('.footer-mark__layer--lit')).toBeHidden()
  })
})

test.describe('the numbers the design audit fixed', () => {
  test('the light rides with the ring, and the hand-off does not flicker across the 2×2', async ({
    page,
    context,
  }) => {
    await liftAutomationGate(context)
    await page.goto('/contact')
    const slab = page.locator(SLAB)
    await slab.scrollIntoViewIfNeeded()
    const box = await slab.boundingBox()
    if (!box) throw new Error('no slab')
    // park, then one big jump; after the ring settles the light must sit ON the ring
    await page.mouse.move(box.x + 200, box.y + 300)
    await page.waitForTimeout(500)
    await page.mouse.move(box.x + 700, box.y + 320)
    await page.waitForTimeout(700)
    const settled = await page.evaluate(() => {
      const slabEl = document.querySelector('.site-footer__slab') as HTMLElement
      const ring = document.querySelector('.cursor-ring') as HTMLElement
      const r = slabEl.getBoundingClientRect()
      const m = /translate3d\(([\d.]+)px, ([\d.]+)px/.exec(ring.style.transform)
      return {
        ringX: m ? Number(m[1]) - r.left : Number.NaN,
        lightX: Number.parseFloat(slabEl.style.getPropertyValue('--gx')),
      }
    })
    expect(Math.abs(settled.ringX - settled.lightX)).toBeLessThanOrEqual(1)

    // Sweep down through the 2×2's INTERIOR at 3px per frame — from just above the
    // first block to just below the last — and count over/off toggles. The gap between
    // the two rows is the case: without hysteresis the halo dimmed and relit across it.
    // The empty padding BELOW the last block is deliberately outside the sweep: there
    // is nothing to light there, so the halo coming back is correct, not a flicker.
    const blocks = page.locator('.footer-block')
    const firstBlock = await blocks.first().boundingBox()
    const lastBlock = await blocks.last().boundingBox()
    if (!firstBlock || !lastBlock) throw new Error('no facts blocks')
    let toggles = 0
    let last: string | null = null
    for (let y = firstBlock.y - 2; y < lastBlock.y + lastBlock.height + 2; y += 3) {
      await page.mouse.move(firstBlock.x + 60, y)
      await page.waitForTimeout(16)
      const over = await slab.getAttribute('data-over')
      if (last !== null && over !== last) toggles++
      last = over
    }
    // one toggle: the entry. Anything more means the hand-off flickered inside the block.
    expect(toggles).toBeLessThanOrEqual(1)
  })

  test('the facts run full width on a phone, and the legal links get the design focus ring', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/contact')
    const facts = await page.locator('.footer-facts').boundingBox()
    const slab = await page.locator(SLAB).boundingBox()
    const pad = await page
      .locator(SLAB)
      .evaluate((el) => Number.parseFloat(getComputedStyle(el).paddingLeft))
    expect(Math.abs((facts?.x ?? 0) - ((slab?.x ?? 0) + pad))).toBeLessThanOrEqual(1)

    await page.locator('.footer-legal a[href="/products"]').focus()
    const outline = await page
      .locator('.footer-legal a[href="/products"]')
      .evaluate((el) => getComputedStyle(el).outlineWidth)
    expect(outline).toBe('2px')
  })

  test('dark mode: muted text clears AA with headroom and the slab has an edge', async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: 'dark' })
    await page.goto('/contact')
    const numbers = await page.locator(SLAB).evaluate((slabEl) => {
      const lum = (r: number, g: number, b: number) => {
        const f = (c: number) => {
          const v = c / 255
          return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
        }
        return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
      }
      const parse = (s: string) => {
        const m = (s.match(/[\d.]+/g) ?? []).map(Number)
        return { r: m[0] ?? 0, g: m[1] ?? 0, b: m[2] ?? 0, a: m.length > 3 ? (m[3] ?? 1) : 1 }
      }
      const ratio = (fgS: string, bgS: string) => {
        const bg = parse(bgS)
        const f = parse(fgS)
        const fg = {
          r: f.r * f.a + bg.r * (1 - f.a),
          g: f.g * f.a + bg.g * (1 - f.a),
          b: f.b * f.a + bg.b * (1 - f.a),
        }
        const l1 = lum(fg.r, fg.g, fg.b)
        const l2 = lum(bg.r, bg.g, bg.b)
        return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)
      }
      const bg = getComputedStyle(slabEl).backgroundColor
      const label = slabEl.querySelector('.footer-block h3') as HTMLElement
      return {
        muted: ratio(getComputedStyle(label).color, bg),
        borderTop: getComputedStyle(slabEl).borderTopWidth,
      }
    })
    expect(numbers.muted).toBeGreaterThanOrEqual(5)
    expect(numbers.borderTop).toBe('1px')
  })
})

test.describe('touch', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } })
  /**
   * ⚠️ UNTIL 2026-09-11 THIS COULD NOT FAIL FOR THE REASON IN ITS NAME. `Cursor.tsx`
   * refuses on `navigator.webdriver` as well as on a coarse pointer, and this test never
   * lifted the flag — so it measured the automation refusal, and deleting the pointer
   * check left it green. The flag is lifted now and both preconditions are asserted;
   * "present on a fine pointer once the mouse moves" above is the positive control that
   * the cursor can mount at all.
   */
  test('no cursor, no glow, arrow always shown on the tab', async ({ page, context }) => {
    await liftAutomationGate(context)
    await page.goto('/contact')
    expect(
      await page.evaluate(() => ({
        webdriver: navigator.webdriver,
        fine: matchMedia('(hover: hover) and (pointer: fine)').matches,
      })),
      'the webdriver spoof did not land, or this browser still reports a fine pointer',
    ).toEqual({ webdriver: false, fine: false })
    // Hydrated, or "no cursor" only means "no JavaScript yet": the clock reads --:--
    // until the client renders it (FooterClock.tsx).
    await expect(page.locator('.footer-clock__time span').first()).not.toHaveText('--:--')
    await expect(page.locator('.cursor-dot')).toHaveCount(0)
    await expect(page.locator('.footer-glow').first()).toBeHidden()
    await expect(page.locator('.site-footer__tab-arrow')).toHaveCSS('opacity', '1')
  })
})

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false })
  test('every route out still renders, the clock is honest, no cursor', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('.site-footer__tab')).toHaveAttribute('href', '/contact')
    // on Contact the tab points at the email — in the HTML, not added by a script
    await page.goto('/contact')
    await expect(page.locator('.site-footer__tab')).toHaveAttribute('href', /^mailto:/)
    await expect(page.locator('.footer-legal a[href="/products"]')).toBeVisible()
    await expect(page.locator('.footer-block--contact a[href^="mailto:"]')).toBeVisible()
    await expect(page.locator('.footer-clock__time span').first()).toHaveText('--:--')
    await expect(page.locator('.footer-status')).toHaveCount(0)
    await expect(page.locator('.cursor-dot')).toHaveCount(0)
  })
})
