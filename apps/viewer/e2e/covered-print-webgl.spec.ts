import { type Page, expect, test } from '@playwright/test'

/**
 * A PRINT MUST STAY UNDER A LAYER THAT COVERS IT — zoomed out, as a phone sees it
 * (2026-09-27, plan fix 2f).
 *
 * The viewer's print nudge used to be -8/-8, and the -8 is a SLOPE term: it grows with the
 * on-screen size of a pixel, so on a zoomed-out garment it pulled Minecut Motion's marble
 * print through the white waistband 2.5 mm in front of it, and a Soccer print through its
 * collar (docs/3d-viewer-forensics-2026-09-27). Every test at the time counted that a nudge
 * was APPLIED; none looked at what the garment then showed. This one looks.
 *
 * The fixture (tools/asset-pipeline/src/placeholders.ts → buildCoverFixture) is a cloth
 * panel turned 70 degrees from the camera, a white print 0.1 mm in front of it and a blue
 * band 2.5 mm in front of the print, over its left half. Two copies differ ONLY in the
 * print's depthBias record: what the pipeline writes today, and the old -8/-8.
 *
 * BOTH WAYS, IN ONE TEST. The old record must lose most of the band — that is the defect,
 * reproduced, and it proves the pixel count can see it. The new record must keep it.
 * By area the print hides 0.12 of the band's 0.175 m², so the old file keeps roughly a third
 * of the blue the new one shows; the assertion asks for less than half, not an exact ratio.
 */

/** Blue band pixels on the stage, decoded in the page (the viewer has no image library). */
async function bluePixels(page: Page): Promise<number> {
  const shot = (await page.locator('model-viewer').screenshot()).toString('base64')
  return page.evaluate(async (b64) => {
    const img = new Image()
    img.src = `data:image/png;base64,${b64}`
    await img.decode()
    const canvas = document.createElement('canvas')
    canvas.width = img.width
    canvas.height = img.height
    const ctx = canvas.getContext('2d')
    if (!ctx) return -1
    ctx.drawImage(img, 0, 0)
    const { data } = ctx.getImageData(0, 0, img.width, img.height)
    let blue = 0
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i] ?? 0
      const g = data[i + 1] ?? 0
      const b = data[i + 2] ?? 0
      if (b > 150 && b > r + 60 && b > g + 30) blue++
    }
    return blue
  }, shot)
}

/** The polygon offset the scene actually DRAWS the print with, read off the three.js material. */
async function drawnPrintOffset(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const mv = document.querySelector('model-viewer') as unknown as Record<symbol, unknown> | null
    if (!mv) return null
    const sym = Object.getOwnPropertySymbols(mv).find((s) => s.description === 'scene')
    const scene = sym ? (mv[sym] as { traverse?: (fn: (o: unknown) => void) => void }) : null
    let found: string | null = null
    scene?.traverse?.((o) => {
      const mesh = o as { isMesh?: boolean; material?: unknown }
      if (!mesh.isMesh) return
      for (const m of ([] as unknown[]).concat(mesh.material)) {
        const mat = m as {
          name?: string
          polygonOffset?: boolean
          polygonOffsetFactor?: number
          polygonOffsetUnits?: number
        }
        if (mat.name === 'Material_Graphic' && mat.polygonOffset)
          found = `${mat.polygonOffsetFactor}/${mat.polygonOffsetUnits}`
      }
    })
    return found
  })
}

async function render(
  page: Page,
  product: string,
): Promise<{ blue: number; offset: string | null }> {
  await page.goto(`/${product}/wine`)
  await page.waitForFunction(
    () => Boolean((document.querySelector('model-viewer') as { loaded?: boolean } | null)?.loaded),
    undefined,
    { timeout: 60_000 },
  )
  // The nudge is written on `load`, and WRITING A three.js PROPERTY DOES NOT SCHEDULE A FRAME
  // (tools/asset-pipeline/CLAUDE.md): without this the screenshot is the frame drawn BEFORE
  // the nudge, and both files measured identical (11,813 blue pixels each, 2026-09-27). A
  // no-op write through model-viewer's own setter asks for a frame without moving the camera.
  await page.evaluate(async () => {
    const mv = document.querySelector('model-viewer') as unknown as {
      model?: { materials: { getAlphaCutoff(): number; setAlphaCutoff(v: number): void }[] }
    } | null
    const m = mv?.model?.materials[0]
    m?.setAlphaCutoff(m.getAlphaCutoff())
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(null))))
  })
  await page.waitForTimeout(1000)
  // COVER_SHOTS=<dir> saves both frames so a person can LOOK — a pixel count is a hint,
  // the picture is the judge (it is how the missing-frame problem above was found).
  if (process.env.COVER_SHOTS)
    await page
      .locator('model-viewer')
      .screenshot({ path: `${process.env.COVER_SHOTS}/${product}.png` })
  return { blue: await bluePixels(page), offset: await drawnPrintOffset(page) }
}

test('a print stays under the band 2.5 mm in front of it; the old -8/-8 punched through', async ({
  page,
}) => {
  const fixed = await render(page, 'zcover-new')
  const old = await render(page, 'zcover-old')

  // The records were obeyed as written — otherwise the pixels below would test nothing.
  expect(fixed.offset).toBe('0/-64')
  expect(old.offset).toBe('-8/-8')

  // The fixture rendered at all: a blank stage would make both counts zero.
  expect(fixed.blue, 'no blue band on the stage — the fixture did not render').toBeGreaterThan(500)
  // NEGATIVE CONTROL: the old nudge must lose most of the band, or this cannot see the defect.
  expect(old.blue, `old ${old.blue} vs fixed ${fixed.blue} blue pixels`).toBeLessThan(
    fixed.blue * 0.5,
  )
})
