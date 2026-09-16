import { DEFAULT_SITE_SETTINGS } from '@run-apparel/shared'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { EMPTY_FOOTER, type PublicSiteSettings } from '../../lib/projectPublic'
import { SiteFooter } from './SiteFooter'

// `usePathname` needs the app router; outside Next it is mocked, and the path is a
// hoisted mutable so each case can choose the page it renders on.
const route = vi.hoisted(() => ({ path: '/' }))
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
}
const html = (settings: PublicSiteSettings) =>
  renderToStaticMarkup(createElement(SiteFooter, { settings }))

describe('SiteFooter', () => {
  it('renders the tab as a real link to Contact, label and arrow in separate spans', () => {
    route.path = '/'
    const out = html(base)
    expect(out).toContain('class="site-footer__tab" href="/contact"')
    expect(out).toContain('site-footer__tab-label">Start an inquiry<')
    expect(out).toContain('aria-hidden="true">→<')
  })

  it('on the Contact page the tab links to the email instead — the visitor is already there', () => {
    route.path = '/contact'
    const out = html(base)
    expect(out).toContain('class="site-footer__tab" href="mailto:partner@wear-run.com"')
    expect(out).not.toContain('site-footer__tab" href="/contact"')
    route.path = '/'
  })

  it('sets the last word of the question in the serif accent', () => {
    expect(html(base)).toContain('needs making <em>properly</em>?')
  })

  it('renders NO claim block when the fields are empty', () => {
    const out = html(base)
    expect(out).not.toContain('footer-block--capacity')
    expect(out).not.toContain('footer-block--standards')
    expect(out).not.toContain('footer-block--elsewhere')
    expect(out).toContain('footer-block--contact')
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
})
