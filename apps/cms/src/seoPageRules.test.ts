import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  checkPage,
  checkSite,
  DESCRIPTION_MAX,
  readPage,
  sitemapUrls,
  TITLE_MAX,
} from '../../../scripts/seo-page-rules.mjs'

/**
 * The rules behind `scripts/seo-crawl.mjs`, the free stand-in for a desktop site crawler
 * (owner's choice, 2026-09-30).
 *
 * ⚠️ EVERY RULE IS PROVEN BOTH WAYS: a good page yields nothing, and the same page with ONE
 * defect planted yields exactly that finding. A checker that has never caught a defect is
 * not known to work, and the defect that prompted this file (a garment page whose body held
 * no heading for a robot, while every gate was green) is the first one planted, against the
 * REAL viewer shell rather than a hand-written string.
 */
const REPO_ROOT = join(import.meta.dirname, '..', '..', '..')
const viewerShell = readFileSync(join(REPO_ROOT, 'apps', 'viewer', 'index.html'), 'utf8')

const URL_ = 'https://wear-run.com/products/rxps/wine'
const good = (over: { head?: string; body?: string; html?: string } = {}) =>
  `<!doctype html><html ${over.html ?? 'lang="en"'}><head>${
    over.head ??
    `<title>X-MILO PRO SKIN-SUIT — Wine | RUN APPAREL</title>
     <meta name="description" content="Race fit · 88% Nylon / 12% Spandex, 160 - 220 GSM. Shown in Wine. See all 5 colorways in 3D." />
     <meta property="og:image" content="https://wear-run.com/og/rxps/wine.jpg" />
     <link rel="canonical" href="${URL_}" />
     <script type="application/ld+json">{"@type":"Product","brand":{"@type":"Brand"}}</script>`
  }</head><body>${
    over.body ?? '<h1>X-MILO PRO SKIN-SUIT</h1><img src="/a.jpg" alt="The skinsuit in Wine" />'
  }</body></html>`

const rules = (html: string, status = 200, xRobotsTag: string | null = null) =>
  checkPage({ url: URL_, status, html, xRobotsTag }).map((finding) => finding.rule)

describe('a page that is right for search', () => {
  it('yields no finding at all (the control every rule below is measured against)', () => {
    expect(checkPage({ url: URL_, status: 200, html: good() })).toEqual([])
  })

  it('is read as a robot reads it: text decoded, comments ignored', () => {
    const read = readPage(
      good({
        body: '<!-- <h1>not a heading</h1> --><h1>Teamwear &amp; <em>Uniforms</em></h1>',
      }),
    )
    expect(read.h1).toEqual(['Teamwear & Uniforms'])
    expect(read.title).toBe('X-MILO PRO SKIN-SUIT — Wine | RUN APPAREL')
    expect(read.jsonLdTypes).toEqual(['Product', 'Brand'])
    expect(read.lang).toBe('en')
  })
})

describe('the defect this file was written for', () => {
  /*
   * Measured live 2026-09-30: the viewer's shell, handed to a robot with a rewritten head
   * and an untouched body. No `<h1>` anywhere outside a comment.
   */
  it('the real viewer shell has no heading for a robot, and the rule says so', () => {
    expect(readPage(viewerShell).h1).toEqual([])
    const withHead = viewerShell.replace(
      '</head>',
      `<link rel="canonical" href="${URL_}" /></head>`,
    )
    expect(rules(withHead)).toContain('h1-missing')
  })

  it('the same shell with the readable block appended inside #root passes that rule', () => {
    const withBody = viewerShell
      .replace('</head>', `<link rel="canonical" href="${URL_}" /></head>`)
      .replace(
        /<\/div>\s*<script type="module"/,
        '<article><h1>X-MILO PRO SKIN-SUIT</h1></article></div><script type="module"',
      )
    expect(readPage(withBody).h1).toEqual(['X-MILO PRO SKIN-SUIT'])
    expect(rules(withBody)).not.toContain('h1-missing')
  })
})

