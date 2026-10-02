import { FAMILIES } from '../src/lib/families'
import { aboutLabel, FAMILY_PAGES, familyGalleryHref, seeAllLabel } from '../src/lib/familyPages'
import { expect, test } from './offlineMedia'

/**
 * VA-33 (visual audit, owner's choice 2026-10-01, words approved 2026-10-02): the buyer page and
 * the filtered gallery name each other. From the home page "Outerwear" opened the buyer page,
 * and on /products the same word filtered the grid, so a buyer who knew one never found the other.
 * `src/familyCrossLinks.test.ts` holds the words and addresses; this clicks them.
 *
 * What would have to break for these to fail: a link missing from a page (most likely the
 * buyer page's, which is drawn only if the family has garments in the database, and CI's seed
 * holds one Sportswear garment), a link that leads somewhere else — the buyer page linking to
 * itself — a link for Sports Accessories, or the filtered view turning into a page of its own
 * for search engines by naming itself as its canonical address.
 */

const WITH_A_PAGE = FAMILY_PAGES.map((page) => {
  const family = FAMILIES.find((entry) => entry.slug === page.familySlug)
  if (!family) throw new Error(`no family ${page.familySlug}`)
  return { family, page }
})

test.describe('the buyer page links to its family’s gallery (VA-33)', () => {
  for (const { family, page } of WITH_A_PAGE) {
    test(`${page.path}: "${seeAllLabel(family)}" opens the filtered gallery`, async ({
      page: browser,
    }) => {
      await browser.goto(page.path)
      const link = browser.locator(`a.btn[href="${familyGalleryHref(family)}"]`)
      // Exactly one: a second would be a way across the page does not need.
      await expect(link).toHaveCount(1)
      await expect(link).toBeVisible()
      await expect(link).toHaveText(seeAllLabel(family))

      await link.click()
      await expect(browser).toHaveURL(new RegExp(`/products\\?family=${family.slug}$`))
      // It is the family's own view: its chip is the current one.
      await expect(browser.locator('.filter-chip[aria-current="page"]')).toContainText(family.name)
    })
  }
})

test.describe('the filtered gallery links back to the buyer page (VA-33)', () => {
  for (const { family, page } of WITH_A_PAGE) {
    test(`/products?family=${family.slug}: "${aboutLabel(family)}" opens ${page.path}`, async ({
      page: browser,
    }) => {
      await browser.goto(familyGalleryHref(family))
      const link = browser.locator(`.result-bar a.btn[href="${page.path}"]`)
      await expect(link).toHaveCount(1)
      await expect(link).toBeVisible()
      await expect(link).toHaveText(aboutLabel(family))
      // Beside the family's own count line, below the chips: not inside the filter row.
      await expect(browser.locator('.filter-bar a.btn')).toHaveCount(0)

      await link.click()
      await expect(browser).toHaveURL(new RegExp(`${page.path}$`))
      await expect(browser.getByRole('heading', { level: 1 })).toBeVisible()
    })
  }

  test('the way across and the way back close a loop: buyer page, gallery, buyer page', async ({
    page,
  }) => {
    const { family, page: buyerPage } = WITH_A_PAGE[0] as (typeof WITH_A_PAGE)[number]
    await page.goto(buyerPage.path)
    await page.locator(`a.btn[href="${familyGalleryHref(family)}"]`).click()
    await expect(page).toHaveURL(new RegExp(`/products\\?family=${family.slug}$`))
    await page.locator(`.result-bar a.btn[href="${buyerPage.path}"]`).click()
    await expect(page).toHaveURL(new RegExp(`${buyerPage.path}$`))
  })
})

test.describe('where there is no buyer page there is no link (VA-33)', () => {
  test('Sports Accessories: no "About our" link on its gallery', async ({ page }) => {
    // Its chip's address, written out: the family has no buyer page, so no helper names it here.
    await page.goto('/products?family=sports-accessories')
    await expect(page.locator('.filter-chip[aria-current="page"]')).toContainText(
      'Sports Accessories',
    )
    await expect(page.locator('a', { hasText: /^About our/i })).toHaveCount(0)
    await expect(page.locator('.result-bar a')).toHaveCount(0)
  })

  test('the unfiltered gallery has no "About our" link either', async ({ page }) => {
    await page.goto('/products')
    await expect(page.locator('a', { hasText: /^About our/i })).toHaveCount(0)
  })
})

test.describe('the filtered view still names /products as its canonical address', () => {
  for (const { family } of WITH_A_PAGE) {
    test(`/products?family=${family.slug}`, async ({ page }) => {
      await page.goto(familyGalleryHref(family))
      const canonical = await page.locator('link[rel="canonical"]').getAttribute('href')
      expect(new URL(canonical ?? '').pathname).toBe('/products')
      expect(canonical).not.toContain('family=')
    })
  }
})
