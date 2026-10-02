import { expect, test } from '@playwright/test'

/**
 * VA-56 (visual audit, 2026-10-02): with JavaScript off, a garment page said "PREPARING…" for
 * ever. The page carries a clear no-JavaScript message (RO-06, `index.html`), but the loading
 * screen drawn from the HTML itself (RO-08) is `position: fixed` over the whole screen and covered
 * it, and nothing ever replaces that screen without a script. AccessLint also flagged the
 * message as outside any landmark. The loading screen is now hidden when scripting is off
 * (`@media (scripting: none)`) and the message sits in a `<main>`.
 *
 * ⚠️ `noscript.spec.ts` PASSED THROUGH ALL OF THIS. It asks Playwright whether the paragraph is
 * VISIBLE, and "visible" means it has a box and is not `visibility: hidden` — a fixed layer
 * painted over it does not count. So the page was reported as showing its message while no
 * visitor could see it. What a visitor has is "is the message the thing under my finger", which
 * is what a TRIAL click measures: it runs the full actionability check, hit-testing included,
 * and fails with "<div class="preloader"> intercepts pointer events" when something covers the
 * target, without clicking. The first two tests below fail against the old page for exactly that
 * reason.
 *
 * ⚠️ NO `page.evaluate` WITH SCRIPTS OFF — only locators, which run in Playwright's own world
 * (the existing spec does the same, and says why `getByText` finds nothing inside `<noscript>`).
 */

const MESSAGE = 'This 3D garment reference needs JavaScript.'

test.describe('with JavaScript off, the page shows its message and nothing covers it (VA-56)', () => {
  test.use({ javaScriptEnabled: false })

  test('the loading screen is not drawn', async ({ page }) => {
    await page.goto('/n001/wine')
    await expect(
      page.locator('.preloader'),
      '"PREPARING…" is still drawn over the page, and nothing will ever replace it',
    ).toBeHidden()
  })

  test('the message and its contact link are what a visitor reaches, not the loading screen', async ({
    page,
  }) => {
    await page.goto('/n001/wine')
    const message = page.locator('p', { hasText: MESSAGE })
    await expect(message).toBeVisible()
    // A trial click: every actionability check, the hit test included, and no click.
    await message.click({ trial: true, timeout: 5_000 })
    await page.getByRole('link', { name: 'wear-run.com/contact' }).click({
      trial: true,
      timeout: 5_000,
    })
  })

  test('the message is inside the page’s main landmark', async ({ page }) => {
    await page.goto('/n001/wine')
    await expect(
      page.getByRole('main'),
      'the no-JavaScript message is outside any landmark',
    ).toContainText(MESSAGE)
    await expect(page.getByRole('main')).toHaveCount(1)
  })
})

test.describe('with JavaScript on, the loading screen still shows while the garment loads (VA-56 control)', () => {
  test('the scripting rule does not hide it for everyone', async ({ page }) => {
    // Hold the garment's data back, so the page stays on its loading screen.
    await page.route('**/api/public/viewer/**', () => {})
    await page.goto('/n001/wine', { waitUntil: 'domcontentloaded' })
    await expect(
      page.locator('.preloader'),
      'the loading screen is hidden for a visitor who has JavaScript',
    ).toBeVisible()
    expect(
      await page.locator('.preloader').evaluate((element) => getComputedStyle(element).display),
    ).toBe('grid')
  })
})
