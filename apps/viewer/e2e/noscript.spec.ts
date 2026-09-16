import { expect, test } from '@playwright/test'

/**
 * RO-06 in a real browser: the page a person with scripts switched off actually sees.
 * The unit test reads index.html; this proves the built page shows it.
 *
 * ⚠️ `getByText()` finds NOTHING here — measured 2026-09-16. With
 * `javaScriptEnabled: false`, Chromium, WebKit and Firefox all render the noscript
 * paragraph normally (confirmed independently: `page.content()`, `page.locator('p')
 * .textContent()` and a failed run's own CDP accessibility snapshot all show the exact
 * text, and `page.locator('p').isVisible()` is `true`), yet `page.locator('text=…')`
 * and `getByText(…)` both resolve to zero elements — Playwright's dedicated "text="
 * engine specifically does not run under a scripting-disabled page. A plain CSS
 * locator and the `hasText` filter are unaffected (diagnosed the same session), and so
 * is `getByRole('link', { name })` below — only the "text=" engine is broken. Use
 * `hasText` for any text assertion on a `javaScriptEnabled: false` page here.
 */
test.use({ javaScriptEnabled: false })

test('with JavaScript off, the page names itself and links the contact page', async ({ page }) => {
  await page.goto('/n001/wine')
  await expect(
    page.locator('p', { hasText: 'This 3D garment reference needs JavaScript.' }),
  ).toBeVisible()
  await expect(page.getByRole('link', { name: 'wear-run.help/contact' })).toHaveAttribute(
    'href',
    'https://wear-run.help/contact',
  )
})
