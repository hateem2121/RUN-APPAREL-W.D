import { viewerApiPath } from '@run-apparel/shared'
import { expect, test } from '@playwright/test'
import { embeddedPayloadScript } from '../worker/embeddedPayload'

/**
 * A search robot's renderer must draw the garment even when its request for the payload fails.
 *
 * Found 2026-10-21 in Search Console: Google's live test of `/products/r-au/bone` failed the
 * request to the CMS ("Other error", then `viewer-load-failed … Failed to fetch` at 28 s),
 * the app drew "This reference did not load", and that screen's noindex kept the garment out
 * of Google ("Excluded by 'noindex' tag"). The Worker now puts the payload in the page it
 * gives a robot (`worker/embeddedPayload.ts`). This spec fails the API request exactly as
 * Google's fetcher did, in every engine, and serves the page as the Worker serves a robot,
 * with the markup built by the Worker's own function.
 *
 * The negative control is the same page WITHOUT the payload: it must reproduce what Google
 * saw, the unreachable screen and a noindex, or this spec could not tell a fix from a
 * request that was never blocked.
 *
 * Service workers are blocked for the reason `copy.spec.ts` gives: once one claims the page,
 * WebKit stops routing, and the app's second ask would reach the real fixture.
 */

const PAGE = '/n001/wine'
const API = '**/api/public/viewer/**'

test.use({ serviceWorkers: 'block' })

test.beforeEach(async ({ page }) => {
  // What Google's fetcher did: the request fails without an answer.
  await page.route(API, (route) => route.abort('failed'))
})

test('with the payload in the page, the garment draws and nothing says noindex', async ({
  page,
  request,
}) => {
  const payload = await (await request.get(viewerApiPath('n001', 'wine'))).json()
  expect(payload.product?.slug, 'the fixture payload did not load').toBe('n001')

  await page.route(`**${PAGE}`, async (route) => {
    const res = await route.fetch()
    const html = (await res.text()).replace(
      '</head>',
      `${embeddedPayloadScript(payload, viewerApiPath('n001', 'wine'))}</head>`,
    )
    expect(html, 'the payload never reached the page').toContain('id="viewer-payload"')
    await route.fulfill({ response: res, body: html })
  })

  await page.goto(PAGE)
  await expect(page.getByRole('heading', { level: 1 })).toContainText(/Velocity Performance/i)
  await expect(page.getByText('[ TEMPORARILY UNAVAILABLE ]')).toHaveCount(0)
  await expect(page.locator('meta[name="robots"]')).toHaveCount(0)
  // Read once: nothing is left for a retry to trust.
  await expect(page.locator('#viewer-payload')).toHaveCount(0)
})

test('control: without it, the page shows what Google saw', async ({ page }) => {
  await page.goto(PAGE)
  // 10 s: the app asks once more before it gives up (`src/lib/api.ts`).
  await expect(page.getByText('[ TEMPORARILY UNAVAILABLE ]')).toBeVisible({ timeout: 10_000 })
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex')
})
