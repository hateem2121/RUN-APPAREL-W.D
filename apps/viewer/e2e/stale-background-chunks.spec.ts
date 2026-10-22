import { expect, type Page, test } from '@playwright/test'

/**
 * A deploy deleted a BACKGROUND chunk while the garment page was open (owner, 2026-10-22).
 *
 * `e2e/stale-chunk-webgl.spec.ts` covers the 3D library. This covers the pieces nobody tapped for:
 * the footer's prompt (`FooterPrompt`), the related garments' cards (`RelatedCards`) and the
 * polish layer (`polish`). Production answers a deleted chunk with the SPA fallback, `200
 * text/html` (measured 2026-10-21), which the browser refuses to run as a module; the plant below
 * serves the fixture's own index.html in its place, the exact answer.
 *
 * What each test would have caught:
 *   - before 2026-10-22 a missing FooterPrompt threw out of `lazy()` into the page-wide boundary
 *     and the garment became "This page ran into a problem" (the footer is on every garment page);
 *   - the cards and polish failed quietly and stayed missing until the visitor reloaded by hand;
 *   - a guard that did not hold would reload in a loop, or twice when two pieces fail together.
 *
 * Not covered here: `smooth-scroll` and `Cursor`, which `polish/index.ts` skips under automation
 * (`navigator.webdriver`) before importing them; `src/polish/index.test.ts` covers those.
 *
 * The service worker is blocked so the route sees the chunk request (hd-image.spec.ts measured a
 * `page.route` missing the worker's own fetch).
 */

test.use({ serviceWorkers: 'block' })

const CRASH = 'This page ran into a problem'

interface Piece {
  name: string
  chunk: RegExp
  /** What the visitor has once the piece arrived. */
  arrived: (page: Page) => Promise<void>
}

const FOOTER: Piece = {
  name: 'footer prompt',
  chunk: /\/assets\/FooterPrompt-[^/]*\.js$/,
  arrived: (page) => expect(page.locator('.site-footer__tab')).toBeAttached(),
}
const RELATED: Piece = {
  name: 'related cards',
  chunk: /\/assets\/RelatedCards-[^/]*\.js$/,
  arrived: (page) => expect(page.locator('.related__card')).toHaveCount(4),
}
const POLISH: Piece = {
  name: 'polish layer',
  chunk: /\/assets\/polish-[^/]*\.js$/,
  // Under automation `startReveals` marks every block revealed at once; with the chunk missing
  // nothing is, so this is the polish layer having run.
  arrived: (page) => expect(page.locator('[data-reveal].is-inview').first()).toBeAttached(),
}

function countNavigations(page: Page) {
  const seen = { count: 0 }
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) seen.count++
  })
  return seen
}

/**
 * Refuses `piece` the way production does after a deploy: the fixture's index.html, as a 200, to
 * EVERY request from the documents `refuse` names (1 is the page as first opened, 2 the reload).
 * Every request, because Firefox asks twice in one document, the modulepreload and then the
 * import, and refusing only the first let the second through with no reload at all (probe,
 * 2026-10-22). A deploy refuses the old page everything; the reloaded page asks for new names.
 */
async function plant(
  page: Page,
  piece: Piece,
  navigations: { count: number },
  refuse: (documentNumber: number) => boolean,
) {
  const planted = { count: 0, served: 0 }
  await page.context().route(piece.chunk, async (route) => {
    planted.served++
    if (!refuse(navigations.count)) return route.continue()
    planted.count++
    const index = await route.fetch({ url: new URL('/', route.request().url()).href })
    return route.fulfill({
      response: index,
      headers: { ...index.headers(), 'cache-control': 'no-store' },
    })
  })
  return planted
}

/*
 * ⚠️ WEBKIT CANNOT SHOW "THEN THE PIECE IS THERE" HERE. Its reloaded page asked for the same chunk
 * name and was answered from memory with the refused HTML, without reaching the route, `no-store`
 * or not (probe, 2026-10-22: the reload happened once, the request never reached the route). A real
 * deploy changes the names, so the reloaded page asks for files it has never seen; a test without a
 * rebuild cannot. On WebKit these tests hold what the visitor needs most: one reload, never a loop,
 * never the crash screen.
 */
