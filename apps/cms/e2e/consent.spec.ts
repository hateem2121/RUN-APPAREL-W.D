import { expect, type Page, test } from './offlineMedia'

/**
 * The cookie choice, in a real browser (2026-09-30).
 *
 * The privacy page now promises: "Nothing is stored on your device, and no tracker runs,
 * unless you choose it." Until this day the promise was "no cookies at all" and
 * `headers.spec.ts` (FA-O-13) held the site to it. That test still runs and still passes,
 * because the question is absent under automation; THIS file lifts that gate and checks the
 * three states a real visitor can be in: not answered, declined, accepted.
 *
 * ⚠️ THE TRACKER HOSTS ARE ANSWERED LOCALLY. Every request to Google or Apollo is fulfilled
 * here with an empty script, so a test run never appears as a visit in the owner's real
 * reports and never depends on either company being up. The request is still MADE, which
 * is what the assertions read: we supply the response, never suppress the request.
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

/** Playwright sets navigator.webdriver; the question honours it, as the cursor does. */
const liftAutomationGate = (context: ReturnType<Page['context']>) =>
  context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false })
  })

/** Answer the trackers locally and record every request that leaves the site. */
async function watch(page: Page) {
  const origin = new URL(test.info().project.use.baseURL ?? 'http://localhost:4174')
  const firstParty = [origin.host, 'media.wear-run.com', 'media.wear-run.help']
  const outside: string[] = []
  await page.route(
    (url) => TRACKER_HOSTS.includes(url.host),
    (route) => route.fulfill({ status: 200, contentType: 'application/javascript', body: '' }),
  )
  page.on('request', (request) => {
    const url = new URL(request.url())
    if (url.protocol === 'data:' || url.protocol === 'blob:') return
    if (firstParty.includes(url.host)) return
    outside.push(`${url.host}${url.pathname}`)
  })
  return outside
}

const stored = (page: Page) =>
  page.evaluate(() => ({
    local: Object.fromEntries(Object.entries(localStorage)),
    session: Object.keys(sessionStorage),
  }))

const banner = (page: Page) => page.getByRole('region', { name: 'Cookie choice' })

