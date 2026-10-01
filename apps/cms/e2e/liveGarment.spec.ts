import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, type Page, test } from './offlineMedia'

/**
 * №03's live garment (decision D24, 2026-09-29). What would have to break for these to fail:
 * a model that downloads on a data-saving connection, a failed model that takes the picture
 * with it, or a model that never loads at all.
 *
 * The suite's garment models are not served (serve.mjs: the seeded files are not on this
 * origin), and CI's database is the only one guaranteed to hold a published garment with a
 * model — so a local run without one skips, and a CI run without one fails.
 */
async function openWithGarment(page: Page) {
  // Playwright sets navigator.webdriver, and the live garment honours it as the cursor does.
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false })
  })
  await page.goto('/')
  if ((await page.locator('.live-garment').count()) === 0) {
    if (process.env.CI) throw new Error('no live garment on the home page, and CI seeds one')
    test.skip(true, 'no published garment with a model in this local database')
  }
}

/*
 * ⚠️ A REAL, MESHOPT-COMPRESSED MODEL, BECAUSE THE TESTS ABOVE COULD NOT FAIL THE WAY PRODUCTION
 * DID. Every other test here serves a 404, and "the model failed, the picture stayed" is exactly
 * what a broken decoder set-up ALSO produces. Found 2026-09-29 against a copy of production: the
 * element was rendered before model-viewer's module had finished loading, the module upgraded it
 * on definition and it fetched its model at once — before `meshoptDecoderLocation` was set on the
 * next line — so every production GLB failed with "setMeshoptDecoder must be called before
 * loading compressed files" and the home page showed only the picture. The seeded n001.glb
 * (`pnpm seed:assets`, which CI's site shards run) carries EXT_meshopt_compression like every
 * production model; the decoder is the viewer's own source (`copy-decoders.mjs`), and the
 * lighting file is committed.
 */
const REPO = fileURLToPath(new URL('../../../', import.meta.url))
const SEEDED_MODEL = join(REPO, 'tools/asset-pipeline/output/n001.glb')
const viewerRequire = createRequire(join(REPO, 'apps/viewer/package.json'))

/**
 * The decoder and the lighting file, served as production serves them (the viewer Worker, which
 * `next start` does not run). Every test needs them: model-viewer fetches the Meshopt decoder
 * BEFORE the model, so without it the model is never even requested — which the two request-
 * counting tests below only "passed" while the bug above fetched the model too early.
 */
async function serveViewerFiles(page: Page) {
  await page.route('**/meshopt_decoder.js', (route) =>
    route.fulfill({
      body: readFileSync(viewerRequire.resolve('meshoptimizer/decoder.cjs')),
      contentType: 'text/javascript',
    }),
  )
  await page.route('**/env/studio-soft.hdr', (route) =>
    route.fulfill({ body: readFileSync(join(REPO, 'apps/viewer/public/env/studio-soft.hdr')) }),
  )
}

async function serveModel(page: Page, found: boolean) {
  await serveViewerFiles(page)
  if (!found) {
    await page.route('**/*.glb', (route) => route.fulfill({ status: 404, body: '' }))
    return
  }
  if (!existsSync(SEEDED_MODEL))
    throw new Error(`run \`pnpm seed:assets\`: ${SEEDED_MODEL} is missing`)
  await page.route('**/*.glb', (route) =>
    route.fulfill({ body: readFileSync(SEEDED_MODEL), contentType: 'model/gltf-binary' }),
  )
}

/** The still under the model (VA-28): faded out while the model is shown, back otherwise. */
const stillOpacity = (page: Page) =>
  page.evaluate(() => {
    const still = document.querySelector('.proof__frame > img, .proof__frame > picture')
    return still ? getComputedStyle(still).opacity : 'no still'
  })

