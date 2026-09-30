import { expect, type Page, test } from '@playwright/test'

/**
 * The cookie choice on a garment page, in a real browser (2026-09-30).
 *
 * The same question, words and stored answer as the website's
 * (`apps/cms/e2e/consent.spec.ts`), because both are one origin in production. This file
 * proves the garment pages' half: nothing runs before Accept, the HASH-LOCKED policy these
 * pages ship admits the two trackers' hosts, and the card does not sit on the garment.
 *
 * ⚠️ THE GATE IS LIFTED, as `audit-guards.spec.ts` does for the cursor: under automation
 * the question is deliberately absent (`ConsentBanner.tsx`), so asserting anything about it
 * without the spoof measures the refusal, not the feature. The first test asserts that
 * refusal on purpose; every other one asserts the card is ON SCREEN before anything else.
 *
 * ⚠️ THE TRACKER HOSTS ARE ANSWERED LOCALLY with an empty script, so a test run is never a
 * visit in the owner's real reports. The request is still made, which is what is asserted.
 */

const TRACKER_HOSTS = [
  'www.googletagmanager.com',
  'assets.apollo.io',
  'aplo-evnt.com',
  'www.google-analytics.com',
  'region1.google-analytics.com',
]
const GA_SCRIPT = 'www.googletagmanager.com/gtag/js'
const APOLLO_SCRIPT = 'assets.apollo.io/micro/website-tracker/tracker.iife.js'

const asAHuman = `Object.defineProperty(Navigator.prototype, 'webdriver', {
  get: () => false,
  configurable: true,
})`

/** Answer the trackers locally and record each request made to them. */
async function watchTrackers(page: Page) {
  const seen: string[] = []
  await page.route(
    (url) => TRACKER_HOSTS.includes(url.host),
    (route) => route.fulfill({ status: 200, contentType: 'application/javascript', body: '' }),
  )
  page.on('request', (request) => {
    const url = new URL(request.url())
    if (TRACKER_HOSTS.includes(url.host) || url.host.endsWith('liadm.com')) {
      seen.push(`${url.host}${url.pathname}`)
    }
  })
  return seen
}

async function openGarment(page: Page) {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/n001/wine')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
}

const banner = (page: Page) => page.getByRole('region', { name: 'Cookie choice' })

const keys = (page: Page) =>
  page.evaluate(() => ({
    local: Object.fromEntries(Object.entries(localStorage)),
    cookie: document.cookie,
  }))

