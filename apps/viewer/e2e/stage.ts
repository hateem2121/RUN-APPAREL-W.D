import { expect, type Page } from '@playwright/test'

/**
 * Is the stage in its no-3D poster fallback? Asked WITHOUT racing the stage.
 *
 * ⚠️ WHY THIS EXISTS: A ONE-SHOT `.stage__error` COUNT WAS THE SINGLE CAUSE OF THE viewer-firefox FLAKES.
 * Measured 2026-09-26 inside CI's image (`mcr.microsoft.com/playwright:v1.62.1-noble`): Firefox there has
 * NO WebGL ("AllowWebgl2:false restricts context creation"), Chromium and WebKit do. `Stage.tsx` decides
 * `no-webgl` in its first effect and the notice follows the heading by 6–18 ms on an idle machine, up to
 * ~480 ms on a starved CPU. Sixteen tests counted `.stage__error:not([hidden])` ONCE, right after the
 * `<h1>` appeared; a busy CI runner let that read land before the notice, the test did not skip, and it
 * then waited 30 s for a `<model-viewer>` that cannot exist without WebGL. The retry usually read late
 * enough to skip, so it showed as "flaky" — 2 to 8 viewer-firefox tests in each of the last ten CI runs
 * (2026-09-25), one of them twice in a row, which failed the run. #65 and #68 patched two of the sixteen.
 *
 * So the question is put to the BROWSER, not to the page's current paint: `canRender3D()`
 * (src/lib/capabilities.ts) is re-run here verbatim — `page.evaluate` cannot import it — and only when it
 * says "no 3D" does this wait for the notice to be on screen, so a fallback that never renders still
 * fails. A browser that CAN render returns at once, which keeps the tests that watch the loading bar
 * (loading.spec.ts) watching it. A stage that falls back for any OTHER reason with 3D available is not
 * skipped: that is a real failure, and the test that waits for the model reports it.
 */
export async function stageFallsBack(page: Page): Promise<boolean> {
  const canRender3D = await page.evaluate(() => {
    const connection = (navigator as { connection?: { saveData?: boolean } }).connection
    if (connection?.saveData) return false
    try {
      const canvas = document.createElement('canvas')
      return Boolean(canvas.getContext('webgl2') ?? canvas.getContext('webgl'))
    } catch {
      return false
    }
  })
  if (canRender3D) return false
  await expect(
    page.locator('.stage__error:not([hidden])'),
    'this browser cannot render 3D, yet the stage never showed its no-3D notice',
  ).toBeVisible({ timeout: 20_000 })
  return true
}
