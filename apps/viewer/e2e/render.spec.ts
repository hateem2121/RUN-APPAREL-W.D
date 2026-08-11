import { expect, test } from '@playwright/test'

/**
 * `/render` — task 13's screenshot route for task 14's automatic-poster robot.
 *
 * Chromium-only, same as webgl.spec.ts and for the same reason: the first
 * test below waits on `window.__RENDER_READY`, which this route only ever
 * sets after <model-viewer>'s `load` event fires — undetectable without a
 * real WebGL context. playwright.config.ts's DOM_SUITE regex now matches
 * this file too, so it runs under the `webgl` project (software SwiftShader)
 * and is excluded from the four DOM-only projects, exactly like webgl.spec.ts.
 * The second test needs no WebGL at all (it only checks a navigation's HTTP
 * status), but there is no value in re-running a host-string check across
 * four more browser engines, so it stays in this file rather than
 * viewer.spec.ts.
 *
 * ⚠️ THE FIXTURE. `/fixtures/n001.glb` (served by e2e/serve.mjs from
 * tools/asset-pipeline/output/n001.glb, built by `pnpm seed:assets`) is the
 * SAME Meshopt-compressed, three-variant file webgl.spec.ts already loads —
 * reused deliberately rather than building a second one. This repo has a
 * documented pattern of production bugs invisible because a seeded fixture
 * could not exhibit the failure (root CLAUDE.md): an uncompressed placeholder
 * would never have exercised the Meshopt decoder path (blob: in connect-src)
 * or proven a real KHR_materials_variants swap. What this fixture does NOT
 * prove: it carries no printed artwork, so it says nothing about whether a
 * poster taken through this route would show a torn logo — that risk lives in
 * the asset pipeline's own decimation step (CLAUDE.md's "three blocking gates
 * do NOT catch decimation damage"), not in this route, which only points a
 * camera at whatever geometry and materials the file already has.
 */
test('render route signals ready and shows only the model', async ({ page }) => {
  const params = new URLSearchParams({
    model: '/fixtures/n001.glb',
    variant: 'N001-NAVY',
    orbit: '0deg 82deg 105%',
    fov: '30deg',
  })
  await page.goto(`/render?${params.toString()}`)
  await page.waitForFunction(
    () => (window as unknown as { __RENDER_READY?: boolean }).__RENDER_READY === true,
    null,
    { timeout: 60_000 },
  )
  await expect(page.locator('header, nav, footer')).toHaveCount(0)

  // Requirement 3 (task 13 brief), proven rather than assumed: `src` was
  // assigned as a JS property, not left inert as an HTML attribute someone
  // wrote into markup, and the model actually finished loading.
  const modelViewer = page.locator('model-viewer')
  await expect(modelViewer).toBeVisible()
  const loaded = await page.evaluate(
    () => (document.querySelector('model-viewer') as { loaded?: boolean } | null)?.loaded,
  )
  expect(loaded).toBe(true)
  const variantName = await page.evaluate(
    () => (document.querySelector('model-viewer') as { variantName?: string } | null)?.variantName,
  )
  expect(variantName).toBe('N001-NAVY')
})

test('refuses a model from anywhere but our own media host', async ({ page }) => {
  const response = await page.goto('/render?model=https://example.com/evil.glb')
  expect(response?.status()).toBe(400)
})

test('refuses a request with no model at all', async ({ page }) => {
  // Not from the task 13 brief's own test list, but the same guard handles it
  // (renderGuard.ts's isAllowedRenderModel treats a missing model as
  // disallowed) — worth pinning here since an absent required param is an
  // easy thing to leave unhandled.
  const response = await page.goto('/render')
  expect(response?.status()).toBe(400)
})
