import { expect, type Page, test } from '@playwright/test'

/**
 * The HD IMAGE button and its full-screen studio render (2026-09-27).
 *
 * The fixture gives THREE of five colours a render (wine, blush, lime — see
 * serve.mjs), because production has garments with renders on some colours only; a
 * fixture where every colour had one could never show the button's absence.
 *
 * Every engine runs this, including the ones with no WebGL: the button lives in the
 * same row as the camera buttons, and in the poster branch it is the ONLY control in
 * that row — a device that cannot draw 3D is the one the picture helps most.
 */

const RENDER_PATH = '/fixtures/renders/'

const hdButton = (page: Page) => page.getByRole('button', { name: /^HD image/ })

async function openReady(page: Page, colour = 'wine') {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto(`/n001/${colour}`)
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
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
  // Give any eager preload the chance to show itself before asserting there was none.
  await page.waitForTimeout(1000)
  expect(renderRequests, 'a render was fetched before anyone asked for it').toEqual([])

  await hdButton(page).hover()
  await expect.poll(() => renderRequests.length).toBeGreaterThan(0)
  expect(renderRequests[0]).toContain('n001-wine.png')
})

test('opens full screen, closes on Escape, and gives focus back to the button', async ({
  page,
}) => {
  await openReady(page, 'wine')
  await hdButton(page).click()

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
  await expect(hdButton(page)).toBeFocused()
})

test('the arrows step through the colours WITH renders and move the page with them', async ({
  page,
}) => {
  await openReady(page, 'wine')
  await hdButton(page).click()
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
  await hdButton(page).click()
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
  await hdButton(page).click()
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
  await hdButton(page).click()
  const frame = page.locator('.hd-image__frame')
  await expect(page.locator('.hd-image__render')).toHaveAttribute('data-loaded', 'true')
  // A 4:5 picture in a wide frame leaves empty space on both sides.
  await frame.click({ position: { x: 8, y: 100 } })
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

test('in landscape the whole picture fits on screen', async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 })
  await openReady(page, 'wine')
  await hdButton(page).click()
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
