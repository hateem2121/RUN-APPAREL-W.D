import { describe, expect, it } from 'vitest'
import {
  classifyLink,
  evaluate,
  extractLinks,
  mixedContentIn,
} from '../../../scripts/link-crawl-probe.mjs'

/**
 * Tests for the link-crawl probe (FI-12, broken links; SE-18, mixed content).
 *
 * FI-12: no crawler existed at all for this site — a broken link (a dead PDF, a stale
 * social URL, a footer fact that changed) was invisible until a person happened to click
 * it. SE-18 is folded in rather than built separately: this probe already downloads every
 * page's full body to find links, so checking those SAME bytes for an `http://` resource
 * costs nothing extra over the network.
 */

describe('extractLinks — pure, no network', () => {
  it('finds href and src attributes and resolves them against the page URL', () => {
    const html = `<a href="/products">Products</a><img src="/logo.png">`
    const links = extractLinks(html, 'https://wear-run.help/')
    expect(links).toContain('https://wear-run.help/products')
    expect(links).toContain('https://wear-run.help/logo.png')
  })

  it('finds mailto: and wa.me links', () => {
    const html = `<a href="mailto:partner@wear-run.com">Email</a><a href="https://wa.me/923361777313">WhatsApp</a>`
    const links = extractLinks(html, 'https://wear-run.help/')
    expect(links).toContain('mailto:partner@wear-run.com')
    expect(links).toContain('https://wa.me/923361777313')
  })

  it('finds sitemap <loc> entries', () => {
    const xml = `<urlset><url><loc>https://viewer.wear-run.help/rxps/wine</loc></url></urlset>`
    const links = extractLinks(xml, 'https://viewer.wear-run.help/sitemap.xml')
    expect(links).toContain('https://viewer.wear-run.help/rxps/wine')
  })

  it('finds Markdown links, e.g. llms.txt', () => {
    const md = 'See [/products](https://wear-run.help/products) for the catalogue.'
    const links = extractLinks(md, 'https://wear-run.help/llms.txt')
    expect(links).toContain('https://wear-run.help/products')
  })

  it('ignores #anchors, javascript: and data: URIs', () => {
    const html = `<a href="#top">Top</a><a href="javascript:void(0)">x</a><img src="data:image/png;base64,AAAA">`
    const links = extractLinks(html, 'https://wear-run.help/')
    expect(links).toEqual([])
  })

  it('de-duplicates', () => {
    const html = `<a href="/a">1</a><a href="/a">2</a>`
    const links = extractLinks(html, 'https://wear-run.help/')
    expect(links.filter((l) => l.endsWith('/a'))).toHaveLength(1)
  })

  it('does not throw on an unparseable relative reference', () => {
    expect(() =>
      extractLinks(`<a href="ht!tp://[bad">x</a>`, 'https://wear-run.help/'),
    ).not.toThrow()
  })
})

describe('classifyLink', () => {
  it('never follows a host outside the default crawlable set', () => {
    expect(classifyLink('https://www.linkedin.com/company/x')).toBe('external')
  })

  it('accepts an overridden crawlable-host set — needed to run the full crawl() against a LOCAL fixture in tests, never production', () => {
    expect(classifyLink('http://127.0.0.1:9999/page', new Set(['127.0.0.1']))).toBe('http')
    expect(classifyLink('http://127.0.0.1:9999/page')).toBe('external') // the real default still refuses it
  })
})

describe('mixedContentIn — pure, no network', () => {
  const PAGE = 'https://wear-run.help/'

  it('finds an http:// resource in an href or src', () => {
    const hits = mixedContentIn(`<img src="http://example.com/x.jpg">`, PAGE)
    expect(hits).toHaveLength(1)
    expect(hits[0]).toContain('http://example.com/x.jpg')
  })

  it('finds an http:// resource inside a <style> url()', () => {
    const hits = mixedContentIn(
      `<style>.a{background:url(http://example.com/bg.png)}</style>`,
      PAGE,
    )
    expect(hits).toHaveLength(1)
  })

  it('does NOT flag the sitemap XML namespace', () => {
    const hits = mixedContentIn(
      `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>`,
      PAGE,
    )
    expect(hits).toEqual([])
  })

  it('does NOT flag a JSON-LD @context URI', () => {
    const hits = mixedContentIn(
      `<script type="application/ld+json">{"@context":"http://purl.org/goodrelations/v1"}</script>`,
      PAGE,
    )
    expect(hits).toEqual([])
  })

  it('a clean page passes', () => {
    expect(mixedContentIn(`<a href="https://wear-run.help/products">ok</a>`, PAGE)).toEqual([])
  })
})