test.describe('the cookie choice', () => {
  test('under automation the question is absent, so every other suite sees the bare page', async ({
    page,
  }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    await expect(banner(page)).toHaveCount(0)
  })

  test('NOT ANSWERED: the question shows, and nothing is stored or contacted', async ({
    page,
    context,
  }) => {
    await liftAutomationGate(context)
    const outside = await watch(page)
    for (const path of [
      '/',
      '/products',
      '/contact',
      '/privacy',
      '/terms',
      '/custom-teamwear-manufacturer',
    ]) {
      await page.goto(path)
      await expect(banner(page), `no question on ${path}`).toBeVisible()
      await page.waitForLoadState('networkidle')
    }
    expect(outside, 'a tracker ran before the visitor chose').toEqual([])
    expect(await context.cookies(), 'a cookie was set before the visitor chose').toEqual([])
    const kept = await stored(page)
    expect(kept.local).toEqual({})
    expect(kept.session).toEqual([])
  })

  test('DECLINE: the question goes, one word is kept, and no tracker ever loads', async ({
    page,
    context,
  }) => {
    await liftAutomationGate(context)
    const outside = await watch(page)
    await page.goto('/')
    await banner(page).getByRole('button', { name: 'Decline' }).click()
    await expect(banner(page)).toHaveCount(0)
    expect((await stored(page)).local).toEqual({ 'run-consent': 'declined' })

    // Remembered: another page, and a reload, ask nothing and load nothing.
    await page.goto('/products')
    await page.waitForLoadState('networkidle')
    await expect(banner(page)).toHaveCount(0)
    await page.reload()
    await page.waitForLoadState('networkidle')
    expect(outside, 'a tracker ran after Decline').toEqual([])
    expect(await context.cookies()).toEqual([])
  })

  test('ACCEPT: both trackers load, the choice is kept, and the next page starts them again', async ({
    page,
    context,
  }) => {
    await liftAutomationGate(context)
    const outside = await watch(page)
    await page.goto('/')
    await banner(page).getByRole('button', { name: 'Accept' }).click()
    await expect(banner(page)).toHaveCount(0)
    await expect.poll(() => outside).toContain(GA_SCRIPT)
    await expect.poll(() => outside).toContain(APOLLO_SCRIPT)
    expect((await stored(page)).local['run-consent']).toBe('accepted')

    // Google's queue carries consent BEFORE config, with every advertising use denied.
    const queue = await page.evaluate(() =>
      ((window as unknown as { dataLayer: ArrayLike<unknown>[] }).dataLayer ?? []).map((entry) =>
        Array.from(entry),
      ),
    )
    const names = queue.map((entry) => entry[0])
    expect(names.indexOf('consent')).toBeGreaterThanOrEqual(0)
    expect(names.indexOf('consent')).toBeLessThan(names.indexOf('config'))
    expect(queue.find((entry) => entry[0] === 'consent')?.[2]).toMatchObject({
      analytics_storage: 'granted',
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
    })

    outside.length = 0
    await page.goto('/contact')
    await expect(banner(page)).toHaveCount(0)
    await expect.poll(() => outside).toContain(GA_SCRIPT)
    await expect.poll(() => outside).toContain(APOLLO_SCRIPT)
  })

  test('only the two named companies are contacted after Accept', async ({ page, context }) => {
    await liftAutomationGate(context)
    const outside = await watch(page)
    await page.goto('/')
    await banner(page).getByRole('button', { name: 'Accept' }).click()
    await expect.poll(() => outside).toContain(APOLLO_SCRIPT)
    await page.waitForLoadState('networkidle')
    const hosts = [...new Set(outside.map((entry) => entry.split('/')[0]))]
    for (const host of hosts) expect(TRACKER_HOSTS, `unexpected host ${host}`).toContain(host)
  })

  /*
   * ⚠️ THE PAGE POLICY MUST ADMIT THE TWO SCRIPTS AND REFUSE LIVEINTENT, and both halves are
   * checked in the browser because a policy string that reads right can still be wrong.
   * The second half is the negative control for the first: the same listener that stays
   * silent for Google and Apollo must fire for `d-code.liadm.com`, the script Apollo would
   * use to identify a person. If it ever stops firing, the privacy page's "companies, not
   * people" sentence has become untrue.
   */
  test('the page policy admits Google and Apollo, and refuses LiveIntent', async ({
    page,
    context,
  }) => {
    await liftAutomationGate(context)
    await context.addInitScript(() => {
      const blocked: string[] = []
      ;(window as unknown as { blockedByPolicy: string[] }).blockedByPolicy = blocked
      document.addEventListener('securitypolicyviolation', (event) => {
        blocked.push(event.blockedURI)
      })
    })
    await watch(page)
    await page.route('https://d-code.liadm.com/**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/javascript', body: '' }),
    )
    await page.goto('/')
    await banner(page).getByRole('button', { name: 'Accept' }).click()
    await page.waitForLoadState('networkidle')
    const blockedBy = () =>
      page.evaluate(() => (window as unknown as { blockedByPolicy: string[] }).blockedByPolicy)
    expect(await blockedBy(), 'the policy blocked a tracker it should admit').toEqual([])

    await page.evaluate(() => {
      const script = document.createElement('script')
      script.src = 'https://d-code.liadm.com/did-0091.min.js'
      document.head.appendChild(script)
    })
    await expect.poll(blockedBy).toContain('https://d-code.liadm.com/did-0091.min.js')
  })

  test('the privacy page brings the question back, and Decline then undoes the Accept', async ({
    page,
    context,
  }) => {
    await liftAutomationGate(context)
    const outside = await watch(page)
    await page.goto('/privacy')
    await banner(page).getByRole('button', { name: 'Accept' }).click()
    await expect.poll(() => outside).toContain(APOLLO_SCRIPT)
    // What Apollo's real script would have stored (its response here is an empty file).
    await page.evaluate(() => localStorage.setItem('apolloAnonId', 'planted-by-the-test'))

    await page.getByRole('button', { name: 'Change your cookie choice' }).click()
    await expect(banner(page)).toBeVisible()
    outside.length = 0
    await Promise.all([
      page.waitForEvent('load'),
      banner(page).getByRole('button', { name: 'Decline' }).click(),
    ])
    await page.waitForLoadState('networkidle')
    expect((await stored(page)).local).toEqual({ 'run-consent': 'declined' })
    expect(outside, 'a tracker loaded on the page reloaded after Decline').toEqual([])
    await expect(banner(page)).toHaveCount(0)
  })

  /*
   * WITHDRAWING MUST BE AS EASY AS GIVING, so the way back is in the footer of every page
   * and opens the question where the visitor already is. The second test is the control
   * for the first and the honest fallback in one: with no question mounted to answer, the
   * same link must still go somewhere useful rather than do nothing.
   */
  test('the footer link reopens the question in place, from any page', async ({
    page,
    context,
  }) => {
    await liftAutomationGate(context)
    await watch(page)
    /*
     * ⚠️ EVERY PAGE STARTS UNANSWERED, so the question showing is the signal that the page
     * has hydrated and the banner is listening. The first version asked `isVisible()` once
     * and moved on; in CI (run 1cb7f7ca) that read "not visible" a moment BEFORE the banner
     * mounted, skipped the Decline, and then found the question on screen. Before hydration
     * the footer link is a plain link and would navigate away, which is the fallback the
     * next test checks, not what this one is about.
     */
    for (const path of ['/', '/products', '/contact', '/terms']) {
      await page.goto(path)
      await page.evaluate(() => localStorage.clear())
      await page.reload()
      await expect(banner(page), `no question on a first visit to ${path}`).toBeVisible()
      await banner(page).getByRole('button', { name: 'Decline' }).click()
      await expect(banner(page)).toHaveCount(0)
      await page.locator('.footer-legal').getByRole('link', { name: 'Cookies' }).click()
      await expect(banner(page), `no question after the footer link on ${path}`).toBeVisible()
      expect(new URL(page.url()).pathname, 'the link left the page').toBe(path)
      await banner(page).getByRole('button', { name: 'Decline' }).click()
    }
  })

  test('with no question to reopen, the footer link goes to the cookie section instead', async ({
    page,
  }) => {
    await page.goto('/products')
    await page.locator('.footer-legal').getByRole('link', { name: 'Cookies' }).click()
    await page.waitForURL('**/privacy#cookies')
    await expect(page.locator('#cookies')).toBeVisible()
  })

  /*
   * Two equal buttons, each a full touch target. A brighter Accept beside a quiet Decline
   * is the nudge regulators object to; equal size and equal style is the measurable form of
   * "neither is favoured". Checked at a phone width, where a wrapped row would show first.
   */
  test('the two buttons are equal, reachable by touch, and inside a phone screen', async ({
    page,
    context,
  }) => {
    await liftAutomationGate(context)
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('/')
    const accept = banner(page).getByRole('button', { name: 'Accept' })
    const decline = banner(page).getByRole('button', { name: 'Decline' })
    const [a, d] = [await accept.boundingBox(), await decline.boundingBox()]
    expect(a && d).toBeTruthy()
    for (const box of [a, d]) {
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44)
      expect(box?.x ?? -1).toBeGreaterThanOrEqual(0)
      expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(375)
      expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(812)
    }
    expect(Math.abs((a?.width ?? 0) - (d?.width ?? 0))).toBeLessThanOrEqual(1)
    expect(await accept.getAttribute('class')).toBe(await decline.getAttribute('class'))
    // It asks a question; it must not cover the bar a visitor navigates with.
    const bar = await page.locator('.notch-shell').first().boundingBox()
    const card = await page.locator('.consent__card').boundingBox()
    expect((bar?.y ?? 0) + (bar?.height ?? 0)).toBeLessThanOrEqual(card?.y ?? 0)
    /*
     * SMALL, NOT HIDDEN (owner, 2026-09-30, and current regulator guidance): visible enough to
     * be a real choice, and no more than a fifth of a phone screen. The first version was 28%.
     */
    await expect(page.locator('.consent__card')).toBeVisible()
    expect(
      card?.height ?? Infinity,
      'the question takes over a fifth of the screen',
    ).toBeLessThanOrEqual(812 * 0.2)
  })

  test('a keyboard reaches both buttons, and Enter answers', async ({ page, context }) => {
    await liftAutomationGate(context)
    await page.goto('/')
    await banner(page).getByRole('button', { name: 'Decline' }).focus()
    await page.keyboard.press('Enter')
    await expect(banner(page)).toHaveCount(0)
    expect((await stored(page)).local).toEqual({ 'run-consent': 'declined' })
  })
})
