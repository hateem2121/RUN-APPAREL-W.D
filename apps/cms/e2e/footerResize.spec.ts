import { expect, test } from './offlineMedia'

test('wordmark fitting does not feed its own resize observer', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => {
    if (/ResizeObserver loop/.test(error.message)) errors.push(error.message)
  })
  await page.goto('/contact')
  await page.evaluate(() => document.fonts.ready)
  await page.locator('.footer-mark').scrollIntoViewIfNeeded()
  for (const width of [390, 440, 375, 430, 320, 414]) {
    await page.setViewportSize({ width, height: 844 })
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
          ),
        ),
    )
  }
  await expect(page.locator('.footer-mark__layer').first()).toBeVisible()
  expect(errors).toEqual([])
})
