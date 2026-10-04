import { expect, type Page, test } from './offlineMedia'
import { parseCssColour, relativeLuminance, toHex } from '../../../scripts/contrast-rules.mjs'

/**
 * Polish X25 (2026-10-05): in dark mode lime is kept for the page's big title and the buttons.
 *
 * Every heading took `--headline` (volt in dark) until then, so a dark guide page showed its title,
 * each section headline and every small heading ("Air courier", "Sea freight") in lime, and on a
 * long page the lime stopped pointing at anything (audit of 3 October; the owner's answer Q12).
 * Every other heading is `--heading` now, the off-white of the page's text; the serif accent word
 * keeps volt, the dark twin of its olive in light mode (packages/ui/src/tokens.css, base.css).
 */

const VOLT = '#cdf345'
const VOLT_DEEP = '#5f7414'
const INK = '#1d1f1a'
const OFF_WHITE = '#ecebe4'

/** The guide the audit photographed: its small headings are "Air courier" and "Sea freight". */
const GUIDE = '/guides/shipping-and-import-duties'

const hex = (colour: string) => toHex(parseCssColour(colour).rgb)

/**
 * Open `path` in `scheme`. ⚠️ Firefox loses an `emulateMedia` made before the first navigation
 * (legibility.spec.ts, measured 2026-09-07), so the page is opened once first; the theme it drew is
 * then checked by its text colour, so a page that stayed light cannot pass as dark. (Not by the
 * ground: on a phone the paper is an image layer over a transparent body, footer.css.)
 */
async function open(page: Page, path: string, scheme: 'light' | 'dark') {
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto(path)
  await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' })
  await page.goto(path)
  const text = relativeLuminance(
    parseCssColour(await page.evaluate(() => getComputedStyle(document.body).color)).rgb,
  )
  if (scheme === 'dark') expect(text, 'the page did not draw dark').toBeGreaterThan(0.5)
  else expect(text, 'the page did not draw light').toBeLessThan(0.2)
}

/**
 * Each kind of heading in `<main>`, with the colour it is drawn in. The home page's featured figure
 * ("100,000" in "Numbers you can hold us to") is display type but no heading: like the accent word
 * it takes the accent colour, `--dimension` (olive in light, volt in dark), so it is read apart.
 */
const read = (page: Page) =>
  page.evaluate(() => {
    const FEATURE = '.fact--feature .fact__value'
    const drawn = (selector: string, part: 'color' | 'backgroundColor' = 'color') =>
      [...document.querySelectorAll(`main ${selector}`)]
        .filter((el) => selector === FEATURE || !el.matches(FEATURE))
        .map((el) => ({
          text: (el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 40),
          colour: getComputedStyle(el)[part],
        }))
    return {
      titles: drawn('h1.display--hero'),
      headlines: drawn('.display:not(.display--hero)'),
      small: drawn('.product-card__name'),
      accents: drawn('.display--section .serif-accent'),
      feature: drawn(FEATURE),
      buttons: drawn('.btn--primary', 'backgroundColor'),
    }
  })

/** Every colour in `list` as #rrggbb, beside its words, for a failure message that names them. */
const colours = (list: { text: string; colour: string }[]) =>
  list.map(({ text, colour }) => `${hex(colour)} ${text}`)

test.describe('X25 — in dark mode only the big title and the buttons are lime', () => {
  test('a guide: the title lime, its section headlines and small headings off-white, the button lime', async ({
    page,
  }) => {
    await open(page, GUIDE, 'dark')
    const m = await read(page)
    expect(m.titles.length, 'no big title').toBe(1)
    expect(colours(m.titles)).toEqual(m.titles.map(({ text }) => `${VOLT} ${text}`))
    expect(m.headlines.length, 'no section headlines').toBeGreaterThanOrEqual(2)
    expect(colours(m.headlines)).toEqual(m.headlines.map(({ text }) => `${OFF_WHITE} ${text}`))
    // The audit's own example is among the small headings measured.
    expect(m.small.map(({ text }) => text)).toContain('Air courier')
    expect(colours(m.small)).toEqual(m.small.map(({ text }) => `${OFF_WHITE} ${text}`))
    expect(m.buttons.length, 'no primary button').toBeGreaterThanOrEqual(1)
    expect(colours(m.buttons)).toEqual(m.buttons.map(({ text }) => `${VOLT} ${text}`))

    // NEGATIVE CONTROL: the rule of before X25, every heading `--headline`, turns them lime again.
    await page.addStyleTag({
      content: '.display, .product-card__name { color: var(--headline) !important; }',
    })
    await expect
      .poll(async () => colours((await read(page)).small)[0], {
        message: 'the reading did not see the planted lime',
      })
      .toBe(`${VOLT} ${m.small[0]?.text}`)
  })

  test('the home page: section headlines and figures off-white, the accent words and the featured figure lime; the hero title lime', async ({
    page,
  }) => {
    await open(page, '/', 'dark')
    const m = await read(page)
    expect(colours(m.titles)).toEqual([`${VOLT} ${m.titles[0]?.text}`])
    expect(m.headlines.length, 'no section headlines').toBeGreaterThanOrEqual(3)
    expect(colours(m.headlines)).toEqual(m.headlines.map(({ text }) => `${OFF_WHITE} ${text}`))
    expect(m.accents.length, 'no accent word in a section headline').toBeGreaterThanOrEqual(1)
    expect(colours(m.accents)).toEqual(m.accents.map(({ text }) => `${VOLT} ${text}`))
    expect(colours(m.feature)).toEqual([`${VOLT} ${m.feature[0]?.text}`])
  })

  test('the privacy notice’s part headings and the garment cards’ names: off-white', async ({
    page,
  }) => {
    await open(page, '/privacy', 'dark')
    const legal = await read(page)
    expect(legal.small.length, 'no part headings').toBeGreaterThanOrEqual(5)
    expect(colours(legal.small)).toEqual(legal.small.map(({ text }) => `${OFF_WHITE} ${text}`))

    // The cards share the class, and are measured where there are any: CI's database has no
    // garments (10 here, 0 there; pages.spec.ts says why).
    await page.goto('/products')
    const cards = await read(page)
    if (cards.small.length === 0) {
      test.info().annotations.push({ type: 'X25', description: 'no garment cards here' })
      return
    }
    expect(colours(cards.small)).toEqual(cards.small.map(({ text }) => `${OFF_WHITE} ${text}`))
  })

  test('light mode is unchanged: every heading ink, the accent olive, the button ink', async ({
    page,
  }) => {
    await open(page, GUIDE, 'light')
    const m = await read(page)
    for (const list of [m.titles, m.headlines, m.small]) {
      expect(list.length).toBeGreaterThanOrEqual(1)
      expect(colours(list)).toEqual(list.map(({ text }) => `${INK} ${text}`))
    }
    expect(colours(m.buttons)).toEqual(m.buttons.map(({ text }) => `${INK} ${text}`))

    // The home page's photo hero is dark in both themes, so its title stays lime in light mode;
    // the accent words and the featured figure below it are olive.
    await page.goto('/')
    const home = await read(page)
    expect(colours(home.titles)).toEqual([`${VOLT} ${home.titles[0]?.text}`])
    expect(colours(home.accents)).toEqual(home.accents.map(({ text }) => `${VOLT_DEEP} ${text}`))
    expect(colours(home.feature)).toEqual([`${VOLT_DEEP} ${home.feature[0]?.text}`])
  })
})
