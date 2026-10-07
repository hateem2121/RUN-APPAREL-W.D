import { expect, test } from './offlineMedia'

/**
 * The privacy page's visit-records paragraph (D37, approved by the owner 2026-09-15; the
 * list extended by D40, 2026-09-16, after a review found `timezone` and `minutes_active`
 * were stored but unlisted) — the wording a solicitor and the owner signed off on,
 * rendered for real rather than typed twice. No test anywhere previously asserted this page's wording as a string
 * (checked: apps/cms/src/**\/*.test.ts and apps/cms/e2e/**\/*.spec.ts reference the
 * page only structurally — a footer link, a CSP source, a word-splitting crawl).
 */
test.describe('privacy page — visit-records wording', () => {
  test('states what a document open records, why, and for how long', async ({ page }) => {
    const response = await page.goto('/privacy')
    expect(response?.status()).toBe(200)

    const main = page.locator('main')
    await expect(main).toContainText('When you open a document we share with you.')
    await expect(main).toContainText('to see how the documents we share are used')
    await expect(main).toContainText(
      'Records of visits to our shared documents for 12 months, after which they are deleted automatically.',
    )

    // D40: the two fields the first draft of this list omitted. Asserted because the list of
    // what is recorded is the part most likely to drift from what the recorder actually
    // stores — a review caught `timezone` and `minutes_active` missing from it once already.
    await expect(main).toContainText('(country, region and city), its time zone')
    await expect(main).toContainText('the time between your first and last activity on it that day')
  })
})

/**
 * The notice for people we email first (owner's brief, 2026-10-07; UK and EU GDPR Articles 14
 * and 21). Outreach emails link to `/privacy#outreach`, so the anchor is the contract. Article 21
 * asks for the right to object "clearly and separately from any other information" (ICO, "What
 * privacy information should we provide?"), hence its own paragraph, asserted alone.
 */
test.describe('privacy page — when we write to you first', () => {
  const OBJECT =
    'You can tell us to stop at any time. Reply to any of our emails, or write to privacy@wear-run.com, and we will never email you again.'

  test('the section sits after "When you contact us", under its anchor, and is listed', async ({
    page,
  }) => {
    await page.goto('/privacy#outreach')
    const heading = page.locator('h2#outreach')
    await expect(heading).toHaveText('When we write to you first')
    await expect(heading).toBeInViewport()
    await expect(page.locator('nav.legal__toc a[href="#outreach"]')).toHaveText(
      'When we write to you first',
    )
    // Straight after the contact paragraph, before job applications. Read in the notice's body:
    // "On this page" names the section first.
    const order = await page.locator('.legal__body').evaluate((body) => {
      const text = body.textContent ?? ''
      return [
        text.indexOf('When you contact us.'),
        text.indexOf('When we write to you first'),
        text.indexOf('When you apply for a job.'),
      ]
    })
    expect(order[0]).toBeLessThan(order[1] ?? -1)
    expect(order[1]).toBeLessThan(order[2] ?? -1)
  })

  test('the right to object stands in a paragraph of its own', async ({ page }) => {
    await page.goto('/privacy')
    const paragraph = page.locator('p', { hasText: 'You can tell us to stop at any time.' })
    await expect(paragraph).toHaveCount(1)
    expect((await paragraph.textContent())?.replace(/\s+/g, ' ').trim()).toBe(OBJECT)
  })

  test('data requests go to privacy@, and the section names its sources', async ({ page }) => {
    await page.goto('/privacy')
    const rights = page.locator('h2#your-rights + p')
    await expect(rights.locator('a[href="mailto:privacy@wear-run.com"]')).toHaveCount(1)
    await expect(rights).not.toContainText('partner@wear-run.com')
    const main = page.locator('main')
    for (const fact of [
      'Apollo (apollo.io)',
      'Wikidata and OpenStreetMap',
      'Companies House',
      'up to four short emails',
      '2 years after our last email',
      'do-not-contact list',
      'Information Commissioner’s Office (ico.org.uk)',
    ]) {
      await expect(main).toContainText(fact)
    }
  })
})
