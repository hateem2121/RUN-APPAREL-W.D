import { expect, type Page, test } from '@playwright/test'
import { parseCssColour, relativeLuminance, toHex } from '../../../scripts/contrast-rules.mjs'

/**
 * Polish X25 (2026-10-05): in dark mode lime is kept for the page's big title and the buttons —
 * here, the garment's name. Every heading took `--headline` (volt in dark) until then; the other
 * headings are `--heading` now, the off-white of the page's text (packages/ui/src/tokens.css,
 * base.css). The website's half is apps/cms/e2e/darkHeadings.spec.ts.
 */

const VOLT = '#cdf345'
const INK = '#1d1f1a'
const OFF_WHITE = '#ecebe4'

const hex = (colour: string) => toHex(parseCssColour(colour).rgb)

/**
 * The garment page in `scheme`, once its related cards are drawn. ⚠️ Firefox loses an
 * `emulateMedia` made before the first navigation (apps/cms/e2e/legibility.spec.ts), so the page
 * is opened once first, and the theme it drew is then checked by its TEXT colour: on a phone the
 * paper is an image layer over a transparent body (footer.css), so the ground reads as no colour.
 * ⚠️ The cards' names are read only once their own stylesheet has applied (`overflow-wrap:
 * anywhere`, related-cards.css): before it arrives a name inherits the page's off-white text, and
 * would pass whatever the rule said.
 */
async function open(page: Page, scheme: 'light' | 'dark') {
  await page.goto('/n001/wine')
  await page.emulateMedia({ colorScheme: scheme })
  await page.goto('/n001/wine')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  const text = relativeLuminance(
    parseCssColour(await page.evaluate(() => getComputedStyle(document.body).color)).rgb,
  )
  if (scheme === 'dark') expect(text, 'the page did not draw dark').toBeGreaterThan(0.5)
  else expect(text, 'the page did not draw light').toBeLessThan(0.2)
  await expect(page.locator('.related__card')).toHaveCount(4)
  await expect
    .poll(() =>
      page
        .locator('.related__name')
        .first()
        .evaluate((el) => getComputedStyle(el).overflowWrap),
    )
    .toBe('anywhere')
}

/** Each kind of heading in `<main>`, as "#rrggbb words". */
const read = (page: Page) =>
  page
    .evaluate(() => {
      const drawn = (selector: string, part: 'color' | 'backgroundColor' = 'color') =>
        [...document.querySelectorAll(`main ${selector}`)].map((el) => ({
          text: (el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 40),
          colour: getComputedStyle(el)[part],
        }))
      return {
        title: drawn('h1.display--hero'),
        headlines: drawn('.display:not(.display--hero)'),
        cards: drawn('.related__name'),
        buttons: drawn('.btn--primary', 'backgroundColor'),
      }
    })
    .then((m) =>
      Object.fromEntries(
        Object.entries(m).map(([kind, list]) => [
          kind,
          list.map(({ text, colour }) => `${hex(colour)} ${text}`),
        ]),
      ),
    )

/** Every entry of `list` drawn in `colour`, with its own words. */
const all = (list: string[] | undefined, colour: string) =>
  (list ?? []).map((entry) => `${colour}${entry.slice(7)}`)

test.describe('X25 — in dark mode only the garment’s name and the buttons are lime', () => {
  test('dark: the name lime; the section headlines and the cards’ names off-white; the buttons lime', async ({
    page,
  }) => {
    await open(page, 'dark')
    const m = await read(page)
    expect(m.title?.length, 'no garment name').toBe(1)
    expect(m.title).toEqual(all(m.title, VOLT))
    // Customization, More from this category, Start the conversation.
    expect(m.headlines?.length, 'no section headlines').toBeGreaterThanOrEqual(3)
    expect(m.headlines).toEqual(all(m.headlines, OFF_WHITE))
    expect(m.cards).toEqual(all(m.cards, OFF_WHITE))
    expect(m.buttons?.length, 'no primary button').toBeGreaterThanOrEqual(1)
    expect(m.buttons).toEqual(all(m.buttons, VOLT))

    // NEGATIVE CONTROL: the rule of before X25, every heading `--headline`, turns them lime again.
    await page.addStyleTag({
      content: '.display, .related__name { color: var(--headline) !important; }',
    })
    await expect
      .poll(async () => (await read(page)).cards?.[0], {
        message: 'the reading did not see the planted lime',
      })
      .toBe(all(m.cards, VOLT)[0])
  })

  test('light mode is unchanged: every heading ink, the buttons ink', async ({ page }) => {
    await open(page, 'light')
    const m = await read(page)
    for (const kind of ['title', 'headlines', 'cards', 'buttons']) {
      expect(m[kind]?.length, `no ${kind}`).toBeGreaterThanOrEqual(1)
      expect(m[kind], kind).toEqual(all(m[kind], INK))
    }
  })
})
