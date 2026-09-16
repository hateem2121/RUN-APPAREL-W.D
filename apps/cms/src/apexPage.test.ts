import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DOCUMENTS } from '../../../infra/apex-404/documents.js'
import {
  CONTACT_URL,
  MESSAGE_BODY,
  MESSAGE_HEADLINE,
  PRIVACY_URL,
  STYLE,
  TOKENS,
  contentSecurityPolicy,
  megabytes,
  renderDocumentPage,
  renderMessagePage,
} from '../../../infra/apex-404/page.js'

/**
 * The document page and the "not active" page. Both are built by the Worker itself, so
 * `_headers` never reaches them (root CLAUDE.md, apps/viewer/CLAUDE.md) — everything a
 * browser needs is asserted here.
 *
 * ⚠️ NO SCRIPT AND NO E-MAIL ADDRESS, EVER. The CSP forbids scripts, and this zone's
 * e-mail obfuscation injects one wherever it sees an address. Either would ship a page
 * that silently breaks its own policy.
 *
 * ⚠️ A MARKER IS AN <img> TOO (owner decision D32, 2026-09-15). Every page after the first
 * ends in an invisible `class="seen"` picture whose lazy request tells the Worker how far
 * someone read. Assertions about the document's pictures read `pictures`, which leaves the
 * markers out: `imgs[4]` would otherwise be page 2's marker, not page 3's picture.
 */
const CODE = 'zzzz-yyyy-xxxx-wwww-vvvv-uuuu'
const part = (id: string, width = 2400, height = 1350) => ({ id, width, height })
const manifest = {
  schema: 1 as const,
  document: 'catalogue',
  version: '20260911-e8698731',
  widths: [800, 1600, 2400],
  pdf: {
    key: 'RUN PRODUCT CATALOUGE.pdf',
    bytes: 54_336_461,
    md5: 'e8698731ac2348595c3268dfd6d466c6',
  },
  pages: [
    { number: 1, parts: [part('p001a'), part('p001b')] },
    { number: 2, parts: [part('p002a'), part('p002b')] },
    { number: 3, parts: [part('p003w', 4800)] },
  ],
}
const html = renderDocumentPage({ doc: DOCUMENTS.catalogue, manifest, code: CODE })
const message = renderMessagePage()
const imgs = [...html.matchAll(/<img [^>]*>/g)].map((m) => m[0])
/** The reading markers in a rendered page, in page order. */
const markersIn = (page: string) => [...page.matchAll(/<img class="seen"[^>]*>/g)].map((m) => m[0])
const markers = markersIn(html)
const pictures = imgs.filter((img) => !img.startsWith('<img class="seen"'))
/** Exactly what page.js must print at the foot of page `n`. */
const marker = (n: number) =>
  `<img class="seen" src="/${CODE}/seen/${n}" alt="" aria-hidden="true" width="1" height="1" loading="lazy" decoding="async" fetchpriority="low">`
const download = `<a class="button" href="/${CODE}/get" download>Download PDF (54 MB)</a>`
const privacy = `<a class="privacy" href="${PRIVACY_URL}">Privacy</a>`

/** The marker assertion, shared by its test and by its negative control. */
function expectMarkersOnPagesTwoAndThree(page: string) {
  expect(markersIn(page)).toEqual([marker(2), marker(3)])
  expect(page).not.toContain('/seen/1"')
}

