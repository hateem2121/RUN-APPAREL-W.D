import { expect, test } from '@playwright/test'
import { stageFallsBack } from './stage'

/**
 * FA-H-28 — how long the camera takes to stop after a real drag release.
 *
 * The audit could not score this at all: it had no way to measure it, so the row reads
 * "cantcheck". `FA-F-08` measured the WHEEL path (one tick, 1046 ms to settle) because a
 * wheel event is trivial to synthesise; a drag and its release were not measured, and that
 * is the interaction a visitor actually uses on a garment.
 *
 * ⚠️ THE POSITIVE CONTROL IS THE POINT OF THIS FILE, NOT THE NUMBER. A settle-time probe
 * that reports "0 ms" cannot be distinguished from one whose drag never reached the camera
 * — and that is exactly how three GPU harnesses in this repo reported clean while
 * measuring nothing (see apps/viewer/CLAUDE.md). So the first assertion is that the camera
 * MOVED, by a margin far larger than float noise. Only then does a settle time mean
 * anything.
 *
 * ⚠️ AND IT SAMPLES `getCameraOrbit()`, NOT THE `camera-orbit` ATTRIBUTE. The attribute is
 * the value that was REQUESTED; the method returns where the camera actually is, which is
 * the whole difference while a damper is still running. `model-viewer-radius-clamp` in
 * this project's notes is the same distinction: what you ask for and what you get are not
 * the same number.
 */

type Sample = { t: number; theta: number; phi: number; radius: number }

declare global {
  interface Window {
    __settleSamples?: Sample[]
    __settleRaf?: number
  }
}

test.describe('FA-H-28 — the camera settles after a drag', () => {
  test('a released drag comes to rest, and the tail is measured', async ({ page }) => {
    await page.goto('/n001/wine')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

    const fallback = await stageFallsBack(page)
    test.skip(fallback, 'no WebGL on this engine — the stage is in poster fallback')

    // The model has to be live, or the drag lands on a poster and moves nothing.
    await page.waitForFunction(
      () => {
        const mv = document.querySelector('model-viewer') as (Element & { loaded?: boolean }) | null
        return Boolean(mv?.loaded)
      },
      undefined,
      { timeout: 40000 },
    )

    const box = await page.locator('.stage__canvas').boundingBox()
    if (!box) throw new Error('no stage to drag')

    // Sample every painted frame, starting before the drag so the whole tail is captured.
    await page.evaluate(() => {
      const mv = document.querySelector('model-viewer') as Element & {
        getCameraOrbit?: () => { theta: number; phi: number; radius: number }
      }
      window.__settleSamples = []
      const tick = () => {
        const o = mv.getCameraOrbit?.()
        if (o) window.__settleSamples?.push({ t: performance.now(), ...o })
        window.__settleRaf = requestAnimationFrame(tick)
      }
      tick()
    })

    const cx = box.x + box.width / 2
    const cy = box.y + box.height / 2
    await page.mouse.move(cx, cy)
    await page.mouse.down()
    await page.mouse.move(cx + 140, cy, { steps: 14 })
    const releasedAt = await page.evaluate(() => performance.now())
    await page.mouse.up()

    // Long enough for any plausible damper to finish; the analysis finds the real end.
    await page.waitForTimeout(2500)

    const result = await page.evaluate((released) => {
      if (window.__settleRaf) cancelAnimationFrame(window.__settleRaf)
      const all = window.__settleSamples ?? []
      const after = all.filter((s) => s.t >= released)
      if (after.length < 10)
        return { frames: after.length, moved: 0, settleMs: -1, total: all.length }

      // How far the camera travelled in total, in degrees of orbit.
      const thetas = all.map((s) => s.theta)
      const moved = ((Math.max(...thetas) - Math.min(...thetas)) * 180) / Math.PI

      // Settled = six consecutive frames whose orbit moves less than a thousandth of a
      // degree. Six, not one: a damper can pass through a near-zero delta on its way down.
      const EPS = (0.001 * Math.PI) / 180
      let quiet = 0
      let settleAt = after[after.length - 1]?.t ?? released
      for (let i = 1; i < after.length; i += 1) {
        const a = after[i - 1]
        const b = after[i]
        if (!a || !b) continue
        const d =
          Math.abs(b.theta - a.theta) + Math.abs(b.phi - a.phi) + Math.abs(b.radius - a.radius)
        if (d < EPS) {
          quiet += 1
          if (quiet === 6) {
            settleAt = b.t
            break
          }
        } else {
          quiet = 0
        }
      }
      return {
        frames: after.length,
        moved: +moved.toFixed(3),
        settleMs: +(settleAt - released).toFixed(1),
        total: all.length,
      }
    }, releasedAt)

    console.log(`FA-H-28 camera settle: ${JSON.stringify(result)}`)

    /*
     * ⚠️ THE POSITIVE CONTROL, FIRST. Without this the test passes on a drag that never
     * reached the camera — the settle would read as ~0 ms and look excellent.
     */
    expect(
      result.frames,
      'no frames were sampled after the release — the probe measured nothing',
    ).toBeGreaterThan(10)
    expect(
      result.moved,
      `the camera moved ${result.moved}° in total — the drag never reached it, so any ` +
        'settle time below is meaningless',
    ).toBeGreaterThan(5)

    /*
     * The bound is deliberately generous. This exists to PRODUCE a number the audit could
     * not, and to catch a regression that makes the camera drift for seconds after the
     * finger leaves — not to pin a value nobody has chosen. `CAMERA_DECAY_MS` is 50 and is
     * the library's tuned default; `lib/motion.ts` explains why it must not be chased
     * downward.
     */
    expect(
      result.settleMs,
      `the camera was still moving ${result.settleMs}ms after the release`,
    ).toBeLessThan(1500)
    expect(result.settleMs, 'a settle of 0ms means the sampler saw nothing move').toBeGreaterThan(0)
  })
})
