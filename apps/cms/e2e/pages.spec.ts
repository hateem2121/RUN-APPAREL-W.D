import AxeBuilder from '@axe-core/playwright'
import { expect, test } from './offlineMedia'

/**
 * The public site, loaded in a real browser.
 *
 * ⚠️ EVERY CASE HERE PINS A DEFECT THAT WAS ACTUALLY FOUND, not a hypothetical. The
 * audit's largest finding was that nothing loaded these pages at all: if all three had
 * rendered blank, every gate in CI would have stayed green.
 *
 * ⚠️ THE PRODUCT GALLERY IS DELIBERATELY STATE-TOLERANT. The content helpers fall back
 * to defaults when D1 is unreachable, so the gallery legitimately has two states: cards,
 * or the "references are being updated" message. CI has no seeded local database and
 * a developer's machine does; asserting a card count would fail in one of the two for
 * reasons that are not defects. Each BRANCH is asserted strictly instead, and the one
 * thing both must satisfy — the page is not blank — is asserted unconditionally.
 */

const PAGES = [
  { path: '/', name: 'home', heading: /Made to order/i },
  { path: '/products', name: 'products', heading: /Every garment/i },
  { path: '/contact', name: 'contact', heading: /talk production/i },
] as const

test.describe('every page renders real content', () => {
  for (const page of PAGES) {
    test(`${page.name} is not blank`, async ({ page: browser }) => {
      const response = await browser.goto(page.path)
      expect(response?.status(), `${page.path} did not return 200`).toBe(200)

      // Exactly one h1, and it says what it should — the cheapest possible proof that
      // the server rendered this page rather than an error shell.
      const h1 = browser.locator('h1')
      await expect(h1).toHaveCount(1)
      await expect(h1).toHaveText(page.heading)

      // LA-04: no skipped heading level anywhere on the page (h1's uniqueness is
      // already proven above) — built from the actual sequence, not assumed.
      const levels = await browser.evaluate(() =>
        [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].map((el) =>
          Number(el.tagName.slice(1)),
        ),
      )
      for (let i = 1; i < levels.length; i++) {
        expect(
          levels[i] - levels[i - 1],
          `${page.path}: heading level jumps from h${levels[i - 1]} to h${levels[i]} (sequence: ${levels})`,
        ).toBeLessThanOrEqual(1)
      }

      // The chrome the layout is responsible for.
      await expect(browser.locator('.notch__nav a')).toHaveCount(2)
      await expect(browser.locator('main#main')).toBeVisible()
      await expect(browser.locator('.site-footer')).toBeVisible()

      // and real prose, not just a skeleton
      const text = (await browser.locator('main').innerText()).trim()
      expect(text.length, 'main rendered almost no text').toBeGreaterThan(120)
    })
  }
})

test.describe('the product gallery', () => {
  test('shows either real cards or the designed empty state, never nothing', async ({ page }) => {
    await page.goto('/products')
    const cards = page.locator('.product-card')
    const count = await cards.count()

    if (count === 0) {
      // The empty state had never been rendered by any test before this one.
      await expect(page.locator('.site-empty')).toBeVisible()
      await expect(page.locator('.site-empty')).toContainText(/being updated/i)
      return
    }

    const first = cards.first()
    await expect(first.locator('.product-card__name')).not.toBeEmpty()

    /*
     * ⚠️ CARDS MUST LINK TO THE VIEWER HOST, NEVER TO THIS ONE. The garment is served by
     * a different Worker reached from printed QR tags; a relative link would 404 because
     * nothing here serves that shape. Pinned because both sides would otherwise stay
     * green while a buyer met "[ REFERENCE UNAVAILABLE ]".
     */
    const href = await first.locator('a.product-card__link').getAttribute('href')
    expect(href).toMatch(/^https:\/\/viewer\./)

    // Every card shows a poster OR the placeholder — never an empty box.
    for (let index = 0; index < Math.min(count, 4); index++) {
      const figure = cards.nth(index).locator('.product-card__figure')
      const hasImage = (await figure.locator('img').count()) > 0
      const hasPlaceholder = (await figure.locator('.product-card__placeholder').count()) > 0
      expect(hasImage || hasPlaceholder, `card ${index} figure is empty`).toBe(true)
    }
  })

  test('falls back to the placeholder when every poster fails', async ({ page }) => {
    /*
     * The poster `error` event fires while the HTML is still parsing — BEFORE React
     * hydrates and attaches its handler — so `onError` alone never fires. Measured
     * 2026-09-05 against a forced 404: image broken, React hydrated, no swap. The
     * component detects the already-failed state on mount instead, and this is the case
     * that proves it, in the only place it can be proven: a real browser.
     */
    await page.route('**/api/media/**', (route) => route.fulfill({ status: 404, body: '' }))
    await page.route('**media.wear-run.help/**', (route) =>
      route.fulfill({ status: 404, body: '' }),
    )
    await page.goto('/products')

    const cards = page.locator('.product-card')
    if ((await cards.count()) === 0) test.skip(true, 'no cards in this environment')

    await cards.first().scrollIntoViewIfNeeded()
    // Not a fixed wait: the swap happens on mount, so poll for the outcome instead.
    await expect(page.locator('.product-card__img')).toHaveCount(0, { timeout: 10_000 })
    await expect(cards.first().locator('.product-card__placeholder')).toBeVisible()
  })
})

