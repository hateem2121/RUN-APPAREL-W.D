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

/**
 * What a run looks like when the stand-ins are really in place: the two SCRIPTS are asked
 * for and nothing else is. A real Google script sends `/g/collect`; a real Apollo script
 * calls `aplo-evnt.com`. Either one in `seen` means a stand-in was bypassed and this run
 * has just appeared in the owner's reports.
 */
function assertNothingReal(seen: string[]) {
  const real = seen.filter(
    (entry) => entry.includes('/g/collect') || entry.startsWith('aplo-evnt.com'),
  )
  expect(real, 'a real tracker ran: the local stand-ins were bypassed').toEqual([])
}

const keys = (page: Page) =>
  page.evaluate(() => ({
    local: Object.fromEntries(Object.entries(localStorage)),
    cookie: document.cookie,
  }))

/*
 * ⚠️ SERVICE WORKERS ARE BLOCKED HERE, OR WEBKIT SENDS REAL VISITS TO THE OWNER'S REPORTS.
 * Found 2026-09-30 in Google Analytics' realtime report: page views titled with this
 * fixture's garment, from the United States (GitHub's test machines) and from this Mac.
 * The build under test is a production build, so it installs `/sw.js`; once that worker
 * controls the page, WebKit stops calling `page.route()` handlers (`fontSwap.spec.ts`
 * measured the same thing on 2026-09-17). The "answered locally" promise at the top of this
 * file was therefore false in both WebKit projects: the real 530 KB Google script loaded,
 * a real `collect` was sent, and Apollo's script ran. Chromium and Firefox were unaffected,
 * which is why every test here still passed. `assertNothingReal` below is the check that
 * can see it.
 */
