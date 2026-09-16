import { expect, test } from '@playwright/test'

/**
 * The privacy page's visit-records paragraph (D37, approved by the owner 2026-09-15) —
 * the wording a solicitor and the owner signed off on, rendered for real rather than
 * typed twice. No test anywhere previously asserted this page's wording as a string
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
  })
})
