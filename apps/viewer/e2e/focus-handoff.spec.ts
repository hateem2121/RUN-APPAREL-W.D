import { expect, type Page, test } from '@playwright/test'
import { SITE_MENU_ID } from '../../../packages/shared/src/siteBar'

/**
 * VA-05 (visual audit, 2026-10-02): the page hands focus over only to a visitor who has not
 * moved it.
 *
 * `App.tsx` focuses the page wrapper when the opening curtain leaves. The page behind the
 * curtain is already live, though — Tab-able from the moment the data arrives until the curtain
 * has gone, up to 1.2 s (400 ms floor + 800 ms wipe) — and a keyboard visitor does not wait.
 * Measured with normal motion before the fix: Tab at 1.5 s reached "Skip to main content" and
 * within 400 ms focus was pulled to the wrapper; a phone menu opened in that window lost its
 * focus the same way, with the menu still open (WCAG 2.2 SC 3.2.1, failure F55).
 *
 * ⚠️ THE CURTAIN ONLY PLAYS FOR A HUMAN. `Preloader.tsx` treats `navigator.webdriver` like
 * reduced motion and hands back at once, so under automation there is no window to press a key
 * in and every assertion below would pass against the unfixed code. Same override as
 * `audit-guards.spec.ts`'s `asAHuman`, and normal motion is emulated because the suite default
 * is `reduce`.
 *
 * ⚠️ THE ASSERTIONS ARE NEGATIVE, SO THEY WAIT LONG ENOUGH FOR THE BUG TO SHOW. "Focus was not
 * taken" is true the instant before the hand-off runs, which is how a first draft of the
 * "page opens at the very top" test (motion-and-layout.spec.ts) passed against unfixed code.
 * Each test below waits for the curtain to leave and then up to 750 ms for the hand-off to
 * land; against the unfixed code it lands within a frame, so 750 ms is generous, and against
 * the fix the wait runs out and the assertion holds.
 *
 * ⚠️ THE FIRST TEST IS THE CONTROL: with nothing pressed the hand-off must still happen, so a
 * setup that never plays the curtain (and so could never fail the other two) is caught here.
 */

const asAHuman = `Object.defineProperty(Navigator.prototype, 'webdriver', {
  get: () => false,
  configurable: true,
})`

const CURTAIN = '.preloader'
const HAND_OFF_WINDOW_MS = 750

/** True if the page wrapper takes focus within the window — the hand-off landing. */
const handOffLands = (page: Page, within = HAND_OFF_WINDOW_MS) =>
  page
    .waitForFunction(() => document.activeElement?.id === 'viewer-top', undefined, {
      timeout: within,
    })
    .then(
      () => true,
      () => false,
    )

test.describe('the page hands focus over only to a visitor who has not moved it (VA-05)', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(asAHuman)
    await page.emulateMedia({ reducedMotion: 'no-preference' })
  })

  test('with nothing pressed, the curtain leaving still hands focus to the top of the page', async ({
    page,
  }) => {
    await page.goto('/n001/wine')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    expect(
      await handOffLands(page, 10_000),
      'the curtain left and focus never reached the page wrapper (#viewer-top)',
    ).toBe(true)
    await expect(page.locator(CURTAIN)).toHaveCount(0)
  })

  test('a Tab pressed while the curtain is still up keeps focus on the skip link', async ({
    page,
    browserName,
  }) => {
    test.skip(browserName === 'webkit', 'WebKit leaves links out of the Tab order by preference')
    await page.goto('/n001/wine')
    // The garment page is built under the curtain once the data arrives.
    await page.locator('.skip-link').waitFor({ state: 'attached' })
    expect(
      await page.locator(CURTAIN).count(),
      'the curtain was gone before the key was pressed, so this would measure nothing',
    ).toBe(1)

    await page.keyboard.press('Tab')
    expect(
      await page.evaluate(() => document.activeElement?.className ?? ''),
      'the first Tab did not reach the skip link',
    ).toContain('skip-link')

    await expect(page.locator(CURTAIN)).toHaveCount(0, { timeout: 10_000 })
    expect(
      await handOffLands(page),
      'the curtain left and pulled focus off the skip link to the page wrapper',
    ).toBe(false)
    expect(await page.evaluate(() => document.activeElement?.className ?? '')).toContain(
      'skip-link',
    )
  })

  test('a menu opened while the curtain is still up stays open, with focus on its button', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 800 })
    await page.goto('/n001/wine')
    const button = page.locator('.notch__menu-btn')
    await button.waitFor({ state: 'attached' })
    expect(
      await page.locator(CURTAIN).count(),
      'the curtain was gone before the menu was opened, so this would measure nothing',
    ).toBe(1)

    // By key, not by click: the curtain covers the page, so a click would wait for it to go.
    await button.focus()
    await page.keyboard.press('Enter')
    await expect(page.locator(`#${SITE_MENU_ID}:popover-open`)).toHaveCount(1)

    await expect(page.locator(CURTAIN)).toHaveCount(0, { timeout: 10_000 })
    expect(
      await handOffLands(page),
      'the curtain left and threw the visitor out of the open menu to the top of the page',
    ).toBe(false)
    await expect(
      page.locator(`#${SITE_MENU_ID}:popover-open`),
      'the menu closed under the visitor',
    ).toHaveCount(1)
    expect(await page.evaluate(() => document.activeElement?.className ?? '')).toContain(
      'notch__menu-btn',
    )
  })
})