test.use({ serviceWorkers: 'block' })

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
    // Long enough for a real script to have phoned home, had one slipped through.
    await page.waitForLoadState('networkidle')
    assertNothingReal(seen)
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
   * WITHDRAWING MUST BE AS EASY AS GIVING: the footer of the garment page brings the
   * question back in place. Without the spoof the question is absent, so the same link has
   * to stay an ordinary link to the notice's cookie section; that half is asserted on its
   * address only, because following it leaves this fixture for the real website.
   */
  test('the footer link reopens the question without leaving the garment', async ({
    page,
    context,
  }) => {
    await context.addInitScript(asAHuman)
    await watchTrackers(page)
    await openGarment(page)
    await banner(page).getByRole('button', { name: 'Decline' }).click()
    await expect(banner(page)).toHaveCount(0)
    const link = page.locator('.footer__meta').getByRole('link', { name: 'Cookies' })
    await expect(link).toHaveAttribute('href', /\/privacy#cookies$/)
    await link.click()
    await expect(banner(page)).toBeVisible()
    expect(new URL(page.url()).pathname).toBe('/n001/wine')
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

  /*
   * ⚠️ NOTHING A KEYBOARD USER IS ON MAY SIT UNDER THE CARD (WCAG 2.2 SC 2.4.11, AA). The
   * live audit of 2026-10-01 found 8 or 9 of about 20 Tab stops on each garment page entirely
   * under it. On a phone that includes the action bar's EMAIL and WHATSAPP, which are fixed
   * under the card and cannot be scrolled out from under it, so the bar steps aside while the
   * question is open (base.css). The same two buttons sit in the page under the colourways.
   * The website's suite has the account of the WebKit fallback this also exercises.
   */
  /*
   * ⚠️ THE KEEP-CLEAR SCROLL ONCE THREW EVERY FIRST VISIT TO THE FOOTER. Found 2026-10-01 in
   * the iOS Simulator, never in a suite: the card is absent under automation, so the layout
   * suites' "the page opens at the very top" ran without it. `App.tsx` hands focus to the
   * 2,245px page wrapper with `preventScroll`; the fallback in `ConsentBanner.tsx` read its
   * bottom edge as "under the card" and scrolled by the overlap, landing at 1,574px of a
   * 390x844 page in Chromium and WebKit alike. A click on text focuses <main>, as tall, and
   * even capped at its top the lift moved it 60px, under the top bar; both are pinned here.
   */
  test('a first visit opens at the top, and a click on text does not move the page', async ({
    page,
    context,
  }) => {
    await context.addInitScript(asAHuman)
    await page.setViewportSize({ width: 390, height: 844 })
    await openGarment(page)
    await expect(banner(page)).toBeVisible()
    // The hand-off is what used to move the page; asserting before it passes on broken code.
    await page.waitForFunction(() => document.activeElement?.id === 'viewer-top')
    expect(await page.evaluate(() => Math.round(window.scrollY)), 'opened scrolled down').toBe(0)

    // ⚠️ A RAW MOUSE CLICK ON TEXT ALREADY ON SCREEN. `locator.click()` scrolls its target
    // into view first, and the product's <h1> is below the fold here: the first draft
    // measured Playwright's own 621px scroll and blamed the page.
    const name = await page.locator('.stage-block__name').boundingBox()
    if (!name) throw new Error('the product line above the garment is not on the page')
    expect(name.y + name.height, 'the text to click is not on screen').toBeLessThan(844)
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
    await page.mouse.click(name.x + name.width / 2, name.y + name.height / 2)
    // The control: the click must have focused something taller than the screen, or this
    // measured nothing. Measured 2026-10-01: it is <main>, 1,870px, starting under the bar.
    const tall = await page.evaluate(
      () => (document.activeElement?.getBoundingClientRect().height ?? 0) > window.innerHeight,
    )
    expect(tall, 'the click did not focus a page-tall container').toBe(true)
    expect(await page.evaluate(() => Math.round(window.scrollY)), 'a click moved the page').toBe(0)
  })

  test('with the question open, no Tab stop is ever entirely under the card', async ({
    page,
    context,
    browserName,
  }) => {
    await context.addInitScript(asAHuman)
    await page.setViewportSize({ width: 390, height: 844 })
    await openGarment(page)
    await expect(banner(page)).toBeVisible()
    const tabKey = browserName === 'webkit' ? 'Alt+Tab' : 'Tab'
    const hidden: string[] = []
    let reachedCard = false
    for (let stop = 0; stop < 45; stop += 1) {
      await page.keyboard.press(tabKey)
      const under = await page.evaluate(() => {
        const el = document.activeElement
        const card = document.querySelector('.consent__card')
        if (!(el instanceof HTMLElement) || !card || el === document.body) return null
        if (card.contains(el)) return 'IN_CARD'
        const a = el.getBoundingClientRect()
        const c = card.getBoundingClientRect()
        const entirely =
          a.top >= c.top && a.bottom <= c.bottom && a.left >= c.left && a.right <= c.right
        return entirely
          ? `${el.tagName.toLowerCase()} “${el.textContent?.trim().slice(0, 30)}”`
          : null
      })
      if (under === 'IN_CARD') reachedCard = true
      else if (under) hidden.push(under)
    }
    expect(reachedCard, 'the Tab walk never reached the question').toBe(true)
    expect(hidden, 'Tab stops entirely under the card').toEqual([])
  })

  test('after the skip link, the next Tab is the question', async ({
    page,
    context,
    browserName,
  }) => {
    await context.addInitScript(asAHuman)
    await openGarment(page)
    await expect(banner(page)).toBeVisible()
    const tabKey = browserName === 'webkit' ? 'Alt+Tab' : 'Tab'
    await page.keyboard.press(tabKey)
    await expect(page.locator('.skip-link')).toBeFocused()
    await page.keyboard.press(tabKey)
    const inCard = await page.evaluate(
      () => !!document.querySelector('.consent')?.contains(document.activeElement),
    )
    expect(inCard, 'the question is not the first stop after the skip link').toBe(true)
  })

  test('the footer link puts focus in the question, and answering hands it back', async ({
    page,
    context,
  }) => {
    await context.addInitScript(asAHuman)
    await watchTrackers(page)
    await openGarment(page)
    await banner(page).getByRole('button', { name: 'Decline' }).click()
    await expect(banner(page)).toHaveCount(0)
    const link = page.locator('.footer__meta').getByRole('link', { name: 'Cookies' })
    await link.focus()
    await page.keyboard.press('Enter')
    await expect(banner(page)).toBeVisible()
    await expect
      .poll(() =>
        page.evaluate(() => !!document.querySelector('.consent')?.contains(document.activeElement)),
      )
      .toBe(true)
    await banner(page).getByRole('button', { name: 'Decline' }).focus()
    await page.keyboard.press('Enter')
    await expect(banner(page)).toHaveCount(0)
    await expect(link).toBeFocused()
  })

  // Measured live 2026-10-01: `_ga_YBY5G3HQLD` outlived Decline. The test plants the late write.
  test('DECLINED: a Google cookie written after the click is gone on the next load', async ({
    page,
    context,
  }) => {
    await context.addInitScript(asAHuman)
    await watchTrackers(page)
    await openGarment(page)
    await banner(page).getByRole('button', { name: 'Decline' }).click()
    await expect(banner(page)).toHaveCount(0)
    await page.evaluate(() => {
      // biome-ignore lint/suspicious/noDocumentCookie: planting the late write the test is about
      document.cookie = '_ga_PLANTED=GS2.1.planted-by-the-test; path=/; max-age=3600'
    })
    const gaCookies = async () =>
      (await context.cookies())
        .map((cookie) => cookie.name)
        .filter((name) => name.startsWith('_ga'))
    // Polled, not read once: on CI's mobile Safari a page-side write was not yet in the
    // context's cookie list on one read (PR #109's last run, then passed on retry; 30/30 here).
    await expect.poll(gaCookies, 'the plant did not land').toEqual(['_ga_PLANTED'])
    await page.reload()
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expect.poll(gaCookies, 'a Google cookie outlived Decline').toEqual([])
  })

  test('on a sideways phone the question stays within a fifth of the screen', async ({
    page,
    context,
  }) => {
    await context.addInitScript(asAHuman)
    await page.setViewportSize({ width: 640, height: 360 })
    await openGarment(page)
    await expect(banner(page)).toBeVisible()
    const card = await page.locator('.consent__card').boundingBox()
    expect(
      card?.height ?? Infinity,
      'the question takes over a fifth of the screen',
    ).toBeLessThanOrEqual(360 * 0.2)
  })
})
