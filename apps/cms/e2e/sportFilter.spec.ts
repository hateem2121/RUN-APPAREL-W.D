import AxeBuilder from '@axe-core/playwright'
import { stripUntilStable } from '../../../scripts/strip-until-stable.mjs'
import { TEAMWEAR_SPORTS } from '../src/lib/sports'
import { LIVE_TEAMWEAR } from './fixtures/teamwear'
import { expect, type Page, test } from './offlineMedia'
import { sportFilterHarnessHtml } from './sportFilterHarness'

/**
 * Polish S7: the Teamwear page's sport buttons (the owner's six groups, Q44), pressed in a browser.
 *
 * ⚠️ ON A HARNESS, with the 19 live garments: this suite's database holds no Teamwear garment, so
 * the real page has nothing to filter here (`sportFilterHarness.ts` has the whole reason). The real
 * buyer page draws its list through the same component, which the last test holds.
 *
 * What would have to break for these to fail: a button that shows another sport's garments or
 * hides its own; a card alone on the last row, or a hole, while a sport is shown (VA-42); the group
 * a screen reader cannot name, or a button it cannot reach by keyboard; a chosen chip told apart by
 * colour alone or failing contrast; or a filter that needs a script (a page that runs none must
 * filter the same).
 */

const tabKey = (browserName: string) => (browserName === 'webkit' ? 'Alt+Tab' : 'Tab')

async function openHarness(page: Page) {
  const html = await sportFilterHarnessHtml()
  await page.route('**/__sport-harness', (route) =>
    route.fulfill({ contentType: 'text/html', body: html }),
  )
  await page.goto('/__sport-harness')
  await expect(page.locator('.product-grid > .product-card')).toHaveCount(LIVE_TEAMWEAR.length)
}

const chip = (page: Page, label: string) =>
  page.locator('.sport-filter__chip').filter({ hasText: new RegExp(`^${label}\\s*\\d+$`, 'i') })

/** The names of the cards on show, in the page's order. */
const shownNames = (page: Page) =>
  page
    .locator('.product-grid > .product-card')
    .evaluateAll((cards) =>
      cards
        .filter((card) => getComputedStyle(card).display !== 'none')
        .map((card) => card.querySelector('.product-card__name')?.textContent?.trim() ?? ''),
    )

/** The rows the cards on show make: each row, the width each card takes, in columns. */
const shownRows = (page: Page) =>
  page.locator('.product-grid').evaluate((grid) => {
    const columns = getComputedStyle(grid).gridTemplateColumns.split(' ').length
    const width = grid.getBoundingClientRect().width
    const rows = new Map<number, number[]>()
    for (const card of grid.children) {
      if (getComputedStyle(card).display === 'none') continue
      const box = card.getBoundingClientRect()
      const top = Math.round(box.top)
      const span = Math.round((box.width / width) * columns)
      rows.set(top, [...(rows.get(top) ?? []), Math.max(span, 1)])
    }
    return { columns, rows: [...rows.entries()].sort(([a], [b]) => a - b).map(([, row]) => row) }
  })

const namesOf = (key: string) =>
  LIVE_TEAMWEAR.filter(([, , sport]) => sport === key).map(([name]) => name)

