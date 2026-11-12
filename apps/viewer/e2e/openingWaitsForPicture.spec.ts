import { type Page, expect, test } from '@playwright/test'
import { PRELOADER_PICTURE_WAIT_MS } from '../src/lib/motion'

/**
 * The opening screen leaves only once the stage has its picture (12 Nov 2026, loader fix B2).
 * Live, on a slowed phone, the screen wiped away at 3.9 s and the picture painted at 5.1 s: 1.2 s of
 * empty stage. Here the poster is held back on purpose, then broken, then removed from the payload,
 * so the wait is proved to happen, to give up on a broken picture, and never to wait for nothing.
 */
const POSTER = (url: URL) => url.pathname.endsWith('/n001-wine-poster.webp')

async function watch(page: Page) {
  // Under automation the screen leaves before its first frame (Preloader.tsx), so act like a person.
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false })
    const w = window as unknown as { __gone?: number; __pictured?: number }
    const tick = () => {
      // "gone" is when the wipe STARTS: the moment the page under it begins to show.
      if (document.querySelector('.preloader--exit') && w.__gone === undefined) {
        w.__gone = performance.now()
      }
      const picture = document.querySelector<HTMLImageElement>('.stage__placeholder')
      if (picture?.complete && picture.naturalWidth > 0 && w.__pictured === undefined) {
        w.__pictured = performance.now()
      }
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
}

const read = (page: Page) =>
  page.evaluate(() => {
    const w = window as unknown as { __gone?: number; __pictured?: number }
    return { gone: w.__gone ?? null, pictured: w.__pictured ?? null }
  })

test.describe('the opening screen waits for the garment picture', () => {
  test('a slow picture holds the screen until it is in', async ({ page }) => {
    await watch(page)
    await page.route(POSTER, async (route) => {
      await new Promise((r) => setTimeout(r, 1000))
      await route.continue()
    })
    await page.goto('/n001/wine')
    await expect.poll(async () => (await read(page)).gone, { timeout: 10_000 }).not.toBe(null)
    const { gone, pictured } = await read(page)
    expect(pictured, 'the picture never arrived, so nothing was measured').not.toBe(null)
    expect(gone as number).toBeGreaterThanOrEqual((pictured as number) - 34)
  })

  test('a broken picture does not hold the screen', async ({ page }) => {
    await watch(page)
    await page.route(POSTER, (route) => route.abort())
    const started = Date.now()
    await page.goto('/n001/wine')
    await expect.poll(async () => (await read(page)).gone, { timeout: 10_000 }).not.toBe(null)
    expect(Date.now() - started).toBeLessThan(PRELOADER_PICTURE_WAIT_MS + 5000)
  })

  test('a garment with no picture is never waited for', async ({ page }) => {
    await watch(page)
    await page.route('**/api/public/viewer/**', async (route) => {
      const response = await route.fetch()
      const body = await response.json()
      for (const colourway of body.colourways ?? []) colourway.poster = null
      if (body.product) body.product.posterFallback = null
      await route.fulfill({ response, json: body })
    })
    await page.goto('/n001/wine')
    await expect
      .poll(async () => (await read(page)).gone, { timeout: PRELOADER_PICTURE_WAIT_MS + 5000 })
      .not.toBe(null)
  })
})
