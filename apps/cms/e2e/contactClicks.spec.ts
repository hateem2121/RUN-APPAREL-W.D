import { expect, type Page, test } from './offlineMedia'

/**
 * A tap on the WhatsApp, phone or inquiry-email link reaches Google Analytics as `contact_click`
 * with the method and nothing else, for a visitor who accepted (`packages/shared/src/
 * contactClicks.ts`). The jobs and press mailboxes are not a buyer reaching out and count nothing.
 *
 * These pages run under webdriver, where the consent banner starts nothing, so each test marks the
 * trackers started itself (as `keyEvents.spec.ts` does) and reads Google's queue; nothing is sent.
 *
 * ⚠️ A TAP MUST NOT LEAVE THE PAGE. `wa.me` is outside the test, and `tel:` and `mailto:` ask the
 * browser to open another program. The page's own click handler runs in the BUBBLE phase, after
 * the counting listener (which listens in the capture phase), so cancelling the click there
 * leaves the count intact and keeps the test on the page.
 */

type Queued = { name: string; params: Record<string, unknown> }

async function queuedContactEvents(page: Page): Promise<Queued[]> {
  return page.evaluate(() =>
    ((window as unknown as { dataLayer?: ArrayLike<unknown>[] }).dataLayer ?? [])
      .map((entry) => Array.from(entry))
      .filter((args) => args[0] === 'event')
      .map((args) => ({
        name: String(args[1]),
        params: (args[2] ?? {}) as Record<string, unknown>,
      })),
  )
}

const markTrackersStarted = (page: Page) =>
  page.addInitScript(() => {
    ;(window as unknown as { runTrackersStarted: boolean }).runTrackersStarted = true
  })

const keepTapsOnPage = (page: Page) =>
  page.addInitScript(() => {
    document.addEventListener('click', (event) => event.preventDefault())
  })

const LINKS = [
  { method: 'whatsapp', selector: 'a[href^="https://wa.me/"]' },
  { method: 'phone', selector: 'a[href^="tel:"]' },
  { method: 'email', selector: 'a[href^="mailto:inquiry@wear-run.com"]' },
] as const

test.describe('a tap on a contact link tells Google Analytics how the buyer reached out', () => {
  for (const { method, selector } of LINKS) {
    test(`/contact: a tap on the ${method} link queues one "contact_click" with method ${method}`, async ({
      page,
    }) => {
      await markTrackersStarted(page)
      await keepTapsOnPage(page)
      await page.goto('/contact')
      await page.locator(selector).first().click()
      expect(await queuedContactEvents(page)).toEqual([
        { name: 'contact_click', params: { method } },
      ])
    })
  }

  test('the footer on the home page counts too, and sends no number or address', async ({
    page,
  }) => {
    await markTrackersStarted(page)
    await keepTapsOnPage(page)
    await page.goto('/')
    await page.locator('footer a[href^="https://wa.me/"]').first().click()
    const events = await queuedContactEvents(page)
    expect(events).toEqual([{ name: 'contact_click', params: { method: 'whatsapp' } }])
    expect(JSON.stringify(events)).not.toMatch(/\d{8}|wear-run\.com/)
  })

  test('a visitor who has not accepted queues nothing', async ({ page }) => {
    await keepTapsOnPage(page)
    await page.goto('/contact')
    await page.locator('a[href^="https://wa.me/"]').first().click()
    expect(await queuedContactEvents(page)).toEqual([])
  })

  test('the jobs mailbox on /careers is not a buyer reaching out', async ({ page }) => {
    await markTrackersStarted(page)
    await keepTapsOnPage(page)
    await page.goto('/careers')
    await page.locator('a[href^="mailto:hr@wear-run.com"]').first().click()
    expect(await queuedContactEvents(page)).toEqual([])
  })

  test('the press mailbox on /press is not a buyer reaching out', async ({ page }) => {
    await markTrackersStarted(page)
    await keepTapsOnPage(page)
    await page.goto('/press')
    await page.locator('a[href^="mailto:press@wear-run.com"]').first().click()
    expect(await queuedContactEvents(page)).toEqual([])
  })

  test('a tap on plain text queues nothing', async ({ page }) => {
    await markTrackersStarted(page)
    await keepTapsOnPage(page)
    await page.goto('/contact')
    await page.locator('h1').first().click()
    expect(await queuedContactEvents(page)).toEqual([])
  })
})
