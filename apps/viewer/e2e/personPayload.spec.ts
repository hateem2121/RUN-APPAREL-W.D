import { viewerApiPath } from '@run-apparel/shared'
import { expect, type Page, test } from '@playwright/test'
import { personHeadMarkup } from '../worker/personPayload'

/**
 * A person's garment page that carries its own data (owner, 2026-11-15; `worker/personPayload.ts`
 * has the measurements). The page is served as the Worker now serves a person when the edge had
 * the data within its budget, with the markup built by the Worker's own function.
 *
 * It must: draw the garment without asking the API (the request it saves is the point), ask for
 * the poster ONCE (the preload must be the stage's very request, or a phone downloads it twice),
 * and still load the 3D, because a robot's copy skips it and the two must not be confused.
 *
 * The control is the same page without the data: it MUST ask the API, or this spec could not tell
 * "the data was in the page" from "the request was never counted".
 *
 * Service workers are blocked for the reason `copy.spec.ts` gives: once one claims the page,
 * WebKit stops routing.
 */

const PAGE = '/n001/wine'
const ROUTE = { productSlug: 'n001', colourSlug: 'wine' }

test.use({ serviceWorkers: 'block' })

/** Every request whose URL matches, from the first one on. */
function count(page: Page, pattern: RegExp): string[] {
  const asked: string[] = []
  page.on('request', (req) => {
    if (pattern.test(req.url())) asked.push(req.url())
  })
  return asked
}

async function hasWebGL(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const canvas = document.createElement('canvas')
    return Boolean(canvas.getContext('webgl2') ?? canvas.getContext('webgl'))
  })
}

test("a person's page with its data draws the garment, asks no API, and loads the 3D", async ({
  page,
  request,
}) => {
  const payload = await (await request.get(viewerApiPath('n001', 'wine'))).json()
  const poster = payload.selectedColourway?.poster?.url as string | undefined
  expect(poster, 'the fixture colour has no poster, so nothing could be preloaded').toBeTruthy()

  await page.route(`**${PAGE}`, async (route) => {
    const res = await route.fetch()
    const html = (await res.text()).replace('</head>', `${personHeadMarkup(payload, ROUTE)}</head>`)
    expect(html, 'the data never reached the page').toContain('data-for="person"')
    // As the Worker sends it: no API preload beside the data.
    const headers = { ...res.headers() }
    delete headers.link
    await route.fulfill({ response: res, body: html, headers })
  })
  const api = count(page, /\/api\/public\/viewer\//)
  const posters = count(page, new RegExp(`${poster?.split('/').pop()?.split('?')[0]}`))
  const models = count(page, /\.glb(\?|$)/)
  const asked = page.waitForRequest(/\.glb(\?|$)/, { timeout: 20_000 })
  asked.catch(() => {})

  await page.goto(PAGE)
  await expect(page.getByRole('heading', { level: 1 })).toContainText(/Velocity Performance/i)
  await expect(page.locator('#viewer-payload')).toHaveCount(0)

  if (await hasWebGL(page)) {
    await asked
    expect(models.length, "a person's copy was read as a robot's: no 3D").toBeGreaterThan(0)
  }
  await page.waitForLoadState('networkidle')
  expect(api, 'the app asked the API although the data was in the page').toEqual([])
  expect(posters, 'the poster was downloaded more than once').toHaveLength(1)
  await expect(page.locator('meta[name="robots"]')).toHaveCount(0)
})

test('control: the same page without its data asks the API', async ({ page }) => {
  const api = count(page, /\/api\/public\/viewer\//)
  await page.goto(PAGE)
  await expect(page.getByRole('heading', { level: 1 })).toContainText(/Velocity Performance/i)
  expect(api.length, 'no API request was seen, so the first test proves nothing').toBeGreaterThan(0)
})