describe('the document page', () => {
  it('shows every part, in manifest order', () => {
    const ids = pictures.map((img) => /\/(p\d{3}[abw])-1600\.webp"/.exec(img)?.[1])
    expect(ids).toEqual(['p001a', 'p001b', 'p002a', 'p002b', 'p003w'])
  })

  it('offers three widths of each picture, under the code and version', () => {
    const base = `/${CODE}/p/20260911-e8698731/p001a`
    expect(pictures[0]).toContain(`src="${base}-1600.webp"`)
    expect(pictures[0]).toContain(
      `srcset="${base}-800.webp 800w, ${base}-1600.webp 1600w, ${base}-2400.webp 2400w"`,
    )
  })

  it('sizes split halves for two columns from 900px, and whole pages for one', () => {
    expect(pictures[0]).toContain('sizes="(min-width: 900px) min(50vw, 800px), 100vw"')
    expect(pictures[4]).toContain('sizes="min(100vw, 1600px)"')
  })

  it("reserves each picture's space with its native size", () => {
    expect(pictures[0]).toContain('width="2400" height="1350"')
    expect(pictures[4]).toContain('width="4800" height="1350"')
  })

  it('describes each picture', () => {
    expect(pictures[0]).toContain('alt="Product catalogue, page 1, left half"')
    expect(pictures[1]).toContain('alt="Product catalogue, page 1, right half"')
    expect(pictures[4]).toContain('alt="Product catalogue, page 3"')
  })

  it('loads only the first page eagerly, and every later picture and marker lazily', () => {
    expect(
      pictures.filter((img) => img.includes('loading="eager" fetchpriority="high"')),
    ).toHaveLength(2)
    // 5, not the 3 this was before markers: the 3 pictures of pages 2 and 3, plus one marker
    // for each of those two pages. An eager marker would count every page as read the moment
    // the document opened.
    expect(imgs.filter((img) => img.includes('loading="lazy"'))).toHaveLength(5)
    expect(pictures.filter((img) => img.includes('loading="lazy"'))).toHaveLength(3)
    expect(markers.filter((img) => img.includes('loading="lazy"'))).toHaveLength(2)
  })

  it('numbers pages the way a PDF reader numbers the downloaded file, with anchors', () => {
    expect(html).toContain('<section class="page" id="page-3" aria-label="Page 3 of 3">')
    expect(html).toContain('<p class="caption">Page 3 of 3</p>')
  })

  it('offers the original PDF twice, with its size, through the counted /get', () => {
    expect(html.split(download)).toHaveLength(3)
    // The Worker counts a press at /get and sends the browser on to /download. A link
    // straight to /download would be served from the cache, uncounted.
    expect(html).not.toContain('/download"')
    expect(megabytes(16_891_515)).toBe('17 MB')
  })

  it('asks search engines not to list it and browsers not to pass the address on', () => {
    expect(html).toContain('<meta name="robots" content="noindex, nofollow">')
    expect(html).toContain('<meta name="referrer" content="no-referrer">')
    expect(html).toContain('<title>Product Catalogue · RUN APPAREL</title>')
  })

  it('escapes anything it prints', () => {
    const page = renderDocumentPage({
      doc: { ...DOCUMENTS.catalogue, title: 'A<b>' },
      manifest,
      code: CODE,
    })
    expect(page).toContain('A&#60;b&#62;')
    expect(page).not.toContain('A<b>')
  })
})

describe('reading markers', () => {
  it('marks the foot of every page after the first, and never page 1', () => {
    expectMarkersOnPagesTwoAndThree(html)
  })

  it('puts each marker last in its own page, after the caption', () => {
    for (const n of [2, 3]) {
      expect(html).toContain(`<p class="caption">Page ${n} of 3</p>\n${marker(n)}\n</section>`)
    }
  })

  it('keeps a marker invisible, out of the layout, and inside its own page', () => {
    expect(STYLE).toContain('.page{position:relative;margin:0 0 24px}')
    expect(STYLE).toContain(
      '.seen{position:absolute;left:0;bottom:0;width:1px;height:1px;opacity:0;pointer-events:none}',
    )
  })

  it('the marker check can actually fail (negative control)', () => {
    const withoutMarkers = html.replace(/\n<img class="seen"[^>]*>/g, '')
    const withPageOne = html.replace(
      '<p class="caption">Page 1 of 3</p>',
      `<p class="caption">Page 1 of 3</p>\n${marker(1)}`,
    )
    expect(withoutMarkers).not.toBe(html)
    expect(withPageOne).not.toBe(html)
    expect(() => expectMarkersOnPagesTwoAndThree(withoutMarkers)).toThrow()
    expect(() => expectMarkersOnPagesTwoAndThree(withPageOne)).toThrow()
  })
})

describe('the privacy link', () => {
  it('appears once, in the footer, right after the download link', () => {
    expect(PRIVACY_URL).toBe('https://wear-run.help/privacy')
    expect(html.split(privacy)).toHaveLength(2)
    expect(/<footer class="bar">\n([\s\S]*?)\n<\/footer>/.exec(html)?.[1]).toBe(
      `${download}\n${privacy}`,
    )
  })

  it('is at least 44px tall and coloured by a design token', () => {
    expect(STYLE).toMatch(/\.privacy\{[^}]*min-height:44px/)
    expect(STYLE).toMatch(/\.privacy\{[^}]*color:var\(--(?:muted|text)\)/)
  })
})

describe('the message page', () => {
  it('says the link is not active and points to the contact page', () => {
    expect(message).toContain(MESSAGE_HEADLINE)
    expect(message).toContain(MESSAGE_BODY)
    expect(`${MESSAGE_HEADLINE} ${MESSAGE_BODY}`).toBe(
      'This link is not complete or no longer active. Please contact RUN Apparel for the current link.',
    )
    expect(message).toContain(`<a class="button" href="${CONTACT_URL}">Contact RUN Apparel</a>`)
    expect(CONTACT_URL).toBe('https://wear-run.help/contact')
  })

  it('carries nothing from any document', () => {
    expect(message).not.toContain('Download')
    expect(message).not.toContain('/p/')
    expect(message).not.toContain('/seen/')
    expect(message).not.toContain(PRIVACY_URL)
    expect(message).toContain('<meta name="robots" content="noindex, nofollow">')
  })
})

describe('both pages', () => {
  it.each([
    ['document', html],
    ['message', message],
  ])('the %s page has no script and no e-mail address', (_name, page) => {
    expect(page).not.toMatch(/<script/i)
    expect(page).not.toMatch(/[\w.+-]+@[\w-]+\.[a-z]/i)
  })

  it('serves exactly the style the CSP hashes', async () => {
    const served = /<style>([\s\S]*?)<\/style>/.exec(html)?.[1]
    expect(served).toBe(STYLE)
    expect(/<style>([\s\S]*?)<\/style>/.exec(message)?.[1]).toBe(STYLE)
    const hash = createHash('sha256').update(STYLE).digest('base64')
    expect(await contentSecurityPolicy()).toBe(
      `default-src 'none'; img-src 'self'; style-src 'sha256-${hash}'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`,
    )
  })
})

/**
 * A Worker cannot import `packages/ui/src/tokens.css`, so page.js copies nine colour
 * pairs. This fails the day one of them drifts from the site's design system.
 */
describe('colours match packages/ui/src/tokens.css', () => {
  const css = readFileSync(
    join(import.meta.dirname, '..', '..', '..', 'packages', 'ui', 'src', 'tokens.css'),
    'utf8',
  )

  const declared = (source: string, name: string): string => {
    const match = new RegExp(`(?:^|[\\s;{])--${name}:\\s*([^;]+);`, 'm').exec(source)
    if (!match) throw new Error(`--${name} is not declared`)
    return match[1]!.trim()
  }
  const resolve = (source: string, value: string): string =>
    value.replace(/var\(--([a-z-]+)\)/g, (_all, inner: string) =>
      resolve(source, declared(source, inner)),
    )
  const lightDark = (source: string, name: string): [string, string] => {
    const inner = /^light-dark\((.*)\)$/.exec(resolve(source, declared(source, name)))?.[1]
    if (!inner) throw new Error(`--${name} is not a light-dark() pair`)
    let depth = 0
    for (let i = 0; i < inner.length; i++) {
      if (inner[i] === '(') depth++
      else if (inner[i] === ')') depth--
      else if (inner[i] === ',' && depth === 0) {
        return [inner.slice(0, i).trim(), inner.slice(i + 1).trim()]
      }
    }
    throw new Error(`--${name} has no top-level comma`)
  }

  it.each(Object.keys(TOKENS))('--%s', (name) => {
    expect(lightDark(css, name)).toEqual([...TOKENS[name as keyof typeof TOKENS]])
  })

  it('the reader can actually fail (negative control)', () => {
    expect(lightDark(css.replaceAll('#f1efea', '#000000'), 'bg')[0]).toBe('#000000')
  })
})
