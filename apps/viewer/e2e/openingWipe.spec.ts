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
    // Read the styles the moment the wipe starts, inside the page: CI's WebKit removed the screen
    // before a read from the test could reach it (PR #383, 12 Nov 2026). Read on the change itself,
    // not in a requestAnimationFrame loop: a frame runs only before a repaint, and CI's WebKit can
    // go seconds without one while the 3D engine starts, so the whole 800 ms wipe can fall between
    // two frames. Measured in the trace of main run 43688095997 (15 Nov 2026), where it failed
    // openingWaitsForPicture.spec.ts; this test failed with the same symptom, "the wipe never
    // started", on main run 43483985688 attempt 1 (mobile Safari).
    const w = window as unknown as { __wipe?: Record<string, string> }
    const observer = new MutationObserver(() => {
      const screen = document.querySelector<HTMLElement>('.preloader.preloader--exit')
      if (!screen) return
      const sheet = screen.querySelector<HTMLElement>('.preloader__sheet')
      const props = (el: Element) => getComputedStyle(el).transitionProperty
      w.__wipe = {
        screen: props(screen),
        sheet: sheet ? props(sheet) : 'no sheet',
        clip: getComputedStyle(screen).clipPath,
      }
      observer.disconnect()
    })
    observer.observe(document, { subtree: true, childList: true, attributes: true })
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