describe('one planted defect, one finding', () => {
  const head = (extra: string, drop?: RegExp) =>
    good({
      head: `${`<title>X-MILO PRO SKIN-SUIT — Wine | RUN APPAREL</title>
         <meta name="description" content="Race fit · 88% Nylon / 12% Spandex, 160 - 220 GSM. Shown in Wine. See all 5 colorways in 3D." />
         <meta property="og:image" content="https://wear-run.com/og/rxps/wine.jpg" />
         <link rel="canonical" href="${URL_}" />
         <script type="application/ld+json">{"@type":"Product"}</script>`.replace(
        drop ?? /$^/,
        '',
      )}${extra}`,
    })

  it.each([
    ['status', () => rules(good(), 404)],
    ['title-missing', () => rules(head('', /<title>[^<]*<\/title>/))],
    [
      'title-long',
      () => rules(head('').replace(/<title>[^<]*/, `<title>${'x'.repeat(TITLE_MAX + 1)}`)),
    ],
    ['description-missing', () => rules(head('', /<meta name="description"[^>]*>/))],
    [
      'description-long',
      () =>
        rules(
          head('').replace(/content="Race[^"]*"/, `content="${'y'.repeat(DESCRIPTION_MAX + 1)}"`),
        ),
    ],
    [
      'description-short',
      () => rules(head('').replace(/content="Race[^"]*"/, 'content="Too short."')),
    ],
    ['h1-missing', () => rules(good({ body: '<h2>Not a top heading</h2>' }))],
    ['h1-many', () => rules(good({ body: '<h1>One</h1><h1>Two</h1>' }))],
    ['h1-empty', () => rules(good({ body: '<h1> </h1>' }))],
    ['canonical-missing', () => rules(head('', /<link rel="canonical"[^>]*>/))],
    ['canonical-many', () => rules(head(`<link rel="canonical" href="${URL_}" />`))],
    [
      'canonical-elsewhere',
      () => rules(head('').replace(`href="${URL_}"`, 'href="https://wear-run.com/products"')),
    ],
    ['noindex', () => rules(head('<meta name="robots" content="noindex" />'))],
    ['noindex', () => rules(good(), 200, 'noindex, nofollow')],
    ['lang-missing', () => rules(good({ html: '' }))],
    ['image-alt', () => rules(good({ body: '<h1>A</h1><img src="/a.jpg" />' }))],
    ['og-image-missing', () => rules(head('', /<meta property="og:image"[^>]*>/))],
    ['og-image-relative', () => rules(head('').replace('https://wear-run.com/og', '/og'))],
    [
      'structured-data-missing',
      () => rules(head('', /<script type="application\/ld\+json">.*<\/script>/)),
    ],
  ])('%s', (rule, run) => {
    expect(run()).toEqual([rule])
  })

  it('a decorative image with alt="" is allowed; only a MISSING alt is a defect', () => {
    expect(rules(good({ body: '<h1>A</h1><img src="/a.svg" alt="" />' }))).toEqual([])
  })

  it('a trailing slash or a fragment on the canonical is the same page', () => {
    expect(rules(good().replace(`href="${URL_}"`, `href="${URL_}/"`))).toEqual([])
  })

  it('a page that does not answer 200 reports only that, not six follow-on findings', () => {
    expect(rules('<html></html>', 500)).toEqual(['status'])
  })
})

describe('across the site', () => {
  const page = (url: string, title: string, description: string) => ({
    url,
    status: 200,
    html: `<title>${title}</title><meta name="description" content="${description}" />`,
  })

  it('finds two pages sharing a title, and names both', () => {
    const findings = checkSite([
      page('https://wear-run.com/a', 'Same', 'One description that is unique to page a.'),
      page('https://wear-run.com/b', 'Same', 'Another description, unique to page b here.'),
      page('https://wear-run.com/c', 'Different', 'A third description, unique to page c.'),
    ])
    expect(findings).toHaveLength(1)
    expect(findings[0]).toMatchObject({
      rule: 'title-duplicate',
      level: 'error',
      urls: ['https://wear-run.com/a', 'https://wear-run.com/b'],
    })
  })

  it('finds a shared description as a warning, and nothing when every page differs', () => {
    expect(
      checkSite([
        page('https://x/a', 'A', 'Shared words.'),
        page('https://x/b', 'B', 'Shared words.'),
      ]),
    ).toMatchObject([{ rule: 'description-duplicate', level: 'warning' }])
    expect(checkSite([page('https://x/a', 'A', 'One.'), page('https://x/b', 'B', 'Two.')])).toEqual(
      [],
    )
  })

  it('ignores a page that did not answer 200, which has its own finding', () => {
    const broken = { ...page('https://x/b', 'A', 'One.'), status: 404 }
    expect(checkSite([page('https://x/a', 'A', 'One.'), broken])).toEqual([])
  })
})

describe('sitemapUrls', () => {
  it('lists the pages and not the pictures', () => {
    const xml = `<urlset><url><loc>https://wear-run.com</loc></url>
      <url><loc>https://wear-run.com/products/rxps/wine</loc>
      <image:image><image:loc>https://media.wear-run.com/rxps-wine.webp</image:loc></image:image></url>
      <url><loc>https://wear-run.com/products?a=1&amp;b=2</loc></url></urlset>`
    expect(sitemapUrls(xml)).toEqual([
      'https://wear-run.com',
      'https://wear-run.com/products/rxps/wine',
      'https://wear-run.com/products?a=1&b=2',
    ])
  })
})
