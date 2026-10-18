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

  /*
   * Polish D2: №03's colour dots change the live garment. The seeded model holds the five colours as
   * variants (`pnpm seed:assets`: N001-WINE … N001-BLACK, the colourways' `variantId`s), so a dot
   * must switch the REAL model's variant, not only the picture under it, and the link follows.
   */
  test('a colour dot switches the live garment to that colour, and the link follows', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await serveModel(page, true)
    await openWithGarment(page)
    await page.locator('.proof__figure').scrollIntoViewIfNeeded()
    await expect(page.locator('.live-garment')).toHaveAttribute('data-phase', 'shown', {
      timeout: 30000,
    })
    const variant = () =>
      page.evaluate(
        () =>
          (document.querySelector('.live-garment model-viewer') as { variantName?: string } | null)
            ?.variantName ?? null,
      )
    const pills = page.locator('.proof__pill')
    expect(await pills.count(), 'the seeded garment has five colours').toBe(5)
    // The control: it starts on the default colour's variant.
    await expect.poll(variant).toBe('N001-WINE')
    // On its dot, as a person clicks it: an unchosen pill's box is wider than the dot it shows (D43).
    await pills.nth(2).click({ position: { x: 22, y: 22 } })
    await expect(pills.nth(2)).toHaveAttribute('aria-checked', 'true')
    await expect.poll(variant).toBe('N001-BUTTER')
    await expect(page.locator('.proof__link')).toHaveAttribute('href', /\/products\/[^/]+\/butter$/)
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

  // Polish F7 (the owner's answer Q20): it turns until touched, then stays still for the visit,
  // and the "Drag to turn" hint (M3) goes at the same moment.
  test('a press stops the turning for good, and the hint goes with it', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await serveModel(page, true)
    await openWithGarment(page)
    await page.locator('.proof__figure').scrollIntoViewIfNeeded()
    await expect(page.locator('.live-garment')).toHaveAttribute('data-phase', 'shown', {
      timeout: 30000,
    })
    const model = page.locator('.live-garment model-viewer')
    const yaw = () =>
      model.evaluate(
        (element) => (element as unknown as { turntableRotation: number }).turntableRotation,
      )
    // The control: before any touch it really turns by itself, and the hint is up. CI's Firefox has
    // no WebGL (e2e/stage.ts in the viewer): the model is shown but never draws a frame, so its angle
    // cannot move, and this failed there on PR #128. Without WebGL the turning is read from the switch
    // that starts it, as the real-model test above reads it.
    const draws = await page.evaluate(() => {
      const canvas = document.createElement('canvas')
      return Boolean(canvas.getContext('webgl2') ?? canvas.getContext('webgl'))
    })
    if (draws) {
      const before = await yaw()
      await expect.poll(yaw, { timeout: 3000 }).not.toBe(before)
    } else {
      await expect(model).toHaveAttribute('auto-rotate', '')
    }
    await expect(page.locator('.live-garment__hint')).toHaveText(/drag to turn/i)

    const box = await model.boundingBox()
    if (!box) throw new Error('the model has no box')
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width / 2 + 40, box.y + box.height / 2, { steps: 4 })
    await page.mouse.up()

    await expect(model).not.toHaveAttribute('auto-rotate')
    await expect(page.locator('.live-garment__hint')).toHaveCount(0)
    const after = await yaw()
    await page.waitForTimeout(1500)
    expect(await yaw(), 'it started turning again after the visitor let go').toBe(after)
  })

  // Polish M3: on an upright phone a swipe on the garment turns it; held sideways the frame is
  // taller than the screen, so up-and-down stays the page's (lib/liveGarment.ts, measured).
  test('the garment wins a swipe upright, and gives it back when the phone turns sideways', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await serveModel(page, true)
    await openWithGarment(page)
    await page.locator('.proof__figure').scrollIntoViewIfNeeded()
    await expect(page.locator('.live-garment')).toHaveAttribute('data-phase', 'shown', {
      timeout: 30000,
    })
    const model = page.locator('.live-garment model-viewer')
    await expect(model).toHaveAttribute('touch-action', 'none')
    await page.setViewportSize({ width: 844, height: 390 })
    await expect(model).toHaveAttribute('touch-action', 'pan-y')
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

  /*
   * The cross-fade (owner, 2026-10-17, after the home page audit). What would have to break: the
   * colour swapped bare in one frame (no picture over it), a picture that never goes, or a blank
   * picture (`toDataURL` is blank on this renderer; `toBlob` is not: pipeline-evals.md). A browser
   * without WebGL (CI's Firefox) draws no frame to picture, so it simply swaps; that is asserted too.
   */
  test('a colour pick cross-fades: the old colour lies over the swap, then goes', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await serveModel(page, true)
    await openWithGarment(page)
    await page.locator('.proof__figure').scrollIntoViewIfNeeded()
    await expect(page.locator('.live-garment')).toHaveAttribute('data-phase', 'shown', {
      timeout: 30000,
    })
    const draws = await page.evaluate(() => {
      const canvas = document.createElement('canvas')
      return Boolean(canvas.getContext('webgl2') ?? canvas.getContext('webgl'))
    })
    // Watch every frame for the picture over the garment, and read its pixels the first time.
    await page.evaluate(() => {
      const w = window as unknown as { __fade: { seen: number; opaque: number } }
      w.__fade = { seen: 0, opaque: -1 }
      const layer = document.querySelector('.live-garment') as Element
      new MutationObserver(() => {
        const picture = layer.querySelector<HTMLImageElement>('.live-garment__fade')
        if (!picture || w.__fade.opaque >= 0) return
        w.__fade.seen++
        picture.decode().then(() => {
          const canvas = document.createElement('canvas')
          canvas.width = picture.naturalWidth
          canvas.height = picture.naturalHeight
          const context = canvas.getContext('2d') as CanvasRenderingContext2D
          context.drawImage(picture, 0, 0)
          const data = context.getImageData(0, 0, canvas.width, canvas.height).data
          let opaque = 0
          for (let i = 3; i < data.length; i += 64) if ((data[i] ?? 0) > 0) opaque++
          w.__fade.opaque = opaque
        })
      }).observe(layer, { childList: true })
    })
    await page
      .locator('.proof__pill')
      .nth(2)
      .click({ position: { x: 22, y: 22 } })
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (document.querySelector('.live-garment model-viewer') as { variantName?: string })
              .variantName,
        ),
      )
      .toBe('N001-BUTTER')
    const fade = () =>
      page.evaluate(
        () => (window as unknown as { __fade: { seen: number; opaque: number } }).__fade,
      )
    if (draws) {
      await expect.poll(async () => (await fade()).opaque, { timeout: 5000 }).toBeGreaterThan(0)
    }
    // Whatever happened, nothing is left over the garment once the change is done.
    await expect(page.locator('.live-garment__fade')).toHaveCount(0, { timeout: 3000 })
  })

  test('under reduced motion a colour pick swaps with no picture over it', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await serveModel(page, true)
    await openWithGarment(page)
    await page.locator('.proof__figure').scrollIntoViewIfNeeded()
    await expect(page.locator('.live-garment')).toHaveAttribute('data-phase', 'shown', {
      timeout: 30000,
    })
    await page.evaluate(() => {
      const w = window as unknown as { __faded: boolean }
      w.__faded = false
      new MutationObserver(() => {
        if (document.querySelector('.live-garment__fade')) w.__faded = true
      }).observe(document.querySelector('.live-garment') as Element, { childList: true })
    })
    await page
      .locator('.proof__pill')
      .nth(1)
      .click({ position: { x: 22, y: 22 } })
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (document.querySelector('.live-garment model-viewer') as { variantName?: string })
              .variantName,
        ),
      )
      .not.toBe('N001-WINE')
    expect(await page.evaluate(() => (window as unknown as { __faded: boolean }).__faded)).toBe(
      false,
    )
  })

  /*
   * Zoom waits for a click (owner, 2026-10-17). What would have to break: a garment that swallows
   * the wheel of a visitor scrolling past (why zoom was off since PR #94), a click that does not
   * switch zoom on, a drag that does, or zoom left on after the pointer has gone. The wheel is a
   * trusted one, so our smooth scroll sees it as a person's (SmoothScroll.tsx). CI's Firefox has no
   * WebGL, so the camera's field of view is read only where a frame is drawn.
   */
  test('zoom waits for a click on the garment, and goes when the pointer leaves', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await serveModel(page, true)
    await openWithGarment(page)
    await page.locator('.proof__figure').scrollIntoViewIfNeeded()
    await expect(page.locator('.live-garment')).toHaveAttribute('data-phase', 'shown', {
      timeout: 30000,
    })
    const layer = page.locator('.live-garment')
    const model = page.locator('.live-garment model-viewer')
    const centre = async () => {
      const box = await model.boundingBox()
      if (!box) throw new Error('the model has no box')
      return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
    }
    const scrolled = () => page.evaluate(() => Math.round(window.scrollY))

    // Before a click: the wheel over the garment scrolls the page (the control for what follows).
    let at = await centre()
    await page.mouse.move(at.x, at.y)
    await expect(model).toHaveAttribute('disable-zoom', '')
    let before = await scrolled()
    await page.mouse.wheel(0, 300)
    await expect.poll(scrolled).not.toBe(before)

    // A drag turns the garment and does NOT switch zoom on.
    at = await centre()
    await page.mouse.move(at.x, at.y)
    await page.mouse.down()
    await page.mouse.move(at.x + 60, at.y, { steps: 5 })
    await page.mouse.up()
    await expect(layer).not.toHaveAttribute('data-zoom')

    // A click: zoom on, the wheel stays with the garment and the page holds still.
    await page.mouse.click(at.x, at.y)
    await expect(layer).toHaveAttribute('data-zoom', '')
    await expect(model).not.toHaveAttribute('disable-zoom')
    // The middle of the garment is the garment's, not model-viewer's 8px pan dot, which takes the
    // pointer outside its controls (LiveGarment.tsx, "THE PAN TARGET"). The dot hangs below and right
    // of the exact centre (measured: its box starts AT the centre), so the wheel above, aimed at the
    // centre, landed on it only when CI's layout rounded a fraction of a pixel inward: 1 try in 8 in
    // CI's own image. Asked of model-viewer's own tree a few pixels round the centre, the answer
    // does not depend on that rounding.
    const nearCentre = await model.evaluate((element) => {
      const box = element.getBoundingClientRect()
      const cx = box.x + box.width / 2
      const cy = box.y + box.height / 2
      return [-3, 0, 3].flatMap((dx) =>
        [-3, 0, 3].map((dy) => {
          const hit = element.shadowRoot?.elementFromPoint(cx + dx, cy + dy)
          return hit ? hit.id || hit.className || hit.tagName : 'nothing'
        }),
      )
    })
    expect(nearCentre, 'what lies round the centre of the garment').not.toContain(
      'default-pan-target',
    )
    expect(nearCentre).not.toContain('nothing')
    await page.waitForTimeout(1200)
    before = await scrolled()
    await page.mouse.wheel(0, -300)
    await page.waitForTimeout(1200)
    // Without WebGL (CI's Firefox) model-viewer never takes the wheel, so the page scrolls on, which
    // is right where there is nothing to zoom. Measured on PR #200, 2026-10-18: CI's Firefox moved
    // the page 300px here on both tries; the Mac's Firefox with `webgl.disabled` did the same, and
    // held still with WebGL on. The holding is checked where a frame is drawn (CI's Chromium).
    const draws = await page.evaluate(() => {
      const canvas = document.createElement('canvas')
      return Boolean(canvas.getContext('webgl2') ?? canvas.getContext('webgl'))
    })
    if (draws) {
      expect(await scrolled(), 'the page scrolled while zoom was on').toBe(before)
    } else {
      expect(await scrolled(), 'without WebGL the wheel should stay the page’s').not.toBe(before)
    }

    // The pointer leaves: zoom off, and the wheel is the page's again.
    await page.mouse.move(8, 450)
    await expect(layer).not.toHaveAttribute('data-zoom')
    await expect(model).toHaveAttribute('disable-zoom', '')

    // Escape switches it off too.
    at = await centre()
    await page.mouse.click(at.x, at.y)
    await expect(layer).toHaveAttribute('data-zoom', '')
    await page.keyboard.press('Escape')
    await expect(layer).not.toHaveAttribute('data-zoom')
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

/*
 * №03 on a phone, home page audit 2026-10-17 (owner: "leave a scroll strip"). The garment wins a
 * swipe upright (`touch-action: none`, polish M3), so a visitor whose thumb landed on it to scroll
 * turned it instead, and the page felt stuck. A strip down each side edge now scrolls the page;
 * the middle still turns the garment, and "Drag to turn" sits there, clear of both strips.
 * What would have to break: no strip, a strip that does not scroll, a strip narrower than a thumb,
 * a strip on a mouse screen, or the garment losing its middle.
 */
test.describe('№03 on a touch phone: a strip down each side scrolls the page', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } })

  test('the edges scroll, the middle turns, and the hint sits between them', async ({
    page,
    browserName,
    context,
  }) => {
    test.skip(
      browserName !== 'chromium',
      'only Chromium emulates a touch phone with a coarse pointer',
    )
    await serveModel(page, true)
    await openWithGarment(page)
    await page.locator('.proof__figure').scrollIntoViewIfNeeded()
    await expect(page.locator('.live-garment')).toHaveAttribute('data-phase', 'shown', {
      timeout: 30000,
    })
    await expect(page.locator('.live-garment model-viewer')).toHaveAttribute('touch-action', 'none')
    const at = await page.locator('.live-garment').evaluate((layer) => {
      const box = layer.getBoundingClientRect()
      const y = box.top + box.height / 2
      const hit = (x: number) => {
        const el = document.elementFromPoint(x, y)
        return {
          strip: Boolean(el?.closest('.live-garment__scroll')),
          garment: Boolean(el?.closest('model-viewer')),
          touchAction: el ? getComputedStyle(el).touchAction : '',
        }
      }
      const strips = [...layer.querySelectorAll('.live-garment__scroll')].map((strip) =>
        strip.getBoundingClientRect(),
      )
      const hint = layer.querySelector('.live-garment__hint')?.getBoundingClientRect() ?? null
      return {
        left: hit(box.left + 6),
        right: hit(box.right - 6),
        // 35% across: inside the garment, clear of the strips and of model-viewer's own 8px pan dot,
        // which sits at the exact centre and takes a touch there (live site too, measured 2026-10-17).
        middle: hit(box.left + box.width * 0.35),
        widths: strips.map((strip) => strip.width),
        hintClear: hint
          ? strips.every((strip) => hint.right <= strip.left || hint.left >= strip.right)
          : null,
        y,
        left6: box.left + 6,
      }
    })
    expect(at.left, 'the left edge is not a scroll strip').toMatchObject({
      strip: true,
      touchAction: 'pan-y',
    })
    expect(at.right, 'the right edge is not a scroll strip').toMatchObject({
      strip: true,
      touchAction: 'pan-y',
    })
    expect(at.middle, 'the middle no longer turns the garment').toMatchObject({
      garment: true,
      strip: false,
    })
    for (const width of at.widths)
      expect(width, 'a strip is narrower than a thumb').toBeGreaterThanOrEqual(44)
    expect(at.hintClear, '"Drag to turn" lies over a strip').toBe(true)

    // A real finger drag (touch down, ten moves, up) from a strip scrolls the page; one from the
    // middle does not, because the garment takes it (the control). Real touch events, not
    // `synthesizeScrollGesture`: that sends a ready-made scroll past touch-action, and scrolled the
    // page from the middle too (measured 2026-10-17), so it could not tell the two apart.
    const cdp = await context.newCDPSession(page)
    const drag = async (x: number, y: number) => {
      const before = await page.evaluate(() => scrollY)
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [{ x: Math.round(x), y: Math.round(y) }],
      })
      for (let step = 1; step <= 10; step++) {
        await cdp.send('Input.dispatchTouchEvent', {
          type: 'touchMove',
          touchPoints: [{ x: Math.round(x), y: Math.round(y - step * 25) }],
        })
        await page.waitForTimeout(16)
      }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
      await page.waitForTimeout(500)
      return (await page.evaluate(() => scrollY)) - before
    }
    expect(
      await drag(at.left6, at.y),
      'a drag from the strip did not scroll the page',
    ).toBeGreaterThan(100)
    await page
      .locator('.live-garment')
      .evaluate((layer) => layer.scrollIntoView({ block: 'center' }))
    await page.waitForTimeout(300)
    const middle = await page.locator('.live-garment').evaluate((layer) => {
      const box = layer.getBoundingClientRect()
      return { x: box.left + box.width * 0.35, y: box.top + box.height / 2 }
    })
    expect(await drag(middle.x, middle.y), 'a drag from the middle scrolled the page').toBeLessThan(
      20,
    )
  })

  test('a mouse screen has no strips: every part of the garment turns it', async ({
    browser,
    browserName,
  }) => {
    test.skip(browserName !== 'chromium', 'paired with the phone case above')
    const desk = await browser.newPage({ viewport: { width: 1440, height: 900 } })
    try {
      await serveModel(desk, true)
      await openWithGarment(desk)
      await desk.locator('.proof__figure').scrollIntoViewIfNeeded()
      await expect(desk.locator('.live-garment')).toHaveAttribute('data-phase', 'shown', {
        timeout: 30000,
      })
      const shown = await desk
        .locator('.live-garment__scroll')
        .evaluateAll(
          (strips) => strips.filter((s) => getComputedStyle(s).display !== 'none').length,
        )
      expect(shown, 'a strip took the edge of the garment from a mouse').toBe(0)
    } finally {
      await desk.close()
    }
  })
})
