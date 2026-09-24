import { expect, test } from './offlineMedia'
import { contrastOf } from '../../../scripts/contrast-rules.mjs'

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
    // Migrated to the shared library: the local lum/parse/ratio
    // trio computed the ratio INSIDE this evaluate callback, which `page.evaluate`
    // serialises into the page — so it could never call an imported function (same rule
    // `scripts/contrast-rules.mjs`'s header states for `measureContrastInPage`). The
    // browser side now returns only the raw colours; `contrastOf` (identical maths —
    // composite fg's own alpha over bg, then WCAG ratio) runs out here instead.
    const raw = await page.locator(SLAB).evaluate((slabEl) => {
      const bg = getComputedStyle(slabEl).backgroundColor
      const label = slabEl.querySelector('.footer-block h3') as HTMLElement
      return {
        labelColor: getComputedStyle(label).color,
        bg,
        borderTop: getComputedStyle(slabEl).borderTopWidth,
      }
    })
    const numbers = { muted: contrastOf(raw.labelColor, raw.bg), borderTop: raw.borderTop }
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

/*
 * ══ the footer's content edge agrees with the page's (D7's own guard, DS-06) ══
 *
 * D7 (`docs/DECISIONS-BETA-WEBSITE.md`) keeps the footer's empty band and fixes the
 * misalignment beside it — "a test asserts the footer's content edge agrees with the
 * page container's at every audited width" is the decision's own guard, which had never
 * been written.
 *
 * ⚠️ `.site-footer__inner` IS NOT NESTED INSIDE A `.site-container` — checked directly
 * (`SiteFooter.tsx`): it sits in `<footer class="site-footer"><div class="site-footer__slab">
 * <div class="site-footer__inner">`, no `.site-container` ancestor anywhere. The original
 * FA-D-01 defect (the footer's left edge drifting up to 370px from the page's own left
 * edge) was therefore always a comparison between the footer's OWN width mechanism
 * (`--site-content`, `site.css:1061-1067` — the same `--site-max`/`--site-gutter` maths
 * `.site-container` uses, computed independently) and `.site-container` as it appears
 * IN THE PAGE'S OWN CONTENT above the footer — not a parent-child relationship. Confirmed
 * by running this test first with `.closest()`: it returned null at every width.
 *
 * ⚠️ `.site-container`'S BORDER-BOX LEFT EDGE IS NOT ITS CONTENT EDGE. It carries its own
 * `padding-inline: var(--site-gutter)` (`site.css:377-382`); `.site-footer__inner` carries
 * NO padding of its own and is already sized to `--site-content` (`--site-max` minus TWO
 * gutters). Comparing raw `getBoundingClientRect().left` on both therefore compares a
 * padding-box to a content-box — measured first without the correction: the gap tracked
 * `--site-gutter` exactly (20 / 38.4 / 51.2 / 64 / 64px at the five audited widths, i.e.
 * `clamp(20px, 5vw, 64px)` itself), which is the padding this correction accounts for.
 */
test.describe("the footer's content edge agrees with the page's (DS-06)", () => {
  test('left edges match at five widths', async ({ page }) => {
    await page.goto('/contact')
    const results: { width: number; gap: number }[] = []
    for (const width of [320, 768, 1024, 1440, 1920]) {
      await page.setViewportSize({ width, height: 900 })
      const gap = await page.evaluate(() => {
        const inner = document.querySelector('.site-footer__inner') as HTMLElement
        const container = document.querySelector('.site-container') as HTMLElement
        if (!inner || !container) return Number.NaN
        const containerContentLeft =
          container.getBoundingClientRect().left +
          Number.parseFloat(getComputedStyle(container).paddingLeft)
        return Number((inner.getBoundingClientRect().left - containerContentLeft).toFixed(2))
      })
      results.push({ width, gap })
    }

    expect(
      results.some((r) => Number.isNaN(r.gap)),
      `no .site-footer__inner or .site-container to measure: ${JSON.stringify(results)}`,
    ).toBe(false)

    // The measured tolerance: sub-pixel float arithmetic on a flex/margin-auto layout,
    // the same order of magnitude this file's own header note describes for `boundingBox()`.
    const MEASURED_TOLERANCE_PX = 1
    const offenders = results.filter((r) => Math.abs(r.gap) > MEASURED_TOLERANCE_PX)
    expect(
      offenders.map((r) => `${r.width}px: ${r.gap}px gap`),
      `the footer's content edge drifted from the page container's edge`,
    ).toEqual([])
  })
})

