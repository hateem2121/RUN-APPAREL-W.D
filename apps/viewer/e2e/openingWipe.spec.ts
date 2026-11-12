import { expect, test } from '@playwright/test'

/**
 * The opening wipe moves on the compositor (12 Nov 2026, loader fix B1). It was a `clip-path`
 * transition, which the main thread draws: on the live garment page the 3D engine's work landed in
 * the same moment, and Chrome froze the wipe for 0.16–0.19 s with real graphics (0.27 s at 4x CPU).
 * Two opposing `translate`s draw the same edge rising and keep moving through that work (web.dev,
 * "How to create high-performance CSS animations": animate transform and opacity).
 */
test('the opening wipe is drawn with translate, never with clip-path', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false })
    // Read the styles in the first frame the wipe runs, inside the page: CI's WebKit removed the
    // screen before a read from the test could reach it (PR #383, 12 Nov 2026).
    const w = window as unknown as { __wipe?: Record<string, string> }
    const tick = () => {
      const screen = document.querySelector<HTMLElement>('.preloader.preloader--exit')
      if (screen) {
        const sheet = screen.querySelector<HTMLElement>('.preloader__sheet')
        const props = (el: Element) => getComputedStyle(el).transitionProperty
        w.__wipe = {
          screen: props(screen),
          sheet: sheet ? props(sheet) : 'no sheet',
          clip: getComputedStyle(screen).clipPath,
        }
        return
      }
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
  await page.goto('/n001/wine')
  await expect
    .poll(() => page.evaluate(() => (window as { __wipe?: unknown }).__wipe ?? null), {
      message: 'the wipe never started, so nothing was measured',
      timeout: 10_000,
    })
    .not.toBe(null)
  const found = (await page.evaluate(
    () => (window as unknown as { __wipe: Record<string, string> }).__wipe,
  )) as { screen: string; sheet: string; clip: string }
  expect(found.screen).toContain('translate')
  expect(found.screen).not.toContain('clip-path')
  expect(found.sheet).toContain('translate')
  expect(found.clip).toBe('none')
})
