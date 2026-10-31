import { expect, test } from '@playwright/test'

/**
 * The first look of a garment is the colour its address names (31 Oct 2026). model-viewer shows the
 * file's own default until a colour is applied, and we applied it after `load`, so for 13-22 ms on a
 * fast Mac, the picture already gone, r-vpj/blue stood purple with no "17" on it.
 */
test('the colour is chosen before the model loads', async ({ page }) => {
  await page.addInitScript(() => {
    const seen = window as unknown as { nameAtLoad?: string | null }
    const hook = setInterval(() => {
      const mv = document.querySelector('model-viewer') as
        | (HTMLElement & { variantName: string | null })
        | null
      if (!mv) return
      clearInterval(hook)
      mv.addEventListener('load', () => {
        seen.nameAtLoad = mv.variantName
      })
    }, 5)
  })
  await page.goto('/n001/wine')
  await page.waitForFunction(
    () => (window as unknown as { nameAtLoad?: unknown }).nameAtLoad !== undefined,
    null,
    { timeout: 60_000 },
  )
  const name = await page.evaluate(() => (window as unknown as { nameAtLoad: unknown }).nameAtLoad)
  expect(name, 'a colour must already be set when the first frame can draw').toBeTruthy()
})
