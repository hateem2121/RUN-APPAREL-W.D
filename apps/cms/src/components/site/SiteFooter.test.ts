import { CLIMATE_COMMITMENT, DEFAULT_SITE_SETTINGS } from '@run-apparel/shared'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { EMPTY_FOOTER, type PublicSiteSettings } from '../../lib/projectPublic'
import { SiteFooter } from './SiteFooter'

// `usePathname` needs the app router; outside Next it is mocked, and the path is a
// hoisted mutable so each case can choose the page it renders on (the tab reads it).
const route = vi.hoisted(() => ({ path: '/products' }))
vi.mock('next/navigation', () => ({ usePathname: () => route.path }))
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: unknown }) =>
    createElement('a', { ...rest, href }, children as never),
}))

const base: PublicSiteSettings = {
  ...DEFAULT_SITE_SETTINGS,
  logoUrl: null,
  logoMimeType: null,
  footer: EMPTY_FOOTER,
  familyLists: {},
}
const html = (settings: PublicSiteSettings) =>
  renderToStaticMarkup(createElement(SiteFooter, { settings }))

describe('SiteFooter', () => {
  it('renders the tab as a real link to Contact, label and arrow in separate spans', () => {
    route.path = '/products'
    const out = html(base)
    expect(out).toContain('class="site-footer__tab" href="/contact"')
    expect(out).toContain('site-footer__tab-label">Start a conversation<')
    expect(out).toContain('aria-hidden="true">→<')
  })

  it('on the Contact page the tab links to the email instead — the visitor is already there', () => {
    route.path = '/contact'
    // Not the default address: a tab that ignored the CMS and drew the default would pass with it.
    const out = html({ ...base, email: 'sales@example.com' })
    expect(out).toContain('class="site-footer__tab" href="mailto:sales@example.com"')
    expect(out).not.toContain('site-footer__tab" href="/contact"')
    route.path = '/products'
  })

  it('sets the last word of the question in the serif accent', () => {
    expect(html(base)).toContain('needs making <em>properly</em>?')
  })

  // Standards stays, holding only the company's own climate commitment (owner, 2026-10-17).
  it('renders NO claim block from the CMS when the fields are empty', () => {
    const out = html(base)
    expect(out).not.toContain('footer-block--capacity')
    expect(out).not.toContain('footer-block--elsewhere')
    expect(out).toContain('footer-block--contact')
    const standards = (out.split('footer-block--standards')[1] ?? '').split('</ul>')[0] ?? ''
    expect(standards.match(/<li>/g)).toHaveLength(1)
    expect(standards).toContain(`<li>${CLIMATE_COMMITMENT.line}</li>`)
    // and never a placeholder, dotted or otherwise
    expect(out).not.toMatch(/GOTS|Oeko|MOQ 50/)
  })

  it('renders each claim block only with its own real values', () => {
    const out = html({
      ...base,
      footer: {
        ...EMPTY_FOOTER,
        capacity: {
          moq: '50 pcs per style',
          leadTime: '',
          hours: { firstDay: 1, lastDay: 6, open: '09:00', close: '18:00' },
        },
        // ⚠️ NOT a bare 'GOTS', which is what this fixture carried until 2026-09-16.
        // Production cannot print a bare standard name any more — the entries are
        // qualified because the company holds none of them itself — so a fixture that
        // prints one is testing a string production will never render. Same rule as the
        // root CLAUDE.md's "if production prints, seed a print".
        certifications: [
          'Parent: SEDEX-registered, SMETA-audited',
          'Suppliers: OEKO-TEX, GOTS, GRS',
        ],
        socialLinks: [{ label: 'LinkedIn', url: 'https://www.linkedin.com/company/run-apparel' }],
        worksCoordinates: '32.49° N · 74.52° E',
      },
    })
    expect(out).toContain('50 pcs per style')
    expect(out).toContain('Mon–Sat 09:00–18:00 PKT')
    expect(out).not.toContain('Lead time')
    expect(out).toContain('>Parent: SEDEX-registered, SMETA-audited<')
    expect(out).toContain('>Suppliers: OEKO-TEX, GOTS, GRS<')
    expect(out).toContain('href="https://www.linkedin.com/company/run-apparel" rel="noopener"')
    expect(out).toContain('32.49° N · 74.52° E')
  })

  /*
   * ⚠️ THIS HEADING IS A LEGAL CLAIM, NOT A LABEL.
   *
   * RUN APPAREL holds no certification in its own name — `lib/companyFacts.ts`
   * CERTIFICATION states it and has been live since 2026-09-07. The parent, DURUS
   * INDUSTRIES, is SEDEX-registered and SMETA-audited; the fabric and trim suppliers hold
   * OEKO-TEX, GOTS and GRS. A block headed "Certified" over supplier-held standards tells
   * a trade buyer the company is certified, and OEKO-TEX, GOTS and Textile Exchange each
   * reserve the right to act on misuse of their marks and claims.
   *
   * The owner asked three times for the bare names, then for the bodies' logos; the
   * ruling on 2026-09-16 was this heading plus qualified entries. This test fails if the
   * word comes back, whatever the entries happen to say — which is the half a reviewer
   * reading only the entries would miss.
   */
  it('heads the standards block "Standards" and never claims the company is certified', () => {
    const out = html({
      ...base,
      footer: { ...EMPTY_FOOTER, certifications: ['Suppliers: OEKO-TEX, GOTS, GRS'] },
    })
    expect(out).toContain('<h3>Standards</h3>')
    expect(out).toContain('footer-block--standards')
    expect(out).not.toMatch(/certified/i)
  })

  /*
   * The bodies' logos (owner, 2026-09-29, D25; layout ruled the same evening): each entry
   * keeps its text line, and the marks the entries name sit in ONE row of small marks under
   * the facts — never under each line, which grew the footer from one screen (900 px) to
   * 1,173 px at 768 px wide with the production entries. The strings are the production
   * prints, not bare standard names (see the fixture note above).
   */
  it('keeps every text line and draws the named marks once, in one row under the facts', () => {
    const out = html({
      ...base,
      footer: {
        ...EMPTY_FOOTER,
        certifications: [
          'Parent: SEDEX-registered, SMETA-audited',
          'Suppliers: OEKO-TEX, GOTS, GRS, amfori BSCI',
        ],
      },
    })
    // the qualifier text stays, unchanged, as plain list items
    expect(out).toContain('<li>Parent: SEDEX-registered, SMETA-audited</li>')
    expect(out).toContain('<li>Suppliers: OEKO-TEX, GOTS, GRS, amfori BSCI</li>')
    // one row, after the four blocks and inside the facts, holding every mark
    const row = out.slice(out.indexOf('footer-marks'), out.indexOf('footer-legal'))
    expect(out.indexOf('footer-marks')).toBeGreaterThan(out.indexOf('footer-block--standards'))
    expect(out.match(/footer-marks/g)).toHaveLength(1)
    const imgs = row.match(/<img [^>]*>/g) ?? []
    expect(imgs).toHaveLength(6)
    for (const img of imgs) {
      expect(img).toContain('loading="lazy"')
      expect(img).toContain('decoding="async"')
      expect(img).toMatch(/width="\d+"/)
      expect(img).toMatch(/height="\d+"/)
      expect(img).toContain('class="footer-logo"')
    }
    // BSCI is text only (owner, 2026-09-29): named in the line, never drawn
    // ... and the company's own climate commitment last (owner, 2026-10-17)
    expect(imgs.map((img) => img.match(/alt="([^"]*)"/)?.[1])).toEqual([
      'Sedex',
      'SMETA',
      'OEKO-TEX',
      'GOTS',
      'GRS',
      CLIMATE_COMMITMENT.logo.alt,
    ])
    expect(out.match(/<img [^>]*>/g)).toHaveLength(6)
    // the heading stays "Standards" beside real logos: SMETA is an audit, not a certificate
    expect(out).toContain('<h3>Standards</h3>')
    expect(out).not.toMatch(/certified/i)
    // a body's mark is never a control. The one link is the company's own commitment, drawn at
    // 44px tall, so the 44px floor holds for it.
    expect(row.match(/<a /g)).toHaveLength(1)
    expect(row).toContain('<a class="footer-commitment"')
    expect(CLIMATE_COMMITMENT.logo.height).toBeGreaterThanOrEqual(44)
    expect(row).toContain(`height="${CLIMATE_COMMITMENT.logo.height}"`)
  })

  // NEGATIVE CONTROL: an entry naming no body draws no picture. The company's own third
  // line ("fully prepared to pursue any program-specific certifications") must not borrow a mark.
  it('draws no logo for an entry that names no body', () => {
    const out = html({
      ...base,
      footer: {
        ...EMPTY_FOOTER,
        certifications: ['Program-specific standards on request', 'Suppliers: GRSX'],
      },
    })
    expect(out).toContain('>Program-specific standards on request<')
    expect(out).toContain('>Suppliers: GRSX<')
    // Only the company's own commitment badge, which no entry draws.
    const pictures = out.match(/<img [^>]*>/g) ?? []
    expect(pictures.map((img) => img.match(/src="([^"]*)"/)?.[1])).toEqual([
      CLIMATE_COMMITMENT.logo.src,
    ])
  })

  it('draws no body’s logo at all when there are no entries', () => {
    const drawn = html(base).match(/\/standards\/[^"]+/g) ?? []
    expect(drawn).toEqual([CLIMATE_COMMITMENT.logo.src])
  })

  it('renders the wordmark twice, both decorative, from the same field as the top bar', () => {
    const out = html({ ...base, temporaryWordmark: 'RUN APPAREL' })
    expect(out.match(/footer-mark__layer[^>]*aria-hidden="true"[^>]*>RUN APPAREL</g)).toHaveLength(
      2,
    )
  })

  it('renders the clock placeholder and no light before hydration', () => {
    const out = html(base)
    expect(out).toContain('--:--')
    expect(out).not.toContain('Open now')
  })

  /*
   * The way back to the cookie question, on every page. Withdrawing a choice must be as
   * easy as making it; before 2026-09-30 evening the only way back was a button on the
   * privacy page. It is a real link to the notice's cookie section, so it still works
   * where no question is mounted to reopen (`e2e/consent.spec.ts` covers the reopening).
   */
  it('carries a Cookies link to the notice, beside Privacy and Terms', () => {
    route.path = '/'
    const legal = html(base).split('footer-legal')[1] ?? ''
    expect(legal).toContain('href="/privacy#cookies">Cookies</a>')
    expect(legal.indexOf('>Privacy<')).toBeLessThan(legal.indexOf('>Cookies<'))
    expect(legal.indexOf('>Cookies<')).toBeLessThan(legal.indexOf('>Terms<'))
    route.path = '/products'
  })
})

