import { FAMILIES } from '../src/lib/families'
import { FAMILY_PAGES, familyHref } from '../src/lib/familyPages'
import { expect, type Page, test } from './offlineMedia'

/**
 * Polish S1–S4 and S8 (the owner's answers Q24–Q26 and Q28, 2026-10-04): one page per job.
 *
 * A family's garments were listed twice, on its buyer page and on its filtered gallery
 * (`/products?family=<slug>`). The buyer page is the family's only list now; the products page
 * shows every family under a heading that opens it, with a bar of chips that jump to each group;
 * the old filter addresses forward; and a buyer page no longer copies the home page's numbers,
 * factory photos and order steps, but links the order guide. `src/oneListPerFamily.test.ts`
 * holds the addresses; this follows them in a browser.
 *
 * What would have to break for these to fail: an old address that no longer forwards (or forwards
 * temporarily, which a search engine would not consolidate), a heading that opens the wrong page,
 * a chip that does not land its group below the bar, the copied sections drawn again, or the link
 * to the guide gone. CI's database holds one garment, so most groups are empty there; every check
 * here holds for an empty group as for a full one.
 */

const WITH_A_PAGE = FAMILY_PAGES.map((page) => {
  const family = FAMILIES.find((entry) => entry.slug === page.familySlug)
  if (!family) throw new Error(`no family ${page.familySlug}`)
  return { family, page }
})

/** Where an address answers, without following it: the status and the forwarded path. */
async function forwardOf(page: Page, address: string) {
  const response = await page.request.get(address, { maxRedirects: 0 })
  const location = response.headers().location ?? ''
  const target = location ? new URL(location, 'http://localhost') : null
  return {
    status: response.status(),
    to: target ? `${target.pathname}${target.hash}` : '',
  }
}

test.describe('the old filter addresses forward, permanently (polish S3)', () => {
  for (const { family, page } of WITH_A_PAGE) {
    test(`/products?family=${family.slug} → ${page.path}`, async ({ page: browser }) => {
      // 308, Next's permanent redirect, which Google treats as it treats 301.
      expect(await forwardOf(browser, `/products?family=${family.slug}`)).toEqual({
        status: 308,
        to: page.path,
      })
      await browser.goto(`/products?family=${family.slug}`)
      await expect(browser).toHaveURL(new RegExp(`${page.path}$`))
      await expect(browser.getByRole('heading', { level: 1 })).toBeVisible()
    })
  }

  test('a family with no page forwards to its group, and an unknown value to the whole page', async ({
    page,
  }) => {
    expect(await forwardOf(page, '/products?family=sports-accessories')).toEqual({
      status: 308,
      to: '/products#sports-accessories',
    })
    expect(await forwardOf(page, '/products?family=nonsense')).toEqual({
      status: 308,
      to: '/products',
    })
    // CONTROL: the products page itself answers, and forwards nowhere.
    expect(await forwardOf(page, '/products')).toEqual({ status: 200, to: '' })
  })
})

test.describe('the products page shows every family under a heading that opens its page (polish S2)', () => {
  test('one group per family, in order, each heading opening the family’s one list', async ({
    page,
  }) => {
    await page.goto('/products')
    const groups = await page.evaluate(() =>
      [...document.querySelectorAll('section.gallery-group')].map((group) => ({
        id: group.id,
        heading: group.querySelector('h2')?.textContent?.replace('→', '').trim() ?? '',
        href: group.querySelector('h2 a')?.getAttribute('href') ?? null,
      })),
    )
    expect(groups.map((group) => group.id)).toEqual(FAMILIES.map((family) => family.slug))
    for (const family of FAMILIES) {
      const group = groups.find((entry) => entry.id === family.slug)
      expect(group?.heading, family.slug).toBe(family.name)
      const page = WITH_A_PAGE.find((entry) => entry.family.slug === family.slug)?.page
      expect(group?.href ?? null, family.slug).toBe(page ? page.path : null)
    }
  })

  test('Sports Accessories says "[ soon ]" and how to ask, in the owner’s words (Q21)', async ({
    page,
  }) => {
    await page.goto('/products')
    const group = page.locator('#sports-accessories')
    await expect(group.locator('.label')).toHaveText('[ soon ]')
    const ask = group.getByRole('link', { name: 'Ask what we make' })
    await expect(ask).toHaveAttribute('href', '/contact')
  })

  // Polish F8: the home page's card said "View the range" and opened an empty group.
  test('the home page’s Sports Accessories card says the same, and goes to Contact (F8)', async ({
    page,
  }) => {
    await page.goto('/')
    // A card is found by where its one link goes (the ticket's title, polish D3).
    const cardOf = (href: string) =>
      page
        .locator('.family-card')
        .filter({ has: page.locator(`a.family-card__link[href="${href}"]`) })
    const accessories = cardOf('/contact')
    await expect(accessories).toHaveCount(1)
    await expect(accessories.locator('.family-card__meta')).toContainText('[ soon ]')
    await expect(accessories.locator('.family-card__cue')).toContainText('Ask what we make')
    // The link's name must say where it goes (WCAG 2.4.4): "Ask what we make" is in it, out of
    // sight, while the other cards' "View the range" only repeats where their names lead.
    // A pattern, not the exact words: engines join a link's words and its hidden span with
    // different spacing ("Accessories. Ask" or "Accessories . Ask").
    const link = page.getByRole('link', { name: /^Sports Accessories\W+Ask what we make$/ })
    await expect(link).toHaveAttribute('href', '/contact')
    // CONTROL: every family with a page still opens it, and says nothing of "soon".
    for (const { page: buyerPage } of WITH_A_PAGE) {
      const card = cardOf(buyerPage.path)
      await expect(card).toHaveCount(1)
      await expect(card).not.toContainText('[ soon ]')
    }
  })

  test.describe('with scripting off', () => {
    test.use({ javaScriptEnabled: false })

    // D1's reason for one page, kept: every garment is in the document a crawler reads.
    test('every garment is on the page, under its family, as the chips count them (D1)', async ({
      page,
    }) => {
      await page.goto('/products')
      const counted = await page
        .locator('nav.filter-bar .filter-chip__count')
        .evaluateAll((counts) => counts.reduce((sum, count) => sum + Number(count.textContent), 0))
      const grouped = await page.locator('section.gallery-group li.product-card').count()
      expect(grouped, 'a garment the chips count is missing from its group').toBe(counted)
      // Each card stands in its own family's group.
      for (const family of FAMILIES) {
        const shown = await page.locator(`#${family.slug} li.product-card`).count()
        const chip = page.locator(`nav.filter-bar a[href="#${family.slug}"] .filter-chip__count`)
        await expect(chip).toHaveText(String(shown))
      }
    })
  })

  test('no link on the page leads to a filter address', async ({ page }) => {
    await page.goto('/products')
    const filters = await page
      .locator('a[href*="family="]')
      .evaluateAll((links) => links.map((link) => link.getAttribute('href')))
    expect(filters).toEqual([])
  })
})