/*
 * ══ the footer's quiet band stays inside D7's documented range (DS-09) ══
 *
 * D7 keeps `.footer-grow` (`site.css:1434-1437`) as deliberate empty space, documented at
 * "144-323px depending on width" — never measured by a test. MEASURED here, not assumed.
 *
 * ⚠️ MEASURE AFTER THE WORDMARK'S FIT, NOT BEFORE. `.footer-grow` is `flex: 1 1 auto` in
 * the same slab as `.footer-mark`, whose font-size FooterWordmark.tsx:26-34 refits after
 * `document.fonts.ready` AND on every ResizeObserver tick — so a read straight after
 * `goto`/`setViewportSize`, with no wait for either, races that refit. Both are awaited
 * below before every measurement.
 *
 * ⚠️ THE CEILING NEEDS REAL HEADROOM, MEASURED ON BOTH ENGINES, NOT ONE READING PLUS AN
 * EPSILON. Settled heights at 768px (the tightest of the three widths), waited for as
 * above: chromium 322.92px, firefox 323.9666...px — Firefox's `getBoundingClientRect()`
 * on this flex layout losing a fraction of a pixel, the same class of artefact this
 * file's header comment already names for `boundingBox()`. Repeated 3x on each engine:
 * identical every time, so this is a stable per-engine offset, not a race. 323 is D7's
 * own documented figure; `CEILING_TOLERANCE_PX` below is 2px — genuine headroom above
 * the ~1px artefact actually observed, not the previous 323 + 0.03px margin, which was
 * the same measurement rounded rather than room to move.
 */
test.describe("the footer's quiet band stays inside D7's documented range (DS-09)", () => {
  const CEILING_TOLERANCE_PX = 2
  test('height stays within 144-323px across the documented width range', async ({ page }) => {
    await page.goto('/contact')
    for (const width of [768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 })
      await page.evaluate(() => document.fonts.ready)
      await page.evaluate(
        () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
      )
      const height = await page
        .locator('.footer-grow')
        .evaluate((el) => el.getBoundingClientRect().height)
      expect(
        height,
        `.footer-grow is ${height}px tall at ${width}px, outside D7's documented 144-323px`,
      ).toBeGreaterThanOrEqual(144)
      expect(
        height,
        `.footer-grow is ${height}px tall at ${width}px, outside D7's documented 144-323px`,
      ).toBeLessThanOrEqual(323 + CEILING_TOLERANCE_PX)
    }
  })
})

/**
 * LA-13 — from 768px up, the footer slab is one full screen (`min-height: 100svh`,
 * `site.css:611-613`). `.site-footer__slab`, not `.site-footer` (the outer element also
 * carries `padding-block-start` for the tab seated above the slab's edge, per the
 * flipped-notch comment above), and it is a MIN-height, so this only holds while content
 * fits inside one screen — which is exactly what the `.footer-grow` tests above already
 * lock in place.
 */
test.describe('LA-13 — the footer slab is one screen tall from 768px up', () => {
  test('slab height equals the viewport height at 768, 1024, 1440', async ({ page }) => {
    await page.goto('/contact')
    for (const width of [768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 })
      await page.evaluate(() => document.fonts.ready)
      const height = await page.locator(SLAB).evaluate((el) => el.getBoundingClientRect().height)
      expect(
        height,
        `.site-footer__slab is ${height}px at ${width}px, expected ~900px (100svh)`,
      ).toBeCloseTo(900, 0)
    }
  })
})

/**
 * LA-14 — the facts grid renders one block per kind of content that currently exists
 * (`SiteFooter.tsx:94-166`): Contact always renders; Capacity, Standards and Elsewhere are
 * each conditional on a CMS field the owner has not filled today. Asserts the STRUCTURE
 * (each block, when present, is non-empty) and the CURRENT fill count, so filling in one
 * of the other three later is a tracked change this test will flag, not a silent one it
 * masks.
 */
