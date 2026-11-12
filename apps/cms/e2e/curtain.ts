import type { Page } from '@playwright/test'

/**
 * Wait, as a visitor would, for the first-arrival curtain to lift before touching the page.
 *
 * A test that lifts `navigator.webdriver` (for the cookie question, the cursor, smooth scrolling…)
 * also brings the curtain, because every `page.goto` is an arrival from outside. Until 12 Nov 2026
 * a click during the curtain went straight through it to the page under it, so these tests clicked
 * a cookie button or a menu nobody could see yet and passed. A fresh review found that bug (I1) and
 * the curtain now keeps a tap from the page, which is what a person meets: the curtain covers the
 * page for 1.4–3 s, and only then is there anything to press. A page with no curtain returns at once.
 */
export async function afterCurtain(page: Page): Promise<void> {
  await page.waitForFunction(() => !document.documentElement.hasAttribute('data-preload'), null, {
    timeout: 8_000,
  })
}
