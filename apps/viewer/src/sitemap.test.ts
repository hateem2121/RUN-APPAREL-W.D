import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
// Repo-root script, the same import path apps/cms/src/liveProducts.test.ts uses.
import { LIVE_PRODUCTS } from '../../../scripts/live-products.mjs'

/**
 * `public/sitemap.xml` is the ONLY machine-readable index of this product.
 *
 * The SPA has no links between garment pages by design — every visit starts at a QR
 * code on a physical tag — so if a page is not in this file, nothing on the internet
 * can find it.
 *
 * ⚠️ AND UNTIL 2026-09-05 NOTHING CHECKED IT. Two test files mentioned the sitemap
 * and neither read its contents. The file's own header names three sources it was
 * cross-checked against and calls a mismatch "the tell that this file has drifted
 * again" — a procedure a human has to remember to run.
 *
 * That procedure was not run on 2026-09-04, and the consequence was measured: the
 * file listed **10 URLs for 2 products while 11 were live**. Forty-five of fifty-five
 * pages were invisible to search, every gate stayed green, and it was found by an
 * audit rather than by CI.
 *
 * ⚠️ THIS TEST COMPARES FILES ON DISK AND MUST NEVER FETCH. The sitemap's header is
 * explicit that generating it at build time is refused on purpose: it would put a
 * network call to cms.wear-run.help on the critical path of every build, and a Bot
 * Fight Mode 403 from a runner would then fail builds that have nothing to do with
 * it. So the snapshot stays a snapshot; this closes the loop from the other side.
 *
 * What this can and cannot catch, stated honestly: it catches "the sitemap and the
 * list of live products disagree". It cannot catch "both are wrong about what the
 * CMS actually published" — nothing offline can. That half is closed after deploy by
 * `scripts/smoke-live-products.mjs`.
 */

const SITEMAP = join(import.meta.dirname, '..', 'public', 'sitemap.xml')
const ORIGIN = 'https://viewer.wear-run.help'

function sitemapUrls(source: string): string[] {
  return [...source.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1] ?? '').filter(Boolean)
}

function expectedUrls(): string[] {
  const out: string[] = []
  for (const product of LIVE_PRODUCTS) {
    for (const colourway of product.colourways) out.push(`${ORIGIN}/${product.slug}/${colourway}`)
  }
  return out
}

describe('sitemap.xml lists exactly the live product pages', () => {
  const source = readFileSync(SITEMAP, 'utf8')

  it('finds a real sitemap with real entries, so nothing below passes vacuously', () => {
    // A count, not a range: this is the negative control for the whole file. If the
    // parser returned [] for any reason, every set comparison below would compare
    // empty to empty and report success.
    expect(
      sitemapUrls(source).length,
      'no <loc> entries parsed out of sitemap.xml',
    ).toBeGreaterThan(10)
    expect(LIVE_PRODUCTS.length, 'LIVE_PRODUCTS is empty').toBeGreaterThan(0)
  })

  it('covers every live product and colourway, and nothing else', () => {
    const actual = sitemapUrls(source).sort()
    const expected = expectedUrls().sort()

    const missing = expected.filter((u) => !actual.includes(u))
    const extra = actual.filter((u) => !expected.includes(u))

    expect(
      { missing, extra },
      'sitemap.xml and scripts/live-products.mjs disagree.\n' +
        'MISSING means those pages are invisible to search — the exact 2026-09-04\n' +
        'incident, where 45 of 55 pages were unlisted and nothing went red.\n' +
        'EXTRA means the sitemap advertises a page that no longer exists.\n' +
        'Regenerate the snapshot per the recipe in the file header; do NOT make this\n' +
        'test fetch, and do NOT generate the sitemap at build time.',
    ).toEqual({ missing: [], extra: [] })
  })

  it('has one entry per page, with no duplicates', () => {
    const actual = sitemapUrls(source)
    const seen = new Set<string>()
    const duplicated: string[] = []
    for (const url of actual) {
      if (seen.has(url)) duplicated.push(url)
      seen.add(url)
    }
    expect(duplicated, 'the same URL is listed more than once').toEqual([])
    expect(actual).toHaveLength(expectedUrls().length)
  })

  it('every URL is absolute and on the viewer origin', () => {
    // A relative <loc> is invalid per the sitemap protocol and is silently ignored
    // by crawlers — the same failure shape as being absent, with none of the tell.
    const wrong = sitemapUrls(source).filter((u) => !u.startsWith(`${ORIGIN}/`))
    expect(wrong, 'a <loc> is relative or points at the wrong host').toEqual([])
  })

  it('the comparison can FAIL (negative control)', () => {
    // Without this, a change that broke `expectedUrls()` into returning [] would
    // make the assertion above compare empty to empty and pass forever.
    const actual = sitemapUrls(source).sort()
    const sabotaged = [...expectedUrls(), `${ORIGIN}/not-a-garment/not-a-colour`].sort()
    expect(actual).not.toEqual(sabotaged)
  })
})
