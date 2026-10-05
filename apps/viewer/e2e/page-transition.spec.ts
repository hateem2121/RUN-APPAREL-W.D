import { expect, type Page, test } from '@playwright/test'

/**
 * Polish MO3 (owner, 2026-10-05: "grow into the loading screen"): a website card's picture grows
 * into this page's loading screen. The website's half (a card tap names its picture; any other link
 * is cancelled) is apps/cms `e2e/motion.spec.ts`. This is the garment page's half: it lets a
 * transition IN and pairs the card's picture with the loading screen (page.css, index.html), and it
 * lets none OUT (`src/lib/pageTransition.ts`).
 *
 * The page a visitor arrives from is stood in for by a same-origin page this test serves itself:
 * opted in, with one picture carrying the card's name, as the products page is at the moment of a
 * tap. Each page reports, from `pagereveal`, whether a transition reached it and what it animated:
 * a `::view-transition-group(garment-opening)` animation exists only when the browser found the
 * name on BOTH pages and grows one into the other.
 */
const NAME = 'garment-opening'
const CARD_PAGE = '/mo3-card'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.addEventListener('pagereveal', async (event) => {
      const transition = (event as Event & { viewTransition?: { ready: Promise<void> } | null })
        .viewTransition
      sessionStorage.setItem('mo3-reveal', transition ? 'transition' : 'plain')
      if (!transition) return
      try {
        await transition.ready
      } catch {
        sessionStorage.setItem('mo3-reveal', 'skipped')
        return
      }
      const moving = document.documentElement
        .getAnimations({ subtree: true })
        .map((animation) => (animation.effect as KeyframeEffect | null)?.pseudoElement ?? '')
      sessionStorage.setItem('mo3-moving', moving.join(' '))
    })
  })
  await page.route(`**${CARD_PAGE}`, (route) =>
    route.fulfill({
      contentType: 'text/html',
      // ⚠️ THE WEBSITE'S OWN VIEWPORT LINE (read off the live /products, 2026-10-05). Without one a
      // phone lays this page out 980px wide, and WebKit skips a transition whose viewport changes
      // size ("Skipping view transition because viewport size changed", iPhone 13 profile).
      body: `<!doctype html><title>card</title><meta name="viewport" content="width=device-width, initial-scale=1"/>
<style>@view-transition { navigation: auto }</style>
<a id="card" href="/n001/wine" style="display: block; inline-size: 200px; block-size: 250px;
background: #8a8a8a; view-transition-name: ${NAME}">A card's picture</a>`,
    }),
  )
})

/** Open the stand-in card page with motion as asked, or skip an engine without transitions. */
async function onTheCardPage(page: Page, motion: 'no-preference' | 'reduce') {
  await page.emulateMedia({ reducedMotion: motion })
  await page.goto(CARD_PAGE)
  const supported = await page.evaluate(() => 'onpagereveal' in window)
  test.skip(!supported, 'this engine has no cross-document view transitions: it simply loads')
}

const report = (page: Page) =>
  page.evaluate(() => ({
    reveal: sessionStorage.getItem('mo3-reveal'),
    moving: sessionStorage.getItem('mo3-moving') ?? '',
  }))

test("a card's picture grows into the loading screen", async ({ page }) => {
  await onTheCardPage(page, 'no-preference')
  await page.locator('#card').click()
  await page.waitForURL('**/n001/wine')
  await expect
    .poll(async () => (await report(page)).moving)
    .toContain(`::view-transition-group(${NAME})`)
  expect((await report(page)).reveal).toBe('transition')
})

test('leaving a garment page stays instant', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.goto('/n001/wine')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  const supported = await page.evaluate(() => 'onpagereveal' in window)
  test.skip(!supported, 'this engine has no cross-document view transitions: it simply loads')
  await page.evaluate((href) => {
    const away = document.createElement('a')
    away.id = 'mo3-away'
    away.href = href
    away.textContent = 'Away'
    // Over everything, so no sticky bar can sit on the link the test presses.
    away.style.cssText = 'position: fixed; top: 50%; left: 50%; z-index: 2147483647; padding: 12px'
    document.body.append(away)
  }, CARD_PAGE)
  await page.locator('#mo3-away').click()
  await page.waitForURL(`**${CARD_PAGE}`)
  // The card page opts in, so only the garment page's own skip makes this arrival plain.
  expect((await report(page)).reveal).toBe('plain')
})

test('under reduced motion a card tap simply loads the garment page', async ({ page }) => {
  await onTheCardPage(page, 'reduce')
  await page.locator('#card').click()
  await page.waitForURL('**/n001/wine')
  expect((await report(page)).reveal).toBe('plain')
})
