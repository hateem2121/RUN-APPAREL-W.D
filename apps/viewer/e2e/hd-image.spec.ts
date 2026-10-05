import { expect, type Page, test } from '@playwright/test'
import { stageFallsBack } from './stage'

/**
 * The HD IMAGE button and its studio render (2026-09-27; in the 3D window since polish D9).
 *
 * The fixture gives THREE of five colours a render (wine, blush, lime — see
 * serve.mjs), because production has garments with renders on some colours only; a
 * fixture where every colour had one could never show the button's absence. Each render
 * has a screen-sized copy at its own `-screen.png` path (F16), so a test can tell which
 * of the two the page asked for.
 *
 * Every engine runs this, including the ones with no WebGL: the button lives in the
 * same row as the camera buttons, and in the poster branch it is the ONLY control in
 * that row — a device that cannot draw 3D is the one the picture helps most. Since D9 the
 * button does two jobs: WITH 3D it switches the window to the picture ("VIEW IN 3D" switches
 * back) and FULL SCREEN opens the full-screen view; WITHOUT 3D the window already holds the
 * picture, and the button opens the full-screen view, as before.
 */

const RENDER_PATH = '/fixtures/renders/'

const hdButton = (page: Page) => page.getByRole('button', { name: /^HD image/ })
const fullButton = (page: Page) => page.getByRole('button', { name: /^Full screen/ })
const view3d = (page: Page) => page.getByRole('button', { name: 'View in 3D' })

async function openReady(page: Page, colour = 'wine') {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto(`/n001/${colour}`)
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
}

/**
 * The full-screen view, the way a visitor reaches it: with 3D, HD IMAGE and then FULL SCREEN
 * (D9); without, HD IMAGE opens it at once. Returns the button that opened it, which is the
 * one focus must come back to.
 */
async function openFull(page: Page) {
  const fallback = await stageFallsBack(page)
  await hdButton(page).click()
  if (fallback) return hdButton(page)
  await fullButton(page).click()
  return fullButton(page)
}

test('the button is on a colour with a render, and absent on one without', async ({ page }) => {
  await openReady(page, 'wine')
  await expect(hdButton(page)).toBeVisible()
  await expect(hdButton(page)).toBeEnabled()

  // Negative case: butter has no render, so there is nothing to offer.
  await page.goto('/n001/butter')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await expect(hdButton(page)).toHaveCount(0)
})

test('the page asks for no render until the visitor shows intent', async ({ page }) => {
  const renderRequests: string[] = []
  page.on('request', (request) => {
    if (request.url().includes(RENDER_PATH)) renderRequests.push(request.url())
  })
  await openReady(page, 'wine')
  await expect(hdButton(page)).toBeVisible()
  // Without 3D the window's own picture IS the screen-sized copy (polish D9, and the "stands in
  // for the poster" test below), so it arrives with the page; there only the full render waits for
  // intent. CI's Firefox has no WebGL (e2e/stage.ts): this failed there on PR #128 and passed on a
  // Mac, whose Firefox draws 3D.
  const fallback = await stageFallsBack(page)
  const early = () =>
    fallback ? renderRequests.filter((url) => !url.endsWith('-screen.png')) : renderRequests
  // Give any eager preload the chance to show itself before asserting there was none.
  await page.waitForTimeout(1000)
  expect(early(), 'a render was fetched before anyone asked for it').toEqual([])

  await hdButton(page).hover()
  await expect.poll(() => early().length).toBeGreaterThan(0)
  // With 3D the switch warms the window's screen-sized copy; without, the full render.
  expect(early()[0]).toMatch(fallback ? /n001-wine\.png$/ : /n001-wine(-screen)?\.png$/)
})