test.describe('№03 — the live 3D garment', () => {
  test('a real Meshopt-compressed model loads and is shown', async ({ page }) => {
    const errors: string[] = []
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text())
    })
    await serveModel(page, true)
    await openWithGarment(page)
    await page.locator('.proof__figure').scrollIntoViewIfNeeded()
    await expect(page.locator('.live-garment'), errors.join('\n')).toHaveAttribute(
      'data-phase',
      'shown',
      { timeout: 30000 },
    )
    await expect(page.locator('.live-garment model-viewer')).toHaveCount(1)
    await expect(page.locator('.live-garment model-viewer')).toHaveAttribute('auto-rotate', '')
    expect(errors.filter((e) => /setMeshoptDecoder/.test(e))).toEqual([])
    // VA-28: the still under the transparent model fades out, so the garment shows once.
    await expect.poll(() => stillOpacity(page), { timeout: 3000 }).toBe('0')
  })

  /*
   * WCAG 2.2 SC 2.4.11: the poster link lies UNDER the model by design (a drag turns the garment),
   * so with the model shown its focus ring was drawn beneath it — the visual audit of 2026-10-01
   * found the link entirely covered at 1440x900. While the link has keyboard focus the layer
   * steps aside (site.css), so what is on top at the link's centre must be the link itself.
   */
  test('with the model shown, a keyboard-focused poster link is not under it', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await serveModel(page, true)
    await openWithGarment(page)
    await page.locator('.proof__figure').scrollIntoViewIfNeeded()
    await expect(page.locator('.live-garment')).toHaveAttribute('data-phase', 'shown', {
      timeout: 30000,
    })
    const topmostAtLink = () =>
      page.evaluate(() => {
        const link = document.querySelector('.proof__link')
        if (!link) return 'no link'
        const box = link.getBoundingClientRect()
        const top = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)
        return top && link.contains(top) ? 'link' : (top?.tagName.toLowerCase() ?? 'nothing')
      })
    // The control: before focus, the model really is on top, so the check can see it.
    expect(await topmostAtLink()).toBe('model-viewer')
    await page.locator('.proof__link').focus()
    await expect(page.locator('.proof__link')).toBeFocused()
    expect(await topmostAtLink(), 'the focused link is under the 3D model').toBe('link')
    // With the model aside, the still comes back, so the focused link shows the garment.
    await expect.poll(() => stillOpacity(page), { timeout: 3000 }).toBe('1')
  })

  test('under reduced motion the model is shown but does not turn by itself', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await serveModel(page, true)
    await openWithGarment(page)
    await page.locator('.proof__figure').scrollIntoViewIfNeeded()
    await expect(page.locator('.live-garment')).toHaveAttribute('data-phase', 'shown', {
      timeout: 30000,
    })
    const model = page.locator('.live-garment model-viewer')
    await expect(model).not.toHaveAttribute('auto-rotate')
    // NEGATIVE CONTROL lives in the real-model test above: without reduced motion it turns.
  })

  test('a model that fails to load leaves the picture exactly as it was', async ({ page }) => {
    await serveModel(page, false)
    await openWithGarment(page)
    await page.locator('.proof__figure').scrollIntoViewIfNeeded()
    await expect(page.locator('.live-garment')).toHaveAttribute('data-phase', 'failed', {
      timeout: 15000,
    })
    await expect(page.locator('.live-garment model-viewer')).toHaveCount(0)
    await expect(page.locator('.proof__frame')).toBeVisible()
    // NEGATIVE CONTROL for VA-28: with no model shown, the still stays fully visible.
    expect(await stillOpacity(page)).toBe('1')
    await expect(page.locator('.proof__link')).toHaveAttribute('href', /\/products\//)
  })

  test('the model is only requested once the section is near', async ({ page }) => {
    const requested: string[] = []
    page.on('request', (request) => {
      if (request.url().endsWith('.glb')) requested.push(request.url())
    })
    await serveModel(page, false)
    await openWithGarment(page)
    await page.waitForTimeout(500)
    expect(requested, 'the model downloaded on the first screen').toEqual([])
    await page.locator('.proof__figure').scrollIntoViewIfNeeded()
    await expect.poll(() => requested.length, { timeout: 15000 }).toBeGreaterThan(0)
  })

  test('on a 2G connection nothing downloads until the visitor asks', async ({ page }) => {
    const requested: string[] = []
    page.on('request', (request) => {
      if (request.url().endsWith('.glb')) requested.push(request.url())
    })
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'connection', {
        get: () => ({ saveData: false, effectiveType: '2g' }),
      })
    })
    await serveModel(page, false)
    await openWithGarment(page)
    await page.locator('.proof__figure').scrollIntoViewIfNeeded()
    const offer = page.getByRole('button', { name: 'Turn it in 3D' })
    await expect(offer).toBeVisible()
    await page.waitForTimeout(500)
    expect(requested).toEqual([])
    await offer.click()
    await expect.poll(() => requested.length, { timeout: 15000 }).toBeGreaterThan(0)
  })

  test('on a data-saving connection nothing downloads until the visitor asks', async ({ page }) => {
    const requested: string[] = []
    page.on('request', (request) => {
      if (request.url().endsWith('.glb')) requested.push(request.url())
    })
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'connection', {
        get: () => ({ saveData: true, effectiveType: '4g' }),
      })
    })
    await serveModel(page, false)
    await openWithGarment(page)
    await page.locator('.proof__figure').scrollIntoViewIfNeeded()
    const offer = page.getByRole('button', { name: 'Turn it in 3D' })
    await expect(offer).toBeVisible()
    await page.waitForTimeout(500)
    expect(requested).toEqual([])
    await offer.click()
    await expect.poll(() => requested.length, { timeout: 15000 }).toBeGreaterThan(0)
  })
})
