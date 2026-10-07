import { expect, type Page, test } from './offlineMedia'

/**
 * The owner's two form key events in Google Analytics: `inquiry_sent` (contact) and
 * `job_application_sent` (careers).
 *
 * ⚠️ WHY A NAMED EVENT, NOT A RULE ON THE PAGE'S ADDRESS (measured on the live site, 2026-10-07).
 * Both key events were Analytics rules matching a page_view whose address contains `?sent=1`. A
 * test application from a browser that had accepted cookies sent ONE page_view, 9.3 s after the
 * page started, with `dl=https://wear-run.com/careers`: the thank-you panel tidies `?sent=1` out of
 * the address at `load` (InquiryOutcome.tsx), and Google's script reads the address only when it
 * arrives, later. The rule could never match, which is why `inquiry_sent` had counted nothing in 90
 * days. A named event queued when the panel shows keeps its name however late the script loads.
 *
 * These pages run under webdriver, where the consent banner starts nothing, so each test marks the
 * trackers started itself (as `consent.test.ts` does) and reads Google's queue; nothing is sent.
 */

/** Every `['event', name]` in Google's queue, once the page has loaded. */
async function queuedEvents(page: Page): Promise<string[]> {
  await page.waitForLoadState('load')
  return page.evaluate(() =>
    ((window as unknown as { dataLayer?: ArrayLike<unknown>[] }).dataLayer ?? [])
      .map((entry) => Array.from(entry))
      .filter((args) => args[0] === 'event')
      .map((args) => String(args[1])),
  )
}

const markTrackersStarted = (page: Page) =>
  page.addInitScript(() => {
    ;(window as unknown as { runTrackersStarted: boolean }).runTrackersStarted = true
  })

test.describe('the forms tell Google Analytics a buyer or an applicant got through', () => {
  for (const { path, anchor, name } of [
    { path: '/contact', anchor: 'inquiry-done', name: 'inquiry_sent' },
    { path: '/careers', anchor: 'application-done', name: 'job_application_sent' },
  ]) {
    test(`${path}: the thank-you panel queues "${name}" once, for a visitor who accepted`, async ({
      page,
    }) => {
      await markTrackersStarted(page)
      await page.goto(`${path}?sent=1#${anchor}`)
      await expect(page.locator(`#${anchor}`)).toBeVisible()
      expect(await queuedEvents(page)).toEqual([name])
    })

    test(`${path}: nothing is queued for a visitor who has not accepted`, async ({ page }) => {
      await page.goto(`${path}?sent=1#${anchor}`)
      await expect(page.locator(`#${anchor}`)).toBeVisible()
      expect(await queuedEvents(page)).toEqual([])
    })
  }

  test('a refused form counts nothing', async ({ page }) => {
    await markTrackersStarted(page)
    await page.goto('/careers?error=too-many#application-problem')
    expect(await queuedEvents(page)).toEqual([])
  })
})
