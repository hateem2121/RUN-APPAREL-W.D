import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { expect, test } from '@playwright/test'
import { apiPreloadLink } from '../worker/apiPreload'

/**
 * Does THIS engine reuse the Worker's API preload, or download the payload twice?
 *
 * `worker/apiPreload.ts` sends `Link: <api url>; rel=preload; as=fetch; crossorigin` with
 * every garment page so the request starts before the app's JavaScript has run. That is a
 * win only if the engine hands the preloaded response to the app's later `fetch`. If it
 * does not, the phone makes TWO requests — slower than no hint — and nothing on screen
 * would ever say so. Measured in Chromium 2026-09-27 (1 request, the app's fetch resolved
 * in 1 ms); WebKit, the engine behind every iPhone that scans a tag, could not be run
 * where it was written, so this is where it is measured.
 *
 * Deliberately NOT the fixture server: `e2e/serve.mjs` answers the API on the SAME
 * origin, and production's API is CROSS-origin, which is exactly the case where
 * `crossorigin` and the credentials mode decide reuse. Two local servers on different
 * origins reproduce it. The header comes from the Worker's own `apiPreloadLink`, and the
 * `fetch` options are `src/lib/api.ts`'s (an `accept` header and an `AbortSignal`).
 *
 * The negative control runs in every engine too: a preload WITHOUT `crossorigin` must
 * cost two requests, or this spec cannot tell reuse from a preload that never happened.
 */

const ROUTE = { productSlug: 'rxps', colourSlug: 'wine' }
/** Long enough that a second, un-reused request is plainly visible in the timing. */
const API_DELAY_MS = 400

let hits = 0
let api: http.Server
let site: http.Server
let apiOrigin = ''
let siteOrigin = ''
let link = ''

function listen(server: http.Server, host: string): Promise<string> {
  return new Promise((resolve) =>
    server.listen(0, host, () =>
      resolve(`http://${host}:${(server.address() as AddressInfo).port}`),
    ),
  )
}

test.beforeAll(async () => {
  api = http.createServer((req, res) => {
    hits += 1
    setTimeout(() => {
      res.writeHead(200, {
        'content-type': 'application/json',
        'access-control-allow-origin': '*',
        'cache-control': 'public, max-age=60, s-maxage=60',
        vary: 'Origin',
      })
      res.end(JSON.stringify({ path: req.url }))
    }, API_DELAY_MS)
  })
  apiOrigin = await listen(api, '127.0.0.1')

  site = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://x')
    const api = `${apiOrigin}/api/public/viewer/${ROUTE.productSlug}/${ROUTE.colourSlug}`
    res.writeHead(200, {
      'content-type': 'text/html; charset=utf-8',
      link: url.searchParams.get('link') ?? link,
    })
    // The app's fetch starts late on purpose: it stands in for the bundle downloading.
    res.end(`<!doctype html><title>wait</title><script>
      setTimeout(() => {
        const t0 = performance.now()
        fetch(${JSON.stringify(api)}, {
          headers: { accept: 'application/json' },
          signal: AbortSignal.timeout(8000),
        })
          .then((r) => r.json())
          .then(() => { window.appFetchMs = performance.now() - t0; document.title = 'done' })
      }, ${API_DELAY_MS + 400})
    </script>`)
  })
  siteOrigin = await listen(site, 'localhost')
  link = apiPreloadLink(ROUTE, apiOrigin)
})

test.afterAll(() => {
  api?.close()
  site?.close()
})

async function load(page: import('@playwright/test').Page, override?: string) {
  hits = 0
  const query = override === undefined ? '' : `?link=${encodeURIComponent(override)}`
  await page.goto(`${siteOrigin}/${query}`)
  await expect(page).toHaveTitle('done', { timeout: 15_000 })
  return {
    hits,
    appFetchMs: await page.evaluate(() => (window as { appFetchMs?: number }).appFetchMs ?? -1),
  }
}

test.describe('the API preload the Worker sends', () => {
  test('is reused by the app’s fetch: one request, already answered', async ({ page }) => {
    const { hits, appFetchMs } = await load(page)
    expect(hits, 'the engine downloaded the payload twice — the preload is not being reused').toBe(
      1,
    )
    expect(
      appFetchMs,
      'the app still waited for the API; the preload did not start early',
    ).toBeLessThan(API_DELAY_MS)
  })

  test('negative control: without crossorigin the same page costs two requests', async ({
    page,
  }) => {
    const mismatched = link.replace('; crossorigin=anonymous', '')
    expect(mismatched).not.toBe(link)
    const { hits } = await load(page, mismatched)
    expect(hits).toBe(2)
  })
})
