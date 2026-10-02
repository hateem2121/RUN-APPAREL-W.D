import { expect, type Locator, test } from '@playwright/test'

/**
 * VA-39 (visual audit, 2026-10-02): a garment page's section labels carry their number ONCE.
 * They read "№02 — CUSTOMIZATION — №02" and "№03 — START THE CONVERSATION — №03", which looks
 * like a typo; the website writes "№02 — What we make".
 *
 * What would have to break for these to fail: a label pasted back with its second number, or
 * `.section-number` losing `text-transform: uppercase` (the words would then show in sentence
 * case, unlike the website's capitals). `src/components/sectionLabels.test.tsx` holds the SOURCE
 * half of this; this is the page a visitor sees.
 *
 * ⚠️ The words are read from `textContent`, not `innerText`: that is the text a screen reader
 * speaks, and it is what the source says. The capitals are asked of the computed style instead
 * of being inferred from a transformed string.
 */

async function labelFacts(label: Locator) {
  return {
    words: (await label.textContent())?.trim(),
    transform: await label.evaluate((element) => getComputedStyle(element).textTransform),
  }
}

test.describe('section labels carry their number once (VA-39) — the garment pages', () => {
  test('"№02 — Customization", and the page draws it in capitals', async ({ page }) => {
    await page.goto('/n001/wine')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    expect(await labelFacts(page.locator('.customise .section-number'))).toEqual({
      words: '№02 — Customization',
      transform: 'uppercase',
    })
  })

  test('"№03 — Start the conversation", and the page draws it in capitals', async ({ page }) => {
    await page.goto('/n001/wine')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    expect(await labelFacts(page.locator('.contact .section-number'))).toEqual({
      words: '№03 — Start the conversation',
      transform: 'uppercase',
    })
  })
})