test.describe('accessibility', () => {
  for (const page of PAGES) {
    test(`${page.name} has no automated violations`, async ({ page: browser }) => {
      await browser.goto(page.path)
      const results = await new AxeBuilder({ page: browser })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze()

      // Name the offenders in the failure, or a red run says only "expected 0".
      const summary = results.violations.map((v) => `${v.id} (${v.nodes.length})`).join(', ')
      expect(results.violations, `axe violations: ${summary}`).toEqual([])
    })
  }
})

test.describe('search visibility follows the committed switch: visible since launch', () => {
  /*
   * ⚠️ THIS SERVER READS `SITE_INDEXING` FROM `wrangler.jsonc`, NOT FROM AN EMPTY
   * ENVIRONMENT. Until 2026-09-25 this block said the var was "unset for this server", and
   * it was not: OpenNext hands `next start` the file's `vars` through `getCloudflareContext`,
   * which `searchVisibility()` reads first. Measured when the switch flipped: with
   * `wrangler.jsonc` saying "visible" and no SITE_INDEXING in the environment, the old
   * "defaults to hidden" tests failed 4 of 4. So this block tests what ships. The fail-closed
   * rule (absent, blank or misspelt means hidden) is proven in src/lib/searchVisibility.test.ts.
   *
   * The owner launched the site on 2026-09-25 (tracker L-21): no public page asks to be left
   * out of search, and the sitemap offers every page. Setting the file back to "hidden"
   * turns these red, which is the control.
   */
  for (const page of PAGES) {
    test(`${page.name} does not carry noindex`, async ({ page: browser }) => {
      await browser.goto(page.path)
      const robots = await browser
        .locator('meta[name="robots"]')
        .evaluateAll((tags) => tags.map((tag) => tag.getAttribute('content') ?? ''))
      expect(robots.filter((content) => /noindex/i.test(content))).toEqual([])
    })
  }

  test('the sitemap lists the five public pages', async ({ request }) => {
    const response = await request.get('/sitemap.xml')
    expect(response.status()).toBe(200)
    const locs = [...(await response.text()).matchAll(/<loc>([^<]+)<\/loc>/g)].map(
      (m) => new URL(m[1] ?? '').pathname,
    )
    expect(locs.sort()).toEqual(['/', '/contact', '/privacy', '/products', '/terms'])
  })

  /**
   * SO-06 — a machine file's CONTENT-TYPE, not just its body. `robots.txt` and
   * `llms.txt` already have this in `findability.spec.ts`'s FA-N-16/17 block;
   * `sitemap.xml` did not. This app's own `withPayload` trap (a header set on a
   * route handler's `Response` can be silently overridden by the LAST matching rule)
   * is exactly why a body-only test is not enough here — the body can be perfect XML
   * while a crawler receives it labelled as something else and declines to parse it.
   */
  test('the sitemap is served as XML, not a web page', async ({ request }) => {
    const response = await request.get('/sitemap.xml')
    expect(response.headers()['content-type']).toContain('application/xml')
  })
})