const reloadsAgainForReal = (browserName: string) => browserName !== 'webkit'

const crashScreen = (page: Page) => page.getByRole('heading', { name: CRASH })

for (const piece of [FOOTER, RELATED, POLISH]) {
  test.describe(piece.name, () => {
    test('a chunk deleted by a deploy costs one reload, then the piece is there', async ({
      page,
      browserName,
    }) => {
      const navigations = countNavigations(page)
      const planted = await plant(page, piece, navigations, (documentNumber) => documentNumber <= 1)

      await page.goto('/n001/wine')
      await expect.poll(() => navigations.count, { message: 'no automatic reload' }).toBe(2)
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      if (reloadsAgainForReal(browserName)) await piece.arrived(page)
      else await page.waitForTimeout(2_000)

      expect(planted.count, 'the plant must land, or this passes vacuously').toBeGreaterThanOrEqual(
        1,
      )
      expect(navigations.count, 'exactly one automatic reload').toBe(2)
      await expect(crashScreen(page)).toHaveCount(0)
    })

    test('a chunk that stays missing reloads once, never a loop, and never blanks the page', async ({
      page,
    }) => {
      const navigations = countNavigations(page)
      const planted = await plant(page, piece, navigations, () => true)

      await page.goto('/n001/wine')
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      // Long enough for a second reload (or the crash screen) to have shown if the guard or the
      // local boundary were missing: the first reload lands well inside this on the fixture.
      await page.waitForTimeout(3_000)

      expect(planted.count, 'the plant must land, or this passes vacuously').toBeGreaterThanOrEqual(
        1,
      )
      expect(navigations.count, 'one reload, not a loop').toBe(2)
      await expect(
        crashScreen(page),
        'the page-wide error screen replaced the garment',
      ).toHaveCount(0)
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    })
  })
}

/*
 * Both pieces refused in EVERY load, so whichever fails first triggers the one reload and the other
 * fails too, before or after it. The first version refused them in the first load only and failed
 * 3 of 3 engines in the full suite (2026-10-22): the cards failed first, the page reloaded before it
 * had asked for the footer, so the footer's plant never landed. What this holds is the guard: two
 * missing pieces never cost more than one reload, and never the crash screen.
 */
test('two pieces failing never cost more than ONE reload', async ({ page }) => {
  const navigations = countNavigations(page)
  const footer = await plant(page, FOOTER, navigations, () => true)
  const related = await plant(page, RELATED, navigations, () => true)

  await page.goto('/n001/wine')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await page.waitForTimeout(3_000)

  expect(footer.count, 'the footer plant must land').toBeGreaterThanOrEqual(1)
  expect(related.count, 'the cards plant must land').toBeGreaterThanOrEqual(1)
  expect(navigations.count, 'one shared guard: one reload for both').toBe(2)
  await expect(crashScreen(page)).toHaveCount(0)
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
})

test('NEGATIVE CONTROL: with no chunk missing the page never reloads', async ({ page }) => {
  // Counts requests without refusing any. If the counters or the routes were not wired, the tests
  // above could pass for the wrong reason; here they must read "chunks asked for, none refused,
  // no reload".
  const navigations = countNavigations(page)
  const planted = [
    await plant(page, FOOTER, navigations, () => false),
    await plant(page, RELATED, navigations, () => false),
    await plant(page, POLISH, navigations, () => false),
  ]

  await page.goto('/n001/wine')
  await FOOTER.arrived(page)
  await RELATED.arrived(page)
  await POLISH.arrived(page)
  await page.waitForTimeout(1_000)

  expect(
    planted.map((p) => p.served),
    'each chunk was requested once (the routes see them)',
  ).toEqual([1, 1, 1])
  expect(planted.map((p) => p.count)).toEqual([0, 0, 0])
  expect(navigations.count, 'no reload when nothing is missing').toBe(1)
})
