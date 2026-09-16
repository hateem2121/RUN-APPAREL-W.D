import { expect, test } from '@playwright/test'
import {
  findBritishSpellings,
  findBuzzwords,
  findEmoji,
  readCopyInPage,
} from '../../../scripts/copy-rules.mjs'

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