test('opens full screen, closes on Escape, and gives focus back to the button', async ({
  page,
}) => {
  await openReady(page, 'wine')
  const opener = await openFull(page)

  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await expect(dialog).toContainText('Studio render — Velocity Performance Tee in Wine')
  const picture = dialog.locator('.hd-image__render')
  await expect(picture).toHaveAttribute('data-loaded', 'true')
  expect(await picture.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(1200)

  // Full screen, not a small lightbox: the dialog covers the viewport.
  const size = page.viewportSize()
  const box = await dialog.boundingBox()
  expect(box?.width).toBeCloseTo(size?.width ?? 0, 0)
  expect(box?.height).toBeCloseTo(size?.height ?? 0, 0)

  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(opener).toBeFocused()
})

test('the arrows step through the colours WITH renders and move the page with them', async ({
  page,
}) => {
  await openReady(page, 'wine')
  await openFull(page)
  const dialog = page.getByRole('dialog')

  await dialog.getByRole('button', { name: 'Next colour: Pebble / Optic White' }).click()
  await expect(dialog).toContainText('in Pebble / Optic White')
  await expect(page).toHaveURL(/\/n001\/blush$/)

  // Butter has no render, so the next step skips it.
  await dialog.getByRole('button', { name: 'Next colour: Lime' }).click()
  await expect(dialog).toContainText('in Lime')
  await expect(page).toHaveURL(/\/n001\/lime$/)

  // The keyboard route wraps round: Lime → Wine.
  await page.keyboard.press('ArrowRight')
  await expect(dialog).toContainText('in Wine')

  await dialog.getByRole('button', { name: 'Close the studio render' }).click()
  await expect(dialog).toHaveCount(0)
  await expect(page).toHaveURL(/\/n001\/wine$/)
})

test('zooms with the wheel and with a double-click, and never past the frame', async ({
  page,
  isMobile,
}) => {
  // Playwright cannot turn a mouse wheel in mobile WebKit; the phone path is the
  // double-TAP test below.
  test.skip(isMobile, 'no mouse wheel on a phone')
  await openReady(page, 'wine')
  await openFull(page)
  const viewport = page.locator('.hd-image__viewport')
  const layer = page.locator('.hd-image__layer')
  await expect(page.locator('.hd-image__render')).toHaveAttribute('data-loaded', 'true')
  const scale = () =>
    layer.evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).a as number)

  expect(await scale()).toBe(1)
  const vb = await viewport.boundingBox()
  if (!vb) throw new Error('no picture frame')
  await page.mouse.move(vb.x + vb.width / 2, vb.y + vb.height / 3)
  await page.mouse.wheel(0, -400)
  await expect.poll(scale).toBeGreaterThan(1)

  // Zoomed out as far as it goes is the fitted picture, not smaller.
  await page.mouse.wheel(0, 4000)
  await expect.poll(scale).toBe(1)

  await viewport.dblclick({ position: { x: vb.width / 2, y: vb.height / 3 } })
  await expect.poll(scale).toBeCloseTo(2.5, 2)
  await viewport.dblclick({ position: { x: vb.width / 2, y: vb.height / 3 } })
  await expect.poll(scale).toBe(1)
})

test('a double-tap zooms in at the finger, and a second one zooms back out', async ({
  page,
  isMobile,
}) => {
  // Touch only: this is the pointer-event path, not the browser's dblclick.
  test.skip(!isMobile, 'a double-TAP needs a touch screen')
  await openReady(page, 'wine')
  await openFull(page)
  const viewport = page.locator('.hd-image__viewport')
  const layer = page.locator('.hd-image__layer')
  await expect(page.locator('.hd-image__render')).toHaveAttribute('data-loaded', 'true')
  const scale = () =>
    layer.evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).a as number)
  const vb = await viewport.boundingBox()
  if (!vb) throw new Error('no picture frame')
  const at = { x: vb.width / 2, y: vb.height / 3 }

  await viewport.tap({ position: at })
  await viewport.tap({ position: at })
  await expect.poll(scale).toBeCloseTo(2.5, 2)
  // iOS Safari can follow a touch double-tap with its own dblclick; Playwright never
  // sends one, so the test does. It must not undo the zoom (HdImageDialog.tsx).
  await viewport.dispatchEvent('dblclick', { clientX: vb.x + at.x, clientY: vb.y + at.y })
  await page.waitForTimeout(300)
  expect(await scale()).toBeCloseTo(2.5, 2)
  await viewport.tap({ position: at })
  await viewport.tap({ position: at })
  await expect.poll(scale).toBe(1)
})

