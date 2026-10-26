import { expect, type Page, test } from '@playwright/test'

/**
 * A colour change soaks into the garment like dye (owner, 2026-10-26: one dye everywhere a garment
 * changes colour; packages/shared/src/dyePlayer.ts). It replaced MO2's 200ms cross-fade
 * (2026-10-04). Real 3D, so the `webgl` project (SwiftShader).
 *
 * What would have to break for these to fail: the copy showing something other than the frame the
 * visitor was looking at (stretched, shifted, blank, or already the new colour), a layer left over
 * the garment, a dye on the first colour a page shows, a hover that plays the full dye, or any dye
 * at all for a visitor who asked for less motion.
 *
 * The reference frame comes from model-viewer's OWN `toBlob`, which crops this garment's part of
 * its canvas by its own internal numbers: a second, independent way to the same pixels, so a wrong
 * crop in packages/shared/src/frameCopy.ts cannot agree with itself here.
 */

type Dye = { runs: number }

async function openStill(page: Page) {
  // Count every dye that starts, from before the app runs.
  await page.addInitScript(() => {
    const record: Dye = { runs: 0 }
    ;(window as unknown as { __dye: Dye }).__dye = record
    new MutationObserver((changes) => {
      for (const change of changes) {
        const layer = change.target as Element
        if (layer.matches('.stage__dye') && layer.hasAttribute('data-running')) record.runs++
      }
    }).observe(document, { subtree: true, attributes: true, attributeFilter: ['data-running'] })
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

const runs = (page: Page) => page.evaluate(() => (window as unknown as { __dye: Dye }).__dye.runs)

test.describe('a colour change soaks into the garment like dye', () => {
  test.setTimeout(90_000)

  test('starts from the very frame the visitor saw, and leaves nothing once the colour has landed', async ({
    page,
  }) => {
    // The config asks every test for reduced motion (CR-05), under which nothing dyes.
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await openStill(page)
    expect(await runs(page), 'the first colour a page shows must not dye').toBe(0)

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

    // Read the layer the moment the dye starts: the observer runs in the same task, before a frame.
    await page.evaluate(() => {
      const w = window as unknown as { __held: Promise<unknown> }
      w.__held = new Promise((done) => {
        new MutationObserver((_, observer) => {
          const layer = document.querySelector<HTMLCanvasElement>('.stage__dye')
          if (!layer?.hasAttribute('data-running')) return
          observer.disconnect()
          const context = layer.getContext('2d') as CanvasRenderingContext2D
          const samples: number[][] = []
          for (const fy of [0.2, 0.35, 0.5, 0.65, 0.8]) {
            for (const fx of [0.2, 0.35, 0.5, 0.65, 0.8]) {
              const x = Math.floor(fx * layer.width)
              const y = Math.floor(fy * layer.height)
              samples.push([...context.getImageData(x, y, 1, 1).data])
            }
          }
          done({ width: layer.width, height: layer.height, samples })
        }).observe(document, { subtree: true, attributes: true, attributeFilter: ['data-running'] })
      })
    })
    await page.getByRole('tab', { name: /black/i }).click()
    const held = (await page.evaluate(
      () => (window as unknown as { __held: Promise<unknown> }).__held,
    )) as { width: number; height: number; samples: number[][] }

    // The same region, at the same resolution, holding the same pixels. Read in the task the dye
    // starts in, before any frame has opened it, so every sample is the copy (its see-through
    // background included).
    expect([held.width, held.height]).toEqual([before.width, before.height])
    const differing = held.samples.filter((pixel, i) =>
      pixel.some((channel, c) => Math.abs(channel - (before.samples[i]?.[c] ?? -999)) > 8),
    )
    expect(differing, 'the copy is not the frame the visitor was looking at').toEqual([])
    // Not a blank copy that would match a blank reference: the garment is in it.
    expect(new Set(held.samples.map((pixel) => pixel.join())).size).toBeGreaterThan(2)

    // It goes, and is not left behind.
    const layer = page.locator('.stage__dye')
    await expect(layer).not.toHaveAttribute('data-running', { timeout: 3000 })
    expect(await layer.evaluate((element) => getComputedStyle(element).visibility)).toBe('hidden')
    expect(await runs(page)).toBe(1)
    expect(
      await page.evaluate(
        () => (document.querySelector('model-viewer') as { variantName?: string }).variantName,
      ),
    ).toBe('N001-BLACK')
  })

  /*
   * Hover, then click the same colour a moment later, as a person does (whole-branch review,
   * 2026-10-26). What would have to break: the click cutting the hover's dye off, so the garment
   * snaps to the colour; Playwright's own `click()` hovers and presses in one frame and could not
   * see it, so the press here comes 120 ms after the hover.
   */
  test('a hover then a click on the same colour lets the hover’s dye run on', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await openStill(page)
    await page.evaluate(() => {
      const w = window as unknown as { __lengths: number[] }
      w.__lengths = []
      let started = 0
      new MutationObserver(() => {
        const running = document.querySelector('.stage__dye')?.hasAttribute('data-running') ?? false
        if (running && !started) started = performance.now()
        if (!running && started) {
          w.__lengths.push(performance.now() - started)
          started = 0
        }
      }).observe(document, { subtree: true, attributes: true, attributeFilter: ['data-running'] })
    })
    const tab = page.getByRole('tab', { name: /black/i })
    await tab.hover()
    await page.waitForTimeout(120)
    await page.mouse.down()
    await page.mouse.up()
    const lengths = () =>
      page.evaluate(() => (window as unknown as { __lengths: number[] }).__lengths)
    await expect.poll(lengths, { timeout: 5000 }).toHaveLength(1)
    // The one dye ran to its end: the short one (--dye-short, 240 ms), not cut at the click.
    expect((await lengths())[0], 'the click cut the hover’s dye').toBeGreaterThanOrEqual(200)
    expect(
      await page.evaluate(
        () => (document.querySelector('model-viewer') as { variantName?: string }).variantName,
      ),
    ).toBe('N001-BLACK')
  })

  test('a hover previews with the short dye; a click plays the full one', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await openStill(page)
    // How long each dye runs, from its layer's data-running.
    await page.evaluate(() => {
      const w = window as unknown as { __lengths: number[] }
      w.__lengths = []
      let started = 0
      new MutationObserver(() => {
        const layer = document.querySelector('.stage__dye')
        const running = layer?.hasAttribute('data-running') ?? false
        if (running && !started) started = performance.now()
        if (!running && started) {
          w.__lengths.push(performance.now() - started)
          started = 0
        }
      }).observe(document, { subtree: true, attributes: true, attributeFilter: ['data-running'] })
    })
    const lengths = () =>
      page.evaluate(() => (window as unknown as { __lengths: number[] }).__lengths)
    await page.getByRole('tab', { name: /black/i }).hover()
    await expect.poll(lengths, { timeout: 5000 }).toHaveLength(1)
    // The pointer leaves the dots: back to the chosen colour, short again.
    await page.mouse.move(5, 5)
    await expect.poll(lengths, { timeout: 5000 }).toHaveLength(2)
    await page.getByRole('tab', { name: /butter/i }).click()
    await expect.poll(lengths, { timeout: 5000 }).toHaveLength(3)
    const [hover, back, click] = await lengths()
    // --dye-short is 240 ms; frames on software 3D add up to ~150 ms of slack.
    expect(hover, 'the hover').toBeLessThan(240 + 150)
    expect(back, 'leaving the dots').toBeLessThan(240 + 150)
    // A pick is the full dye, at least --dye-min (320 ms).
    expect(click, 'the click').toBeGreaterThanOrEqual(320)
    expect(click).toBeGreaterThan(hover as number)
  })

  test('changes at once, with no dye, for a visitor who asked for less motion', async ({
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
    // Long enough for a dye to have begun, had one been started.
    await page.waitForTimeout(400)
    expect(await runs(page)).toBe(0)
  })
})
