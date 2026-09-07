import { DEFAULT_SITE_SETTINGS, type ViewerSiteSettings } from '@run-apparel/shared'
import { act } from 'react'
import { type Root, createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Footer } from './Footer'
;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

/**
 * The footer is the company's identity block on the one surface reached by
 * scanning a physical garment tag — audit FA-Q-09 measured it holding a wordmark,
 * a tagline and a legal line, while the marketing site's footer prints email,
 * WhatsApp and a postal address. The buyer most likely to be verifying a supplier
 * was the one shown least about them.
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

const links = () => [...host.querySelectorAll<HTMLAnchorElement>('.footer__meta a')]

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
    // The displayed value keeps its spaces and its `+`; the href must not.
    expect(wa?.getAttribute('href')).toBe('https://wa.me/441234567890')
    expect(wa?.textContent).toBe('+44 1234 567890')
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

  it('offers the one route out that is not an enquiry', () => {
    render(<Footer settings={settings} />)

    // Audit FA-W-01: six anchors, three destinations, and every one of them either
    // an enquiry or the skip link. This is the secondary action for the buyer who
    // is interested and not yet ready to email.
    const home = links().find((a) => a.getAttribute('href') === 'https://wear-run.help')
    expect(home?.textContent).toBe('wear-run.help')
  })

  it('still shows the legal line', () => {
    render(<Footer settings={settings} />)
    expect(host.textContent).toContain(DEFAULT_SITE_SETTINGS.legalLine)
  })
})
