import { expect, test } from '@playwright/test'

/**
 * VA-20, the 3D stage's half (visual audit, 2026-10-02). `<Stage>` chose the camera's
 * `interpolation-decay` from `prefersReducedMotion()` while rendering, so turning reduced motion
 * on during a visit left the camera easing as before (50 ms decay; reduced motion is 1 ms) until
 * something else re-rendered the stage. It now follows the setting through
 * `usePrefersReducedMotion()`, in both directions.
 *
 * ⚠️ THE FILE NAME IS NOT DECORATION. `playwright.config.ts` sends spec files whose names match
 * `/(webgl|render|camera-settle)\.spec\.ts/` to the `webgl` project, the one with a software GL
 * context, and keeps them out of the four DOM projects. `<model-viewer>` exists only there, and
 * this reads one. The DOM half of VA-20 is `reduced-motion-live.spec.ts`.
 *
 * Read from the ATTRIBUTE, which React writes for a hyphenated name on a custom element (it is
 * the PROPERTY that `apps/viewer/CLAUDE.md` warns is never reflected for names like `src`).
 */

const DECAY = () =>
  document.querySelector('model-viewer')?.getAttribute('interpolation-decay') ?? null

test('the camera damping follows reduced motion turned on and off mid-visit (VA-20)', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.goto('/n001/wine')
  await expect(page.locator('model-viewer')).toBeVisible()

  // The instrument: with motion allowed it is the library's tuned 50 (CAMERA_DECAY_MS).
  expect(await page.evaluate(DECAY), 'not the camera damping the stage is built with').toBe('50')

  /*
   * Both waits use the `webgl` project's measured `expect` limit (playwright.config.ts), not a
   * fixed 5 s. Measured 11 Oct 2026 on this Mac: the page saw the change at once (`matchMedia` true
   * right after `emulateMedia`), and the attribute followed after 1.3–6.7 s in 10 of 10 runs at load
   * averages 39–69, behind SwiftShader's main-thread work; the fixed 5 s failed 6 of 10 at 62–97
   * while never missing the change. Planted, a stage that never follows the setting fails in 15 s.
   *
   * ⚠️ WHAT THIS CANNOT SEE (measured the same day): the VA-20 bug ITSELF, the stage reading the
   * setting once while rendering. Here the stage re-renders on its own within 0.9–2.1 s of the change
   * (loading and camera state), and each render reads the new value, so that plant passed 2 of 2.
   * The live page the audit saw had settled and did not re-render. The hook's subscription is
   * guarded by `src/lib/usePrefersReducedMotion.test.tsx` (planted, 3 of 5 fail); the stage's use
   * of the hook has no test that can fail.
   */
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await expect
    .poll(() => page.evaluate(DECAY), {
      message: 'the camera still eases as if motion were allowed after it was turned off',
    })
    .toBe('1')

  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await expect
    .poll(() => page.evaluate(DECAY), {
      message: 'the camera stayed at reduced motion after it was turned back on',
    })
    .toBe('50')
})
