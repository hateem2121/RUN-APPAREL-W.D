import { expect, type Page, test } from '@playwright/test'

/**
 * A deploy deleted the 3D library's chunk while the page was open (2026-10-21).
 *
 * Every chunk name carries its content hash, Workers Static Assets keeps only the current
 * deploy's files, and the SPA fallback answers a missing chunk with index.html as
 * `200 text/html` (measured live). The owner saw "The 3D view is not available" on rxps/wine
 * 65 s after the viewer deploy, and a reload drew the garment. The plant below serves the
 * fixture's own index.html in place of the chunk — the exact answer production gives.
 *
 * In the `webgl` project because only a page with a WebGL context imports the library at all;
 * everywhere else `canRender3D()` stops first. The service worker is blocked so the route sees
 * the chunk request (hd-image.spec.ts measured a `page.route` missing the worker's own fetch).
 */

const LOAD_NOTICE =
  'The 3D view is not available. The colors, fabric and specifications on this page are correct, and you can still send an inquiry below.'
const CHUNK = /\/assets\/model-viewer-[^/]*\.js$/

test.use({ serviceWorkers: 'block' })

function countNavigations(page: Page) {
  const seen = { count: 0 }
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) seen.count++
  })
  return seen
}

test('a chunk deleted by a deploy costs one reload, then the garment is in 3D', async ({
  page,
  context,
}) => {
  let planted = 0
  await context.route(CHUNK, async (route) => {
    if (planted === 0) {
      planted++
      const index = await route.fetch({ url: new URL('/', route.request().url()).href })
      return route.fulfill({ response: index })
    }
    return route.continue()
  })
  const navigations = countNavigations(page)

  await page.goto('/n001/wine')
  await page.waitForFunction(
    () => (document.querySelector('model-viewer') as { loaded?: boolean } | null)?.loaded === true,
    null,
    { timeout: 90_000 },
  )

  expect(planted, 'the plant must land, or this passes vacuously').toBe(1)
  expect(navigations.count, 'exactly one automatic reload').toBe(2)
  await expect(page.locator('.stage__error')).toBeHidden()
})

test('a chunk that stays missing reloads once, then shows the notice — never a loop', async ({
  page,
  context,
}) => {
  let planted = 0
  await context.route(CHUNK, async (route) => {
    planted++
    const index = await route.fetch({ url: new URL('/', route.request().url()).href })
    return route.fulfill({ response: index })
  })
  const navigations = countNavigations(page)

  await page.goto('/n001/wine')
  await expect(page.locator('.stage__error:not([hidden])')).toHaveText(LOAD_NOTICE, {
    timeout: 30_000,
  })
  // Long enough for a second reload to have started if the guard were missing: the first
  // one lands well inside this on the fixture server.
  await page.waitForTimeout(3_000)

  expect(planted, 'one refused chunk per document: before and after the reload').toBe(2)
  expect(navigations.count, 'one reload, not a loop').toBe(2)
  await expect(page.locator('.stage__error:not([hidden])')).toHaveText(LOAD_NOTICE)
})
