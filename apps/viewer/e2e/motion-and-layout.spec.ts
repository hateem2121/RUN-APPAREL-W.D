import { expect, test } from '@playwright/test'

/**
 * The two halves of the motion layer, and the layout invariants that no gate
 * watched before 2026-08-13.
 *
 * WHY THIS FILE EXISTS. `playwright.config.ts` sets `reducedMotion: 'reduce'` in
 * the top-level `use`, for a good reason — it collapses the motion layer so
 * selectors and timing stay stable. The side effect is that the entire suite ran
 * in the branch MOST VISITORS NEVER SEE. `base.css` gates the scroll-reveal on
 * `@media (prefers-reduced-motion: no-preference)`, so `[data-reveal]` elements
 * only take `opacity: 0` in the default case — the case nothing tested. A reveal
 * that never un-reveals would have been invisible to CI and obvious to everyone
 * else.
 *
 * Both branches are therefore asserted here explicitly, each overriding the
 * suite default rather than relying on it.
 *
 * WHY NOT SCREENSHOT BASELINES. Pixel comparison was the obvious tool for the
 * spacing and placement regressions this file guards, and it was rejected:
 * Playwright baselines are per-platform, CI is Linux, and the only machine that
 * can generate them here is macOS. Committing Mac baselines makes CI fail
 * forever; committing none makes the first CI run generate and pass, which is a
 * gate that has never once compared anything. The invariants below are computed
 * from the live DOM instead — platform-independent, no baseline to rot, and they
 * fail on the specific things the 2026-08-13 audit found rather than on any
 * anti-aliasing difference.
 */

/**
 * ⚠️ 320 was ADDED 2026-08-14 and it is the width that mattered.
 *
 * This matrix started at 375 and the page failed at 320: measured live,
 * `clientWidth` 320 against `scrollWidth` 352 — 32px of sideways scrolling, a
 * WCAG 1.4.10 Reflow failure. The gate existed, passed, and was blind to it,
 * because 375 is where the header's contents happen to still fit.
 *
 * 320 is not an arbitrary extra rung. It is the criterion's own threshold, and
 * it is also what a 1280px desktop shows at the 400% zoom the same criterion
 * requires — so this row covers a low-vision desktop visitor as much as a small
 * phone. The rail test below already used 320; the document never did.
 */
const VIEWPORTS = [
  { name: 'small mobile', width: 320, height: 640 },
  { name: 'mobile', width: 375, height: 812 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1280, height: 800 },
] as const

test.describe('motion layer', () => {
  test('reduced motion never leaves revealed content invisible', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/n001/wine')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

    // The `opacity: 0` that starts a reveal lives inside
    // `@media (prefers-reduced-motion: no-preference)`, so under `reduce` it must
    // never apply. This is the failure mode most sites ship: hide-then-reveal
    // written unconditionally, with only the transition disabled, which leaves a
    // motion-sensitive visitor on a blank page.
    const hidden = await page.evaluate(
      () =>
        [...document.querySelectorAll('[data-reveal]')].filter(
          (el) => Number.parseFloat(getComputedStyle(el).opacity) === 0,
        ).length,
    )
    expect(hidden, 'a [data-reveal] element is invisible under prefers-reduced-motion').toBe(0)
  })

  test('the default branch reveals content rather than stranding it', async ({ page }) => {
    // Explicitly the OPPOSITE of the suite default — this is the branch real
    // visitors get, and until 2026-08-13 nothing exercised it at all.
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await page.goto('/n001/wine')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

    const reveals = page.locator('[data-reveal]')
    const count = await reveals.count()
    expect(count, 'expected the page to use the scroll-reveal layer at all').toBeGreaterThan(0)

    // Scroll the whole document so every reveal crosses its trigger, then assert
    // that each one actually arrived. `is-inview` is the class the observer adds;
    // asserting the computed opacity instead keeps this honest about what the
    // visitor sees rather than about the mechanism.
    await page.evaluate(async () => {
      for (let y = 0; y <= document.body.scrollHeight; y += 400) window.scrollTo(0, y)
      window.scrollTo(0, 0)
    })

    await expect
      .poll(
        async () =>
          page.evaluate(
            () =>
              [...document.querySelectorAll('[data-reveal]')].filter(
                (el) => Number.parseFloat(getComputedStyle(el).opacity) === 0,
              ).length,
          ),
        {
          message: 'a [data-reveal] element never revealed after the page was scrolled through',
          timeout: 10_000,
        },
      )
      .toBe(0)
  })

  test('a finished reveal releases its compositor layer', async ({ page }) => {
    /**
     * `will-change: opacity, transform` was declared on `[data-reveal]` and never
     * withdrawn — `.is-inview` sets `opacity: 1; transform: none` and inherits the
     * hint from the rule above it. Five elements carry `[data-reveal]`, so after
     * the visitor's first scroll the page holds five compositor layers forever,
     * for animations that have finished and cannot run again: `startReveals()`
     * calls `observer.unobserve()` on each element as it arrives.
     *
     * `will-change` is a hint with a real memory cost, and the spec is explicit
     * that it should be removed once the animation is done. This is exactly the
     * device that is already carrying a 27 MB model on a phone GPU.
     *
     * Must run under `no-preference`: the whole reveal layer — and therefore the
     * hint — lives inside that media block, so under the suite's default `reduce`
     * this assertion would pass vacuously.
     */
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await page.goto('/n001/wine')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

    await page.evaluate(() => {
      for (let y = 0; y <= document.body.scrollHeight; y += 400) window.scrollTo(0, y)
      window.scrollTo(0, 0)
    })

    await expect
      .poll(
        async () =>
          page.evaluate(() =>
            [...document.querySelectorAll('[data-reveal].is-inview')]
              .filter((el) => getComputedStyle(el).willChange !== 'auto')
              .map((el) => el.className),
          ),
        {
          message:
            'a finished reveal is still holding a compositor layer — will-change is a ' +
            'hint with a memory cost and must be released once the animation is done',
          timeout: 10_000,
        },
      )
      .toEqual([])
  })
})