test.describe('FA-P-09 — the empty gallery is a designed state, reached on purpose', () => {
  /**
   * ⚠️ THE EXISTING CHECK COULD NOT SEE THIS ONE, AND THAT IS THE FINDING. "shows either
   * real cards or the designed empty state" above takes the `count === 0` branch only
   * where the gallery happens to be empty — which is CI, never a developer's machine (10
   * seeded products here, 0 there). So the empty state was asserted in exactly the
   * environment nobody looks at, and the one where it is easy to look never ran it.
   *
   * The family filters make it reachable deterministically in both: `?family=` on a
   * family with no garments renders the SECOND empty message, the one written because a
   * single message would have been a lie — nothing is "being updated" when the catalogue
   * is fine and this family is simply empty.
   *
   * What "designed" has to mean, or the row is just "some text appeared": the dashed
   * panel, centred in its column (FA-D-03 — it used to hug the left edge with up to 468px
   * of empty column beside it while its own text was centred), naming the family, and
   * offering a way out. Plus the rest of the page still being a page.
   */
  test('an empty family renders the dashed panel, centred, with a route out', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.goto('/products')

    const empties = await page.locator('.filter-chip[data-empty="true"]').all()
    /*
     * The negative control on the FIXTURE, not on the page. If every family has garments
     * there is no empty route to visit, and this test would skip quietly forever — which
     * is the failure it was written to remove. Fail instead, and say what to do.
     */
    expect(
      empties.length,
      'no family is empty in this environment, so the empty gallery cannot be reached. ' +
        'Point this test at a fixture that has one rather than letting it skip.',
    ).toBeGreaterThan(0)

    const href = await empties[0]?.getAttribute('href')
    const familyName = ((await empties[0]?.textContent()) ?? '').replace(/\d+$/, '').trim()
    expect(href).toMatch(/\?family=/)
    await page.goto(href as string)

    await expect(page.locator('.product-card')).toHaveCount(0)
    const empty = page.locator('.site-empty')
    await expect(empty).toBeVisible()

    // It names THIS family — the generic "being updated" message would be untrue here.
    await expect(empty).toContainText(familyName)
    await expect(empty).toContainText(/email us/i)

    const box = await page.evaluate(() => {
      const panel = document.querySelector('.site-empty') as HTMLElement
      const column = panel.closest('.site-container') as HTMLElement
      const p = panel.getBoundingClientRect()
      const c = column.getBoundingClientRect()
      const style = getComputedStyle(panel)
      return {
        leftGap: Number((p.left - c.left).toFixed(1)),
        rightGap: Number((c.right - p.right).toFixed(1)),
        borderStyle: style.borderTopStyle,
        borderWidth: Number.parseFloat(style.borderTopWidth),
        width: Number(p.width.toFixed(1)),
        columnWidth: Number(c.width.toFixed(1)),
      }
    })
    // The FA-D-03 fix: `margin-inline: auto` on a block that is narrower than its column.
    expect(
      box.columnWidth,
      'the panel fills its column, so centring proves nothing',
    ).toBeGreaterThan(box.width + 20)
    expect(
      Math.abs(box.leftGap - box.rightGap),
      `the panel sits ${box.leftGap}px from the left and ${box.rightGap}px from the right`,
    ).toBeLessThanOrEqual(1)
    expect(box.borderStyle, 'the panel lost its dashed edge').toBe('dashed')
    expect(box.borderWidth).toBeGreaterThanOrEqual(1)

    // and the page is still a page: the filters, the header and the footer are all there
    await expect(page.locator('.filter-bar .filter-chip').first()).toBeVisible()
    await expect(page.locator('.notch__nav a')).toHaveCount(2)
    await expect(page.locator('.site-footer')).toBeVisible()
  })

  test('the unfiltered empty message is a DIFFERENT sentence from the filtered one', async ({
    page,
  }) => {
    /*
     * Both strings live in one ternary and one is unreachable in whichever environment
     * this runs in, so the two are compared as SOURCE-visible copy through the rendered
     * page: whichever branch is live here must not be the other one's wording. It is a
     * small assertion and it pins the decision the comment in products/page.tsx records —
     * that a single message would have been a lie in the filtered case.
     */
    await page.goto('/products')
    const cards = await page.locator('.product-card').count()
    if (cards === 0) {
      await expect(page.locator('.site-empty')).toContainText(/being updated/i)
      await expect(page.locator('.site-empty')).not.toContainText(/yet —/i)
      return
    }
    const empties = await page.locator('.filter-chip[data-empty="true"]').all()
    expect(empties.length).toBeGreaterThan(0)
    await page.goto((await empties[0]?.getAttribute('href')) as string)
    await expect(page.locator('.site-empty')).toContainText(/still being built/i)
    await expect(page.locator('.site-empty')).not.toContainText(/being updated/i)
  })
})
