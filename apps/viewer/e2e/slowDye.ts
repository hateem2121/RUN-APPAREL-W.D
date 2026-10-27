import type { Page } from '@playwright/test'

/**
 * Makes every colour change's dye ten times longer on this page (3.2–6.4 s, a hover's 2.4 s), for
 * a test that looks at the dye ON ITS WAY: where its front is, how many frames it is drawn over.
 * CI's runner draws so few frames that a 320–640 ms dye was caught 2 to 4 times, never mid-way,
 * and five tests failed there while passing on a Mac (PR #274, 2026-10-26). The tokens are set on
 * <html> from script, which a style-src policy does not refuse as it refuses a <style> tag. The
 * dye's real speed is held by the timing tests, which do not call this.
 */
export async function slowDye(page: Page) {
  await page.evaluate(() => {
    const style = document.documentElement.style
    style.setProperty('--dye-min', '3200ms')
    style.setProperty('--dye-max', '6400ms')
    style.setProperty('--dye-short', '2400ms')
  })
}
