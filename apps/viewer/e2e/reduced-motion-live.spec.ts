import { expect, test } from '@playwright/test'

/**
 * VA-20 (visual audit, 2026-10-02): a reduced-motion change made DURING a visit was not followed —
 * turning it on left the smooth scroller and the custom cursor running until the next page. They
 * decided once, at startup. `polish/index.ts` now stops them when the setting turns on.
 * (The stage's own camera damping is `reduced-motion-live-webgl.spec.ts`: it needs a real 3D stage,
 * so it lives with the other spec files that run in the WebGL project.)
 *
 * ⚠️ AS A HUMAN, WITH MOTION ALLOWED. The polish layer is off under `navigator.webdriver` and
 * under reduced motion, which is this suite's default, so the test lifts the first and emulates
 * `no-preference` for the second — otherwise there is nothing running to stop, and every
 * assertion below would pass against the unfixed code. The first assertions confirm both layers
 * are running (the instrument), and only then is the setting changed.
 *
 * ⚠️ THE ENGINE HAS TO DELIVER THE CHANGE. `useIdentityInAside.ts` records headless WebKit in CI
 * not firing a `matchMedia` change event on a resize; whether Playwright's reduced-motion emulation
 * fires one in each engine is not something to assume. A listener planted in the page before the
 * switch is the positive control: if it never hears the change, this engine cannot show the fix
 * and the test says so and skips, rather than failing for a gap in the emulation.
 */

const asAHuman = `Object.defineProperty(Navigator.prototype, 'webdriver', {
  get: () => false,
  configurable: true,
})`

test('turning reduced motion on mid-visit stops the smooth scroll and the cursor (VA-20)', async ({
  page,
  browserName,
  isMobile,
}) => {
  await page.addInitScript(asAHuman)
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.goto('/n001/wine')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

  // The instrument: both layers are really running before anything changes.
  await expect(
    page.locator('html.lenis'),
    'smooth scrolling never started, so there is nothing to stop',
  ).toHaveCount(1, { timeout: 10_000 })
  if (!isMobile) {
    await expect(
      page.locator('#polish-cursor-root'),
      'the custom cursor never mounted, so there is nothing to stop',
    ).toHaveCount(1, { timeout: 10_000 })
  }

  // The positive control for the engine: does it deliver a change event at all?
  await page.evaluate(() => {
    const heard = { count: 0 }
    ;(window as unknown as { __reducedMotionHeard: typeof heard }).__reducedMotionHeard = heard
    window
      .matchMedia('(prefers-reduced-motion: reduce)')
      .addEventListener('change', () => heard.count++)
  })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const delivered = await page
    .waitForFunction(
      () =>
        (window as unknown as { __reducedMotionHeard: { count: number } }).__reducedMotionHeard
          .count > 0,
      undefined,
      { timeout: 3_000 },
    )
    .then(
      () => true,
      () => false,
    )
  test.skip(!delivered, `${browserName} does not fire a matchMedia change under emulation`)

  await expect(
    page.locator('html.lenis'),
    'smooth scrolling is still running after reduced motion was turned on',
  ).toHaveCount(0, { timeout: 5_000 })
  if (!isMobile) {
    await expect(
      page.locator('#polish-cursor-root'),
      'the custom cursor is still on screen after reduced motion was turned on',
    ).toHaveCount(0, { timeout: 5_000 })
  }
})
