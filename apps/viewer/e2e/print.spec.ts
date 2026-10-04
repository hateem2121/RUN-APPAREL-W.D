import { expect, type Page, test } from '@playwright/test'
import { contrastOf } from '../../../scripts/contrast-rules.mjs'
import { LONGEST_COPY } from './garmentCopy'
import { stageFallsBack } from './stage'

/**
 * VA-04 on the garment pages — a printed page reads, whatever theme it was printed from (visual
 * audit, 2026-10-02). Browsers drop background colours on paper and printing changes neither the
 * system's dark setting nor a saved theme choice, so a dark theme prints light text on white;
 * WCAG 1.4.3 asks for 4.5:1. The rules are shared with the website (packages/ui: tokens.css,
 * notch.css, base.css), and apps/cms/e2e/print.spec.ts holds the website to the same checks.
 */

const printedColours = (page: Page) =>
  page.evaluate(() => {
    const colour = (selector: string) => {
      const el = document.querySelector(selector)
      return el ? getComputedStyle(el).color : `missing: ${selector}`
    }
    return { headline: colour('h1'), text: colour('main p'), bar: colour('.notch__wordmark') }
  })

for (const { how, theme } of [
  { how: 'the system setting', theme: null },
  { how: 'the theme switch', theme: 'dark' },
] as const) {
  test(`printed from dark mode set by ${how}, every word is dark on white (VA-04)`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: 'dark' })
    await page.goto('/n001/wine')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    if (theme) {
      await page.evaluate((value) => {
        document.documentElement.dataset.theme = value
      }, theme)
    }
    // NEGATIVE CONTROL: on screen the page IS dark, so the paper result below means something.
    const onScreen = await printedColours(page)
    expect(contrastOf(onScreen.text, '#ffffff'), 'not light text on screen').toBeLessThan(3)

    await page.emulateMedia({ media: 'print', colorScheme: 'dark' })
    const onPaper = await printedColours(page)
    for (const [what, colour] of Object.entries(onPaper)) {
      expect(contrastOf(colour, '#ffffff'), `${what} on paper: ${colour}`).toBeGreaterThanOrEqual(
        4.5,
      )
    }
  })
}

/*
 * POLISH F14 — ONE CLEAN SHEET PER GARMENT. Printed before (Chromium, A4, from a 1440x900 window,
 * 2026-10-04) a garment page ran to three sheets with the Email / WhatsApp bar on each, the camera
 * buttons, a cropped 3D frame, and the footer's contact details under an opaque white layer.
 */

/**
 * The catalogue's worst case on paper: the longest description and name, and the most facts —
 * six performance features (r-xmp, r-cch, r-rpt and r-et; production D1 read 2026-10-04) and
 * three fabrics.
 */
function serveFullestGarment(page: Page) {
  return page.route('**/api/public/viewer/**', async (route) => {
    const response = await route.fetch()
    const body = (await response.json()) as {
      product: Record<string, unknown> & {
        specs?: { key: string; items: { text: string; note: string | null }[] }[]
      }
    }
    Object.assign(body.product, LONGEST_COPY)
    for (const group of body.product.specs ?? []) {
      const most = group.key === 'performance' ? 6 : group.key === 'fabric' ? 3 : 0
      while (group.items.length < most) {
        group.items.push({ text: `Breathable mesh panel ${group.items.length + 1}`, note: null })
      }
    }
    await route.fulfill({ response, json: body })
  })
}

