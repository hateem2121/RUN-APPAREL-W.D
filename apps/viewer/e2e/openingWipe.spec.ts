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
  })
  await page.goto('/n001/wine')
  const exit = page.locator('.preloader.preloader--exit')
  await exit.waitFor({ state: 'attached', timeout: 10_000 })
  const found = await page.evaluate(() => {
    const screen = document.querySelector('.preloader') as HTMLElement
    const sheet = screen.querySelector('.preloader__sheet') as HTMLElement | null
    const props = (el: Element) => getComputedStyle(el).transitionProperty
    return {
      screen: props(screen),
      sheet: sheet ? props(sheet) : 'no sheet',
      clip: getComputedStyle(screen).clipPath,
    }
  })
  expect(found.screen).toContain('translate')
  expect(found.screen).not.toContain('clip-path')
  expect(found.sheet).toContain('translate')
  expect(found.clip).toBe('none')
})
