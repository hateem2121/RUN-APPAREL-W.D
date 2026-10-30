import { expect, type Page, test } from '@playwright/test'

/**
 * A tap on the footer's WhatsApp or email link on a garment page reaches Google Analytics as
 * `contact_click` with the method and nothing else, but ONLY after the visitor pressed Accept
 * (`packages/shared/src/contactClicks.ts`; `apps/cms/e2e/contactClicks.spec.ts` proves the
 * website's half).
 *
 * Unlike the website's spec this one goes through the REAL question: the gate is lifted as
 * `consent.spec.ts` does (under automation the banner is absent), the trackers' hosts are
 * answered locally with an empty script so a run is never a visit in the owner's reports, and
 * service workers are blocked or WebKit would bypass those stand-ins.
 *
 * ⚠️ A TAP MUST NOT LEAVE THE PAGE. The page's own bubble-phase handler cancels the click for
 * a contact link only; the counting listener runs first, in the capture phase, so the count is
 * intact and the test stays on the garment.
 */

const TRACKER_HOSTS = [
  'www.googletagmanager.com',
  'assets.apollo.io',
  'aplo-evnt.com',
  'www.google-analytics.com',
  'region1.google-analytics.com',
  'us-assets.i.posthog.com',
  'us.i.posthog.com',
]

const asAHuman = `Object.defineProperty(Navigator.prototype, 'webdriver', {
  get: () => false,
  configurable: true,
})`

const keepContactTapsOnPage = `document.addEventListener('click', (event) => {
  const link = event.target && event.target.closest && event.target.closest('a[href]')
  const href = link ? link.getAttribute('href') : ''
  if (/^(https:\\/\\/wa\\.me\\/|tel:|mailto:)/i.test(href)) event.preventDefault()
})`

test.use({ serviceWorkers: 'block' })

const banner = (page: Page) => page.getByRole('region', { name: 'Cookie choice' })

async function openGarment(page: Page) {
  await page.route(
    (url) => TRACKER_HOSTS.includes(url.host),
    (route) => route.fulfill({ status: 200, contentType: 'application/javascript', body: '' }),
  )
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/n001/wine')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  // The same focus hand-off wait as consent.spec.ts: a tap before it can be lost to it.
  await page.waitForFunction(() => document.activeElement?.id === 'viewer-top')
}

/** Every `contact_click` in Google's queue, as its parameters. */
const contactEvents = (page: Page) =>
  page.evaluate(() =>
    ((window as unknown as { dataLayer?: ArrayLike<unknown>[] }).dataLayer ?? [])
      .map((entry) => Array.from(entry))
      .filter((args) => args[0] === 'event' && args[1] === 'contact_click')
      .map((args) => args[2]),
  )

const whatsapp = (page: Page) => page.locator('footer a[href^="https://wa.me/"]').first()
const email = (page: Page) => page.locator('footer a[href^="mailto:"]').first()

test.describe('a tap on a contact link on a garment page', () => {
  test('ACCEPT: one "contact_click" per tap, carrying only the method', async ({
    page,
    context,
  }) => {
    await context.addInitScript(asAHuman)
    await context.addInitScript(keepContactTapsOnPage)
    await openGarment(page)
    await banner(page).getByRole('button', { name: 'Accept' }).click()
    await expect(banner(page)).toHaveCount(0)

    await whatsapp(page).click()
    await email(page).click()

    const events = await contactEvents(page)
    expect(events).toEqual([{ method: 'whatsapp' }, { method: 'email' }])
    expect(JSON.stringify(events)).not.toMatch(/\d{8}|@|wear-run/)
  })

  test('DECLINE: a tap queues nothing', async ({ page, context }) => {
    await context.addInitScript(asAHuman)
    await context.addInitScript(keepContactTapsOnPage)
    await openGarment(page)
    await banner(page).getByRole('button', { name: 'Decline' }).click()
    await expect(banner(page)).toHaveCount(0)

    await whatsapp(page).click()
    await email(page).click()

    expect(await contactEvents(page)).toEqual([])
  })

  test('NOT ANSWERED: a tap queues nothing', async ({ page, context }) => {
    await context.addInitScript(asAHuman)
    await context.addInitScript(keepContactTapsOnPage)
    await openGarment(page)
    await expect(banner(page)).toBeVisible()

    // The open question is fixed to the foot of the screen and may cover the footer's links, so
    // the tap is sent to the link itself rather than to the pixels where it lies.
    await whatsapp(page).evaluate((link) => (link as HTMLAnchorElement).click())
    await email(page).evaluate((link) => (link as HTMLAnchorElement).click())

    expect(await contactEvents(page)).toEqual([])
  })
})
