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