test('a tap on the empty space round the picture closes it', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await openReady(page, 'wine')
  await openFull(page)
  const frame = page.locator('.hd-image__frame')
  await expect(page.locator('.hd-image__render')).toHaveAttribute('data-loaded', 'true')
  // A 4:5 picture in a wide frame leaves empty space on both sides.
  await frame.click({ position: { x: 8, y: 100 } })
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

test('in landscape the whole picture fits on screen', async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 })
  await openReady(page, 'wine')
  await openFull(page)
  /*
   * ⚠️ WAIT FOR THE SETTLED FRAME, NOT THE FIRST ONE. The dialog is a lazy chunk with its
   * own stylesheet (hd-image.css), and its code can render before that sheet arrives. The
   * frame is then measured unstyled — 26px tall — and a ResizeObserver corrects it when
   * the sheet lands. Reading the box straight after the click raced that correction: it
   * failed once in Firefox under a full-suite run (2026-09-28, "Received: 26") and passed
   * 10/10 alone. Reproduced on every engine by holding back only that stylesheet for
   * 1.5 s (with the service worker blocked, or the delay never applies): exactly 26 again.
   * A picture that STAYS too small still fails here, when the poll times out.
   */
  const viewport = page.locator('.hd-image__viewport')
  await expect
    .poll(async () => (await viewport.boundingBox())?.height ?? 0, {
      message: 'the picture never grew to its fitted size',
    })
    .toBeGreaterThan(200)
  const picture = await viewport.boundingBox()
  expect(picture, 'no picture frame').not.toBeNull()
  if (!picture) return
  expect(picture.y).toBeGreaterThanOrEqual(0)
  expect(picture.y + picture.height).toBeLessThanOrEqual(390)
  expect(picture.height).toBeGreaterThan(200)
  // The render's own 4:5 shape, kept.
  expect(picture.width / picture.height).toBeCloseTo(1200 / 1500, 1)
})

/**
 * The row must stay ONE row on the narrowest phone. The stage band's height budget
 * has been wrong three times by reasoning (.claude/rules/viewer-layout.md), and a
 * wrapped row costs a whole button height of garment — so it is measured here, on
 * every engine, not argued.
 */
