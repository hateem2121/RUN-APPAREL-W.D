import {
  COMPANY_PAGE_SOURCES,
  FAMILY_PAGE_SOURCES,
  FAQ_PAGE_SOURCES,
  GLOSSARY_PAGE_SOURCES,
  GUIDE_PAGE_SOURCES,
  POLICY_PAGE_SOURCES,
} from '../publicViewerHeaders.mjs'
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
  // The company pages, the FAQ and the glossary (2026-10-07).
  ...POLICY_PAGE_SOURCES,
  ...COMPANY_PAGE_SOURCES,
  ...FAQ_PAGE_SOURCES,
  ...GLOSSARY_PAGE_SOURCES,
  '/no-such-page',
] as const

/**
 * A listed word used in its plain sense, page by page, with the sentence that does it. The rule
 * treats "next generation" and "next-generation" alike on purpose; on /community it is the
 * owner's sentence about people ("Senior stitchers and cutters train the next generation",
 * approved 2026-10-07), found when the company pages joined this suite.
 */
const PLAIN_MEANING: Readonly<Record<string, readonly string[]>> = {
  '/community': ['next-generation', 'next-gen'],
}

// NEGATIVE CONTROL for the quote skip: it removes the quote and nothing else, so the same word
// planted in /about's own prose is still caught.
test('the buzzword check skips only the quoted mission', async ({ page }) => {
  await page.goto('/about')
  const copy = await page.evaluate(readCopyInPage)
  expect(copy.quoted, 'no quote was found, so the skip was not tested').toHaveLength(1)
  expect(findBuzzwords(copy.quoted[0] ?? ''), 'the quote no longer holds the word').toContain(
    'empower',
  )
  const planted = `${copy.body}\nWe empower every team.`
  const unquoted = copy.quoted.reduce((text, quote) => text.split(quote).join(' '), planted)
  expect(findBuzzwords(unquoted)).toEqual(['empower'])
})

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
    // The owner's quoted mission (`[data-quote]`) is kept word for word, so it is the one text
    // this check skips (owner, 2026-10-09). Removed by plain string, never a RegExp.
    const unquoted = copy.quoted.reduce((text, quote) => text.split(quote).join(' '), copy.body)
    expect(
      findBuzzwords(unquoted, { allow: [...(PLAIN_MEANING[path] ?? [])] }),
      'buzzwords in the copy (CT-03)',
    ).toEqual([])
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
 * `order` in CSS would draw the label first and leave a screen reader on the old order. The label's
 * verb became "Manufacturing since" on 2026-10-09 (owner), to match `LINEAGE`.
 */
for (const width of [390, 1280]) {
  test(`№01 reads "Manufacturing since 1889", and its other figure as it did, at ${width}px`, async ({
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
      words: ['Manufacturing since', '1889'],
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
  // One name each since polish X20 (the owner's answers Q9 and Q40, 2026-10-03): the buyer pages'
  // "Get a free quote" became "Start a conversation", and "Browse the references" "Browse in 3D".
  /^Start a conversation$/,
  /^Browse in 3D$/,
  /^Email \S+@\S+$/,
  /^Send inquiry$/,
  // The careers form's Send (owner, F23, 2026-10-07).
  /^Send application$/,
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

/**
 * Polish X20 (the owner's answers Q9 and Q40, 2026-10-03): one name for each action. The audit
 * counted six names for "talk to us" ("Get a free quote" 15 times, "Start an inquiry", …) and four
 * for the link to the 3D garments ("See the 3D references", "Browse the references", "See the
 * garments in 3D", "All products in 3D"). One name for each is what WCAG 3.2.4 (Consistent
 * Identification) asks of the same function on every page. The form's own "Send inquiry" sends,
 * and the email and WhatsApp links write; each is another action, so each keeps its name. Two
 * narrower links keep theirs too, as the audit's list did not name them: the 404's "Tell us what
 * you were looking for" (a ghost button beside the main one) and the garment pages' "See all
 * <category> in 3D" (the owner's words for one category's garments, VA-33, 2026-10-02).
 *
 * What would have to break: an old name back on any page, a main button to the inquiry form or
 * the footer's tab with another name, or a button or chip to the 3D garments with another name.
 */
const OLD_NAMES =
  /^(?:Get a free quote|Start an inquiry|See the 3D references|Browse the references|See the garments in 3D|All products in 3D)$/

test('X20 — the way to talk to us and the way to the 3D garments each have one name, on every page', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  let talk = 0
  let browse = 0
  for (const path of PAGES) {
    await page.goto(path)
    const links = await page.locator('main a, footer a').evaluateAll((all) =>
      all.map((element) => ({
        text: (
          element.querySelector('.site-footer__tab-label')?.textContent ??
          element.textContent ??
          ''
        )
          .trim()
          .replace(/\s+/g, ' '),
        href: element.getAttribute('href') ?? '',
        kind: element.classList.contains('btn--primary')
          ? 'main'
          : /\bbtn\b/.test(element.className)
            ? 'button'
            : element.classList.contains('site-footer__tab')
              ? 'tab'
              : element.classList.contains('filter-chip')
                ? 'chip'
                : 'link',
      })),
    )
    expect(
      links.filter((link) => OLD_NAMES.test(link.text)).map((link) => link.text),
      `${path}: an old name is back`,
    ).toEqual([])
    for (const link of links) {
      if (link.kind === 'link') continue
      if (
        (link.kind === 'main' || link.kind === 'tab') &&
        /^\/contact(?:#inquiry)?$/.test(link.href)
      ) {
        talk++
        expect(link.text, `${path}: a way to the form named otherwise`).toBe('Start a conversation')
      }
      if (link.href === '/products' || link.href === '#garments') {
        browse++
        expect(link.text, `${path}: a way to the 3D garments named otherwise`).toBe('Browse in 3D')
      }
    }
  }
  // Not vacuous: the sweep met both actions, on many pages.
  expect(talk, 'no button to the inquiry form was found').toBeGreaterThanOrEqual(10)
  expect(browse, 'no link to the 3D garments was found').toBeGreaterThanOrEqual(5)
})
