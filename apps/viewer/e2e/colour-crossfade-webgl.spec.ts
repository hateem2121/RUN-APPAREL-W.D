import { expect, type Page, test } from '@playwright/test'

/**
 * MO2 (polish, 2026-10-04): picking a colour fades from the old colour over 200ms instead of
 * snapping (src/lib/colourCrossFade.ts). Real 3D, so the `webgl` project (SwiftShader).
 *
 * What would have to break for these to fail: the copy showing something other than the frame the
 * visitor was looking at (stretched, shifted, blank, or already the new colour), a copy left over
 * the garment, a fade on the first colour a page shows, or any fade at all for a visitor who asked
 * for less motion.
 *
 * The reference frame comes from model-viewer's OWN `toBlob`, which crops this garment's part of
 * its canvas by its own internal numbers: a second, independent way to the same pixels, so a wrong
 * crop in colourCrossFade.ts cannot agree with itself here.
 */

type Crossfade = { states: string[] }

async function openStill(page: Page) {
  // Record every state the overlay takes, from before the app runs.
  await page.addInitScript(() => {
    const record: Crossfade = { states: [] }
    ;(window as unknown as { __crossfade: Crossfade }).__crossfade = record
    new MutationObserver(() => {
      const overlay = document.querySelector('.stage__crossfade')
      const state = overlay?.getAttribute('data-state')
      if (state && record.states.at(-1) !== state) record.states.push(state)
    }).observe(document, { subtree: true, attributes: true, attributeFilter: ['data-state'] })
  })
  await page.goto('/n001/wine')
  await page.waitForFunction(
    () => Boolean((document.querySelector('model-viewer') as { loaded?: boolean } | null)?.loaded),
    undefined,
    { timeout: 30_000 },
  )
  // FRONT ends the idle hint, whose sweep would move the camera under the comparison.
  await page.getByRole('button', { name: 'front' }).click()
  await page.waitForFunction(
    () => {
      const mv = document.querySelector('model-viewer') as {
        getCameraOrbit?: () => { theta: number; phi: number; radius: number }
      } | null
      const orbit = mv?.getCameraOrbit?.()
      if (!orbit) return false
      const now = `${orbit.theta.toFixed(4)} ${orbit.phi.toFixed(4)} ${orbit.radius.toFixed(4)}`
      const w = window as unknown as { __orbit?: string; __still?: number }
      w.__still = w.__orbit === now ? (w.__still ?? 0) + 1 : 0
      w.__orbit = now
      return w.__still >= 5
    },
    undefined,
    { polling: 100, timeout: 20_000 },
  )
}

const states = (page: Page) =>
  page.evaluate(() => (window as unknown as { __crossfade: Crossfade }).__crossfade.states)

test.describe('a colour change cross-fades on the garment (MO2)', () => {
  test.setTimeout(90_000)

  test('holds the very frame the visitor saw, then fades it once the new colour is drawn', async ({
    page,
  }) => {
    // The config asks every test for reduced motion (CR-05), under which nothing fades.
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await openStill(page)
    expect(await states(page), 'the first colour a page shows must not fade').toEqual([])

    // The reference: model-viewer's own crop of this garment's frame, sampled on a 5 x 5 grid.
    const before = await page.evaluate(async () => {
      const mv = document.querySelector('model-viewer') as unknown as {
        toBlob: (options: { idealAspect: boolean }) => Promise<Blob>
      }
      const bitmap = await createImageBitmap(await mv.toBlob({ idealAspect: false }))
      const canvas = document.createElement('canvas')
      canvas.width = bitmap.width
      canvas.height = bitmap.height
      const context = canvas.getContext('2d') as CanvasRenderingContext2D
      context.drawImage(bitmap, 0, 0)
      const samples: number[][] = []
      for (const fy of [0.2, 0.35, 0.5, 0.65, 0.8]) {
        for (const fx of [0.2, 0.35, 0.5, 0.65, 0.8]) {
          const x = Math.floor(fx * canvas.width)
          const y = Math.floor(fy * canvas.height)
          samples.push([...context.getImageData(x, y, 1, 1).data])
        }
      }
      return { width: canvas.width, height: canvas.height, samples }
    })

    await page.getByRole('tab', { name: /black/i }).click()
    await expect.poll(() => states(page)).toContain('held')

    const held = await page.evaluate(() => {
      const overlay = document.querySelector('.stage__crossfade') as HTMLCanvasElement
      const context = overlay.getContext('2d') as CanvasRenderingContext2D
      const samples: number[][] = []
      for (const fy of [0.2, 0.35, 0.5, 0.65, 0.8]) {
        for (const fx of [0.2, 0.35, 0.5, 0.65, 0.8]) {
          const x = Math.floor(fx * overlay.width)
          const y = Math.floor(fy * overlay.height)
          samples.push([...context.getImageData(x, y, 1, 1).data])
        }
      }
      return { width: overlay.width, height: overlay.height, samples }
    })
    // The same region, at the same resolution, holding the same pixels.
    expect([held.width, held.height]).toEqual([before.width, before.height])
    const differing = held.samples.filter((pixel, i) =>
      pixel.some((channel, c) => Math.abs(channel - (before.samples[i]?.[c] ?? -999)) > 8),
    )
    expect(differing, 'the held frame is not the frame the visitor was looking at').toEqual([])
    // Not a blank copy that would match a blank reference: the garment is in it.
    expect(new Set(held.samples.map((pixel) => pixel.join())).size).toBeGreaterThan(2)

    // It goes, over --fast, and is not left behind.
    await expect.poll(() => states(page)).toEqual(['held', 'fading'])
    const overlay = page.locator('.stage__crossfade')
    await expect
      .poll(() => overlay.evaluate((element) => getComputedStyle(element).visibility))
      .toBe('hidden')
    expect(await overlay.evaluate((element) => getComputedStyle(element).opacity)).toBe('0')
    expect(
      await page.evaluate(
        () => (document.querySelector('model-viewer') as { variantName?: string }).variantName,
      ),
    ).toBe('N001-BLACK')
  })

  test('changes at once, with no fade, for a visitor who asked for less motion', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await openStill(page)
    await page.getByRole('tab', { name: /black/i }).click()
    await page.waitForFunction(
      () =>
        (document.querySelector('model-viewer') as { variantName?: string } | null)?.variantName ===
        'N001-BLACK',
    )
    // Long enough for a fade to have begun, had one been started.
    await page.waitForTimeout(400)
    expect(await states(page)).toEqual([])
  })
})
