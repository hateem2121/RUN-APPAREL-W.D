import { expect, test } from '@playwright/test'

/**
 * A press on the garment must reach it, and the loading readout once took it (AC-14, 11 Oct 2026).
 * `.stage__loading` sits over the middle of the stage until the render after the model loads; under
 * load that render came late, and `audit-guards.spec.ts`'s arrow-key click at the canvas centre
 * landed on `span.stage__loading-title`, so the browser focused the nearest focusable box, the
 * colour panel (`tabIndex={-1}`), and `<model-viewer>` never saw the press: 2 of 40 in full local
 * runs, 1 of 50 at a load average of 68–89. A visitor pressing the garment in that moment met the
 * same. The readout is display-only and lets presses through (`page.css`).
 *
 * Held deterministically: the model never arrives, so the readout stays, and the question is what a
 * press at the stage's centre hits (`elementFromPoint` skips what takes no press). Red in all four
 * DOM projects before the fix, green after.
 *
 * ⚠️ THE FILE NAME SENDS THIS TO THE `webgl` PROJECT (`DOM_SUITE` in playwright.config.ts), the one
 * with a software GL context. Without WebGL the stage falls back to its picture, downloads nothing
 * and draws no readout, which is what CI's other projects do: there it skipped (review, 12 Oct).
 */
test('a press on the middle of the stage is never taken by the loading readout (AC-14)', async ({
  page,
}) => {
  await page.route('**/fixtures/n001.glb', () => {})
  await page.goto('/n001/wine')
  await expect(page.locator('.stage__loading'), 'the readout this asks about').toBeVisible()
  const hit = await page.evaluate(() => {
    const box = document.querySelector('.stage__canvas')?.getBoundingClientRect()
    const readout = document.querySelector('.stage__loading')?.getBoundingClientRect()
    if (!box || !readout) return 'no stage or no readout'
    const x = box.x + box.width / 2
    const y = box.y + box.height / 2
    // Not vacuous: the point is on screen, and the readout covers it.
    if (y < 0 || y > window.innerHeight) return `the centre (${Math.round(y)}) is off screen`
    if (x < readout.left || x > readout.right || y < readout.top || y > readout.bottom)
      return 'the readout does not cover the centre'
    const at = document.elementFromPoint(x, y)
    if (!at) return 'nothing at the centre'
    return at.closest('.stage__loading')
      ? `the readout (${at.tagName.toLowerCase()}.${at.className})`
      : 'not the readout'
  })
  expect(hit, 'a press on the garment lands on the loading readout').toBe('not the readout')
})
