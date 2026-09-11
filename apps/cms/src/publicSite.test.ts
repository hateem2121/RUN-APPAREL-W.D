import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { isAddressableColourway } from './lib/colourwayAccess'

/**
 * Gates for the public marketing site (the `(frontend)` route group).
 *
 * This Worker served nothing public until 2026-09-04 — its root was a stub reading
 * "This service is private" and the layout carried `robots: { index: false }`. Opening
 * it up means three things that were previously true by accident now have to be true
 * on purpose, and each one below is a defect this repo or its sibling has already
 * shipped once.
 */

const CMS_ROOT = join(import.meta.dirname, '..')
const FRONTEND = join(CMS_ROOT, 'src', 'app', '(frontend)')
const read = (...parts: string[]) => readFileSync(join(...parts), 'utf8')

/**
 * Blank out comment BODIES while preserving offsets and newlines.
 *
 * The assertions below scan source for patterns, and the source's own comments
 * DISCUSS those patterns — the first draft of this file failed because layout.tsx
 * explains why it no longer sets `index: false`. Same false positive tokens.test.ts
 * hit, same fix. Line comments are only stripped at the start of a line so a `//`
 * inside `https://…` survives.
 */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, ' '))
    .replace(/^[ \t]*\/\/.*$/gm, (line) => ' '.repeat(line.length))
}

/** Source with comments blanked — use this for every "the code says X" assertion. */
const code = (...parts: string[]) => stripComments(read(...parts))

/**
 * The site stylesheet, comments blanked.
 *
 * Module scope, not inside one describe: this file's own comments discuss the very
 * techniques being asserted about, and the `interpolate-size` check once matched the
 * paragraph explaining why interpolate-size is NOT used. Third time that shape of
 * false positive appeared here — the fix is always to read the code, not the prose.
 */
const css = () => stripComments(read(FRONTEND, 'site.css'))

describe('the public site is indexable and the admin is not exposed by it', () => {
  it('the frontend layout derives robots from the switch and never hard-codes index', () => {
    // Until 2026-09-06 this asserted the ABSENCE of noindex: the pages exist to be
    // found. They still do — but the owner launches them as a hidden beta first, so the
    // layout now derives `robots` from SITE_INDEXING and must never state `index` itself
    // (declaring it broke the 404's own noindex after hydration, measured 2026-09-05).
    const layout = code(FRONTEND, 'layout.tsx')
    expect(layout).toMatch(/robots:\s*robotsFor\(visibility\)/)
    expect(layout).not.toMatch(/index:\s*true/)
    // and the 404 must still declare its own. It moved to the app root on 2026-09-07 —
    // `notFound()` does not server-render (vercel/next.js#62228), so the branded page had
    // to become Next's own unmatched handler rather than a catch-all's. See the test
    // below that pins that layout.
    expect(code(join(CMS_ROOT, 'src', 'app'), 'not-found.tsx')).toMatch(
      /robots:\s*\{\s*index:\s*false/,
    )
  })

  it('the switch ships HIDDEN in wrangler.jsonc, and the sitemap follows it', () => {
    // A Worker deployed with this var missing is ALSO hidden (the parser fails closed),
    // but the file must say so explicitly, or the next reader assumes the default is open.
    expect(read(CMS_ROOT, 'wrangler.jsonc')).toMatch(/"SITE_INDEXING":\s*"hidden"/)
    expect(code(join(CMS_ROOT, 'src', 'app'), 'sitemap.ts')).toMatch(
      /sitemapFor\(await searchVisibility\(\), SITE_ORIGIN\)/,
    )
  })

  it('the admin and REST API stay in the (payload) group, which this layout never wraps', () => {
    // Payload's admin is protected by authentication, not by metadata. This asserts
    // the structural separation rather than the protection: if a future change moved
    // admin routes under (frontend), they would inherit `index: true` and start
    // advertising the login screen to crawlers.
    const adminPage = join(
      CMS_ROOT,
      'src',
      'app',
      '(payload)',
      'admin',
      '[[...segments]]',
      'page.tsx',
    )
    expect(() => readFileSync(adminPage, 'utf8')).not.toThrow()
    // Structural, not textual: nothing that serves the admin or the REST API may live
    // under the indexable group. A prose mention of "(payload)" in a comment is not a
    // finding, which is exactly what the first draft of this assertion got wrong.
    const frontendEntries = readdirSync(FRONTEND)
    expect(frontendEntries).not.toContain('admin')
    expect(frontendEntries).not.toContain('api')
  })
})

describe('media URLs', () => {
  /**
   * MEASURED 2026-09-04, and the reason this test exists. Under `next dev` with
   * PUBLIC_MEDIA_BASE_URL unset, the r2Storage plugin's `generateFileURL` does not
   * fire and Payload emits a relative `/api/media/file/<name>` URL. Correct locally.
   * In production that would route every gallery poster through the public origin's
   * uncached Payload API route instead of media.wear-run.help — a silent performance
   * regression with no error anywhere. Nothing asserted this var before.
   */
  it('wrangler.jsonc declares PUBLIC_MEDIA_BASE_URL', () => {
    const wrangler = read(CMS_ROOT, 'wrangler.jsonc')
    expect(wrangler).toMatch(/"PUBLIC_MEDIA_BASE_URL":\s*"https:\/\/[^"]+"/)
  })
})

describe('the gallery advertises only what the viewer can serve', () => {
  /**
   * `getProductCards` and `buildViewerResponse` share `isAddressableColourway`. If they
   * ever stopped sharing it, the gallery could list a garment whose viewer URL 404s,
   * and both sides would still be green — the only symptom would be a buyer clicking a
   * card and meeting "[ REFERENCE UNAVAILABLE ]". These cases pin the rule itself.
   */
  it('accepts a colourway with a slug and no explicit active:false', () => {
    expect(isAddressableColourway({ slug: 'wine' })).toBe(true)
    expect(isAddressableColourway({ slug: 'wine', active: true })).toBe(true)
  })

  it('rejects a retired colourway', () => {
    expect(isAddressableColourway({ slug: 'wine', active: false })).toBe(false)
  })

  it('rejects a row with no usable slug, which is what a blank imported row looks like', () => {
    expect(isAddressableColourway({ slug: '' })).toBe(false)
    expect(isAddressableColourway({ slug: '   ' })).toBe(false)
    expect(isAddressableColourway({})).toBe(false)
    expect(isAddressableColourway({ slug: null })).toBe(false)
  })

  it('does not require a poster — requiring one 404d a live garment on 2026-08-21', () => {
    expect(isAddressableColourway({ slug: 'wine', posterPreview: null })).toBe(true)
  })

  it('is the SAME function projectViewer.ts uses, not a copy of the rule', () => {
    const projection = code(CMS_ROOT, 'src', 'endpoints', 'projectViewer.ts')
    expect(projection).toContain("import { isAddressableColourway } from '../lib/colourwayAccess'")
    expect(projection).toContain('if (!isAddressableColourway(doc)) continue')
    // The old inline rule must be gone, or the two could drift again.
    expect(projection).not.toContain("if (!String(doc.slug ?? '').trim()) continue")
  })
})

describe('touch targets', () => {
  it('the contact page links clear the 44px floor', () => {
    // MEASURED 2026-09-05 across twelve viewports: both links were 19px tall at EVERY
    // size. Email and WhatsApp are the contact page's only two actions, so on a phone
    // the page's entire purpose was a thumb-sized miss. Nothing looked wrong at desktop
    // widths, which is why a sweep found it and reading the design did not.
    //
    // BOTH lines are required: min-height on a flex child is only a suggestion until
    // flex-shrink is pinned — the same pairing the notch wordmark needs.
    const rule = /a\.contact-block__value\s*\{[^}]*\}/.exec(css())?.[0] ?? ''
    expect(rule, 'a.contact-block__value rule is missing entirely').not.toBe('')
    expect(rule).toContain('min-height: var(--target-min)')
    expect(rule).toContain('flex-shrink: 0')
  })

  it('the notch wordmark and links clear it too', () => {
    for (const selector of ['.notch__wordmark', '.nav-link']) {
      const rule = new RegExp(`\\${selector}\\s*\\{[^}]*\\}`).exec(css())?.[0] ?? ''
      expect(rule, `${selector} rule is missing`).not.toBe('')
      expect(rule, `${selector} does not pin the touch floor`).toContain(
        'min-height: var(--target-min)',
      )
    }
  })
})