type LinkObservation = {
  kind: 'http' | 'mailto' | 'wa' | 'external'
  url: string
  foundOn?: string
  status?: number
  contentType?: string
  error?: string
}

const link = (over: Partial<LinkObservation> = {}): LinkObservation => ({
  kind: 'http',
  url: 'https://wear-run.help/products',
  status: 200,
  foundOn: 'https://wear-run.help/',
  ...over,
})

describe('evaluate — the healthy case', () => {
  it('passes a clean set of links', () => {
    const result = evaluate({ links: [link()], mixedContent: [] })
    expect(result.ok).toBe(true)
    expect(result.failures).toEqual([])
  })
})

describe('evaluate — negative controls', () => {
  it('FAILS a 404, naming the URL and where it was found', () => {
    const result = evaluate({ links: [link({ status: 404 })], mixedContent: [] })
    expect(result.ok).toBe(false)
    expect(result.failures[0]).toContain('https://wear-run.help/products')
    expect(result.failures[0]).toContain('https://wear-run.help/')
  })

  it('FAILS a malformed mailto: address', () => {
    const result = evaluate({
      links: [link({ kind: 'mailto', url: 'mailto:not-an-email', status: undefined })],
      mixedContent: [],
    })
    expect(result.ok).toBe(false)
  })

  it('passes a well-formed mailto: address with no network request', () => {
    const result = evaluate({
      links: [link({ kind: 'mailto', url: 'mailto:partner@wear-run.com', status: undefined })],
      mixedContent: [],
    })
    expect(result.ok).toBe(true)
  })

  it('FAILS a wa.me link with the wrong number', () => {
    const result = evaluate({
      links: [link({ kind: 'wa', url: 'https://wa.me/15551234567', status: undefined })],
      mixedContent: [],
    })
    expect(result.ok).toBe(false)
    expect(result.failures[0]).toContain('923361777313')
  })

  it('passes a wa.me link with the pinned number', () => {
    const result = evaluate({
      links: [link({ kind: 'wa', url: 'https://wa.me/923361777313', status: undefined })],
      mixedContent: [],
    })
    expect(result.ok).toBe(true)
  })

  it('FAILS mixed content, naming the page and the URL', () => {
    const result = evaluate({
      links: [link()],
      mixedContent: ['https://wear-run.help/: <img src="http://example.com/x.jpg">'],
    })
    expect(result.ok).toBe(false)
    expect(result.failures.some((f) => f.includes('http://example.com/x.jpg'))).toBe(true)
  })
})

describe('evaluate — what must NOT be read as a pass or a fail', () => {
  it('reads a 403/429/503 as inconclusive, never a failure', () => {
    for (const status of [403, 429, 503]) {
      const result = evaluate({ links: [link({ status })], mixedContent: [] })
      expect(result.failures).toEqual([])
      expect(result.inconclusive[0]).toContain(String(status))
    }
  })

  it('reads a network error as inconclusive', () => {
    const result = evaluate({
      links: [link({ status: undefined, error: 'fetch failed' })],
      mixedContent: [],
    })
    expect(result.failures).toEqual([])
    expect(result.inconclusive[0]).toContain('fetch failed')
  })

  it('reports every PDF and image content-type, even when it passes', () => {
    const result = evaluate({
      links: [link({ url: 'https://wear-run.help/catalogue.pdf', contentType: 'application/pdf' })],
      mixedContent: [],
    })
    expect(result.ok).toBe(true)
    expect(result.lines.join('\n')).toContain('application/pdf')
  })
})
