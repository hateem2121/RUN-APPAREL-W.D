import { DEFAULT_SITE_SETTINGS, type ViewerSiteSettings } from '@run-apparel/shared'
import { act } from 'react'
import { type Root, createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { RetiredNotice, UnavailableState } from './States'
;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

/**
 * The two states a visitor sees when something has gone wrong — which is exactly
 * when the viewer is least forgiving, because the person looking at it scanned a
 * printed tag and cannot "try a different link".
 *
 * WHY THE noindex EFFECT IS THE POINT OF THIS FILE. `UnavailableState` appends a
 * `<meta name="robots" content="noindex">` on mount and removes it on unmount. Both
 * halves matter and both fail silently:
 *
 *   - Without the ADD, a retired product code gets indexed as "This reference has
 *     moved forward" and that page outlives the garment in search results. QR URLs
 *     are printed on tags and do get crawled.
 *   - Without the REMOVE, the tag survives client-side navigation to a product that
 *     IS available, and a live garment is silently deindexed. Nothing on the page
 *     looks different in either case, and no test elsewhere in this repo — including
 *     the axe scan and the Lighthouse run, which measure a single static state —
 *     could observe the difference.
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
  for (const meta of document.head.querySelectorAll('meta[name="robots"]')) meta.remove()
})

const render = (node: React.ReactNode) => {
  act(() => root.render(node))
}

const robotsMetas = () => [...document.head.querySelectorAll('meta[name="robots"]')]

describe('RetiredNotice', () => {
  it('announces the message as a live status region', () => {
    render(<RetiredNotice message="This colourway is no longer active." />)

    const notice = host.querySelector('.notice')
    // role="status" is what makes a screen reader announce the substitution. Without
    // it the visitor is shown a different garment than their tag pointed at, with no
    // spoken indication that anything was swapped.
    expect(notice?.getAttribute('role')).toBe('status')
    expect(notice?.textContent).toContain('This colourway is no longer active.')
  })

  it('renders whatever message the CMS supplied, per-product', () => {
    render(<RetiredNotice message="Ask us about the replacement." />)
    expect(host.textContent).toContain('Ask us about the replacement.')
  })
})

describe('UnavailableState', () => {
  it('adds a robots noindex tag while it is on screen', () => {
    expect(robotsMetas()).toHaveLength(0)
    render(<UnavailableState />)

    expect(robotsMetas()).toHaveLength(1)
    expect(robotsMetas()[0]?.getAttribute('content')).toBe('noindex')
  })

  it('removes the noindex tag on unmount, so a later live product is not deindexed', () => {
    render(<UnavailableState />)
    expect(robotsMetas()).toHaveLength(1)

    act(() => root.render(<div />))

    expect(robotsMetas(), 'the meta must not survive the component').toHaveLength(0)
  })

  it('falls back to the shared default settings when none are supplied', () => {
    render(<UnavailableState />)

    // The primary action moved from the catalogue to Email on 2026-09-04, when the
    // catalogue button was removed. This screen must keep exactly ONE primary
    // action — it is the only screen a visitor reaches with intent and gets
    // nothing, so an ambiguous recovery path is the expensive failure here.
    const primary = host.querySelector<HTMLAnchorElement>('a.btn--primary')
    expect(primary?.href).toContain(`mailto:${DEFAULT_SITE_SETTINGS.email}`)
    expect(host.querySelectorAll('a.btn--primary')).toHaveLength(1)
  })

  it('offers both contact routes, and deliberately does NOT link the catalogue', () => {
    const settings: ViewerSiteSettings = {
      ...DEFAULT_SITE_SETTINGS,
      email: 'sales@example.com',
      whatsappNumber: '+441234567890',
      catalogueUrl: 'https://example.com/catalogue',
    }
    render(<UnavailableState settings={settings} />)

    const hrefs = [...host.querySelectorAll<HTMLAnchorElement>('a')].map(
      (a) => a.getAttribute('href') ?? '',
    )

    // This page is a dead end unless these work: the visitor arrived from a printed
    // tag for a product that no longer exists, and these are the only path from
    // "your QR is dead" to "talk to us".
    expect(hrefs.some((h) => h.startsWith('mailto:sales@example.com'))).toBe(true)
    expect(hrefs.some((h) => h.includes('441234567890'))).toBe(true)

    // ⚠️ THE NEGATIVE HALF IS THE POINT, and it is why this assertion exists at all.
    // Owner decision 2026-09-04: no page may hand a visitor the catalogue, because
    // these pages are indexed and the catalogue is a 54 MB B2B PDF. `catalogueUrl`
    // is STILL in the payload and still in this component's props, so nothing about
    // the types stops someone rendering it again — only this line does. It was
    // previously asserted the other way round (`toBe(true)`), so the decision would
    // silently revert if this were merely deleted rather than inverted.
    expect(hrefs.some((h) => h.includes('example.com/catalogue'))).toBe(false)
  })

  it('offers a browse route out, and it is the index rather than the catalogue', () => {
    // Audit FA-W-03: a mistyped URL on the marketing site got "Browse the
    // references"; a DEAD QR TAG — the visitor who arrived with intent, holding the
    // garment — got the two enquiry buttons and nothing else. Both halves are
    // asserted, because the fix is only correct if it is the ordinary index page:
    // linking the catalogue here would satisfy "a browse route exists" and break
    // the 2026-09-04 decision the assertion below guards.
    render(<UnavailableState />)

    const browse = [...host.querySelectorAll<HTMLAnchorElement>('a')].find((a) =>
      (a.getAttribute('href') ?? '').includes('/products'),
    )
    expect(browse?.getAttribute('href')).toBe('https://wear-run.help/products')
    expect(browse?.textContent).toMatch(/browse/i)
    // …and it did not smuggle the catalogue back in under a different label.
    expect(browse?.getAttribute('href')).not.toContain('catalogue')
  })

  it('opens WhatsApp in a new tab without leaking the referrer', () => {
    render(<UnavailableState />)
    const wa = [...host.querySelectorAll<HTMLAnchorElement>('a')].find((a) =>
      (a.getAttribute('href') ?? '').includes('wa.me'),
    )

    expect(wa?.getAttribute('target')).toBe('_blank')
    // `noopener` is the security half (the opened page cannot reach back through
    // window.opener); dropping it is invisible until it is exploited.
    expect(wa?.getAttribute('rel')).toContain('noopener')
  })

  it('marks itself as the page main landmark', () => {
    render(<UnavailableState />)
    expect(host.querySelector('main')).not.toBeNull()
  })
})