describe('the owner can replace the tab icon from the CMS', () => {
  it('the fallback mark is in public/, NOT app/', () => {
    // As app/icon.svg it was Next's file-based metadata convention, and file-based
    // metadata BEATS generateMetadata — so uploading a logo would have changed nothing
    // while the CMS field looked like it worked. Measured 2026-09-05.
    expect(existsSync(join(CMS_ROOT, 'public', 'icon.svg'))).toBe(true)
    expect(existsSync(join(CMS_ROOT, 'src', 'app', 'icon.svg'))).toBe(false)
  })

  it('the layout picks the CMS logo when set and the built-in mark when not', () => {
    const layout = code(FRONTEND, 'layout.tsx')
    expect(layout).toContain('export async function generateMetadata')
    expect(layout).toMatch(/settings\.logoUrl[\s\S]{0,200}DEFAULT_ICON/)
    // A static `metadata` export cannot read the database, so it must be gone.
    expect(layout).not.toMatch(/export const metadata:/)
  })

  it('Settings carries a logo field the owner can actually find', () => {
    const global = code(CMS_ROOT, 'src', 'globals', 'SiteSettings.ts')
    expect(global).toMatch(/name: 'logo'/)
    expect(global).toMatch(/type: 'upload'/)
    expect(global).toMatch(/relationTo: 'media'/)
    // Images only — the same allow-list every other image field uses, so a GLB
    // cannot be chosen as a tab icon.
    expect(global).toMatch(/IMAGE_MIME_TYPES/)
  })

  it('reads settings at depth 1, or the upload arrives as a bare row id', () => {
    expect(code(CMS_ROOT, 'src', 'lib', 'content.ts')).toMatch(
      /findGlobal\(\{ slug: 'site-settings', depth: 1 \}\)/,
    )
  })

  it('the migration adds the column without rebuilding the table', () => {
    // A rebuild is the most hazardous operation in this repo on D1: a DROP runs an
    // implicit DELETE that cascades, and it emptied two tables in production on
    // 2026-07-29. ADD COLUMN does none of that.
    const migration = code(CMS_ROOT, 'src', 'migrations', '20260905_090000_site_logo.ts')
    expect(migration).toMatch(/ALTER TABLE .{0,2}site_settings.{0,2} ADD COLUMN .{0,2}logo_id/)
    expect(migration).not.toMatch(/CREATE TABLE __new|DROP TABLE/)
    expect(code(CMS_ROOT, 'src', 'migrations', 'index.ts')).toContain('20260905_090000_site_logo')
  })
})

describe('copy rules', () => {
  /**
   * The viewer's e2e suite asserts the product page carries no retail language
   * (e2e/viewer.spec.ts). A marketing page is exactly where that rule gets broken —
   * it is the page most tempted to say "shop" or "add to cart". RUN APPAREL is a B2B
   * manufacturer: buyers place production orders, they do not check out.
   */
  const BANNED = [
    'add to cart',
    'add to basket',
    'buy now',
    'checkout',
    'shop now',
    'in stock',
    'free shipping',
    'sale',
  ]

  const PAGES = [
    ['home', join(FRONTEND, 'page.tsx')],
    ['contact', join(FRONTEND, 'contact', 'page.tsx')],
    ['products', join(FRONTEND, 'products', 'page.tsx')],
  ] as const

  for (const [name, path] of PAGES) {
    it(`${name} uses no retail or e-commerce language`, () => {
      const source = stripComments(readFileSync(path, 'utf8')).toLowerCase()
      const found = BANNED.filter((phrase) => source.includes(phrase))
      expect(found, `${name} page uses retail language: ${found.join(', ')}`).toEqual([])
    })
  }

  it('the products page links garments to the viewer host, never to a local path', () => {
    // `/{slug}/{colour}` on this host serves nothing — the 3D reference is a separate
    // Worker on viewer.wear-run.help reached from printed QR tags. A relative link
    // here would 404 for every card.
    const page = code(FRONTEND, 'products', 'page.tsx')
    expect(page).toContain('VIEWER_ORIGIN')
    expect(page).toMatch(
      /\$\{VIEWER_ORIGIN\}\/\$\{product\.slug\}\/\$\{product\.defaultColourSlug\}/,
    )
  })
})