/** Sheets in a PDF: its page objects (`/Type /Page`, not the `/Pages` tree above them). */
const sheetsIn = (pdf: Buffer) =>
  (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length
/**
 * Pictures in a PDF. The garment's is the only one on the sheet: the colour dots, the logos and
 * the 3D window do not print, and the icons are drawn, not pictures.
 */
const picturesIn = (pdf: Buffer) =>
  (pdf.toString('latin1').match(/\/Subtype\s*\/Image/g) ?? []).length

/** What a browser does when a visitor prints (MDN "Window: beforeprint event"). */
const toPaper = (page: Page) => page.evaluate(() => window.dispatchEvent(new Event('beforeprint')))
const toScreen = (page: Page) => page.evaluate(() => window.dispatchEvent(new Event('afterprint')))

test.describe('one clean sheet per garment (polish F14)', () => {
  for (const { from, width, height } of [
    { from: 'a computer', width: 1440, height: 900 },
    { from: 'a phone', width: 390, height: 844 },
  ] as const) {
    test(`printed from ${from}, the fullest garment fits one A4 and one Letter sheet, picture included`, async ({
      page,
      browserName,
    }) => {
      test.skip(browserName !== 'chromium', 'page.pdf() is Chromium only')
      await serveFullestGarment(page)
      await page.setViewportSize({ width, height })
      await page.goto('/n001/wine')
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      // The picture the sheet will carry has arrived: the print copy, or the window's own
      // picture where there is no 3D.
      await expect
        .poll(() =>
          page.evaluate(() => {
            const img = document.querySelector<HTMLImageElement>('.stage__print, .stage__picture')
            return Boolean(img?.complete && img.naturalWidth > 0)
          }),
        )
        .toBe(true)
      await toPaper(page)
      for (const format of ['A4', 'Letter'] as const) {
        const pdf = await page.pdf({ format })
        expect(sheetsIn(pdf), `${format} sheets`).toBe(1)
        expect(picturesIn(pdf), `${format} pictures`).toBeGreaterThan(0)
      }
    })
  }

  test('from a computer it prints the one-column arrangement, and returns after', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/n001/wine')
    await expect(page.locator('.stage__aside .product-info')).toHaveCount(1)
    // In the same breath as the event: the browser lays the sheet out straight after it.
    const onPaper = await page.evaluate(() => {
      window.dispatchEvent(new Event('beforeprint'))
      return {
        aside: document.querySelectorAll('.stage__aside .product-info').length,
        content: document.querySelectorAll('.content .product-info').length,
        corners: document.querySelectorAll('.spec-groups--corners').length,
      }
    })
    expect(onPaper).toEqual({ aside: 0, content: 1, corners: 0 })
    await toScreen(page)
    await expect(page.locator('.stage__aside .product-info')).toHaveCount(1)
  })

  test('on paper the window holds the chosen colour’s picture, taken once it has arrived', async ({
    page,
  }) => {
    /*
     * The print copy must not ask for the poster while the download placeholder is still
     * fetching it: created then, it was a second download in 3 of 16 Chromium page loads. A count
     * of requests cannot hold this (whether Chromium reuses a finished picture from memory varies
     * with timing, and the test server marks nothing cacheable, unlike the live media host), so
     * this asks the page itself: when the copy appears, has the poster already arrived?
     */
    await page.addInitScript(() => {
      const seen: boolean[] = []
      ;(window as unknown as { printCopies: boolean[] }).printCopies = seen
      new MutationObserver((records) => {
        for (const record of records) {
          for (const node of record.addedNodes) {
            if (!(node instanceof Element)) continue
            const copies = node.matches('.stage__print')
              ? [node]
              : [...node.querySelectorAll('.stage__print')]
            for (const copy of copies as HTMLImageElement[]) {
              seen.push(
                [...document.querySelectorAll<HTMLImageElement>('.stage__placeholder')].some(
                  (poster) => poster.src === copy.src && poster.complete,
                ),
              )
            }
          }
        }
      }).observe(document, { childList: true, subtree: true })
    })
    await page.goto('/n001/wine')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    test.skip(await stageFallsBack(page), 'no 3D here: the window already holds the picture')
    await expect(page.locator('model-viewer')).toBeAttached()
    const picture = page.locator('.stage__print')
    await expect(picture).toBeHidden()

    await page.emulateMedia({ media: 'print' })
    await expect(picture).toBeVisible()
    await expect(picture).toHaveAttribute('src', /n001-wine-poster/)
    await expect
      .poll(() => picture.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth))
      .toBeGreaterThan(0)
    await expect(page.locator('model-viewer')).toHaveCSS('visibility', 'hidden')
    const copies = await page.evaluate(
      () => (window as unknown as { printCopies: boolean[] }).printCopies,
    )
    expect(copies, 'one copy, made after the poster arrived').toEqual([true])
  })

  test('another colour’s picture downloads only when the page prints', async ({ page }) => {
    const fetched: string[] = []
    page.on('request', (request) => {
      if (request.url().includes('-poster.')) fetched.push(new URL(request.url()).pathname)
    })
    await page.goto('/n001/wine')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    test.skip(await stageFallsBack(page), 'no 3D here: the window already holds the picture')
    // After the download: during it the window paints the chosen colour's picture itself.
    await page.waitForFunction(
      () =>
        Boolean((document.querySelector('model-viewer') as { loaded?: boolean } | null)?.loaded),
      undefined,
      { timeout: 40_000 },
    )
    await page.getByRole('tab', { name: /Lime/ }).click()
    const picture = page.locator('.stage__print')
    await expect(picture).toHaveAttribute('src', /n001-lime-poster/)
    await expect(picture).toHaveAttribute('loading', 'lazy')
    // Long enough for an eager picture from this server to have been asked for (under 50ms here).
    await page.waitForTimeout(500)
    expect(fetched.filter((path) => path.includes('n001-lime-poster'))).toHaveLength(0)

    await toPaper(page)
    await page.emulateMedia({ media: 'print' })
    await expect(picture).toHaveAttribute('loading', 'eager')
    await expect
      .poll(() => picture.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth))
      .toBeGreaterThan(0)
    await toScreen(page)
    await expect(picture).toHaveAttribute('loading', 'lazy')
  })

  test('on paper: no buttons or bars, and the contact details uncovered', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/n001/wine')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    // NEGATIVE CONTROL: on a phone's screen the bar and the colour dots are there.
    await expect(page.locator('.action-bar')).toBeVisible()
    await expect(page.locator('.colourways')).toBeVisible()

    await page.emulateMedia({ media: 'print' })
    for (const selector of [
      '.action-bar',
      '.colourways',
      '.stage__plinth',
      '.trail',
      '.customise',
      '.contact',
      '.footer-cta',
    ]) {
      await expect(page.locator(selector).first(), selector).toBeHidden()
    }
    // The grid layer over the footer printed as an opaque white sheet (Chromium, A4 and Letter).
    const cover = await page
      .locator('.site-footer__slab')
      .evaluate((slab) => getComputedStyle(slab, '::before').display)
    expect(cover).toBe('none')
    await expect(page.locator('.footer-block--contact')).toBeVisible()
  })
})

test('the cookie question never prints (VA-04)', async ({ page, context }) => {
  // The question honours navigator.webdriver; lift it, as consent.spec.ts does.
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false })
  })
  await page.goto('/n001/wine')
  const card = page.locator('.consent')
  await expect(card).toBeVisible()
  await page.emulateMedia({ media: 'print' })
  await expect(card).toBeHidden()
})