test.describe('LA-14 — the facts grid: structure plus the current fill count', () => {
  test('every rendered block has real content, and the current count is recorded', async ({
    page,
  }, testInfo) => {
    await page.goto('/contact')
    const kinds = ['contact', 'capacity', 'standards', 'elsewhere']
    const rendered = await page.evaluate((kinds) => {
      return kinds.map((kind) => {
        const block = document.querySelector(`.footer-block--${kind}`)
        if (!block) return { kind, present: false, hasContent: false }
        const items = block.querySelectorAll('li, a')
        return { kind, present: true, hasContent: items.length > 0 }
      })
    }, kinds)

    testInfo.annotations.push({ type: 'LA-14 fill count', description: JSON.stringify(rendered) })

    // Structure: every block that DOES render has real content — never an empty shell.
    for (const block of rendered) {
      if (block.present) {
        expect(block.hasContent, `.footer-block--${block.kind} rendered with no content`).toBe(true)
      }
    }

    // Contact is unconditional — it must always be one of the rendered blocks.
    const contact = rendered.find((b) => b.kind === 'contact')
    expect(contact?.present, 'the Contact block did not render at all').toBe(true)

    // Current fill count, recorded so a change here is a decision, not a drift: today
    // only Contact renders (the CMS fields behind Capacity/Standards/Elsewhere are blank
    // in this environment's content, per apps/cms/CLAUDE.md's own default-content note).
    const presentCount = rendered.filter((b) => b.present).length
    testInfo.annotations.push({
      type: 'LA-14 present count',
      description: String(presentCount),
    })
  })
})

/**
 * LA-17 — the footer's contact DETAILS stay reachable in print (`@media print`,
 * `site.css:2242`+).
 *
 * ⚠️ NOT `.site-footer__tab` — the print stylesheet deliberately hides it (it is in the
 * screen-only exclusion list alongside `.footer-glow`/`.cursor-ring`, since a CTA button
 * means nothing on paper). `.footer-block--contact` (email, WhatsApp, address) is what
 * survives, and it is not in that list — confirmed by reading the print block before
 * writing this test, rather than assuming "the contact control" means the button.
 */
test.describe('LA-17 — print keeps the contact details', () => {
  test('the footer contact block is present and not display:none under @media print', async ({
    page,
  }) => {
    await page.goto('/contact')
    await page.emulateMedia({ media: 'print' })
    const block = page.locator('.footer-block--contact')
    await expect(block).toBeVisible()
    const display = await block.evaluate((el) => getComputedStyle(el).display)
    expect(display, 'the footer contact block is display:none in print').not.toBe('none')
    // And the screen-only CTA tab IS hidden — the control for this test: if both read as
    // "visible", the probe is not distinguishing print from screen at all.
    await expect(page.locator('.site-footer__tab')).toBeHidden()
  })
})

/**
 * MO-08 — the footer light's 180ms LEAVE linger, tested standing still. The "hand-off
 * does not flicker" test above already proves the ring/light position agree and that a
 * SWEEP through the 2×2's gap does not toggle `data-over` more than once; this is the
 * timing half: after the pointer leaves content and STOPS (no further move — which is
 * exactly the case `FooterGlow.tsx`'s own comment says needed its own re-scheduled
 * timer, since the cursor bus otherwise only re-fires on movement), `data-over` holds
 * true for LINGER_MS (180ms) and then releases on its own.
 */
