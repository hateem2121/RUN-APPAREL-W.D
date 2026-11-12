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
    const w = window as unknown as { __gone?: number; __pictured?: number; __asked?: number }
    const tick = () => {
      // "gone" is when the wipe STARTS: the moment the page under it begins to show.
      if (document.querySelector('.preloader--exit') && w.__gone === undefined) {
        w.__gone = performance.now()
      }
      const picture = document.querySelector<HTMLImageElement>('.stage__placeholder')
      // The stage's picture is drawn in the same render that starts the wait (App.tsx), so its
      // first frame is when the 1.5 s allowance began.
      if (picture && w.__asked === undefined) w.__asked = performance.now()
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
    const w = window as unknown as { __gone?: number; __pictured?: number; __asked?: number }
    return { gone: w.__gone ?? null, pictured: w.__pictured ?? null, asked: w.__asked ?? null }
  })

test.describe('the opening screen waits for the garment picture', () => {
  /*
   * The rule: the screen leaves once the picture is in, or once the 1.5 s allowance has run out,
   * and never before both. CI's Firefox (PR #383, 12 Nov 2026) took longer than the allowance to
   * deliver a picture held back 1 s, so the screen rightly left first and the old check, which
   * expected the picture to win, read that as a failure. Here the picture is held 1.3 s: later than
   * a screen that does not wait leaves (0.44-0.57 s, measured with the wait taken out: it failed
   * 6 of 6, Chromium and Firefox), and either honest ending passes.
   */
  test('a slow picture holds the screen until it is in, or until the allowance runs out', async ({
    page,
  }) => {
    await watch(page)
    await page.route(POSTER, async (route) => {
      await new Promise((r) => setTimeout(r, 1300))
      await route.continue()
    })
    await page.goto('/n001/wine')
    await expect.poll(async () => (await read(page)).gone, { timeout: 10_000 }).not.toBe(null)
    await expect
      .poll(async () => (await read(page)).pictured, {
        message: 'the picture never arrived, so nothing was measured',
        timeout: 10_000,
      })
      .not.toBe(null)
    const { gone, pictured, asked } = await read(page)
    expect(asked, 'the stage never drew its picture, so the wait has no start').not.toBe(null)
    // One frame either side for each of the three reads (rAF), 34 ms.
    const allowanceEnds = (asked as number) + PRELOADER_PICTURE_WAIT_MS
    expect(
      gone as number,
      `left at ${Math.round(gone as number)} ms: before the picture (${Math.round(pictured as number)}) and before the allowance ran out (${Math.round(allowanceEnds)})`,
    ).toBeGreaterThanOrEqual(Math.min(pictured as number, allowanceEnds) - 34)
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
