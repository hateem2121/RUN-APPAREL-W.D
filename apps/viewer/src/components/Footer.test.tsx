import {
  CONSENT_OPEN_EVENT,
  DEFAULT_SITE_SETTINGS,
  EMPTY_FOOTER,
  formatAddress,
  SITE_FOOTER_LINKS,
  SITE_FOOTER_MADE,
  type ViewerSiteSettings,
} from '@run-apparel/shared'
import { act } from 'react'
import { type Root, createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { SITE_ORIGIN } from '../lib/siteLinks'
import { Footer } from './Footer'
;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

/**
 * The garment pages draw the WEBSITE's footer since 2026-10-02 (visual audit VA-31). The
 * contact details stay what audit FA-Q-09 asked for on the one surface reached by scanning a
 * physical garment tag — email, WhatsApp and the postal address — now in the website's
 * Contact block, with the website's call to action, clock and bottom row around them.
 *
 * The browser suites hold both footers to one template (`siteFooterAriaSnapshot`); these
 * tests pin what the template cannot see: the addresses the links go to.
 */

let host: HTMLDivElement
let root: Root

beforeEach(() => {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

const settings: ViewerSiteSettings = {
  ...DEFAULT_SITE_SETTINGS,
  email: 'sales@example.com',
  whatsappNumber: '+44 1234 567890',
}

const render = (node: React.ReactNode) => act(() => root.render(node))

const links = () => [...host.querySelectorAll<HTMLAnchorElement>('footer a')]
const byText = (label: string) => links().find((a) => a.textContent === label)
const headings = () => [...host.querySelectorAll('footer h3')].map((h) => h.textContent)

describe('Footer', () => {
  it('prints the contact details the CMS holds, as readable text', () => {
    render(<Footer settings={settings} />)

    const text = host.textContent ?? ''
    // The ADDRESS is the label, not "Email Us" — a buyer verifying a supplier reads
    // and copies it. The enquiry buttons elsewhere on the page are the conversion
    // control and say the verb instead.
    expect(text).toContain('sales@example.com')
    expect(text).toContain('+44 1234 567890')
    expect(links().map((a) => a.getAttribute('href'))).toContain('mailto:sales@example.com')
  })

  it('strips the WhatsApp number to digits, because wa.me rejects the rest', () => {
    render(<Footer settings={settings} />)

    const wa = links().find((a) => (a.getAttribute('href') ?? '').includes('wa.me'))
    // The displayed value keeps its spaces and its `+`; the href must not. The words around
    // it are the website footer's since VA-31.
    expect(wa?.getAttribute('href')).toBe('https://wa.me/441234567890')
    expect(wa?.textContent).toBe('WhatsApp +44 1234 567890')
    expect(wa?.getAttribute('rel')).toContain('noopener')
  })

  it('carries no enquiry template — that belongs to the conversion controls', () => {
    render(<Footer settings={settings} />)

    // `viewer.spec.ts` pins the locked template on `.contact a`. If this link ever
    // grew one, that test would not notice and the two would drift; the footer is a
    // detail to read, not a prefilled message to send.
    const mailto = links().find((a) => (a.getAttribute('href') ?? '').startsWith('mailto:'))
    expect(mailto?.getAttribute('href')).not.toContain('?')
  })

  it("offers routes out that are not an enquiry: the website's own pages", () => {
    render(<Footer settings={settings} />)

    // Audit FA-W-01 found every anchor on this page was an enquiry or the skip link. The
    // website's bottom row answers it with Products and Guides (the "wear-run.com" link the
    // old footer carried went with it, VA-31).
    expect(byText('Products')?.getAttribute('href')).toBe('https://wear-run.com/products')
    expect(byText('Guides')?.getAttribute('href')).toBe('https://wear-run.com/guides')
  })

  // Polish Q42 (owner, 2026-10-04): a garment page ends on one prompt, "Ask about this garment",
  // in its contact section. The footer's tab and question were the second and third (X23).
  it('asks nothing: no "Start an inquiry" tab, no question, no clock beside it', () => {
    render(<Footer settings={settings} />)
    expect(host.querySelector('footer')?.classList.contains('site-footer--no-prompt')).toBe(true)
    expect(host.querySelector('.site-footer__tab')).toBeNull()
    expect(host.querySelector('.footer-cta, .footer-q, .footer-clock')).toBeNull()
    expect(host.textContent).not.toContain(EMPTY_FOOTER.ctaLabel)
    expect(host.textContent).not.toContain(EMPTY_FOOTER.ctaQuestion)
    // The routes stay: the facts still carry the email and WhatsApp.
    expect(headings()).toContain('Contact')
  })

  it('still shows the legal line', () => {
    render(<Footer settings={settings} />)
    expect(host.textContent).toContain(DEFAULT_SITE_SETTINGS.legalLine)
  })

  it('links every page in the bottom row on the website, in the shared order', () => {
    render(<Footer settings={settings} />)

    // Both surfaces process visitor data, and the notice says it covers these pages; a
    // visitor looks for it in the footer of the page they are on.
    const row = [...host.querySelectorAll<HTMLAnchorElement>('.footer-legal a')]
    expect(row.map((a) => a.textContent)).toEqual(SITE_FOOTER_LINKS.map((link) => link.label))
    expect(byText('Privacy')?.getAttribute('href')).toBe('https://wear-run.com/privacy')
    expect(byText('Terms')?.getAttribute('href')).toBe('https://wear-run.com/terms')
  })

  /*
   * The way back to the cookie question. Withdrawing a choice must be as easy as making
   * it, so the link is on the page itself. Both halves matter: with a banner listening the
   * click stays put (the question opens in place); with none, it must remain a working
   * link, or the control would silently do nothing.
   */
  it('offers the cookie question again, and stays a real link when no banner answers', () => {
    render(<Footer settings={settings} />)
    const cookies = byText('Cookies')
    expect(cookies?.getAttribute('href')).toBe('https://wear-run.com/privacy#cookies')

    // Read at the document, which is above React's root, so the footer's handler has run.
    // Then cancel, so jsdom does not try to follow the link.
    const click = () => {
      let stayed = false
      const after = (event: Event) => {
        stayed = event.defaultPrevented
        event.preventDefault()
      }
      document.addEventListener('click', after, { once: true })
      act(() => {
        cookies?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
      })
      return stayed
    }

    expect(click(), 'no banner is listening, so the link must navigate').toBe(false)

    let opened = 0
    const banner = (event: Event) => {
      opened += 1
      event.preventDefault()
    }
    document.addEventListener(CONSENT_OPEN_EVENT, banner)
    try {
      expect(click(), 'a banner answered, so the page must stay put').toBe(true)
      expect(opened).toBe(1)
    } finally {
      document.removeEventListener(CONSENT_OPEN_EVENT, banner)
    }
  })

  it('prints the postal address the site footer prints', () => {
    render(<Footer settings={settings} />)
    expect(host.querySelector('.footer-block--contact')?.textContent).toContain(formatAddress())
  })

  // Polish F9 (the owner's Q22): the four category pages, on the website, from every footer.
  it('links "What we make" to the website\'s four category pages', () => {
    render(<Footer settings={settings} />)
    const made = [...host.querySelectorAll<HTMLAnchorElement>('.footer-block--made a')]
    expect(made.map((a) => [a.textContent, a.getAttribute('href')])).toEqual(
      SITE_FOOTER_MADE.map((link) => [link.label, `${SITE_ORIGIN}${link.href}`]),
    )
    expect(made).toHaveLength(4)
  })

  it('draws no claim block for a blank claim, and each claim block once it is set', () => {
    render(<Footer settings={settings} />)
    // "What we make" is not a claim: it is there with nothing set.
    expect(headings()).toEqual(['Contact', 'What we make'])
    expect(host.querySelector('.footer-marks')).toBeNull()

    render(
      <Footer
        settings={{
          ...settings,
          footer: {
            ...EMPTY_FOOTER,
            capacity: { moq: '300 pieces', leadTime: '6 weeks', hours: null },
            worksCoordinates: '32.4945° N, 74.5229° E',
            certifications: ['Suppliers: OEKO-TEX, GOTS'],
            socialLinks: [{ label: 'LinkedIn', url: 'https://www.linkedin.com/company/x' }],
          },
        }}
      />,
    )
    // The website's order since polish X23: the two link groups, then the two claims.
    expect(headings()).toEqual(['Contact', 'What we make', 'Elsewhere', 'Capacity', 'Standards'])
    expect(host.textContent).toContain('MOQ 300 pieces')
    expect(host.textContent).toContain('32.4945° N, 74.5229° E')
    // The marks follow from the entry's words, in the order named, from the website's files.
    const marks = [...host.querySelectorAll<HTMLImageElement>('.footer-marks img')]
    expect(marks.map((img) => img.alt)).toEqual(['OEKO-TEX', 'GOTS'])
    expect(marks.map((img) => img.getAttribute('src'))).toEqual([
      '/standards/oeko-tex.svg',
      '/standards/gots.svg',
    ])
    expect(byText('LinkedIn')?.getAttribute('href')).toBe('https://www.linkedin.com/company/x')
  })

  it('draws the default footer from an API answer cached before the footer joined it', () => {
    const { footer: _dropped, ...older } = settings
    render(<Footer settings={older} />)
    // The facts with no claim (no capacity, standards or links), and the legal row.
    expect(headings()).toEqual(['Contact', 'What we make'])
    expect(host.textContent).toContain(DEFAULT_SITE_SETTINGS.legalLine)
  })

  it('counts the email and WhatsApp clicks, as the footer it replaced did', () => {
    render(<Footer settings={settings} />)
    const events: string[] = []
    const listen = (event: Event) => {
      events.push((event as CustomEvent<{ event: string }>).detail.event)
    }
    document.addEventListener('run:analytics', listen)
    const stay = (event: Event) => event.preventDefault()
    document.addEventListener('click', stay)
    try {
      for (const a of links().filter((l) => /^(mailto:|https:\/\/wa\.me)/.test(l.href))) {
        act(() => {
          a.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
        })
      }
    } finally {
      document.removeEventListener('run:analytics', listen)
      document.removeEventListener('click', stay)
    }
    expect(events).toEqual(['email_clicked', 'whatsapp_clicked'])
  })
})