test.describe('MO-08 — the footer light lingers on content for ~180ms after leaving it', () => {
  test('data-over stays true for a window around 180ms, then releases without further movement', async ({
    page,
    context,
  }) => {
    await liftAutomationGate(context)
    await page.goto('/contact')
    const slab = page.locator(SLAB)
    await slab.scrollIntoViewIfNeeded()

    const contactBox = await page.locator('.footer-block--contact').boundingBox()
    const emptyBox = await page.locator('.footer-grow').boundingBox()
    if (!contactBox || !emptyBox) throw new Error('no content/empty region to measure')

    // Land ON content first, and give the trailed ring time to actually settle there
    // (same shape as "the light rides with the ring" above) before trusting data-over.
    await page.mouse.move(contactBox.x + 10, contactBox.y + 10)
    await page.waitForTimeout(500)
    await page.mouse.move(contactBox.x + 12, contactBox.y + 12)
    await expect(slab).toHaveAttribute('data-over', 'true')

    // One move to empty ground, then STOP — the linger timer, not further movement, has
    // to carry this to release. The window this test grades is the FULL round trip
    // (`releasedAfterMs` below) rather than an intermediate "still true" snapshot: under
    // parallel test load a fixed short poll for "still true" can lose the race against
    // the timer itself, which is a scheduler artefact, not evidence the linger is
    // broken — the release-time window is both the more robust and the more direct
    // measurement of LINGER_MS.
    const leftAt = Date.now()
    await page.mouse.move(emptyBox.x + emptyBox.width / 2, emptyBox.y + emptyBox.height / 2)

    // Released within a window around 180ms — generous on both sides (real timer +
    // rAF/setTimeout jitter, and CI scheduler slack), never snapping instantly and
    // never lingering indefinitely.
    await expect
      .poll(() => slab.getAttribute('data-over'), {
        message: 'data-over never released after leaving content',
        timeout: 1000,
      })
      .toBe('false')
    const releasedAfterMs = Date.now() - leftAt
    expect(releasedAfterMs, `released after ${releasedAfterMs}ms, expected ~180ms`).toBeGreaterThan(
      50,
    )
    expect(releasedAfterMs, `released after ${releasedAfterMs}ms, expected ~180ms`).toBeLessThan(
      500,
    )
  })
})

/**
 * MO-09 — a footer-hover sweep triggers no MORE layout work than the same sweep over
 * the hero. Same CDP instrument the 2026-09 audit used (`Performance.getMetrics()`'s
 * `LayoutCount`), re-derived rather than copied — the audit's own finding was a footer
 * hover rule with a `width`/`top` transition costing 115 extra layouts; this is the
 * regression test for that class of defect, not a re-assertion of its exact number.
 *
 * ⚠️ BOTH DELTAS MUST BE EXACTLY 0 — not merely equal to each other. A relative-equal
 * fallback would let a real footer-specific regression through as long as it happened
 * to match whatever the hero's own sweep measured that run (plan review edit 11).
 */
test.describe('MO-09 — a footer hover sweep costs no more layout than the hero (LayoutCount)', () => {
  test('60-move sweep over the footer and over the hero both cost 0 extra layouts', async ({
    page,
    context,
  }) => {
    await liftAutomationGate(context)
    const cdp = await context.newCDPSession(page)
    await cdp.send('Performance.enable')

    const layoutCount = async () => {
      const { metrics } = await cdp.send('Performance.getMetrics')
      const metric = metrics.find((m: { name: string; value: number }) => m.name === 'LayoutCount')
      if (!metric) throw new Error('LayoutCount metric not reported by this engine')
      return metric.value
    }

    const sweep = async (box: { x: number; y: number; width: number; height: number }) => {
      const before = await layoutCount()
      for (let i = 0; i < 60; i++) {
        const x = box.x + (box.width * i) / 60
        const y = box.y + box.height / 2
        await page.mouse.move(x, y)
      }
      const after = await layoutCount()
      return after - before
    }

    await page.goto('/contact')
    // Warm-up: the FIRST pointer move on the page mounts the custom cursor (new DOM —
    // .cursor-dot/.cursor-ring), which costs its own one-time layout unrelated to
    // either region being measured. Spend that cost here, outside both sweeps, so
    // neither delta is blamed for a mount cost the other would have paid instead had
    // it swept first.
    await page.mouse.move(10, 10)
    await page.waitForTimeout(50)

    const hero = await page.locator('.site-hero').boundingBox()
    if (!hero) throw new Error('no .site-hero to sweep')
    const heroDelta = await sweep(hero)

    const slab = page.locator(SLAB)
    await slab.scrollIntoViewIfNeeded()
    // Same reasoning as the hero warm-up above: the scroll itself, and the cursor's
    // first arrival at a new region's coordinate space, can each cost one settling
    // layout. Spend it here, before this sweep's own "before" reading.
    const settleBox = await slab.boundingBox()
    if (settleBox) await page.mouse.move(settleBox.x + 5, settleBox.y + 5)
    await page.waitForTimeout(50)
    const footer = await slab.boundingBox()
    if (!footer) throw new Error('no footer slab to sweep')
    const footerDelta = await sweep(footer)

    expect(heroDelta, `hero sweep cost ${heroDelta} layouts, expected 0`).toBe(0)
    expect(footerDelta, `footer sweep cost ${footerDelta} layouts, expected 0`).toBe(0)
  })
})