test.describe('interaction feedback', () => {
  test('every control answers a press, on a phone as well as a pointer', async ({ page }) => {
    await page.goto('/n001/wine')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

    /**
     * There was not one `:active` rule in `apps/viewer/src` — verified by grep
     * across every CSS and TSX file on 2026-08-14.
     *
     * That is not an oversight in isolation; it is the shadow of a correct
     * decision. Every interaction cue in this viewer sits inside
     * `@media (hover: hover) and (pointer: fine)`, deliberately, because an
     * ungated `:hover` sticks after a tap (see the touch test below and the
     * `pointer-only styling` suite in tokens.test.ts). The consequence nobody
     * followed through on: the phone — the device a QR code is scanned with —
     * was then left with NO feedback on any control at all.
     *
     * `:active` is the correct answer and is deliberately NOT gated: unlike
     * `:hover` it is a real press on both pointer types and it releases itself.
     */
    const missing = await page.evaluate(() => {
      const css = [...document.styleSheets]
        .flatMap((sheet) => {
          try {
            return [...sheet.cssRules]
          } catch {
            return []
          }
        })
        .map((rule) => rule.cssText)
        .join('\n')
      return [
        '.btn:active',
        '.camera-btn:active',
        '.colourway-tab:active',
        '.theme-toggle:active',
      ].filter((selector) => !css.includes(selector))
    })

    expect(
      missing,
      'these controls give a phone no press feedback — every other cue in this ' +
        'stylesheet is correctly hidden behind (hover: hover), which leaves touch with nothing',
    ).toEqual([])
  })
})