test.describe('the chips jump to their group (polish S8)', () => {
  test('one chip per family, each to its group, and a jump lands the heading below the bar', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/products')
    const chips = page.locator('nav.filter-bar a.filter-chip')
    expect(
      await chips.evaluateAll((links) => links.map((link) => link.getAttribute('href'))),
    ).toEqual(FAMILIES.map((family) => `#${family.slug}`))
    // The last group, the one furthest down: its heading comes to rest under the bar.
    const last = FAMILIES.at(-1)?.slug ?? ''
    await chips.last().click()
    await expect(page).toHaveURL(new RegExp(`#${last}$`))
    await expect
      .poll(() =>
        page.evaluate((id) => {
          const heading = document.getElementById(`${id}-heading`)?.getBoundingClientRect()
          const bar = document.querySelector('.notch-shell')?.getBoundingClientRect()
          return heading && bar ? heading.top >= bar.bottom - 1 && heading.top < 900 : false
        }, last),
      )
      .toBe(true)
  })
})

test.describe('the groups after the first are drawn as they near the screen (polish S9)', () => {
  test('the first group at once, the others deferred, and a Tab still walks into them', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 600 })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/products')
    const groups = await page.evaluate(() =>
      [...document.querySelectorAll('section.gallery-group')].map((group) => ({
        id: group.id,
        visibility: getComputedStyle(group).contentVisibility,
        // `contentVisibilityAuto`: false while the group is skipped, which proves it is deferred.
        drawn: (group.querySelector('h2') as HTMLElement).checkVisibility({
          contentVisibilityAuto: true,
        }),
      })),
    )
    expect(groups.map((group) => group.visibility)).toEqual([
      'visible',
      ...FAMILIES.slice(1).map(() => 'auto'),
    ])
    expect(groups[0]?.drawn, 'the first group is not drawn on the first screen').toBe(true)
    expect(groups.at(-1)?.drawn, 'the last group was drawn before it neared the screen').toBe(false)

    // The guide's check: sequential keyboard reach across the boundary into a deferred group.
    // From the first group's last stop, link or colour dot.
    await page.locator('section.gallery-group').first().locator('a[href], button').last().focus()
    await page.keyboard.press('Tab')
    expect(
      await page.evaluate(() => document.activeElement?.closest('section.gallery-group')?.id),
    ).toBe(FAMILIES[1]?.slug)
  })
})

test.describe('a buyer page is its family’s list, and copies nothing (polish S1, S4)', () => {
  for (const { page } of WITH_A_PAGE) {
    test(`${page.path}: no numbers, no factory photos, no steps; the order guide instead`, async ({
      page: browser,
    }) => {
      await browser.goto(page.path)
      await expect(browser.locator('.facts-grid, .works-slab, .about__photos')).toHaveCount(0)
      await expect(
        browser.getByRole('heading', { level: 2, name: page.stepsHeading }),
      ).toBeVisible()
      const guide = browser.getByRole('link', { name: 'How a Private Label Clothing Order Works' })
      await expect(guide).toHaveAttribute('href', '/guides/how-a-private-label-order-works')
      // It sends nobody to a filter address, its own or another family's.
      await expect(browser.locator('a[href*="family="]')).toHaveCount(0)
      // The other ranges it names lead to their own lists.
      const others = await browser
        .locator('.see-also a.filter-chip')
        .evaluateAll((links) => links.map((link) => link.getAttribute('href')))
      for (const href of others) {
        expect([...FAMILIES.map((family) => familyHref(family)), '/products'], `${href}`).toContain(
          href,
        )
      }
    })
  }
})
