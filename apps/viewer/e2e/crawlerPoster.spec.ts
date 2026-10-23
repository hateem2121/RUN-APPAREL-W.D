import { viewerApiPath } from '@run-apparel/shared'
import { expect, type Page, test } from '@playwright/test'
import { embeddedPayloadScript } from '../worker/embeddedPayload'

/**
 * A search robot's copy of a garment page shows the picture and fetches no 3D file.
 *
 * Search Console, 23 Oct 2026: of 1,520 crawl requests in 90 days, half were resources fetched
 * while rendering, and the ones on the media host were the `*-optimized.glb` models, 3.5–9.9 MB
 * each. Seven garments sat "Discovered – currently not indexed", a crawl Google says it
 * rescheduled because it "was expected to overload the site". The Worker already marks a robot's
 * copy by embedding the payload (`worker/embeddedPayload.ts`); the stage now reads that as
 * "picture only" (`PosterReason` 'crawler').
 *
 * The control is a person's page, built the same way without the payload: it MUST ask for the
 * model, or this spec could not tell "skipped for robots" from "never asked by anyone".
 *
 * Service workers are blocked for the reason `copy.spec.ts` gives: once one claims the page,
 * WebKit stops routing.
 */

const PAGE = '/n001/wine'

test.use({ serviceWorkers: 'block' })

/** Every model file the page asks for, from the first request on. */
function countModelRequests(page: Page): string[] {
  const asked: string[] = []
  page.on('request', (req) => {
    if (/\.glb(\?|$)/.test(req.url())) asked.push(req.url())
  })
  return asked
}

test("a robot's copy shows the garment's picture and asks for no 3D file", async ({
  page,
  request,
}) => {
  const payload = await (await request.get(viewerApiPath('n001', 'wine'))).json()
  expect(
    payload.product?.glbUrl,
    'the fixture garment has no model, so nothing could be skipped',
  ).toBeTruthy()

  await page.route(`**${PAGE}`, async (route) => {
    const res = await route.fetch()
    const html = (await res.text()).replace(
      '</head>',
      `${embeddedPayloadScript(payload, viewerApiPath('n001', 'wine'))}</head>`,
    )
    expect(html, 'the payload never reached the page').toContain('id="viewer-payload"')
    await route.fulfill({ response: res, body: html })
  })
  const models = countModelRequests(page)

  await page.goto(PAGE)
  await expect(page.getByRole('heading', { level: 1 })).toContainText(/Velocity Performance/i)
  await expect(page.locator('.stage__picture')).toBeVisible()
  // Settle: long enough for the person's page below to have asked for its model.
  await page.waitForLoadState('networkidle')

  expect(models, 'the robot was sent the 3D file').toEqual([])
  await expect(page.locator('model-viewer')).toHaveCount(0)
  // Nothing failed, so nothing says "not available" — that sentence would be indexed.
  await expect(page.locator('.stage__error')).toBeHidden()
  await expect(page.locator('meta[name="robots"]')).toHaveCount(0)
})

test("control: a person's page asks for the model", async ({ page }) => {
  const models = countModelRequests(page)
  const asked = page.waitForRequest(/\.glb(\?|$)/, { timeout: 20_000 })
  asked.catch(() => {})
  await page.goto(PAGE)
  await expect(page.getByRole('heading', { level: 1 })).toContainText(/Velocity Performance/i)
  // The app's own test (`canRender3D`, src/lib/capabilities.ts): CI's Firefox has no WebGL, and
  // there a person's page rightly asks for no model either, so the control has nothing to show.
  const webgl = await page.evaluate(() => {
    const canvas = document.createElement('canvas')
    return Boolean(canvas.getContext('webgl2') ?? canvas.getContext('webgl'))
  })
  test.skip(!webgl, 'no WebGL on this engine: a person gets the picture here too')
  await asked
  expect(models.length, 'a person was never sent the 3D file').toBeGreaterThan(0)
})