test.describe('the header survives a phone', () => {
  for (const width of [320, 360, 375, 390, 414]) {
    test(`controls keep their size and the nav stays on one line at ${width}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 720 })
      await page.goto('/n001/wine')
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

      /**
       * `.header` had no flex-wrap and no shrink protection, so a declared width
       * on a child acted as a MAXIMUM. Measured live 2026-08-14, before the fix:
       * the theme toggle rendered 2.0px at 320, 21.1px at 360, 27.1px at 375,
       * 30.7px at 390 and 36.6px at 414 — every one of those under the 44px this
       * system states twice, and the first two under WCAG 2.5.8's 24x24 floor.
       *
       * 360px is called out because it is the commonest Android CSS width, and
       * because the existing target-size test runs at 375 where the control is
       * 27px — big enough to clear 24x24 and therefore invisible to that gate.
       */
      const toggle = await page.$eval('.theme-toggle', (el) => el.getBoundingClientRect().width)
      expect(
        Math.round(toggle),
        `the theme toggle is ${toggle}px wide at ${width}px — docs/DESIGN.md §4 states 44`,
      ).toBeGreaterThanOrEqual(44)

      // Measure the VISIBLE label only. The button carries two spans — the long
      // form is moved offscreen rather than unmounted so the accessible name
      // survives (see Header.tsx) — so a Range over the whole button counts the
      // hidden one too and reports four rects for a single-line button.
      const label = await page.$eval('.header .btn', (el) => {
        const shown =
          [...el.children].find((child) => getComputedStyle(child).position !== 'absolute') ?? el
        const range = document.createRange()
        range.selectNodeContents(shown)
        return { lines: range.getClientRects().length, height: el.getBoundingClientRect().height }
      })
      expect(
        label.lines,
        `the nav label wraps to ${label.lines} lines at ${width}px — it is the only ` +
          'navigation on the page and it sits above the garment',
      ).toBeLessThanOrEqual(1)
      // The user-visible consequence, asserted independently of the markup: two
      // lines measured 56.1px against the 40px declared, and that 16px is what
      // inflated the whole header from 69px to 81px on a phone.
      expect(
        Math.round(label.height),
        `the header button is ${label.height}px tall at ${width}px — 40px is one line`,
      ).toBeLessThanOrEqual(48)
    })
  }

  test('shortening the label below 700px does not change its accessible name', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 720 })
    await page.goto('/n001/wine')
    // The long form moves offscreen rather than unmounting, and the short form is
    // aria-hidden — so this must read the same at every width.
    await expect(page.locator('.header .btn')).toHaveAccessibleName('Back to Catalogue')
  })
})

test.describe('layout invariants', () => {
  for (const viewport of VIEWPORTS) {
    test(`no horizontal overflow at ${viewport.name} (${viewport.width}px)`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height })
      await page.goto('/n001/wine')
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

      // The page must never scroll sideways. Individual elements MAY exceed the
      // viewport — the colourway rail scrolls horizontally on purpose, and SVG
      // artwork is clipped by its own viewBox — so the assertion is on the
      // document, which is what the visitor actually feels.
      const overflow = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }))
      expect(
        overflow.scrollWidth,
        `the page scrolls sideways at ${viewport.width}px ` +
          `(${overflow.scrollWidth} > ${overflow.clientWidth})`,
      ).toBeLessThanOrEqual(overflow.clientWidth + 1)
    })
  }

  test('the garment and its colourway picker fit one phone screen, unscrolled', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('/n001/wine')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

    /**
     * Measured on the live site 2026-08-13, before this test existed: the canvas
     * ended at y=674 and the colourway rail began at y=1360 — 686px of product
     * copy in between, because <ColourwayTabs> was rendered inside `.content`
     * AFTER the 613px-tall product panel. Scrolling the rail into view put the
     * canvas 306px above the top of the viewport, so **zero pixels** of the
     * garment were on screen at the moment a visitor chose its colour. Pick a
     * colour blind, scroll back up, discover what you picked.
     *
     * The invariant is deliberately "unscrolled", not "eventually both visible".
     * A weaker assertion — that some scroll position shows both — is satisfied by
     * a layout where the two are 400px apart on a 812px screen, which is the same
     * bug wearing a smaller number. What the visitor is owed is that the garment
     * is already on screen when they reach for the swatches.
     *
     * The fixed action bar is subtracted rather than ignored: it is 72px of
     * EMAIL / WHATSAPP painted over the bottom of the viewport, so a rail that
     * "fits" underneath it does not fit at all.
     */
    const fit = await page.evaluate(() => {
      const box = (selector: string) => {
        const el = document.querySelector(selector)
        if (!el) return null
        const r = el.getBoundingClientRect()
        return { top: Math.round(r.top), bottom: Math.round(r.bottom) }
      }
      const bar = document.querySelector('.action-bar')
      return {
        scrollY: Math.round(window.scrollY),
        usableBottom: bar ? Math.round(bar.getBoundingClientRect().top) : window.innerHeight,
        canvas: box('.stage__canvas'),
        rail: box('[role="tablist"]'),
      }
    })

    expect(fit.canvas, 'no .stage__canvas on the page').not.toBeNull()
    expect(fit.rail, 'no colourway tablist on the page').not.toBeNull()
    const { canvas, rail, usableBottom } = fit as {
      canvas: { top: number; bottom: number }
      rail: { top: number; bottom: number }
      usableBottom: number
    }

    expect(
      canvas.bottom,
      `the garment is cut off: canvas ends at ${canvas.bottom}, ` +
        `usable viewport ends at ${usableBottom}`,
    ).toBeLessThanOrEqual(usableBottom)

    expect(
      rail.bottom,
      `the colourway rail is off screen at rest: it ends at ${rail.bottom}, ` +
        `usable viewport ends at ${usableBottom} — a visitor must scroll the ` +
        `garment away to change its colour`,
    ).toBeLessThanOrEqual(usableBottom)

    expect(
      rail.top,
      `the colourway rail sits above the garment (rail top ${rail.top}, ` +
        `canvas bottom ${canvas.bottom})`,
    ).toBeGreaterThanOrEqual(canvas.bottom)
  })

  test('every interactive control meets the WCAG 2.5.8 target size', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('/n001/wine')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

    // WCAG 2.2 AA wants 24x24 CSS px, with an exception for targets spaced far
    // enough apart that a 24px circle centred on each would not overlap. Both
    // limbs are evaluated, because the header links legitimately rely on the
    // second one.
    const undersized = await page.evaluate(() => {
      const targets = [
        ...document.querySelectorAll<HTMLElement>(
          'a, button, [role="button"], [role="tab"], input, select, summary',
        ),
      ].filter((el) => {
        const r = el.getBoundingClientRect()
        return r.width > 0 && r.height > 0
      })

      return targets
        .filter((el) => {
          const r = el.getBoundingClientRect()
          if (r.width >= 24 && r.height >= 24) return false
          const cx = r.x + r.width / 2
          const cy = r.y + r.height / 2
          const nearest = Math.min(
            ...targets
              .filter((other) => other !== el)
              .map((other) => {
                const q = other.getBoundingClientRect()
                return Math.hypot(cx - (q.x + q.width / 2), cy - (q.y + q.height / 2))
              }),
          )
          return !(nearest >= 24)
        })
        .map((el) => {
          const r = el.getBoundingClientRect()
          const label = (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 30)
          return `${el.tagName.toLowerCase()} "${label}" ${Math.round(r.width)}x${Math.round(r.height)}`
        })
    })

    expect(undersized, 'controls below 24x24 CSS px with no spacing exception').toEqual([])
  })

  test('hover styling is inert on a touch device', async ({ page, browserName }) => {
    // The regression this guards shipped as a CSS-only bug: six `:hover` rules
    // with no `(hover: hover)` guard, two of them sharing their styling with
    // `[aria-pressed]` / `[aria-selected]`. On a phone that makes a
    // merely-tapped control look selected. `hasTouch` is what flips the media
    // query, so the assertion has to run in a touch context to mean anything.
    test.skip(browserName !== 'chromium', 'needs a touch-emulating context')

    const context = await page
      .context()
      .browser()
      ?.newContext({
        hasTouch: true,
        isMobile: true,
        viewport: { width: 375, height: 812 },
      })
    expect(context, 'expected to be able to open a touch context').toBeTruthy()
    if (!context) return

    const touchPage = await context.newPage()
    try {
      await touchPage.goto('/n001/wine')
      await expect(touchPage.getByRole('heading', { level: 1 })).toBeVisible()

      const anyHoverRuleActive = await touchPage.evaluate(
        () => matchMedia('(hover: hover) and (pointer: fine)').matches,
      )
      expect(
        anyHoverRuleActive,
        'a touch context still reports a fine pointer — the guard cannot work here',
      ).toBe(false)
    } finally {
      await context.close()
    }
  })
})

test.describe('the colourway rail fits the screen', () => {
  for (const width of [320, 375, 414]) {
    test(`every colourway is reachable without sliding at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 812 })
      await page.goto('/n001/wine')
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

      /**
       * Measured on the live site 2026-08-13, before this test existed: the rail
       * needed 637px inside 361px of room at 375px wide, so 276px — THREE of the
       * five colourways — sat off the right edge with no visual cue they existed.
       * "03 BUTTE" was clipped mid-word at the boundary.
       *
       * For a B2B garment reference the colourways ARE the product, so a picker
       * that hides 60% of the range by default is not a styling detail.
       *
       * The assertion is deliberately "no horizontal scrolling exists", not "the
       * swatches are wide enough" — a rail that fits by shrinking targets below
       * the WCAG 2.5.8 minimum trades one defect for another, and the target-size
       * test above still guards that independently.
       */
      const fit = await page.evaluate(() => {
        const list = document.querySelector('.colourways__list')
        if (!list) return null
        const listRect = list.getBoundingClientRect()
        const tabs = [...list.querySelectorAll('[role="tab"]')]
        return {
          overflowPx: Math.round(list.scrollWidth - list.clientWidth),
          offEdge: tabs
            .filter((t) => {
              const r = t.getBoundingClientRect()
              return r.right > listRect.right + 1 || r.left < listRect.left - 1
            })
            .map((t) => t.textContent?.trim() ?? '?'),
          count: tabs.length,
        }
      })

      expect(fit, 'no colourway tablist on the page').not.toBeNull()
      const { overflowPx, offEdge, count } = fit as {
        overflowPx: number
        offEdge: string[]
        count: number
      }
      expect(count).toBeGreaterThan(0)
      expect(
        overflowPx,
        `the rail scrolls horizontally by ${overflowPx}px — the colours past the ` +
          'edge can only be found by guessing they are there',
      ).toBeLessThanOrEqual(0)
      expect(
        offEdge,
        `these colourways are outside the visible rail: ${offEdge.join(', ')}`,
      ).toEqual([])
    })
  }
})
