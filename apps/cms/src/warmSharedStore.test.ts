import { describe, expect, it } from 'vitest'
import { storeVerdict, summarize, warmTargets } from '../../../scripts/warm-shared-store.mjs'

/**
 * The post-deploy warm-up (W1-A, 2026-10-24): after each deploy Workers Cache starts empty for the
 * new Worker version, so CI asks once for everything SitePages keeps, and the first buyer meets a
 * full store. It must never fail a deploy, and it must ask for the right addresses.
 */

const SITEMAP = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
<url><loc>https://wear-run.com/</loc></url>
<url><loc>https://wear-run.com/products</loc></url>
<url><loc>https://wear-run.com/products/rxps/wine</loc></url>
<url><loc>https://wear-run.com/products/r-avn/navy</loc></url>
<url><loc>https://wear-run.com/guides/garment-printing-methods</loc></url>
<url><loc>https://wear-run.com/privacy</loc></url>
</urlset>`

describe('what the warm-up asks for', () => {
  const targets = warmTargets(SITEMAP)

  it('every website page in the sitemap, and the three kept files', () => {
    expect(targets.pages).toEqual([
      'https://wear-run.com/',
      'https://wear-run.com/products',
      'https://wear-run.com/guides/garment-printing-methods',
      'https://wear-run.com/privacy',
      'https://wear-run.com/llms.txt',
      'https://wear-run.com/robots.txt',
    ])
  })

  // Garment pages are drawn by the viewer Worker, not SitePages; their DATA is what SitePages keeps.
  it('the garment data behind each garment page, never the garment page itself', () => {
    expect(targets.garments).toEqual([
      'https://cms.wear-run.help/api/public/viewer/rxps/wine',
      'https://cms.wear-run.help/api/public/viewer/r-avn/navy',
    ])
    expect(targets.pages.some((url) => /\/products\/[^/]+/.test(url))).toBe(false)
  })

  it('ignores addresses on any other host', () => {
    const other = SITEMAP.replace('https://wear-run.com/privacy', 'https://example.com/privacy')
    expect(warmTargets(other).pages).not.toContain('https://example.com/privacy')
  })

  it('asks for nothing when the sitemap is empty or not a sitemap', () => {
    expect(warmTargets('').pages).toEqual([])
    expect(warmTargets('<html>Just a moment…</html>').garments).toEqual([])
  })
})

describe('what each answer says', () => {
  it.each<[string, number, string, string]>([
    ['a store hit', 200, 'page-cache;desc="hit"', 'hit'],
    ['a fresh drawing', 200, 'page-cache;desc="miss"', 'miss'],
    ['a refused copy', 200, 'api-cache;desc="skip"', 'skip'],
    ['a file with no timing', 200, '', 'ok'],
    ['Bot Fight Mode', 403, '', 'inconclusive'],
    ['a rate limit', 429, '', 'inconclusive'],
    ['an outage', 503, '', 'inconclusive'],
    ['a broken page', 500, 'page-cache;desc="skip"', 'error'],
    ['a missing garment', 404, 'api-cache;desc="skip"', 'error'],
  ])('%s → %s', (_label, status, timing, verdict) => {
    expect(storeVerdict(status, timing)).toBe(verdict)
  })

  it('a network failure is inconclusive, never an error', () => {
    expect(storeVerdict(0, '')).toBe('inconclusive')
  })
})

describe('the summary', () => {
  it('counts each verdict and warns about errors, but never fails', () => {
    const report = summarize([
      { url: 'a', verdict: 'hit' },
      { url: 'b', verdict: 'miss' },
      { url: 'c', verdict: 'error' },
      { url: 'd', verdict: 'inconclusive' },
    ])
    expect(report.counts).toEqual({ hit: 1, miss: 1, skip: 0, ok: 0, inconclusive: 1, error: 1 })
    expect(report.warnings.join(' ')).toContain('c')
    expect(report.exitCode).toBe(0)
  })
})
