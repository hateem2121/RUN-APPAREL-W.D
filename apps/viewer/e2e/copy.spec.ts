import { expect, type Page, test } from '@playwright/test'
import { formatAddress } from '../../../packages/shared/src/company'
import {
  findBritishSpellings,
  findBuzzwords,
  findEmoji,
  GARMENT_TERMS,
  primaryActionsInPage,
  primaryActionsOnScreen,
  readCopyInPage,
} from '../../../scripts/copy-rules.mjs'

/**
 * Copy on the 3D pages, read the way a visitor reads it.
 *
 * The footer test lives with the copy rules because what a footer prints IS copy: the
 * privacy notice, the terms and the postal address are what a buyer holding the garment
 * looks for, and the unit test sees only the component, not the page it ends up on.
 */

test.describe('the footer', () => {
  test('links the privacy notice and the terms, and prints the postal address', async ({
    page,
  }) => {
    await page.goto('/n001/wine')
    // The website's footer since 2026-10-02 (VA-31); the old footer's `.footer__meta` is gone.
    const meta = page.locator('footer.site-footer')
    await expect(meta.getByRole('link', { name: 'Privacy', exact: true })).toHaveAttribute(
      'href',
      'https://wear-run.com/privacy',
    )
    await expect(meta.getByRole('link', { name: 'Terms', exact: true })).toHaveAttribute(
      'href',
      'https://wear-run.com/terms',
    )
    await expect(meta).toContainText(formatAddress())
  })
})

const API = '**/api/public/viewer/**'

/** The three copy rules on whatever the page shows now. Returns what it read. */
async function expectCopyRules(page: Page) {
  const copy = await page.evaluate(readCopyInPage)
  expect(
    copy.body.length,
    'the screen rendered almost no text, so every rule below would pass',
  ).toBeGreaterThan(80)
  expect(
    copy.headings.flatMap((heading) => findEmoji(heading)),
    'emoji in a heading (CT-01)',
  ).toEqual([])
  // Garment text may say "seamless" and mean the knitting method — see copy-rules.mjs.
  expect(findBuzzwords(copy.body, { allow: GARMENT_TERMS }), 'buzzwords (CT-03)').toEqual([])
  expect(
    findBritishSpellings([copy.body, ...copy.decoded].join('\n')),
    'British spelling in visible or pre-filled text (CT-05)',
  ).toEqual([])
  return copy
}

test.describe('copy rules on every screen a QR scan can land on', () => {
  test('a product page', async ({ page }) => {
    await page.goto('/n001/wine')
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/Velocity Performance/i)
    await expectCopyRules(page)
  })

  test('a colorway that has been switched off', async ({ page }) => {
    await page.goto('/n001/not-a-colorway')
    await expect(page.getByText(/linked by this QR is no longer active/i)).toBeVisible()
    await expectCopyRules(page)
  })

  test('a garment that is not published', async ({ page }) => {
    await page.goto('/not-a-garment/wine')
    await expect(page.getByText('[ REFERENCE UNAVAILABLE ]')).toBeVisible()
    const copy = await expectCopyRules(page)
    expect(copy.decoded.join('\n'), 'the pre-filled email was not read').toContain(
      'QR reference unavailable',
    )
  })

  test('the product failed to load', async ({ page }) => {
    await page.route(API, (route) =>
      route.fulfill({ status: 500, contentType: 'application/json', body: '{}' }),
    )
    await page.goto('/n001/wine')
    await expect(page.getByText('[ TEMPORARILY UNAVAILABLE ]')).toBeVisible()
    const copy = await expectCopyRules(page)
    expect(copy.decoded.join('\n'), 'the pre-filled email was not read').toContain(
      'QR reference unavailable',
    )
  })
})

// "Ask about this garment" since polish S10 + Q42 (owner, 2026-10-04): the page's one closing
// prompt, the main button of its contact section, where Email Us and WhatsApp Us are quieter.
const PRIMARY_LABELS = [/^Email Us$/, /^Try Again$/, /^Trying…$/, /^Ask about this garment$/]

