import { expect, type Page, test } from '@playwright/test'

/**
 * VA-03 — when 3D cannot run, the stage draws the colour's picture (visual audit, owner-approved
 * 2026-10-01). From 2026-08-21 it drew none in any failure state: measured live on
 * /products/r-afp/butter with 3D off, the picture downloaded and was never drawn, so a visitor
 * with Data Saver on saw an empty grid and a sentence. On this site the printed artwork IS the
 * product. Data Saver is the switch here because every engine honours it the same way
 * (`canRender3D()`, src/lib/capabilities.ts); the stopped-download and lost-context fallbacks
 * are covered in stall-webgl.spec.ts and webgl.spec.ts.
 */

const LOAD_NOTICE =
  'The 3D view is not available. The colors, fabric and specifications on this page are correct, and you can still send an inquiry below.'

async function openWithDataSaver(page: Page, width: number, height: number) {
  await page.setViewportSize({ width, height })
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'connection', { value: { saveData: true } })
  })
  await page.goto('/n001/wine')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
}

for (const [width, height] of [
  [320, 640],
  [390, 844],
  [1280, 800],
  [1920, 1080],
] as const) {
  test(`with Data Saver on, the colour's picture sits above the notice at ${width}x${height}`, async ({
    page,
  }) => {
    await openWithDataSaver(page, width, height)
    const picture = page.locator('.stage__picture')
    await expect(picture).toBeVisible()
    await expect(picture).toHaveAttribute('alt', 'Velocity Performance Tee in Wine')
    expect(await picture.evaluate((img: HTMLImageElement) => img.decode().then(() => true))).toBe(
      true,
    )
    // The sentence is kept, word for word, under the picture.
    await expect(page.locator('.stage__error:not([hidden])')).toHaveText(LOAD_NOTICE)

    // Neither the note nor anything else covers the DRAWN garment: `object-fit: contain`
    // letterboxes, so the garment is the box the picture's own ratio fits, not the element.
    const m = await page.evaluate(() => {
      const img = document.querySelector('.stage__picture') as HTMLImageElement
      const note = (document.querySelector('.stage__error') as HTMLElement).getBoundingClientRect()
      const stage = (document.querySelector('.stage') as HTMLElement).getBoundingClientRect()
      const box = img.getBoundingClientRect()
      const scale = Math.min(box.width / img.naturalWidth, box.height / img.naturalHeight)
      const w = img.naturalWidth * scale
      const h = img.naturalHeight * scale
      const garment = {
        left: box.left + (box.width - w) / 2,
        right: box.left + (box.width + w) / 2,
        top: box.top + (box.height - h) / 2,
        bottom: box.top + (box.height + h) / 2,
      }
      return {
        overlaps:
          note.left < garment.right &&
          garment.left < note.right &&
          note.top < garment.bottom &&
          garment.top < note.bottom,
        garmentHeight: h,
        inside: garment.top >= stage.top - 0.5 && note.bottom <= stage.bottom + 0.5,
      }
    })
    expect(m.overlaps, 'the notice covers the garment').toBe(false)
    expect(m.inside, 'the picture or the notice leaves the stage').toBe(true)
    // Measured 2026-10-02: 106px at 320x640, the smallest; anything near zero is a collapse.
    expect(m.garmentHeight).toBeGreaterThan(80)
  })
}

test('a product with no picture keeps the notice alone', async ({ page }) => {
  await page.route('**/api/public/viewer/**', async (route) => {
    const response = await route.fetch()
    const body = await response.json()
    if (body.product) body.product.posterFallback = null
    for (const c of body.colourways ?? []) c.poster = null
    if (body.selectedColourway) body.selectedColourway.poster = null
    await route.fulfill({ response, json: body })
  })
  await openWithDataSaver(page, 390, 844)
  await expect(page.locator('.stage__error:not([hidden])')).toHaveText(LOAD_NOTICE)
  await expect(page.locator('.stage__picture')).toHaveCount(0)
})
