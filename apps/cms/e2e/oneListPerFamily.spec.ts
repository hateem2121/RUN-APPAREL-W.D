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

// A product line's page (the soccer ball) is not its family's link.
const WITH_A_PAGE = FAMILY_PAGES.filter((page) => !page.productLine).map((page) => {
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

  test('Sports Accessories forwards to its page, and an unknown value to the whole page', async ({
    page,
  }) => {
    expect(await forwardOf(page, '/products?family=sports-accessories')).toEqual({
      status: 308,
      to: '/custom-sports-accessories-manufacturer',
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

  test('no family card says "[ ask us ]" now every family has a page (owner, 2026-10-31)', async ({
    page,
  }) => {
    await page.goto('/')
    // A card is found by where its one link goes (the ticket's title, polish D3).
    const cardOf = (href: string) =>
      page
        .locator('.family-card')
        .filter({ has: page.locator(`a.family-card__link[href="${href}"]`) })
    // Every family with a page opens it, and says nothing of "[ ask us ]".
    for (const { page: buyerPage } of WITH_A_PAGE) {
      const card = cardOf(buyerPage.path)
      await expect(card).toHaveCount(1)
      await expect(card).not.toContainText('[ ask us ]')
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

/**
 * Polish S9 (5 Oct) drew each group after the first only as it neared the screen. It was withdrawn
 * on 11 Oct 2026: its 1,200px stand-in let an undrawn group's cards lie on the next group's (site.css;
 * `productsGroups.spec.ts` holds every group to its own box). What S9's guard also held stays: a Tab
 * walks from one group into the next.
 */
test.describe('every group is drawn at once, and a Tab walks from one into the next', () => {
  test('no group is deferred, and a Tab crosses the boundary', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 600 })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/products')
    const groups = await page.evaluate(() =>
      [...document.querySelectorAll('section.gallery-group')].map((group) => ({
        visibility: getComputedStyle(group).contentVisibility,
        // `contentVisibilityAuto`: false while a group is skipped, true once it is drawn.
        drawn: (group.querySelector('h2') as HTMLElement).checkVisibility({
          contentVisibilityAuto: true,
        }),
      })),
    )
    expect(groups.map((group) => group.visibility)).toEqual(FAMILIES.map(() => 'visible'))
    expect(
      groups.map((group) => group.drawn),
      'a group was left undrawn',
    ).toEqual(FAMILIES.map(() => true))

    // Sequential keyboard reach across the boundary, from the first group's last stop (a link or a
    // colour dot) into the second group.
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
      // `.about-ground`: №01's factory photo since D41 (2026-10-16); `.about__photos` until then.
      await expect(browser.locator('.facts-grid, .works-slab, .about-ground')).toHaveCount(0)
      await expect(
        browser.getByRole('heading', { level: 2, name: page.stepsHeading }),
      ).toBeVisible()
      // An accessory is no clothing, so its pages name the same guide in plainer words.
      const guide = browser.getByRole('link', {
        name:
          page.familySlug === 'sports-accessories'
            ? 'How an order works'
            : 'How a Private Label Clothing Order Works',
        exact: true,
      })
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