test.describe('the sport buttons (polish S7)', () => {
  test('each button shows its sport’s garments, in order, and "All" brings every one back', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    await openHarness(page)
    for (const sport of TEAMWEAR_SPORTS) {
      await chip(page, sport.label).click()
      await expect(chip(page, sport.label).locator('input')).toBeChecked()
      expect(await shownNames(page), sport.label).toEqual(namesOf(sport.key))
    }
    await chip(page, 'All').click()
    expect(await shownNames(page)).toEqual(LIVE_TEAMWEAR.map(([name]) => name))
  })

  // 700px since polish M1: a phone has one column now, a tablet the two that lie a last card down.
  for (const width of [390, 700, 1280, 1440, 1920]) {
    test(`at ${width}px no sport leaves a card alone on its last row, or a hole above it (VA-42)`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 })
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await openHarness(page)
      const failures: string[] = []
      for (const sport of TEAMWEAR_SPORTS) {
        await chip(page, sport.label).click()
        const { columns, rows } = await shownRows(page)
        const count = namesOf(sport.key).length
        const filled = (row: number[] | undefined) =>
          (row ?? []).reduce((sum, span) => sum + span, 0) === columns
        const last = rows.at(-1) ?? []
        if (count > 1 && last.length < 2 && !filled(last))
          failures.push(`${sport.label} (${count}): last row ${JSON.stringify(last)}`)
        // Above the last row every row is full, but the one before it when the rule moved a card.
        const moved = columns >= 3 && count % columns === 1
        for (const row of rows.slice(0, moved ? -2 : -1)) {
          if (!filled(row))
            failures.push(`${sport.label} (${count}): a hole in ${JSON.stringify(rows)}`)
        }
      }
      expect(failures, `at ${width}px`).toEqual([])
    })
  }

  test('a screen reader hears one group, "Sport", of seven choices, each its sport and count', async ({
    page,
  }) => {
    await openHarness(page)
    const group = page.getByRole('group', { name: 'Sport' })
    const radios = group.getByRole('radio')
    await expect(radios).toHaveCount(TEAMWEAR_SPORTS.length + 1)
    await expect(group.getByRole('radio', { name: 'All 19' })).toBeChecked()
    for (const sport of TEAMWEAR_SPORTS) {
      const name = `${sport.label} ${namesOf(sport.key).length}`
      await expect(group.getByRole('radio', { name, exact: true }), name).not.toBeChecked()
    }
  })

  test('the keyboard: one stop reaches the chosen button, the arrows choose, the chip shows the ring', async ({
    page,
    browserName,
  }) => {
    await openHarness(page)
    const ring = (label: string) =>
      chip(page, label).evaluate((element) => getComputedStyle(element).outlineStyle)
    // From the top of a fresh page: the first stop is the chosen radio, as a radio group is ONE
    // stop. (Not after a click on the page's corner: Firefox then starts from the first chip's
    // words, which come after its radio, and skips the group. Measured 2026-10-05.)
    await page.keyboard.press(tabKey(browserName))
    await expect(page.getByRole('radio', { name: 'All 19' })).toBeFocused()
    expect(await ring('All'), 'the focused chip draws no ring').toBe('solid')
    await page.keyboard.press('ArrowRight')
    const soccer = page.getByRole('radio', { name: 'Soccer 4' })
    await expect(soccer).toBeFocused()
    await expect(soccer).toBeChecked()
    expect(await shownNames(page)).toEqual(namesOf('soccer'))
    // ⚠️ WebKit stops matching `:focus-visible` on a radio the arrow keys reach (measured
    // 2026-10-05, against the Selectors spec's keyboard heuristic), so the ring goes there; the
    // fill moves with the focus, which in a radio group is always on the chosen chip.
    if (browserName === 'webkit') {
      await expect(chip(page, 'Soccer')).toHaveCSS('background-color', 'rgb(205, 243, 69)')
    } else {
      expect(await ring('Soccer'), 'the focused chip draws no ring').toBe('solid')
    }
    // A second press leaves the group: no stop on each radio.
    await page.keyboard.press(tabKey(browserName))
    await expect(page.locator('.sport-filter__input:focus')).toHaveCount(0)
  })

  test('the chosen button is filled, not only coloured, and every chip passes contrast in both themes', async ({
    page,
  }) => {
    for (const scheme of ['light', 'dark'] as const) {
      // The chip fades its colours over `--ui`; read them, and let axe judge them, once settled.
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' })
      await openHarness(page)
      await chip(page, 'Cycling').click()
      await expect(chip(page, 'Cycling'), `${scheme}: the chosen chip`).toHaveCSS(
        'background-color',
        'rgb(205, 243, 69)',
      )
      await expect(chip(page, 'Soccer'), `${scheme}: a chip not chosen`).toHaveCSS(
        'background-color',
        'rgba(0, 0, 0, 0)',
      )
      const results = await new AxeBuilder({ page })
        .include('.sport-filter')
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze()
      expect(
        results.violations.map(
          (v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`,
        ),
        scheme,
      ).toEqual([])
    }
  })

  // Windows High Contrast repaints every fill and border: the choice must show by shape (VA-08).
  test('with the system’s colours forced, the chosen chip wears a ring and the others none', async ({
    page,
  }) => {
    await page.emulateMedia({ forcedColors: 'active', reducedMotion: 'reduce' })
    await openHarness(page)
    const forced = await page.evaluate(() => matchMedia('(forced-colors: active)').matches)
    test.skip(!forced, 'this engine cannot emulate forced colours')
    await chip(page, 'Training').click()
    await expect(chip(page, 'Training')).toHaveCSS('outline-style', 'solid')
    for (const label of ['All', 'Soccer', 'Water sports']) {
      await expect(chip(page, label), label).toHaveCSS('outline-style', 'none')
    }
  })

  // The filter is HTML and CSS. The page React drew, loaded with scripting off, filters the same.
  test('with scripting off, the buttons still filter', async ({ page, browser }) => {
    await openHarness(page)
    const drawn = await page.evaluate(() => document.documentElement.outerHTML)
    // Until stable, and any end tag (`</script >` too): the code scan, PR #128.
    const html = `<!doctype html>${stripUntilStable(drawn, /<script\b[\s\S]*?<\/script[^>]*>/gi, '')}`
    expect(html).not.toMatch(/<script/i)
    const context = await browser.newContext({ javaScriptEnabled: false })
    try {
      const still = await context.newPage()
      await still.route('**/__sport-still', (route) =>
        route.fulfill({ contentType: 'text/html', body: html }),
      )
      await still.goto(`${new URL(page.url()).origin}/__sport-still`)
      await chip(still, 'Tennis & pickleball').click()
      expect(await shownNames(still)).toEqual(namesOf('tennis-pickleball'))
      await chip(still, 'Water sports').click()
      expect(await shownNames(still)).toEqual(namesOf('water-sports'))
    } finally {
      await context.close()
    }
  })
})

// The harness is the real component; this holds the real page to it. CI's one garment is
// Sportswear, a family the owner did not divide, so its page draws the list with no buttons.
test('a buyer page of a family with no sports draws its garments with no buttons', async ({
  page,
}) => {
  await page.goto('/custom-activewear-manufacturer')
  const grid = page.locator('#garments .product-grid')
  if ((await grid.count()) === 0) {
    if (process.env.CI) throw new Error('CI seeds a Sportswear garment, so the page has a list')
    test.skip(true, 'no Sportswear garment in this local database')
  }
  await expect(grid.locator('.product-card').first()).toBeVisible()
  await expect(page.locator('.sport-filter, .sport-scope, [data-sport]')).toHaveCount(0)
})
