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

const VIEWPORTS = [
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
