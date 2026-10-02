import { FAMILY_PAGE_SOURCES, GUIDE_PAGE_SOURCES } from '../publicViewerHeaders.mjs'
import { expect, test } from './offlineMedia'
import {
  findBritishSpellings,
  findBuzzwords,
  findEmoji,
  primaryActionsInPage,
  readCopyInPage,
} from '../../../scripts/copy-rules.mjs'
import { FACTS } from '../src/lib/companyFacts'

/**
 * The copy rules, on every page of the site a visitor can reach — the 404 included.
 *
 * The rules live in `scripts/copy-rules.mjs` so this suite, the viewer's, the unit tests
 * and the live check all read ONE list. `readCopyInPage` also decodes pre-filled mailto
 * and WhatsApp text: a template is copy a visitor sends, and `innerText` never sees it.
 */
const PAGES = [
  '/',
  '/products',
  '/contact',
  '/privacy',
  '/terms',
  ...FAMILY_PAGE_SOURCES,
  ...GUIDE_PAGE_SOURCES,
  '/no-such-page',
] as const

for (const path of PAGES) {
  test(`copy rules hold on ${path}`, async ({ page }) => {
    await page.goto(path)
    const copy = await page.evaluate(readCopyInPage)
    expect(
      copy.body.length,
      'the page rendered almost no text, so every rule below would pass',
    ).toBeGreaterThan(200)
    expect(
      copy.headings.flatMap((heading) => findEmoji(heading)),
      'emoji in a heading (CT-01)',
    ).toEqual([])
    expect(findBuzzwords(copy.body), 'buzzwords in the copy (CT-03)').toEqual([])
    expect(
      findBritishSpellings([copy.body, ...copy.decoded].join('\n')),
      'British spelling in visible or pre-filled text (CT-05)',
    ).toEqual([])
  })
}

test.describe('the 1889 wording and the confirmed numbers on the home page (CT-06, decision D14)', () => {
  test('1889 is stated, never "EST. LINEAGE", and the minimum order is shown', async ({ page }) => {
    await page.goto('/')
    // textContent, not innerText: CSS sets some labels in capitals, and this checks the words.
    const text = (await page.locator('main').textContent()) ?? ''
    expect(text).toContain('1889')
    expect(text).not.toMatch(/EST\.?\s*LINEAGE/i)
    // "Days, approved sample to shipment" was removed by the owner on 2026-09-29 ("days may
    // vary order to order"); `companyFacts.test.ts` refuses it coming back.
    for (const label of ['Minimum order, per style']) {
      const fact = FACTS.find((f) => f.label === label)
      expect(
        fact,
        `companyFacts.ts no longer has "${label}" — ask the owner before changing this test`,
      ).toBeDefined()
      expect(text).toContain(label)
      expect(text).toContain(fact?.value ?? 'missing value')
    }
  })
})

/**
 * VA-58 (visual audit 2026-10-02, the owner's decision): №01's first figure read "1889" over "MAKING
 * CLOTHES SINCE", so in order it said "1889, making clothes since". The label is now first in the
 * MARKUP and above the year on screen, with the same words; the neighbour ("One" over "Building,
 * first stitch to sealed bag") keeps its order. Both are measured because they must agree: an
 * `order` in CSS would draw the label first and leave a screen reader on the old order.
 */
for (const width of [390, 1280]) {
  test(`№01 reads "Making clothes since 1889", and its other figure as it did, at ${width}px`, async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/')
    const facts = page.locator('.about__points .fact')
    await expect(facts, 'the №01 figures were not found, so nothing was measured').toHaveCount(2)
    const read = (index: number) =>
      facts.nth(index).evaluate((fact) => {
        const [first, second] = [...fact.children] as HTMLElement[]
        const above =
          (first?.getBoundingClientRect().bottom ?? 0) <=
          (second?.getBoundingClientRect().top ?? 0) + 0.5
        return {
          // textContent, not innerText: CSS sets these in capitals, and this checks the words.
          words: [first?.textContent, second?.textContent],
          markup: [
            first?.className.includes('fact__label') ? 'label' : 'value',
            second?.className.includes('fact__label') ? 'label' : 'value',
          ],
          firstIsAbove: above,
        }
      })
    expect(
      await read(0),
      'the 1889 figure does not read label first, in markup and on screen',
    ).toEqual({
      words: ['Making clothes since', '1889'],
      markup: ['label', 'value'],
      firstIsAbove: true,
    })
    expect(await read(1), 'the second figure changed its order').toEqual({
      words: ['One', 'Building, first stitch to sealed bag'],
      markup: ['value', 'label'],
      firstIsAbove: true,
    })
  })
}

/**
 * CT-08: one primary action per screen, and only agreed labels. The list is what the pages
 * carried on 2026-09-15 — a new primary button is a design decision, so adding one means
 * adding its label here on purpose. A screen is one viewport-high slice of the page; the
 * same destination repeated counts once.
 */
const PRIMARY_LABELS = [
  /^Start a conversation$/,
  /^Browse the references$/,
  /^Email \S+@\S+$/,
  /^Send inquiry$/,
  // The buyer pages' one action (owner approved the page and its button, 2026-09-30).
  /^Get a free quote$/,
]

for (const viewport of [
  { width: 390, height: 844 },
  { width: 1440, height: 900 },
]) {
  test(`one primary action per screen at ${viewport.width}px (CT-08)`, async ({ page }) => {
    await page.setViewportSize(viewport)
    for (const path of PAGES) {
      await page.goto(path)
      const { primaries, windows } = await page.evaluate(primaryActionsInPage)
      for (const { label } of primaries) {
        expect(
          PRIMARY_LABELS.some((pattern) => pattern.test(label)),
          `"${label}" on ${path} is not an agreed primary action`,
        ).toBe(true)
      }
      for (const { top, destinations } of windows) {
        expect(
          destinations.length,
          `${path} at ${viewport.width}px: the screen starting at ${top}px leads to ${destinations.join(' + ')}`,
        ).toBeLessThanOrEqual(1)
      }
    }
  })
}