test.describe('the cookie choice on a garment page', () => {
  test('under automation the question is absent, so the layout suites measure the bare page', async ({
    page,
  }) => {
    await openGarment(page)
    await expect(banner(page)).toHaveCount(0)
  })

  test('NOT ANSWERED: the question shows, and no tracker is contacted or anything stored', async ({
    page,
    context,
  }) => {
    await context.addInitScript(asAHuman)
    const seen = await watchTrackers(page)
    await openGarment(page)
    await expect(banner(page)).toBeVisible()
    await page.waitForLoadState('networkidle')
    expect(seen, 'a tracker ran before the visitor chose').toEqual([])
    const kept = await keys(page)
    expect(kept.local).toEqual({})
    expect(kept.cookie).toBe('')
    expect((await context.cookies()).map((cookie) => cookie.name)).toEqual([])
  })

  test('DECLINE: one word is kept and no tracker ever loads, on this page or the next', async ({
    page,
    context,
  }) => {
    await context.addInitScript(asAHuman)
    const seen = await watchTrackers(page)
    await openGarment(page)
    await banner(page).getByRole('button', { name: 'Decline' }).click()
    await expect(banner(page)).toHaveCount(0)
    expect((await keys(page)).local).toEqual({ 'run-consent': 'declined' })

    await page.reload()
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await page.waitForLoadState('networkidle')
    await expect(banner(page)).toHaveCount(0)
    expect(seen, 'a tracker ran after Decline').toEqual([])
  })

  test('ACCEPT: both trackers load, and a returning visitor is not asked again', async ({
    page,
    context,
  }) => {
    await context.addInitScript(asAHuman)
    const seen = await watchTrackers(page)
    await openGarment(page)
    await banner(page).getByRole('button', { name: 'Accept' }).click()
    await expect(banner(page)).toHaveCount(0)
    await expect.poll(() => seen).toContain(GA_SCRIPT)
    await expect.poll(() => seen).toContain(APOLLO_SCRIPT)
    expect((await keys(page)).local['run-consent']).toBe('accepted')

    seen.length = 0
    await page.reload()
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(banner(page)).toHaveCount(0)
    await expect.poll(() => seen).toContain(GA_SCRIPT)
    await expect.poll(() => seen).toContain(APOLLO_SCRIPT)
  })

  /*
   * ⚠️ THE SHIPPED POLICY, NOT A COPY OF IT. `e2e/serve.mjs` sends the `_headers` file the
   * build wrote, so this is the hash-locked Content-Security-Policy a visitor receives.
   * It must admit the two tracker scripts WITHOUT widening inline scripts, and it must
   * refuse `d-code.liadm.com`, which Apollo would use to identify a person. The second
   * half is the control for the first: the listener that stays silent for Google and
   * Apollo has to fire for LiveIntent, or its silence proves nothing.
   */
  test('the shipped policy admits Google and Apollo, and refuses LiveIntent', async ({
    page,
    context,
  }) => {
    await context.addInitScript(asAHuman)
    await context.addInitScript(() => {
      const blocked: string[] = []
      ;(window as unknown as { blockedByPolicy: string[] }).blockedByPolicy = blocked
      document.addEventListener('securitypolicyviolation', (event) => {
        blocked.push(event.blockedURI)
      })
    })
    await watchTrackers(page)
    await page.route('https://d-code.liadm.com/**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/javascript', body: '' }),
    )
    await openGarment(page)
    await banner(page).getByRole('button', { name: 'Accept' }).click()
    await page.waitForLoadState('networkidle')
    const blockedBy = () =>
      page.evaluate(() => (window as unknown as { blockedByPolicy: string[] }).blockedByPolicy)
    const trackerBlocks = (await blockedBy()).filter((uri) => /google|apollo|aplo-evnt/.test(uri))
    expect(trackerBlocks, 'the policy blocked a tracker it should admit').toEqual([])

    await page.evaluate(() => {
      const script = document.createElement('script')
      script.src = 'https://d-code.liadm.com/did-0091.min.js'
      document.head.appendChild(script)
    })
    await expect.poll(blockedBy).toContain('https://d-code.liadm.com/did-0091.min.js')
  })

  /*
   * A buyer scanning a QR tag came to see the garment. On a phone the card may sit over the
   * action bar at the foot of the screen until they answer, but it must not touch the
   * garment or the bar at the top. Measured in document space at the phone size the layout
   * suite uses.
   */
  test('on a phone the card leaves the garment and the top bar uncovered', async ({
    page,
    context,
  }) => {
    await context.addInitScript(asAHuman)
    await page.setViewportSize({ width: 390, height: 844 })
    await openGarment(page)
    await expect(banner(page)).toBeVisible()
    const boxes = await page.evaluate(() => {
      const rect = (selector: string) => {
        const box = document.querySelector(selector)?.getBoundingClientRect()
        return box ? { top: box.top, bottom: box.bottom, left: box.left, right: box.right } : null
      }
      return {
        card: rect('.consent__card'),
        canvas: rect('.stage__canvas'),
        bar: rect('.notch-shell'),
      }
    })
    expect(boxes.card, 'no card on the page').not.toBeNull()
    expect(boxes.canvas, 'no .stage__canvas on the page').not.toBeNull()
    expect(boxes.card?.top ?? 0).toBeGreaterThanOrEqual(boxes.canvas?.bottom ?? Infinity)
    expect(boxes.card?.top ?? 0).toBeGreaterThanOrEqual(boxes.bar?.bottom ?? Infinity)
    expect(boxes.card?.left ?? -1).toBeGreaterThanOrEqual(0)
    expect(boxes.card?.right ?? Infinity).toBeLessThanOrEqual(390)
    expect(boxes.card?.bottom ?? Infinity).toBeLessThanOrEqual(844)
    // Small, not hidden (owner, 2026-09-30): at most a fifth of the phone's height.
    expect(
      (boxes.card?.bottom ?? Infinity) - (boxes.card?.top ?? 0),
      'the question takes over a fifth of the screen',
    ).toBeLessThanOrEqual(844 * 0.2)

    for (const name of ['Accept', 'Decline']) {
      const box = await banner(page).getByRole('button', { name }).boundingBox()
      expect(box?.height ?? 0, `${name} is under the 44px touch floor`).toBeGreaterThanOrEqual(44)
    }
  })
})
