import { expect, test } from '@playwright/test'
import {
  findBritishSpellings,
  findBuzzwords,
  findEmoji,
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
const PAGES = ['/', '/products', '/contact', '/privacy', '/terms', '/no-such-page'] as const

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
  test('1889 reads as a family trade, never "EST. LINEAGE", and minimum order and lead time are shown', async ({
    page,
  }) => {
    await page.goto('/')
    // textContent, not innerText: CSS sets some labels in capitals, and this checks the words.
    const text = (await page.locator('main').textContent()) ?? ''
    expect(text).toContain('1889')
    expect(text).not.toMatch(/EST\.?\s*LINEAGE/i)
    for (const label of ['Minimum order, per style', 'Days, approved sample to shipment']) {
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