/*
 * The company's own climate commitment (owner, 2026-10-17): its line last under Standards and its
 * badge last in the row of marks, a link to the company's row in the Hub's list. Drawn whatever the
 * CMS holds, so it is checked with no certifications at all, and with them after the CMS's lines.
 */
describe('SiteFooter and the climate commitment', () => {
  const badgeLink = `<a class="footer-commitment" href="${CLIMATE_COMMITMENT.href.replace('&', '&amp;')}" rel="noopener"><img class="footer-logo" src="${CLIMATE_COMMITMENT.logo.src}"`

  it('draws its line and its linked badge with nothing in the CMS', () => {
    const out = html(base)
    expect(out).toContain(`<li>${CLIMATE_COMMITMENT.line}</li>`)
    expect(out).toContain(badgeLink)
    expect(out).toContain(`alt="${CLIMATE_COMMITMENT.logo.alt}"`)
  })

  it('comes last: after the CMS lines and after the CMS marks', () => {
    const out = html({
      ...base,
      footer: { ...EMPTY_FOOTER, certifications: ['Parent: SEDEX-registered, SMETA-audited'] },
    })
    const standards = out.split('footer-block--standards')[1] ?? ''
    expect(standards.indexOf('SEDEX-registered')).toBeGreaterThan(0)
    expect(standards.indexOf('SEDEX-registered')).toBeLessThan(
      standards.indexOf(CLIMATE_COMMITMENT.line),
    )
    expect(out.indexOf('/standards/smeta.svg')).toBeGreaterThan(0)
    expect(out.indexOf('/standards/smeta.svg')).toBeLessThan(out.indexOf(badgeLink))
  })
})

/*
 * The home page's footer is every website page's footer, question, tab and clock included (owner,
 * 2026-10-17: "100% identical across the whole website"; №05's closing ask stays as well, "keep
 * both"). From 2026-10-16 (#194) to then, the home page left the three out. What would have to
 * break: anything drawn on one page's footer and not the other's. The parts are checked by name
 * too, so two empty footers cannot pass as equal.
 */
describe('SiteFooter on the home page', () => {
  it('is the same footer as another page’s, the tab, the question and its clock included', () => {
    route.path = '/'
    const home = html(base)
    route.path = '/products'
    const other = html(base)
    expect(home).toBe(other)
    for (const part of [
      'site-footer__tab',
      'footer-cta',
      'footer-q',
      'footer-clock',
      'footer-grow',
      'footer-block--contact',
      'footer-legal',
    ]) {
      expect(home, `the home page's footer has no ${part}`).toContain(part)
    }
    expect(home).toContain('<footer class="site-footer">')
  })
})
