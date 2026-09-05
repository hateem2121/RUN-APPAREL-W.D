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
  it('the frontend layout asks to be indexed', () => {
    // The whole reason these pages are server-rendered in apps/cms rather than added
    // to the client-rendered viewer is that they have to be findable. A leftover
    // noindex would make the entire exercise pointless while every page still looked
    // perfect in a browser — green, and worth nothing.
    const layout = code(FRONTEND, 'layout.tsx')
    expect(layout).toMatch(/robots:\s*\{\s*index:\s*true/)
    expect(layout).not.toMatch(/index:\s*false/)
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

  it('grows the panel with grid rows, not height, so every engine animates it', () => {
    // Animating to `height: auto` needs interpolate-size/calc-size(), still
    // Chromium-only in 2026. 0fr→1fr works everywhere and needs no fallback.
    expect(css()).toMatch(/grid-template-rows: 0fr/)
    expect(css()).toMatch(/grid-template-rows: 1fr/)
    expect(css()).not.toMatch(/interpolate-size|calc-size\(/)
  })

  it('hides the closed panel from the keyboard, not just from the eye', () => {
    // A 0fr grid row still contains focusable links. Without this a keyboard user tabs
    // into a menu they cannot see.
    expect(css()).toMatch(
      /\.notch:not\(\[data-open="true"\]\) \.notch__nav\s*\{[^}]*visibility: hidden/,
    )
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
    // screen reader reads twice. CSS moves the one set instead.
    const source = header()
    expect(source.match(/href="\/products"/g) ?? []).toHaveLength(1)
    expect(source.match(/href="\/contact"/g) ?? []).toHaveLength(1)
  })

  it('the menu button is a real button with aria-expanded and aria-controls', () => {
    const source = header()
    expect(source).toMatch(/type="button"/)
    expect(source).toMatch(/aria-expanded=\{open\}/)
    expect(source).toMatch(/aria-controls="notch-nav"/)
    expect(source).toMatch(/id="notch-nav"/)
  })

  it('closes on Escape and hands focus back to the button', () => {
    // Without the focus return a keyboard user is dropped at the top of the document
    // with no idea where they are.
    const source = header()
    expect(source).toMatch(/event\.key !== 'Escape'/)
    expect(source).toMatch(/toggleRef\.current\?\.focus\(\)/)
  })

  it('closes when the pointer goes down outside the notch', () => {
    expect(header()).toMatch(/notchRef\.current\?\.contains/)
  })

  it('removes both document listeners when it closes', () => {
    // A listener per open would accumulate for the life of the page.
    const source = header()
    expect(source).toMatch(/removeEventListener\('keydown'/)
    expect(source).toMatch(/removeEventListener\('pointerdown'/)
  })
})
