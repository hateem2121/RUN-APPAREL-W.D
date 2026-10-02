import { expect, type Page, test } from './offlineMedia'
import {
  SITE_MENU_ID,
  SITE_MENU_NAME,
  THEME_SWITCH_NAMES,
} from '../../../packages/shared/src/siteBar'
import { parseCssColour, relativeLuminance } from '../../../scripts/contrast-rules.mjs'
import { THEME_STORAGE_KEY } from '../src/lib/themeBoot'
import { PHONE_QUERY, THEME_COLOR } from '../src/lib/themeColor'

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
 * `light-dark()`). Measured 2026-09-23: Lightning CSS 1.33.0 makes
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
    // The phone's browser bar follows the choice (the viewer's N6): every tag takes the dark
    // colour of its kind — the bar's on phones, the page's elsewhere — and keeps its own media,
    // so a desktop never takes the phone colour (VA-50).
    const metas = await page
      .locator('meta[name="theme-color"]')
      .evaluateAll((tags) =>
        tags.map((tag) => `${tag.getAttribute('content')}|${tag.getAttribute('media') ?? ''}`),
      )
    const dark = (phone: boolean) =>
      THEME_COLOR.find((t) => t.media.includes('dark') && t.media.includes(PHONE_QUERY) === phone)
        ?.color
    expect(metas).toEqual(
      THEME_COLOR.map((t) => `${dark(t.media.includes(PHONE_QUERY))}|${t.media}`),
    )
  })

  test('remembers the choice, and applies it before the first paint of the next page', async ({
    page,
  }) => {
    await page.goto('/')
    await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' })
    await page.goto('/')
    await page.getByRole('button', { name: THEME_SWITCH_NAMES.toDark, exact: true }).click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark', { timeout: 15_000 })
    // The privacy page names exactly ONE thing a press keeps (the owner's choice,
    // 2026-09-23). Anything else kept makes that page wrong with nothing else going red.
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
    // Measured once the menu has landed: it drops in on a scale from 0.94 (VA-51), and even
    // reduced motion's 0.01ms leaves one frame at 41.4px (44 x 0.94), caught in the full suite.
    await page.waitForFunction(() =>
      (document.querySelector('.notch-shell') as HTMLElement)
        .getAnimations({ subtree: true })
        .every((a) => a.playState !== 'running' || a.timeline !== document.timeline),
    )
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
      // Products, Contact and Guides, the phone menu's own (VA-37).
      await expect(page.locator(`#${SITE_MENU_ID} a`)).toHaveCount(3)
      await expect(page.locator('.theme-toggle')).toBeHidden()
    })
  })
})

/**
 * VA-38 (visual audit 2026-10-02) said the switch "names the wrong action before the script runs:
 * the server always writes 'Switch to dark mode'; the script corrects it about a second later".
 * The server writes BOTH names, one in each face, and `notch.css` shows the face for the page's
 * theme (`data-theme`, else the system's), so by that reading the name is the page's own from the
 * first paint. This reads it to see whether the finding holds.
 *
 * THE SCRIPTS ARE REFUSED, not waited for: every `.js` request is aborted, so React never
 * hydrates. The proof that it did not is the tooltip, which only the script writes. The small
 * inline script that applies a returning visitor's stored choice (`lib/themeBoot.ts`) is not a
 * request, so it still runs, as it does before the first paint. The four cases are the system's
 * preference crossed with a stored choice that disagrees with it, which is where a wrong name
 * could hide. `apps/viewer/src/components/themeSwitchName.test.tsx` holds the `data-theme` half in
 * a unit test; the system-preference half only a browser can read.
 *
 * ⚠️ IF A CASE HERE FAILS the finding is true and the switch needs the neutral label the audit asked
 * for ("Change colour theme" until the script has run); `siteBarAriaSnapshot` would then need that
 * name in its theme-switch pattern too, or the bar's snapshot tests would have to wait for hydration.
 */
test.describe('VA-38 — before any script has run, the switch is named for the page it is on', () => {
  const CASES = [
    {
      colorScheme: 'light',
      stored: null,
      expected: THEME_SWITCH_NAMES.toDark,
      other: THEME_SWITCH_NAMES.toLight,
    },
    {
      colorScheme: 'dark',
      stored: null,
      expected: THEME_SWITCH_NAMES.toLight,
      other: THEME_SWITCH_NAMES.toDark,
    },
    {
      colorScheme: 'light',
      stored: 'dark',
      expected: THEME_SWITCH_NAMES.toLight,
      other: THEME_SWITCH_NAMES.toDark,
    },
    {
      colorScheme: 'dark',
      stored: 'light',
      expected: THEME_SWITCH_NAMES.toDark,
      other: THEME_SWITCH_NAMES.toLight,
    },
  ] as const

  for (const { colorScheme, stored, expected, other } of CASES) {
    test(`a ${colorScheme} system${stored ? ` with a stored ${stored} choice` : ''} hears "${expected}"`, async ({
      page,
    }) => {
      await page.route(
        (url) => url.pathname.endsWith('.js'),
        (route) => route.abort(),
      )
      if (stored) {
        await page.addInitScript(({ key, value }) => localStorage.setItem(key, value), {
          key: THEME_STORAGE_KEY,
          value: stored,
        })
      }
      await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' })
      await page.setViewportSize({ width: 1280, height: 800 })
      await page.goto('/')
      const switchButton = page.locator('.theme-toggle')
      // The control: the script did not run, or this is not the state before it.
      await expect(
        switchButton,
        'the page hydrated, so this reads the state AFTER the script',
      ).not.toHaveAttribute('title', /./)
      await expect(page.getByRole('button', { name: expected, exact: true })).toBeVisible()
      await expect(
        page.getByRole('button', { name: other, exact: true }),
        `the switch also answers to "${other}", the wrong action`,
      ).toHaveCount(0)
    })
  }
})