/**
 * Waits until the phone's contact bar has answered the last scroll: two frames for its observer,
 * then its fade done (reduced motion makes that one frame), so it is hidden exactly when it has
 * stepped aside. A bar with focus inside it stays by design, and none of these stops gives it any.
 */
async function barSettled(page: Page) {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  )
  await expect
    .poll(() =>
      page.evaluate(() => {
        const bar = document.querySelector('.action-bar')
        if (!bar) return true
        return bar.hasAttribute('data-tucked') === (getComputedStyle(bar).visibility === 'hidden')
      }),
    )
    .toBe(true)
}

for (const viewport of [
  { width: 390, height: 844 },
  { width: 1440, height: 900 },
]) {
  /*
   * ⚠️ SCROLLED THROUGH, NOT MEASURED AT ONCE, SINCE POLISH S10 (2026-10-04). The page's closing
   * section leads with "Ask about this garment" and the phone's fixed bar with Email Us: two
   * places. The bar steps aside while that button is in view, which a whole-page measurement
   * cannot see (it counts a fixed bar on every screen), so this stops every half screen, lets the
   * bar answer, and counts the main buttons a visitor can see and press there
   * (`primaryActionsOnScreen`). Measured at once, it failed in four engines on a screen where only
   * one of the two could be seen.
   */
  test(`one primary action per screen at ${viewport.width}px (CT-08)`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.setViewportSize(viewport)
    const screens: [string, () => Promise<void>][] = [
      [
        '/n001/wine',
        () =>
          expect(page.getByRole('heading', { level: 1 })).toContainText(/Velocity Performance/i),
      ],
      [
        '/not-a-garment/wine',
        () => expect(page.getByText('[ REFERENCE UNAVAILABLE ]')).toBeVisible(),
      ],
    ]
    for (const [path, ready] of screens) {
      await page.goto(path)
      await ready()
      const { primaries } = await page.evaluate(primaryActionsInPage)
      expect(
        primaries.length,
        `${path}: no primary action found, so this would pass vacuously`,
      ).toBeGreaterThan(0)
      for (const { label } of primaries) {
        expect(
          PRIMARY_LABELS.some((pattern) => pattern.test(label)),
          `"${label}" on ${path}`,
        ).toBe(true)
      }
      const height = await page.evaluate(() => document.documentElement.scrollHeight)
      const tops = new Set<number>()
      for (let top = 0; top < height; top += Math.floor(viewport.height / 2)) tops.add(top)
      // …and every 8px while each main button in the page rises past the foot of the screen,
      // where the phone's bar sits: the moment two main buttons could show together lasts
      // about 60px of scrolling, which half-screen stops step over (planted, 2026-10-04).
      const rising = await page.evaluate(() =>
        [...document.querySelectorAll('.btn--primary')]
          .filter((element) => {
            for (let node: Element | null = element; node; node = node.parentElement) {
              if (getComputedStyle(node).position === 'fixed') return false
            }
            return element.getBoundingClientRect().height > 0
          })
          .map((element) =>
            Math.round(element.getBoundingClientRect().bottom + window.scrollY - innerHeight),
          ),
      )
      for (const start of rising) {
        for (let top = Math.max(0, start - 16); top <= start + 240; top += 8) tops.add(top)
      }
      let stops = 0
      for (const top of [...tops].sort((a, b) => a - b)) {
        await page.evaluate((y) => window.scrollTo(0, y), top)
        await barSettled(page)
        const destinations = [
          ...new Set((await page.evaluate(primaryActionsOnScreen)).map((p) => p.destination)),
        ]
        stops += 1
        expect(
          destinations.length,
          `${path} at ${viewport.width}px, scrolled to ${top}px: ${destinations.join(' + ')}`,
        ).toBeLessThanOrEqual(1)
      }
      expect(stops, `${path}: the walk stopped nowhere`).toBeGreaterThan(1)
    }
  })
}
