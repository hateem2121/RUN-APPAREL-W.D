import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { OG_CARDS } from './og-cards'
// Repo-root script, the same import path apps/cms/src/liveProducts.test.ts uses.
import { LIVE_PRODUCTS } from '../../../scripts/live-products.mjs'

/**
 * Keep the generated manifest and the files on disk in step, in BOTH directions.
 *
 * The Worker reads og-cards.ts at bundle time and never checks whether the file
 * it names is really there, because doing so would cost a subrequest on every
 * crawl. That makes two silent failures possible, and this test is the only thing
 * that catches either:
 *
 *   - a card listed here but missing from public/og/ → og:image 404s, and the
 *     platform shows a card with a broken picture;
 *   - a card in public/og/ but missing here → the JPEG ships and is never used,
 *     so the link falls back to the WebP poster and looks fine on Slack while
 *     showing nothing on LinkedIn.
 *
 * Neither is visible from the running site. Regenerate with `pnpm og:cards <slug>`
 * rather than editing the manifest by hand.
 */
const viewerRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const ogDir = join(viewerRoot, 'public', 'og')

/** Every `<product>/<colour>` under public/og/, i.e. what actually ships. */
function cardsOnDisk(): string[] {
  if (!existsSync(ogDir)) return []
  const found: string[] = []
  for (const product of readdirSync(ogDir)) {
    const productDir = join(ogDir, product)
    if (!statSync(productDir).isDirectory()) continue
    for (const file of readdirSync(productDir)) {
      if (file.endsWith('.jpg')) found.push(`${product}/${file.replace(/\.jpg$/, '')}`)
    }
  }
  return found.sort()
}

/** Minimal JPEG SOF scan — same approach as scripts/og.test.ts, no dependency. */
function jpegSize(path: string): { width: number; height: number } {
  const buf = readFileSync(path)
  for (let i = 2; i < buf.length - 9; ) {
    if (buf[i] !== 0xff) {
      i++
      continue
    }
    const marker = buf[i + 1]!
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) }
    }
    i += 2 + buf.readUInt16BE(i + 2)
  }
  return { width: 0, height: 0 }
}

describe('the preview-card manifest', () => {
  it('lists exactly the cards that are on disk', () => {
    expect(Object.keys(OG_CARDS).sort()).toEqual(cardsOnDisk())
  })

  it('ships at least one card, so the fallback path is not the only one in use', () => {
    // If this ever hits zero, every link has silently reverted to the WebP poster —
    // which LinkedIn and iMessage do not render at all.
    //
    // ⚠️ THIS COMMENT NAMED `N001` AS "live and shared with leads" UNTIL 2026-09-05.
    // `n001` 404s in production and has since the 2026-08-15 rename; the eleven live
    // slugs are in scripts/live-products.mjs. The test is sound — only the product
    // in its rationale was dead. `n001` remains correct inside e2e/serve.mjs, which
    // IS the fixture.
    expect(cardsOnDisk().length).toBeGreaterThan(0)
  })

  /**
   * ⚠️ THE TWO ASSERTIONS ABOVE CLOSE A LOOP THAT DOES NOT INCLUDE THE PRODUCTS.
   *
   * Manifest-vs-disk is checked in both directions, which is good and stays. But
   * until 2026-09-05 nothing compared either side to the list of live garments — so
   * a twelfth product published without running `pnpm og:cards <slug>` left manifest
   * and disk in perfect agreement, every test green, and that garment's five links
   * silently falling back to the generic card on WhatsApp, Slack, iMessage and every
   * search crawler.
   *
   * The `> 0` floor above was all that stood in for this, and a floor of one is not
   * a guard on fifty-five.
   */
  it('has a card for every live product and colourway, and nothing else', () => {
    // No cast: scripts/live-products.d.mts types this, so a renamed field fails
    // typecheck rather than silently becoming `any` and passing.
    const expected = LIVE_PRODUCTS.flatMap((p) => p.colourways.map((c) => `${p.slug}/${c}`)).sort()
    // Negative control: if either side came back empty the comparison below would be
    // empty-to-empty and would mean nothing.
    expect(expected.length, 'LIVE_PRODUCTS produced no expected cards').toBeGreaterThan(10)
    expect(Object.keys(OG_CARDS).length, 'the manifest is empty').toBeGreaterThan(10)

    const actual = Object.keys(OG_CARDS).sort()
    const missing = expected.filter((k) => !actual.includes(k))
    const extra = actual.filter((k) => !expected.includes(k))
    expect(
      { missing, extra },
      'The link-preview manifest and the live product list disagree.\n' +
        'MISSING means those garment links unfurl with the generic card instead of\n' +
        'the garment — run `pnpm og:cards <slug>` for each, then rebuild the manifest.\n' +
        'EXTRA means a card exists for a page that is no longer live.',
    ).toEqual({ missing: [], extra: [] })
  })

  it.each(Object.keys(OG_CARDS))('%s exists and is a real JPEG of the declared size', (key) => {
    const path = join(ogDir, `${key}.jpg`)
    expect(existsSync(path), `${path} is missing — og:image would 404`).toBe(true)
    // Not decoration: the manifest's numbers become og:image:width/height, which
    // crawlers use to lay the card out before the image arrives. A wrong value is
    // a lie that goes stale the moment a poster is re-rendered at another size.
    expect(jpegSize(path)).toEqual({ width: OG_CARDS[key]!.width, height: OG_CARDS[key]!.height })
  })

  it.each(Object.keys(OG_CARDS))('%s stays small enough for every client to fetch it', (key) => {
    // Measured 2026-08-08: N001's five cards are 62-75 KB at quality 76. The
    // ceiling is a wide guard against someone regenerating them uncompressed —
    // preview clients are the least forgiving fetchers there are, and a card
    // silently dropped for weight looks identical to no card at all.
    const bytes = statSync(join(ogDir, `${key}.jpg`)).size
    expect(bytes).toBeLessThan(300 * 1024)
  })
})
