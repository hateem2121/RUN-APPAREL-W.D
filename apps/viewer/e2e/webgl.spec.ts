import { expect, test } from '@playwright/test'

/**
 * The headline feature — real WebGL. Runs only in the `webgl` project (software
 * SwiftShader). Skips cleanly if the runner has no WebGL context, so CI can
 * never red-flake on GPU availability.
 */
test('3D model loads and switching colourway changes the KHR material variant', async ({
  page,
}) => {
  await page.goto('/n001/navy')

  const hasWebGL = await page.evaluate(() => {
    try {
      const canvas = document.createElement('canvas')
      return Boolean(canvas.getContext('webgl2') ?? canvas.getContext('webgl'))
    } catch {
      return false
    }
  })
  test.skip(!hasWebGL, 'No WebGL context available in this runner')

  const modelViewer = page.locator('model-viewer')
  await expect(modelViewer).toBeVisible()

  // The model actually finishes loading (not just the poster).
  await page.waitForFunction(
    () => Boolean((document.querySelector('model-viewer') as { loaded?: boolean } | null)?.loaded),
    undefined,
    { timeout: 20_000 },
  )

  // The selected colourway binds the matching KHR_materials_variants entry.
  await page.waitForFunction(
    () =>
      (document.querySelector('model-viewer') as { variantName?: string } | null)?.variantName ===
      'N001-NAVY',
    undefined,
    { timeout: 20_000 },
  )

  // Switching to Black updates the bound variant — the real 3D swap.
  await page.getByRole('tab', { name: /black/i }).click()
  await page.waitForFunction(
    () =>
      (document.querySelector('model-viewer') as { variantName?: string } | null)?.variantName ===
      'N001-BLACK',
    undefined,
    { timeout: 20_000 },
  )
})
