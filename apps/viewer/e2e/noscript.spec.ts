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
 * and `getByText(…)` both resolve to zero elements. That is not about scripting being
 * off: playwright-core's injected text engine skips SCRIPT, NOSCRIPT and STYLE
 * elements by tag name, and anything inside one (`shouldSkipForTextMatching`, plus
 * the lax-mode ancestor short-circuit), so text that lives inside `<noscript>` is
 * invisible to it in any page. A plain CSS locator with the `hasText` filter, and
 * `getByRole('link', { name })` below, do not use that skip. Use `hasText` (or a
 * plain CSS locator) for text that lives inside `<noscript>`.
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
