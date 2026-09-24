import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  classifyLink,
  crawl,
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

/**
 * `measured` — the guard against reporting "✓ 0 broken links" while having crawled
 * nothing at all. It counts every http-kind link that got a real, judged answer
 * (neither a fetch error nor 403/429/503), WHETHER IT PASSED OR FAILED — a 404 still
 * counts, because the probe asked a question and got an answer.
 */
describe('evaluate — measured must never read a blocked run as "0 broken links"', () => {
  it('measured=0 when the only observation is inconclusive — this is the ::warning:: condition, and it must still be ok:true', () => {
    const result = evaluate({
      links: [link({ status: 403, foundOn: '(entry point)' })],
      mixedContent: [],
    })
    expect(result.ok).toBe(true) // ok means "no FAILURES", not "everything was measured"
    expect(result.measured).toBe(0)
  })

  it('a FAILED http link still counts as measured — the probe got a real answer, it was just a bad one', () => {
    const result = evaluate({ links: [link({ status: 404 })], mixedContent: [] })
    expect(result.measured).toBe(1)
  })

  it('a passing http link counts as measured too', () => {
    const result = evaluate({ links: [link()], mixedContent: [] })
    expect(result.measured).toBe(1)
  })
})

/**
 * `crawl()` itself — every entry point is judged like any other link, mining only
 * follows a healthy (2xx) body, and a stubbed `fetch` proves both directions without
 * touching production. Never a real network call.
 */
describe('crawl — entry points are judged, not silently skipped', () => {
  const LOCAL_HOST = new Set(['127.0.0.1'])

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('a seed answering 404 is reported as its own failure, not silently skipped', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response('<a href="http://127.0.0.1/should-not-be-mined">x</a>', { status: 404 }),
      ),
    )
    const observed = await crawl(['http://127.0.0.1/broken-sitemap.xml'], {
      crawlableHosts: LOCAL_HOST,
    })
    expect(observed.links).toEqual([
      expect.objectContaining({ url: 'http://127.0.0.1/broken-sitemap.xml', status: 404 }),
    ])
    const result = evaluate(observed)
    expect(result.ok).toBe(false)
    expect(result.failures[0]).toContain('http://127.0.0.1/broken-sitemap.xml')
  })

  it('a seed answering 403 is inconclusive and its body is never mined for links (a Bot-Fight-Mode challenge page is not the site)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response('<a href="http://127.0.0.1/should-not-be-mined">x</a>', { status: 403 }),
      ),
    )
    const observed = await crawl(['http://127.0.0.1/challenge'], { crawlableHosts: LOCAL_HOST })
    // The seed itself only — nothing mined from a body behind a non-2xx status.
    expect(observed.links).toHaveLength(1)
    expect(observed.links[0]).toMatchObject({ url: 'http://127.0.0.1/challenge', status: 403 })
    const result = evaluate(observed)
    expect(result.ok).toBe(true) // inconclusive, never a failure
    expect(result.measured).toBe(0)
    expect(result.inconclusive[0]).toContain('403')
  })

  it('a healthy 200 seed is measured, and its links are mined and followed', async () => {
    // A RELATIVE href, deliberately — matching how the real site actually links to
    // itself, and sidestepping `mixedContentIn`'s own separately-tracked nit (it flags
    // any literal `http://` attribute, so an absolute same-host link over plain HTTP —
    // unavoidable for a local, unencrypted fixture server — would misreport as mixed
    // content here, which this test is not about).
    const bodies = new Map([
      ['http://127.0.0.1/', '<a href="/products">Products</a>'],
      ['http://127.0.0.1/products', 'ok'],
    ])
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url) => {
        const body = bodies.get(String(url))
        if (body === undefined) return new Response('not found', { status: 404 })
        return new Response(body, { status: 200, headers: { 'content-type': 'text/html' } })
      }),
    )
    const observed = await crawl(['http://127.0.0.1/'], { crawlableHosts: LOCAL_HOST })
    const result = evaluate(observed)
    expect(result.ok).toBe(true)
    expect(result.measured).toBe(2) // the seed itself, plus the one link it led to
    expect(observed.links).toContainEqual(
      expect.objectContaining({ url: 'http://127.0.0.1/products', status: 200 }),
    )
  })
})
