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
    expect(out).toContain('site-footer__tab-label">Start an enquiry<')
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
    expect(out).not.toContain('footer-block--certified')
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
        certifications: ['GOTS'],
        socialLinks: [{ label: 'LinkedIn', url: 'https://www.linkedin.com/company/run-apparel' }],
        worksCoordinates: '32.49° N · 74.52° E',
      },
    })
    expect(out).toContain('50 pcs per style')
    expect(out).toContain('Mon–Sat 09:00–18:00 PKT')
    expect(out).not.toContain('Lead time')
    expect(out).toContain('>GOTS<')
    expect(out).toContain('href="https://www.linkedin.com/company/run-apparel" rel="noopener"')
    expect(out).toContain('32.49° N · 74.52° E')
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