for (const width of [320, 375] as const) {
  test(`the control row stays one row at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 700 })
    await openReady(page, 'wine')
    await expect(hdButton(page)).toBeVisible()
    const measured = await page.evaluate(() => {
      const row = document.querySelector('.stage__controls') as HTMLElement
      const buttons = [...row.querySelectorAll('button')].map((b) => b.getBoundingClientRect())
      const plinth = (
        document.querySelector('.stage__plinth') as HTMLElement
      ).getBoundingClientRect()
      const box = [...row.children].map((c) => c.getBoundingClientRect())
      return {
        // Pill edges, not button edges: the camera buttons sit 1px inside their pill's
        // border, the HD button IS its pill.
        tops: [...new Set(box.map((b) => Math.round(b.top)))],
        bottoms: [...new Set(box.map((b) => Math.round(b.bottom)))],
        // The PILLS against the plinth, not the row against the page: the row was
        // once 318px in a 301px plinth and still "fit the page" by the gutter.
        left: Math.min(...box.map((b) => b.left)) - plinth.left,
        right: plinth.right - Math.max(...box.map((b) => b.right)),
        docWidth: document.documentElement.clientWidth,
        labelsWrap: buttons.some((b) => b.height > 60),
      }
    })
    expect(measured.tops, 'the buttons sit on more than one row').toHaveLength(1)
    expect(measured.bottoms, 'the two pills are not the same height').toHaveLength(1)
    expect(measured.labelsWrap, 'a label wrapped inside its button').toBe(false)
    expect(measured.left, 'a pill hangs out of the plinth on the left').toBeGreaterThanOrEqual(0)
    expect(measured.right, 'a pill hangs out of the plinth on the right').toBeGreaterThanOrEqual(0)
  })
}

/*
 * Polish F2 (2026-10-04): with smooth scroll on, a wheel over the open picture slid the page from
 * 0 to 1,200px behind it, so the visitor closed the picture somewhere else. base-ui holds the page
 * with `overflow: hidden`, which stops a person but not Lenis's `scrollTo`; Lenis now hands the
 * wheel back to the browser while the page is held (packages/shared/src/pageHold.ts). Run AS A
 * HUMAN, because under automation smooth scroll is off and the page would hold still regardless.
 */
test('a wheel over the open picture leaves the page behind it where it was', async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, 'a phone has no wheel')
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.addInitScript(`Object.defineProperty(Navigator.prototype, 'webdriver', {
    get: () => false,
    configurable: true,
  })`)
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto('/n001/wine')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await expect
    .poll(() => page.evaluate(() => document.documentElement.classList.contains('lenis')), {
      message: 'Lenis never started, so this would pass with the fix deleted',
      timeout: 10_000,
    })
    .toBe(true)
  // base-ui's lock can move the page's position from <html> onto <body>, so read both.
  const scrollY = () => page.evaluate(() => Math.round(window.scrollY + document.body.scrollTop))

  await openFull(page)
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect
    .poll(
      () =>
        page.evaluate(() =>
          [document.documentElement.style.overflowY, document.body.style.overflowY].some((v) =>
            /^(?:hidden|clip)$/.test(v),
          ),
        ),
      { message: 'base-ui never held the page, so there is nothing for Lenis to honour' },
    )
    .toBe(true)
  // Measured with the picture open: the click first scrolled the button into view.
  const start = await scrollY()
  await page.mouse.move(640, 450)
  await page.mouse.wheel(0, 1200)
  // Longer than the 1.1 s glide, so a slow one cannot hide inside the wait.
  await page.waitForTimeout(1500)
  expect(await scrollY(), 'the page slid behind the open picture').toBe(start)
})

/*
 * POLISH D9 (owner-approved 2026-10-03): the picture in the 3D window. With 3D only: without it
 * the window already holds the picture (the last test below), and these are skipped there.
 */
test.describe('HD IMAGE shows the picture in the 3D window (D9)', () => {
  const picture = (page: Page) => page.locator('.stage__hd')
  const modelVisibility = (page: Page) =>
    page.locator('model-viewer').evaluate((el) => getComputedStyle(el).visibility)

  test('the window shows the picture, and VIEW IN 3D brings the garment back', async ({ page }) => {
    await openReady(page, 'wine')
    test.skip(await stageFallsBack(page), 'no 3D here: the window is the picture already')
    await expect(page.locator('model-viewer')).toHaveCount(1)

    // By keyboard: the switch is one element in both states, so focus must stay on it (WebKit
    // on a Mac does not focus a button on a mouse click, so a click could not show this).
    await hdButton(page).focus()
    await page.keyboard.press('Enter')
    await expect(picture(page)).toBeVisible()
    await expect(picture(page)).toHaveAttribute('src', /n001-wine-screen\.png$/)
    await expect(picture(page)).toHaveAttribute(
      'alt',
      'Velocity Performance Tee in Wine, studio render',
    )
    // POLLED: under reduced motion every property carries a 0.01 ms transition (MO-03), so a
    // change of `visibility` lands one frame after the attribute (read the same frame, 2026-10-04).
    await expect
      .poll(() => modelVisibility(page), { message: 'the garment still shows under the picture' })
      .toBe('hidden')
    await expect(page.getByRole('group', { name: 'Camera positions' })).toHaveCount(0)
    await expect(page.getByRole('region', { name: 'Product picture' })).toBeVisible()
    await expect(view3d(page), 'focus left the switch').toBeFocused()
    await expect(fullButton(page)).toBeVisible()

    await page.keyboard.press('Enter')
    await expect(picture(page)).toHaveCount(0)
    await expect.poll(() => modelVisibility(page)).toBe('visible')
    await expect(page.getByRole('group', { name: 'Camera positions' })).toBeVisible()
    await expect(hdButton(page), 'focus left the switch').toBeFocused()
    await expect(fullButton(page)).toHaveCount(0)
  })

  test('with motion allowed, the switch runs as a view transition and still lands', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      const doc = document as Document & { startViewTransition?: (cb: () => void) => unknown }
      const original = doc.startViewTransition?.bind(doc)
      ;(window as unknown as { __vt: number }).__vt = 0
      if (original)
        doc.startViewTransition = (cb: () => void) => {
          ;(window as unknown as { __vt: number }).__vt++
          return original(cb)
        }
    })
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await page.goto('/n001/wine')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    test.skip(await stageFallsBack(page), 'no 3D here: the window is the picture already')
    const supported = await page.evaluate(() => 'startViewTransition' in document)
    await hdButton(page).click()
    await expect(picture(page)).toBeVisible()
    await view3d(page).click()
    await expect(picture(page)).toHaveCount(0)
    const used = await page.evaluate(() => (window as unknown as { __vt: number }).__vt)
    // Where the browser has the API, both switches go through it; where not, they are instant.
    expect(used).toBe(supported ? 2 : 0)
  })

  test('the colour dots switch the picture, and a colour with none goes back to 3D', async ({
    page,
  }) => {
    await openReady(page, 'wine')
    test.skip(await stageFallsBack(page), 'no 3D here: the window is the picture already')
    await hdButton(page).click()
    await expect(picture(page)).toHaveAttribute('src', /n001-wine-screen\.png$/)

    await page.getByRole('tab', { name: /Lime/ }).click()
    await expect(picture(page)).toHaveAttribute('src', /n001-lime-screen\.png$/)

    // Butter has no render: no picture to show, and no button to offer one.
    await page.getByRole('tab', { name: /Butter/ }).click()
    await expect(picture(page)).toHaveCount(0)
    await expect(hdButton(page)).toHaveCount(0)
    await expect(page.getByRole('group', { name: 'Camera positions' })).toBeVisible()

    // Back on a colour with a render, the garment stays: the picture waits for the button.
    await page.getByRole('tab', { name: /Wine/ }).click()
    await expect(hdButton(page)).toBeVisible()
    await expect(picture(page)).toHaveCount(0)
  })

  test('the window asks for the screen-sized copy; only FULL SCREEN asks for the full render', async ({
    page,
  }) => {
    const asked: string[] = []
    page.on('request', (request) => {
      if (request.url().includes(RENDER_PATH)) asked.push(new URL(request.url()).pathname)
    })
    await openReady(page, 'wine')
    test.skip(await stageFallsBack(page), 'no 3D here: the window is the picture already')
    await hdButton(page).click()
    await expect(picture(page)).toBeVisible()
    await page.waitForTimeout(500)
    expect(asked, 'the window fetched the full render').not.toContain(`${RENDER_PATH}n001-wine.png`)
    expect(asked).toContain(`${RENDER_PATH}n001-wine-screen.png`)

    await fullButton(page).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await expect.poll(() => asked).toContain(`${RENDER_PATH}n001-wine.png`)
  })

  for (const width of [320, 375] as const) {
    test(`with the picture showing, the row stays one row at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 700 })
      await openReady(page, 'wine')
      test.skip(await stageFallsBack(page), 'no 3D here: the window is the picture already')
      await hdButton(page).click()
      await expect(view3d(page)).toBeVisible()
      const measure = () =>
        page.evaluate(() => {
          const row = document.querySelector('.stage__controls') as HTMLElement
          const plinth = (
            document.querySelector('.stage__plinth') as HTMLElement
          ).getBoundingClientRect()
          const box = [...row.children].map((c) => c.getBoundingClientRect())
          return {
            tops: [...new Set(box.map((b) => Math.round(b.top)))],
            left: Math.min(...box.map((b) => b.left)) - plinth.left,
            right: plinth.right - Math.max(...box.map((b) => b.right)),
            labelsWrap: box.some((b) => b.height > 60),
          }
        })
      /*
       * POLLED: the row's words are sized by a CONTAINER query (`.hd-image-btn__more`), which
       * WebKit, like Firefox, can apply a frame after the buttons change. Read in the same frame
       * as the switch, WebKit reported two rows at 375px while the settled page showed one
       * (screenshot, 2026-10-04). A row that truly wraps still fails when the poll times out.
       */
      await expect
        .poll(async () => (await measure()).tops.length, {
          message: 'FULL SCREEN and VIEW IN 3D sit on more than one row',
        })
        .toBe(1)
      const m = await measure()
      expect(m.labelsWrap, 'a label wrapped inside its button').toBe(false)
      expect(m.left).toBeGreaterThanOrEqual(0)
      expect(m.right).toBeGreaterThanOrEqual(0)
    })
  }
})

/*
 * "If the 3D can't load, the HD picture can stand in for it" (D9, second check). N002 has no
 * model, so every engine lands in the no-3D state: the window draws the colour's screen-sized
 * copy instead of its poster, except under Save-Data, which keeps the ~34 KB poster.
 */
test('without 3D the screen-sized HD copy stands in for the poster, but not under Save-Data', async ({
  page,
}) => {
  await page.goto('/n002/wine')
  await expect(page.locator('.stage__error:not([hidden])')).toBeVisible()
  await expect(page.locator('.stage__picture')).toHaveAttribute('src', /n001-wine-screen\.png$/)

  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'connection', {
      configurable: true,
      value: { saveData: true },
    })
  })
  await page.goto('/n002/wine')
  await expect(page.locator('.stage__error:not([hidden])')).toBeVisible()
  await expect(page.locator('.stage__picture')).toHaveAttribute('src', /-poster\.webp$/)
})