describe('public pages are never pre-rendered', () => {
  /**
   * `resolveCloudflareEnv()` returns null during `next build` — there is no D1 binding
   * in the build phase — so a statically-generated public page would be built against
   * an absent database. The content helpers swallow that throw, which means the
   * failure mode is not a crash but a page permanently frozen with empty content.
   */
  for (const [name, ...parts] of [
    ['home', 'page.tsx'],
    ['contact', 'contact', 'page.tsx'],
    ['products', 'products', 'page.tsx'],
  ] as const) {
    it(`${name} declares force-dynamic`, () => {
      expect(code(FRONTEND, ...parts)).toContain("export const dynamic = 'force-dynamic'")
    })
  }
})

describe('the notch', () => {
  const header = () => code(CMS_ROOT, 'src', 'components', 'site', 'SiteHeader.tsx')

  it('draws its concave corners with a mask, so the blueprint grid shows through', () => {
    // A box-shadow fillet would paint a solid patch of page colour into the corner and
    // cut a visible hole in the hero's blueprint grid. The mask leaves the carved-away
    // quarter genuinely transparent. supaste.com uses two SVG data-URI divs for this;
    // one declaration replaces both.
    expect(css()).toMatch(/\.notch::before[\s\S]{0,400}mask: radial-gradient/)
    expect(css()).toMatch(/\.notch::after[\s\S]{0,400}mask: radial-gradient/)
  })

  it('never ships a corner-shape enhancement without a rendered check', () => {
    // `corner-shape: scoop` is the native property for this arc AND is live in Chrome,
    // so an @supports block using it runs in the majority browser. The first attempt
    // drew two white triangles either side of the bar. @supports proves a property
    // parses, never that the result looks right.
    expect(css()).not.toMatch(/@supports\s*\(corner-shape/)
  })

  it('sends no visitor to the catalogue from any public page', () => {
    // Owner decision 2026-09-05: the notch CTA and both "Download the catalogue" ghost
    // buttons were removed. The 3D VIEWER keeps its own catalogue link deliberately —
    // that one is pinned by apps/viewer/e2e and a post-deploy CI assertion, and was
    // explicitly left in scope for the viewer, not this site.
    //
    // This asserts the DECISION rather than the absence of one class name: a link
    // re-added under any other class, or straight from the setting, still fails here.
    const surfaces = [
      [FRONTEND, 'layout.tsx'],
      [FRONTEND, 'page.tsx'],
      [FRONTEND, 'contact', 'page.tsx'],
      [FRONTEND, 'products', 'page.tsx'],
      [CMS_ROOT, 'src', 'components', 'site', 'SiteHeader.tsx'],
      [CMS_ROOT, 'src', 'components', 'site', 'SiteFooter.tsx'],
    ]
    for (const parts of surfaces) {
      expect(code(...parts), parts.at(-1)).not.toMatch(/catalogueUrl|\/catalogue/)
    }
    // And the rule that styled it is gone too, rather than left behind as dead CSS —
    // which is the defect this audit found in the `aria-current` rule.
    expect(css()).not.toMatch(/\.notch__cta\s*\{/)
  })

  it('never hands the settings object to the client component', () => {
    // Removing the links was not enough. SiteHeader is a client component, and Next
    // serialises every prop of one into the HTML — so passing the whole `settings`
    // global shipped `catalogueUrl` (plus email, whatsappNumber, footerLine and
    // legalLine) into the source of all three pages with no link pointing at it.
    // Measured 2026-09-05 by grepping the rendered HTML, not the source.
    //
    // The header renders one field. Anything wider than a string re-opens the leak.
    const header = code(CMS_ROOT, 'src', 'components', 'site', 'SiteHeader.tsx')
    expect(header).toMatch(/export function SiteHeader\(\{\s*wordmark\s*\}: \{\s*wordmark: string/)
    expect(header).not.toMatch(/settings/)
  })

  it('gives the shared link class fallbacks, because the footer has no notch scope', () => {
    // `--notch-muted` is declared on `.notch`. In the footer it does not resolve, and a
    // bare var() would drop the declaration and fall back to `inherit` — how the skip
    // link once shipped at 1.00:1. tokens.test.ts cannot catch this: the property IS
    // defined, just not in scope here.
    expect(css()).toMatch(/color: var\(--notch-muted, var\(--muted\)\)/)
    expect(css()).toMatch(/color: var\(--notch-text, var\(--text\)\)/)
  })

  it('puts the scroll response behind @supports, so Firefox keeps the resting notch', () => {
    // Chrome/Edge 115+, Safari 26+; Firefox 152 still has scroll-driven animations
    // behind a flag (measured 2026-09-05). The fallback has to BE the design, not a
    // broken version of it — and it is decoration, so reduced-motion opts out.
    expect(css()).toMatch(/@supports \(animation-timeline: scroll\(\)\)/)
    expect(css()).toMatch(
      /@supports \(animation-timeline: scroll\(\)\)[\s\S]{0,200}prefers-reduced-motion: no-preference/,
    )
  })

  it('needs no JavaScript to navigate — there is no disclosure to hydrate', () => {
    // THE DEFECT THIS REPLACES. The bar used to hide its links behind a button whose
    // open state lived in React: `.notch:not([data-open="true"]) .notch__nav` stayed in
    // force until hydration, so with scripting disabled at 390px **0 of 2 links were
    // reachable**, and likewise for the second or two before the bundle lands on a slow
    // connection. Desktop never showed it.
    //
    // Two no-JS replacements were measured and rejected: `<details>` (CSS can reveal a
    // closed one, but its links are absent from the accessibility tree and unreachable
    // by keyboard in all three engines) and the checkbox pattern (announced as a
    // checkbox). Removing the Catalogue CTA left two short links that FIT at every
    // width, so the disclosure is gone rather than reimplemented.
    const source = header()
    expect(source).not.toMatch(/'use client'/)
    expect(source).not.toMatch(/useState|useEffect|useRef/)
    expect(source).not.toMatch(/data-open/)
    // and nothing in CSS may hide the links behind a state attribute again
    expect(css()).not.toMatch(/\.notch__nav\s*\{[^}]*visibility: hidden/)
    expect(css()).not.toMatch(/data-open/)
  })

  it('clears the fixed bar with a height derived from the bar, not a second guess', () => {
    // Measured 2026-09-05: the bar's bottom sat at 68px while the hero's first line
    // began at 64px, so it covered the opening line on EVERY phone width on all three
    // pages. Two independent numbers had to agree and nothing made them.
    //
    // A literal here would be the same bug with a different value, so the clearance is
    // computed from the tokens that produce the bar. e2e re-measures the real gap.
    //
    // ⚠️ THE HEIGHT GAINED A ROW COUNT ON 2026-09-07 (audit FA-E-03). At large browser
    // text the bar wraps to two rows, and the ONE thing that must stay true is that the
    // clearance is derived from the same `--notch-lines` the wrap sets — the failure the
    // `flex-wrap: nowrap` comment describes is a 120px bar against a 60px reservation.
    // Whitespace is collapsed first: the expression is long enough that the formatter
    // breaks it over seven lines.
    const flat = css().replace(/\s+/g, ' ')
    expect(flat).toContain(
      '--notch-h: calc( var(--target-min) * var(--notch-lines) + var(--notch-pad-y) * 2 + ' +
        '(var(--notch-lines) - 1) * var(--notch-row-gap) )',
    )
    expect(flat, 'the wrap no longer moves the row count the clearance is built from').toMatch(
      /--notch-lines: 2/,
    )
    expect(css()).toMatch(/--notch-clearance: calc\(var\(--notch-h\) \+ 24px\)/)
    expect(css()).toMatch(
      /padding-block-start: max\(clamp\(64px, 11vw, 160px\), var\(--notch-clearance\)\)/,
    )
    // the bar must use the same padding token the clearance is derived from
    expect(css()).toMatch(/\.notch\s*\{[\s\S]*?padding-block: var\(--notch-pad-y\)/)
  })

  it('sizes the bar against the shell, not the viewport, so a scrollbar cannot overflow it', () => {
    // `100vw` includes a classic scrollbar; the fixed shell's width excludes it. On
    // Windows and Linux `calc(100vw - 24px)` therefore resolves wider than the space
    // the bar has. Invisible on macOS, where overlay scrollbars are zero-width.
    expect(css()).toMatch(/\.notch\s*\{[\s\S]*?max-width: 100%/)
    expect(css()).not.toMatch(/max-width: calc\(100vw/)
  })

  it('reserves the fillets width on the shell, with a token BOTH scopes can read', () => {
    // The fillets are pseudo-elements outside the bar's box, so the shell reserves their
    // width. The first attempt wrote that reservation using `--notch-r` while the token
    // was still declared on `.notch` — out of scope for the shell, so the whole
    // declaration was silently dropped and the bar ran to the viewport edge.
    //
    // tokens.test.ts cannot catch this shape: the property IS defined, just not where it
    // is read. Same blind spot `--notch-muted` carries an explicit fallback for.
    expect(css()).toMatch(/:root\s*\{[\s\S]*?--notch-r: var\(--radius-panel\)/)
    // EXACTLY the fillet width. An earlier `calc(12px + var(--notch-r))` cost 36px of
    // bar width — enough that the default 11-character wordmark truncated at 320px.
    expect(css()).toMatch(/\.notch-shell\s*\{[\s\S]*?padding-inline: var\(--notch-r\)/)
    // and it must NOT be re-declared on .notch, which would reopen the scope trap
    expect(css()).not.toMatch(/\.notch\s*\{[^}]*--notch-r:/)
  })

  it('keeps the bar one line tall whatever the CMS wordmark says', () => {
    // The bar's height is what the page's top spacing is derived from. With `flex-wrap:
    // wrap` the nav dropped to a second line as the wordmark grew — 112px against an
    // 84px clearance, reintroducing the overlap from a CMS text field with nothing
    // failing. Measured at 320px: the fit broke at THIRTEEN characters and the default
    // wordmark is eleven.
    expect(css()).toMatch(/\.notch\s*\{[\s\S]*?flex-wrap: nowrap/)
    expect(css()).toMatch(/\.notch__wordmark\s*\{[^}]*text-overflow: ellipsis/)
    // min-width: 0 is required or the flex item refuses to shrink and overflows instead
    expect(css()).toMatch(/\.notch__wordmark\s*\{[^}]*min-width: 0/)
  })

  it('keeps the card placeholder off --wash, which fails AA by two hundredths', () => {
    // axe, 2026-09-05: nine SERIOUS colour-contrast violations on /products, all the
    // same rule — the "[ 3D REFERENCE ]" label was --muted on --wash at 4.48:1 against
    // a 4.5:1 floor. Every other gate was green; only a live audit found it. On --bg it
    // is 5.10:1 light and 6.69:1 dark, and the card body being the lighter --surface
    // keeps the figure reading as recessed.
    expect(css()).toMatch(/\.product-card__figure\s*\{[^}]*background: var\(--bg\)/)
    expect(css()).not.toMatch(/\.product-card__figure\s*\{[^}]*background: var\(--wash\)/)
  })

  it('carries the elevation token, which is its ONLY separation in dark mode', () => {
    // Measured 2026-09-05: --raised (#363c2f) on --bg (#1c1f18) is 1.47:1, and --raised
    // is already the lightest surface the system has — there is no lighter bar to reach
    // for. --shadow-raised is the token that exists for this; tokens.css records the
    // floating colourway preview hitting the same wall over the same --bg. Drop the
    // shadow and the bar stops reading as a distinct object on dark.
    expect(css()).toMatch(/\.notch\s*\{[^}]*box-shadow: var\(--shadow-raised\)/)
  })

  it('renders exactly ONE set of links, not a duplicate for mobile', () => {
    // The popover route would need a second copy of the nav inside the popover, which a
    // screen reader reads twice. There is one set, in one place.
    //
    // The links live in NavLinks.tsx since the current-page marker needed the pathname;
    // this counts across BOTH files so moving them cannot quietly leave a copy behind.
    const both =
      code(CMS_ROOT, 'src', 'components', 'site', 'SiteHeader.tsx') +
      code(CMS_ROOT, 'src', 'components', 'site', 'NavLinks.tsx')
    expect(both.match(/href: '\/products'|href="\/products"/g) ?? []).toHaveLength(1)
    expect(both.match(/href: '\/contact'|href="\/contact"/g) ?? []).toHaveLength(1)
  })
})

describe('findability', () => {
  const appDir = join(CMS_ROOT, 'src', 'app')

  it('robots and sitemap sit at the app root, not inside a route group', () => {
    // Route groups contribute nothing to the URL, but a text file served from inside
    // `(frontend)` would inherit that group's layout, which is a full HTML document —
    // and `sitemap.ts` is only honoured as a metadata convention at the app root, where
    // inside a group it would be a stray module serving nothing with no error to say so.
    //
    // ⚠️ ROBOTS IS A ROUTE HANDLER SINCE 2026-09-07, NOT `robots.ts`. Next's convention
    // can emit only User-agent/Allow/Disallow/Sitemap/Host, and the owner's reuse policy
    // needs a `Content-Signal` field it has no representation for. Both files answer
    // `/robots.txt`, so the old one is DELETED rather than left to race — that is what
    // the third assertion is for.
    expect(existsSync(join(appDir, 'robots.txt', 'route.ts'))).toBe(true)
    expect(existsSync(join(appDir, 'sitemap.ts'))).toBe(true)
    expect(existsSync(join(appDir, 'robots.ts'))).toBe(false)
    expect(existsSync(join(FRONTEND, 'robots.ts'))).toBe(false)
    expect(existsSync(join(FRONTEND, 'sitemap.ts'))).toBe(false)
  })

  it('keeps crawlers out of the admin and the API', () => {
    // Not their protection — both are behind authentication and a Disallow is a request,
    // never access control. Worth stating anyway: without it the login screen is a
    // candidate for indexing and /api/* is crawlable JSON that costs D1 reads.
    //
    // ⚠️ THIS ASSERTS THE SOURCE CARRIES ONE SHARED LIST, NOT THE LIST ITSELF, and it has
    // now been wrong twice for the same reason: it read the literal
    // `disallow: ['/admin', '/api/']` until the AI-crawler group arrived and the paths
    // moved into a constant, then read `robots.ts` until that file was replaced by a
    // route handler. A text scan cannot decide what a crawler receives. What the OUTPUT
    // contains, per group, is asserted properly in src/lib/robotsTxt.test.ts — including
    // that a NAMED group repeats the disallows rather than inheriting them, which is the
    // failure worth guarding.
    const robots = code(join(CMS_ROOT, 'src', 'lib'), 'robotsTxt.ts')
    expect(robots).toMatch(/const DISALLOW = \['\/admin', '\/api\/'\]/)
    expect(robots, 'the groups no longer share one builder').toMatch(/function group\(/)
    expect(robots).toMatch(/Sitemap:/)
  })

  it('the sitemap speaks only for this host', () => {
    // Cards link to viewer.wear-run.help, a different host with its own sitemap. A
    // sitemap may only speak for the host serving it, so listing garments here would be
    // ignored at best. It also means this file needs no database.
    const sitemap = code(appDir, 'sitemap.ts')
    expect(sitemap).not.toMatch(/VIEWER_ORIGIN|getProductCards/)
    expect(sitemap).not.toMatch(/lastModified/)
  })

  it('supplies the large image it promises', () => {
    // `twitter.card = summary_large_image` is an undertaking to provide a picture.
    // Measured 2026-09-05: og:image and twitter:image were absent from all three pages,
    // so every shared link rendered as a bare grey box. Promising and omitting is worse
    // than declaring `summary`.
    const seo = code(CMS_ROOT, 'src', 'lib', 'seo.ts')
    expect(seo).toMatch(/card: 'summary_large_image'/)
    expect(seo).toMatch(/images: \[OG_IMAGE\]/)
    expect(seo).toMatch(/images: \[OG_IMAGE\.url\]/)
    // and the file it points at must actually exist, at the ratio platforms crop to
    expect(existsSync(join(CMS_ROOT, 'public', 'og-default.png'))).toBe(true)
    expect(seo).toMatch(/width: 1200/)
    expect(seo).toMatch(/height: 630/)
  })

  it('escapes `<` in structured data so a value cannot close the script element', () => {
    // The HTML parser ends a <script> at the first literal `</script>`, inside a JSON
    // string or not. structuredData.test.ts proves the escape defeats a hostile value;
    // this pins that the renderer still applies it.
    expect(code(CMS_ROOT, 'src', 'components', 'site', 'JsonLd.tsx')).toMatch(
      /replace\(\/<\/g, '\\\\u003c'\)/,
    )
  })
})

describe('location and contrast cues', () => {
  const site = (...parts: string[]) => join(CMS_ROOT, 'src', 'components', 'site', ...parts)

  it('marks the current page in the HTML, before any script runs', () => {
    // The rule styling `.nav-link[aria-current="page"]` shipped from day one and had
    // NEVER applied — nothing set the attribute. Dead CSS that looked correct.
    //
    // NavLinks is a client component, but a client component is rendered on the server
    // for the initial response, so `usePathname` resolves there and the attribute is in
    // the delivered HTML. Verified with curl, which executes nothing: /products comes
    // back with aria-current on Products and nothing on Contact.
    const nav = code(site('NavLinks.tsx'))
    expect(nav).toMatch(/usePathname/)
    // `page`, not `true` — the value names what is current; `true` reads as a generic
    // "current item" with no context.
    expect(nav).toMatch(/aria-current=\{pathname === href \? 'page' : undefined\}/)
  })

  it('does not signal the current page by colour alone', () => {
    // Measured 2026-09-05 once the attribute was live: the ONLY difference between
    // current and non-current was alpha 0.7 → 1.0 on the same colour. That is a
    // colour-only distinction (WCAG 1.4.1) and barely perceptible at that.
    const rule = /\.nav-link\[aria-current="page"\]\s*\{[^}]*\}/.exec(css())?.[0] ?? ''
    expect(rule, 'the aria-current rule is missing').not.toBe('')
    expect(rule).toContain('text-decoration: underline')
  })

  it('survives Windows High Contrast, where colour carries nothing', () => {
    // Nothing handled forced-colors before. Two things break without help: the carved
    // fillets are pseudo-elements whose only content is a background, so they vanish
    // and the bar loses the shape it is named for; and the volt underline is stripped,
    // taking the current-page cue with it.
    const block = /@media \(forced-colors: active\)\s*\{[\s\S]*?\n\}/.exec(css())?.[0] ?? ''
    expect(block, 'no forced-colors block').not.toBe('')
    expect(block).toMatch(/text-decoration-color: LinkText/)
    expect(block).toMatch(/\.notch\s*\{[^}]*border: 1px solid CanvasText/)
    // and the brand palette must NOT be forced back over the user's chosen one
    expect(css()).not.toMatch(/forced-color-adjust:\s*none/)
  })

  it('gives the skip link a focusable target without ringing the whole page', () => {
    // Measured 2026-09-05: without tabindex the skip link set the hash and the next Tab
    // did land in the content — but activeElement stayed on BODY, which is what a
    // screen reader follows. Adding it then drew a 2px outline around the ENTIRE page,
    // which reads as a rendering fault. Safe to suppress because -1 keeps main out of
    // the tab order, so the skip link is the only way to focus it.
    expect(code(FRONTEND, 'layout.tsx')).toMatch(
      /<main id="main" className="site-main" tabIndex=\{-1\}>/,
    )
    expect(css()).toMatch(
      /\.site-main:focus,\s*\n\.site-main:focus-visible \{\s*\n\s*outline: none;/,
    )
  })

  it('keeps the client boundary to the links alone', () => {
    // SiteHeader must stay a server component: Next serialises every prop of a client
    // component into the HTML, which is how the whole settings global — catalogueUrl
    // included — reached the page source on 2026-09-05.
    expect(code(site('SiteHeader.tsx'))).not.toMatch(/'use client'/)
    expect(code(site('SiteFooter.tsx'))).not.toMatch(/'use client'/)
    expect(read(site('NavLinks.tsx')).startsWith("'use client'")).toBe(true)
    // NavLinks takes no props at all, so there is nothing to serialise
    expect(code(site('NavLinks.tsx'))).toMatch(/export function NavLinks\(\)/)
  })
})

describe('a poster that fails to load', () => {
  it('detects an ALREADY-failed image on mount, not only via onError', () => {
    // The markup is server-rendered, so the browser starts fetching the poster while
    // the HTML is still parsing. A 404 therefore fires `error` BEFORE React hydrates
    // and attaches the handler — the listener arrives after the event it was waiting
    // for. Measured 2026-09-05 against a forced 404: image broken (complete: true,
    // naturalWidth: 0), React hydrated, swap never happened.
    const src = code(CMS_ROOT, 'src', 'components', 'site', 'ProductPoster.tsx')
    expect(src).toMatch(/img\?\.complete && img\.naturalWidth === 0/)
    // and onError stays, for a poster that fails LATER — lazy-scrolled, or a dropped
    // connection. Both paths are needed; neither is sufficient.
    expect(src).toMatch(/onError=\{\(\) => setFailed\(true\)\}/)
  })

  it('keeps a no-JavaScript treatment in CSS as well', () => {
    // The component covers the case where scripting runs. The CSS layer covers the
    // window before hydration and every no-JS visitor, by styling the alt text the
    // browser lays out inside a broken <img>.
    const rule = /\.product-card__img\s*\{[^}]*\}/.exec(css())?.[0] ?? ''
    expect(rule, '.product-card__img rule is missing').not.toBe('')
    expect(rule).toContain('font-family: var(--font-mono)')
    expect(rule).toContain('text-transform: uppercase')
    // ⚠️ and NO padding: it insets the content box of a replaced element, so
    // object-fit fits the poster inside it — a 16px pad put a visible margin around
    // every poster that loaded correctly.
    expect(rule).not.toMatch(/\bpadding:/)
  })
})

describe('the 404, the policy, and analytics', () => {
  const site = (...parts: string[]) => join(CMS_ROOT, 'src', 'components', 'site', ...parts)

  /**
   * ⚠️ THE 404 LIVES AT THE APP ROOT, AND PUTTING IT BACK IN A ROUTE GROUP RE-BREAKS IT
   * FOR EVERY VISITOR WITHOUT JAVASCRIPT.
   *
   * The arrangement this replaced was a `[...unmatched]` catch-all inside (frontend)
   * calling `notFound()`, so the branded page rendered inside the site's own layout. It
   * looked right and measured as a blank white screen with scripting off — 0 characters
   * of body text on every wrong URL (FA-I-01, FA-P-01).
   *
   * The cause is an open upstream bug, vercel/next.js#62228: `notFound()` does not
   * server-render its page, delivering the markup only inside the Flight payload. Next's
   * OWN unmatched handling does render, which is why the catch-all had to go rather than
   * be repaired. Measured 2026-09-07 over raw HTTP:
   *
   *   catch-all + notFound()   404, 0 <h1>, 0 links,  28 chars
   *   root not-found.tsx       404, 1 <h1>, 6 links, 365 chars
   *
   * `e2e/notfound.spec.ts` proves the rendered output; this pins the file layout that
   * produces it, because the two files it forbids are the obvious "tidy-up".
   */
  it('the 404 is at the app root, where Next server-renders it', () => {
    expect(existsSync(join(CMS_ROOT, 'src', 'app', 'not-found.tsx'))).toBe(true)
    expect(
      existsSync(join(FRONTEND, 'not-found.tsx')),
      'a not-found.tsx inside (frontend) only answers notFound(), which does not render',
    ).toBe(false)
    expect(
      existsSync(join(FRONTEND, '[...unmatched]', 'page.tsx')),
      'the catch-all is what routed unmatched URLs through the broken notFound() path',
    ).toBe(false)
  })

  it('gives the public pages a CSP and leaves the admin alone', () => {
    // ⚠️ NO NONCE, AND NOT FOR WANT OF TRYING. A nonce needs per-request middleware, and
    // measured 2026-09-05: `proxy.ts` on the Node runtime fails the Cloudflare build
    // ("Node.js middleware is not currently supported"), and with `runtime: 'edge'` it
    // fails earlier ("Proxy does not support Edge runtime"). Both with pnpm build, the
    // typecheck and the whole suite GREEN — only `opennextjs-cloudflare build` fails.
    // ⚠️ `code`, NOT `read` — comments blanked. The first version read the raw file, and
    // that file's own comment explains why `object-src 'none'` matters, so deleting the
    // real directive still matched the prose. A negative control caught it: removing the
    // directive failed nothing. Fourth time this shape of false positive has appeared in
    // this repo's style tests, and the fix is always the same — assert against the code.
    const headers = code(CMS_ROOT, 'publicViewerHeaders.mjs')
    expect(headers).toMatch(
      /PUBLIC_PAGE_SOURCES = \['\/', '\/products', '\/contact', '\/privacy', '\/terms'\]/,
    )
    // The directives that are worth having regardless of the inline-script compromise:
    // each closes an attack class that has nothing to do with inline scripts.
    for (const directive of ["object-src 'none'", "base-uri 'self'", "form-action 'self'"]) {
      expect(headers, `CSP is missing ${directive}`).toContain(directive)
    }
    // and it must be appended AFTER withPayload's blanket rule, or it never applies —
    // the exact way L1's Vary fix shipped green and inert in production.
    //
    // ⚠️ THIS ONLY CHECKS THAT THE RULES ARE APPENDED, NOT WHICH ONE WINS. It asserted
    // `publicViewerVaryRule, ...publicPageCspRules` as ADJACENT text until 2026-09-07,
    // when `notFoundCspRule` was inserted between them — and failed against a change
    // that made the headers strictly better. A text scan cannot decide precedence
    // anyway; src/notFoundCsp.test.ts does it properly, by reading the rules back out of
    // .next/routes-manifest.json in the order Next recorded them.
    // Whitespace-insensitive: the formatter reflows this call across lines, and an
    // assertion that depends on its layout fails for a reason that is not a defect.
    const appended = headers.replace(/\s+/g, ' ')
    expect(appended).toMatch(/publicViewerVaryRule,.*\.\.\.publicPageCspRules/)
    expect(appended).toMatch(/notFoundCspRule,\s*\.\.\.publicPageCspRules/)
  })

  /**
   * ⚠️ `GET /api/access` ANSWERS 200 TO ANYONE, AND THAT IS CORRECT — MEASURED, NOT
   * ASSUMED (audit FA-O-09, scored 6).
   *
   * Fetched live on 2026-09-07, the anonymous response is:
   *
   *     {"collections":{"users":{"fields":{"sessions":{"read":true,
   *       "fields":{"id":{"read":true},"createdAt":{"read":true},"expiresAt":{"read":true}}}}}}}
   *
   * One collection, three field names, and no `canAccessAdmin`. It does NOT enumerate the
   * collections, which is what the finding's severity assumed. Everything in it is already
   * implied by the existence of `/admin`.
   *
   * ⚠️ AND BLOCKING IT WOULD BREAK THE ADMIN. Payload's own admin calls this endpoint to
   * decide which screens a signed-in user may see; shadowing it with a 403 would take the
   * panel down for the owner while protecting three strings. That is the trade, and it is
   * a bad one.
   *
   * This test pins the ONE thing that would make the finding serious: that no other
   * collection ever appears in that response. If `products`, `media`, `raw-uploads` or
   * `inquiries` start showing up, an access rule has been loosened somewhere.
   * `e2e/notfound.spec.ts` fetches the live shape; this asserts the rule that produces it.
   */
  it('no collection but `users` is readable without authentication', () => {
    /*
     * ⚠️ ANY OF THE THREE GATES, NOT `isAuthenticated` SPECIFICALLY. The first version of
     * this test demanded that exact helper and failed immediately — on three collections
     * that are STRICTER than it: `RawUploads` is `isAdminOrEditor` and `Events` is
     * `isAdmin`. Asserting the tightest rule would have made a future tightening fail the
     * build, which is the wrong direction for a security guard to point.
     */
    const GATED = ['isAuthenticated', 'isAdminOrEditor', 'isAdmin']
    const roles = code(join(CMS_ROOT, 'src', 'access'), 'roles.ts')
    for (const helper of GATED) expect(roles).toContain(`export const ${helper}`)

    for (const collection of ['Products', 'Media', 'RawUploads', 'Events', 'Inquiries']) {
      const source = code(join(CMS_ROOT, 'src', 'collections'), `${collection}.ts`)
      const match = source.match(/read:\s*([A-Za-z]+)/)
      expect(match, `${collection} declares no read rule at all`).not.toBeNull()
      expect(
        GATED,
        `${collection}.read is "${match?.[1]}" — /api/access will now enumerate it to ` +
          'anyone, which is the exposure FA-O-09 was scored against',
      ).toContain(match?.[1])
    }
  })

  it('has no middleware or proxy file, because neither can be deployed', () => {
    // Keeping a dead one around would break `opennextjs-cloudflare build` again, and
    // `pnpm build` would stay green while it did.
    expect(existsSync(join(CMS_ROOT, 'src', 'proxy.ts'))).toBe(false)
    expect(existsSync(join(CMS_ROOT, 'src', 'middleware.ts'))).toBe(false)
  })

  it('never renders an analytics beacon without a token', () => {
    // A beacon carrying an empty token reports to Cloudflare from an unidentified site,
    // which is worse than not reporting.
    //
    // ⚠️ THIS COMMENT DEMANDED A NONCE UNTIL 2026-09-07, AND THE TEST DIRECTLY BELOW IT
    // FORBIDS ONE (audit FA-T-04). It read "it must carry the nonce, or the CSP refuses
    // it silently and analytics records nothing while everything looks green" — a
    // description of a stack this one is not. The nonce plumbing was removed once the
    // Cloudflare build proved a proxy cannot exist here, so a reader following this
    // instruction would have re-added dead code that the next assertion then rejects.
    //
    // What actually admits the beacon is the HOST:
    // `script-src … https://static.cloudflareinsights.com` in publicViewerHeaders.mjs.
    const analytics = code(site('Analytics.tsx'))
    expect(analytics).toMatch(/if \(!token\) return null/)
  })

  it('carries no leftover nonce plumbing', () => {
    // The nonce was threaded through the layout, both pages, JsonLd and Analytics before
    // the Cloudflare build proved a proxy cannot exist here. Leaving it would be exactly
    // the dead code this audit found in the `aria-current` rule: present, plausible, and
    // wired to nothing.
    for (const file of [site('JsonLd.tsx'), site('Analytics.tsx')]) {
      expect(code(file), file).not.toMatch(/nonce/)
    }
    for (const page of ['layout.tsx', join('products', 'page.tsx'), join('contact', 'page.tsx')]) {
      expect(code(FRONTEND, page), page).not.toMatch(/x-nonce|next\/headers/)
    }
  })
})

describe('FA-I-14 — the mono micro-label says which of its five jobs it is doing', () => {
  /**
   * ⚠️ ONE CLASS WAS DOING FIVE JOBS. Counted 2026-09-07 across the five public pages:
   * `.section-number` marked the numbered section headers (`№01 — What we make`), the
   * unnumbered section eyebrow on /contact, eleven sub-headings inside the two legal
   * pages, six labels naming the value under them, and the gallery's result count. They
   * look identical and they are not the same thing — and because `.section-number` is
   * declared in `packages/ui/src/base.css`, a change aimed at the numbered markers
   * reaches the 3D viewer's two uses as well.
   *
   * The rename is only worth anything if it stays done, and there is no visual signal
   * when it comes undone: a new `.section-number` on a legal page renders correctly and
   * silently rejoins the pile. Hence a gate rather than a convention.
   */
  const PAGES = [
    ['home', join(FRONTEND, 'page.tsx')],
    ['products', join(FRONTEND, 'products', 'page.tsx')],
    ['contact', join(FRONTEND, 'contact', 'page.tsx')],
    ['privacy', join(FRONTEND, 'privacy', 'page.tsx')],
    ['terms', join(FRONTEND, 'terms', 'page.tsx')],
  ] as const

  const MEANING_CLASSES = ['subhead', 'field-label', 'result-count']

  it('`.section-number` is only ever on a numbered marker', () => {
    const offenders: string[] = []
    let numbered = 0
    for (const [name, path] of PAGES) {
      const source = stripComments(readFileSync(path, 'utf8'))
      for (const match of source.matchAll(/className="section-number">([^<]*)</g)) {
        const text = (match[1] ?? '').trim()
        // `№` is written `&#8470;` in the viewer and literally here; accept both.
        if (/^(?:№|&#8470;)/.test(text)) {
          numbered += 1
          continue
        }
        offenders.push(`${name}: "${text.slice(0, 48)}"`)
      }
    }
    // The negative control: if the regex stopped matching, `offenders` would be empty
    // and this gate would pass while reading nothing at all.
    expect(numbered, 'no numbered section markers found — the matcher is broken').toBeGreaterThan(3)
    expect(
      offenders,
      'these use `.section-number` for something that is not a section number. Use ' +
        `one of ${MEANING_CLASSES.join(', ')} — site.css explains which is which.`,
    ).toEqual([])
  })

  it('every meaning class is actually used, so none of them is a dead name', () => {
    const markup = PAGES.map(([, path]) => stripComments(readFileSync(path, 'utf8'))).join('\n')
    for (const name of MEANING_CLASSES) {
      expect(markup, `.${name} is declared in site.css and used nowhere`).toContain(
        `className="${name}"`,
      )
    }
  })

  it('and they look EXACTLY like the class they were split out of', () => {
    /*
     * ⚠️ THE DRIFT CONTROL, AND THE REASON THIS SPLIT IS SAFE. site.css restates the five
     * declarations because base.css belongs to both surfaces and is not this site's to
     * repurpose — so the appearance now exists twice. Two copies of a look is exactly the
     * shape that produced FA-Q-03 (two cursors that agreed only by luck), so the copies
     * are compared here rather than trusted. They cite the same tokens, so a token change
     * still moves both; what this catches is one of them being edited and not the other.
     */
    const declarations = (source: string, selector: RegExp) => {
      const match = selector.exec(stripComments(source))
      expect(match, `the rule ${selector} is gone`).not.toBeNull()
      return (match?.[1] ?? '')
        .split(';')
        .map((part) => part.trim().replace(/\s+/g, ' '))
        .filter(Boolean)
        .sort()
    }

    const base = readFileSync(
      join(CMS_ROOT, '..', '..', 'packages', 'ui', 'src', 'base.css'),
      'utf8',
    )
    const sectionNumber = declarations(base, /\.section-number\s*\{([^}]*)\}/)
    const meaning = declarations(
      read(FRONTEND, 'site.css'),
      /\.subhead,\s*\.field-label,\s*\.result-count\s*\{([^}]*)\}/,
    )

    // Not `toHaveLength(0)` on a diff — name what moved, or the failure says nothing.
    expect(meaning, 'the site copy and base.css no longer describe the same label').toEqual(
      sectionNumber,
    )
    expect(sectionNumber.length, 'the base rule parsed empty').toBeGreaterThan(3)
  })

  it('the site never restyles `.section-number` itself', () => {
    // Restyling it here would reach the viewer's Contact and Customisation sections,
    // which render the same class on live product pages.
    const rules = [...css().matchAll(/([^{}]*)\{([^}]*)\}/g)]
      .filter(([, selector]) => /\.section-number\b/.test(selector ?? ''))
      .filter(([, selector]) => !/\+\s*\*/.test(selector ?? ''))
      .map(([, selector]) => (selector ?? '').trim().replace(/\s+/g, ' '))
    expect(
      rules,
      'site.css now styles .section-number. That class is declared in packages/ui and ' +
        'the 3D viewer renders it on every product page.',
    ).toEqual([])
  })
})

describe('FA-N-10 / D10 — the pages say in words why there is no price', () => {
  /**
   * The JSON-LD half is in `lib/structuredData.test.ts`. This is the other half of the
   * decision: Google reads structured data that contradicts the visible page as a spam
   * signal, and a buyer reads the page. Both have to say the same thing, and the page has
   * to say it at all — "no price" with no explanation reads as an omission.
   */
  it('/products states it is a reference set and not a shop', () => {
    const source = stripComments(read(FRONTEND, 'products', 'page.tsx'))
    expect(source, 'the products page no longer says it is not a shop').toMatch(
      /development references, not a shop/i,
    )
  })

  it('/terms states that nothing on the site is an offer', () => {
    const source = stripComments(read(FRONTEND, 'terms', 'page.tsx'))
    expect(source).toMatch(/Nothing here is an offer/i)
    // and it explains what a price actually depends on, rather than only denying one
    expect(source.toLowerCase()).toMatch(/quot/)
  })

  it('/contact never says nothing is required above three required fields (CT-14)', () => {
    const source = stripComments(read(FRONTEND, 'contact', 'page.tsx'))
    // The lede lists what HELPS a reply; the form under it requires a name, an email and a
    // message. "Nothing is required" read as a claim about the form (audit CT-14). The owner
    // chose this replacement wording on 2026-09-11.
    expect(source).not.toMatch(/Nothing is required/i)
    expect(source).toMatch(/None of it is required to start the conversation\./)
    // and the fields the sentence must not contradict are still required
    expect(source.match(/\brequired\b(?!\s*to start)/g)?.length ?? 0).toBeGreaterThanOrEqual(3)
  })
})
