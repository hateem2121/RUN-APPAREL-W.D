import { expect, type Page, test } from '@playwright/test'
import {
  SITE_MENU_ID,
  SITE_MENU_NAME,
  THEME_SWITCH_NAMES,
} from '../../../packages/shared/src/siteBar'
import { parseCssColour, relativeLuminance } from '../../../scripts/contrast-rules.mjs'

const OPEN = `#${SITE_MENU_ID}:popover-open`

/** The luminance of the page the visitor sees: under 0.2 is dark, over 0.5 light. */
const ground = (page: Page) =>
  page
    .evaluate(() => getComputedStyle(document.body).backgroundColor)
    .then((colour) => relativeLuminance(parseCssColour(colour).rgb))

/**
 * XS-05 — the site gets the viewer's light/dark switch, inside the bar (owner, 2026-09-17).
 *
 * ⚠️ THE FIRST TEST MEASURES THE RENDERED PAGE, NOT THE ATTRIBUTE. SiteHeader.tsx recorded on
 * 2026-09-05 that the BUILT stylesheet would ignore `data-theme` (Lightning CSS downlevels
 * `light-dark()`). Measured while planning Phase 1b-B: Lightning CSS 1.33.0 makes
 * `:root[data-theme="dark"]` set the polyfill's own variables, and the viewer's real build
 * carries exactly that rule. This suite runs against `next build` + `next start`, so it is
 * the authority either way.
 */
test.describe('XS-05 — the light/dark switch on the site', () => {
  test('flips the page the visitor sees, in the built site, and says what it will do next', async ({
    page,
  }) => {
    await page.goto('/')
    await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' })
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/')
    expect(await ground(page), 'the page did not start light').toBeGreaterThan(0.5)
    await page.getByRole('button', { name: THEME_SWITCH_NAMES.toDark, exact: true }).click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    await expect
      .poll(() => ground(page), { message: 'data-theme is set and the page stayed light' })
      .toBeLessThan(0.2)
    await expect(
      page.getByRole('button', { name: THEME_SWITCH_NAMES.toLight, exact: true }),
    ).toBeVisible()
    // The phone's browser bar follows the choice (the viewer's N6): one colour, no media.
    const metas = await page
      .locator('meta[name="theme-color"]')
      .evaluateAll((tags) =>
        tags.map((tag) => `${tag.getAttribute('content')}|${tag.getAttribute('media') ?? ''}`),
      )
    expect(metas.length).toBeGreaterThan(0)
    for (const meta of metas) expect(meta).toBe('#1c1f18|')
  })

  test('remembers the choice, and applies it before the first paint of the next page', async ({
    page,
  }) => {
    await page.goto('/')
    await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' })
    await page.goto('/')
    await page.getByRole('button', { name: THEME_SWITCH_NAMES.toDark, exact: true }).click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark', { timeout: 15_000 })
    // The privacy page names exactly ONE thing a press keeps (Question Q3 = A). Anything
    // else kept makes that page wrong with nothing else going red.
    const kept = await page.evaluate(() => ({
      local: Object.fromEntries(Object.entries(localStorage)),
      session: Object.keys(sessionStorage),
    }))
    expect(kept).toEqual({ local: { 'run-theme': 'dark' }, session: [] })
    expect(await page.context().cookies()).toEqual([])
    // What <html> said when the document finished parsing — before React could hydrate.
    await page.addInitScript(() => {
      document.addEventListener('DOMContentLoaded', () => {
        ;(window as unknown as { themeAtParse?: string | null }).themeAtParse =
          document.documentElement.getAttribute('data-theme')
      })
    })
    await page.goto('/products')
    expect(
      await page.evaluate(
        () => (window as unknown as { themeAtParse?: string | null }).themeAtParse,
      ),
      'the choice arrived after the first paint: the boot script did not run',
    ).toBe('dark')
    expect(await ground(page)).toBeLessThan(0.2)
  })

  test('with motion on, the press still lands (a view transition, as in the viewer)', async ({
    page,
  }) => {
    // The same patience the viewer's test needed: WebKit on a loaded runner waits for a frame.
    await page.goto('/')
    await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'no-preference' })
    await page.goto('/')
    await page.getByRole('button', { name: THEME_SWITCH_NAMES.toDark, exact: true }).click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark', { timeout: 15_000 })
  })

  test('sits in the phone menu as a 44px row, and works there', async ({ page }) => {
    await page.goto('/')
    await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' })
    await page.setViewportSize({ width: 390, height: 800 })
    await page.goto('/')
    const theSwitch = page.getByRole('button', { name: THEME_SWITCH_NAMES.toDark, exact: true })
    await expect(theSwitch, 'the switch shows outside the closed menu').toBeHidden()
    await page.getByRole('button', { name: SITE_MENU_NAME, exact: true }).click()
    await expect(page.locator(OPEN)).toHaveCount(1)
    await expect(theSwitch).toBeVisible()
    expect((await theSwitch.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(43.95)
    await theSwitch.click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  })

  test.describe('with scripting off', () => {
    test.use({ javaScriptEnabled: false })

    test('the switch is not offered — a button that cannot work is worse than none', async ({
      page,
    }) => {
      await page.setViewportSize({ width: 1280, height: 800 })
      await page.goto('/')
      await expect(
        page.locator(`#${SITE_MENU_ID} a`).first(),
        'the bar did not render',
      ).toBeVisible()
      await expect(page.locator('.theme-toggle')).toBeHidden()
      await page.setViewportSize({ width: 390, height: 800 })
      await page.getByRole('button', { name: SITE_MENU_NAME, exact: true }).click()
      await expect(page.locator(OPEN)).toHaveCount(1)
      await expect(page.locator(`#${SITE_MENU_ID} a`)).toHaveCount(2)
      await expect(page.locator('.theme-toggle')).toBeHidden()
    })
  })
})
