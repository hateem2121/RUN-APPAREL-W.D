import { readFileSync } from 'node:fs'
import path from 'node:path'
import { expect, type Page, type Route, test } from '@playwright/test'

/**
 * The 360° film on a ball's page (owner, 2026-11-20), in a real browser on all four engines.
 *
 * What would have to break in production for this to fail:
 *  - the page's CSP refusing the film host (no `media-src`): the fixture server replays the real
 *    built CSP (serve.mjs → loadGlobalHeaders), and Playwright's routing runs after the browser's
 *    CSP check, so a refused source never reaches the route below and never plays;
 *  - a codec string a browser cannot play, or the AV1/H.264 order reversed;
 *  - Safari needing byte ranges: the route answers a `Range` request with `206` and
 *    `Content-Range`, the way the media host answers (measured 2026-11-20: 206, cf-cache-status HIT).
 *
 * The page is n001's fixture with its product turned into KURA and its second colour into the
 * colour KURA's film shows. The films are 160px, 1 s cuts of the real KURA encode (e2e/films/):
 * the same codecs and profiles as production, a few KB each.
 */

const FILMS = path.join(import.meta.dirname, 'films')
const FILE = {
  av1: readFileSync(path.join(FILMS, 'film-av1.mp4')),
  h264: readFileSync(path.join(FILMS, 'film-h264.mp4')),
}

async function serveRange(route: Route, body: Buffer) {
  const range = route.request().headers().range
  const match = range ? /bytes=(\d+)-(\d*)/.exec(range) : null
  if (!match) {
    await route.fulfill({
      status: 200,
      body,
      headers: { 'content-type': 'video/mp4', 'accept-ranges': 'bytes' },
    })
    return
  }
  const start = Number(match[1])
  const end = match[2] ? Math.min(Number(match[2]), body.length - 1) : body.length - 1
  await route.fulfill({
    status: 206,
    body: body.subarray(start, end + 1),
    headers: {
      'content-type': 'video/mp4',
      'accept-ranges': 'bytes',
      'content-range': `bytes ${start}-${end}/${body.length}`,
    },
  })
}

async function openBallPage(page: Page) {
  const asked: string[] = []
  await page.route('**/api/public/viewer/n001/**', async (route) => {
    const response = await route.fetch()
    const json = await response.json()
    json.product.slug = 'kura'
    json.product.productName = 'KURA'
    json.colourways[1] = {
      ...json.colourways[1],
      slug: 'red-navy',
      displayName: 'Cricket Ball / Derby Red',
    }
    await route.fulfill({ response, json })
  })
  await page.route('https://media.wear-run.com/kura-360-*', async (route) => {
    const url = route.request().url()
    asked.push(url.slice(url.lastIndexOf('/') + 1))
    if (url.endsWith('-av1.mp4')) return serveRange(route, FILE.av1)
    if (url.endsWith('-h264.mp4')) return serveRange(route, FILE.h264)
    return route.fulfill({ status: 404 })
  })
  await page.goto('/n001/wine')
  await expect(page.locator('h1')).toContainText('KURA')
  return asked
}

test.describe('the product film', () => {
  test('sits under the facts, before the customisation section, and fetches nothing until near', async ({
    page,
  }) => {
    const asked = await openBallPage(page)
    const film = page.locator('.product-film')
    await expect(film).toHaveCount(1)
    // Its place in №01: the section after it is the customisation one.
    expect(await film.evaluate((el) => el.nextElementSibling?.className)).toContain('customise')
    await expect(film.locator('figcaption span')).toHaveText(
      'KURA in Cricket Ball / Derby Red, turning 360°',
    )
    // The first screen is the 3D model's: no film bytes before the visitor scrolls near it.
    expect(asked.filter((f) => f.endsWith('.mp4'))).toEqual([])
  })

  test('plays when asked, through the page’s own security policy', async ({
    page,
    browserName,
  }) => {
    // Measured 2026-11-20: Playwright's WebKit sends <video> requests past page.route() (no route
    // ever fired for the .mp4s), so they reached the real media host, whose
    // `Cross-Origin-Resource-Policy: same-site` correctly refuses a localhost page. On the live
    // site the page and the media host are one site (posters and models load there the same way),
    // so Safari is checked on the deployed page in the iOS Simulator instead (PR checklist).
    test.skip(
      browserName === 'webkit',
      'WebKit media requests bypass page.route(); checked live in Safari',
    )
    const asked = await openBallPage(page)
    const film = page.locator('.product-film')
    await film.scrollIntoViewIfNeeded()
    // Under automation it does not start by itself (navigator.webdriver): the button offers to.
    const button = film.getByRole('button', { name: 'Play' })
    await expect(button).toBeVisible()
    await button.click()
    await expect(film.getByRole('button', { name: 'Pause' })).toBeVisible()
    const state = await film.locator('video').evaluate(async (video: HTMLVideoElement) => {
      const t0 = video.currentTime
      await new Promise((resolve) => setTimeout(resolve, 600))
      return {
        readyState: video.readyState,
        moved: video.currentTime > t0,
        src: video.currentSrc,
        error: video.error?.code ?? null,
      }
    })
    expect(state.error).toBeNull()
    expect(state.readyState).toBeGreaterThanOrEqual(2)
    expect(state.moved).toBe(true)
    expect(asked.some((f) => f.endsWith('.mp4'))).toBe(true)
  })

  test('the policy still refuses a film from any other host (the control)', async ({ page }) => {
    await openBallPage(page)
    const violated = await page.evaluate(
      () =>
        new Promise<string>((resolve) => {
          document.addEventListener(
            'securitypolicyviolation',
            (event) => resolve(event.effectiveDirective),
            { once: true },
          )
          const video = document.createElement('video')
          video.src = 'https://cms.wear-run.help/not-a-film.mp4'
          document.body.append(video)
          setTimeout(() => resolve('none'), 3000)
        }),
    )
    expect(violated).toBe('media-src')
  })
})
