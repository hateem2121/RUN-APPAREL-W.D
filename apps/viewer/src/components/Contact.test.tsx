import { DEFAULT_SITE_SETTINGS, type EnquiryContext } from '@run-apparel/shared'
import { act } from 'react'
import { type Root, createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ContactSection, MobileActionBar, StickyContactRail } from './Contact'
;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

/**
 * The contact surfaces — the only conversion path in the whole product. There is no
 * cart and no form: a buyer either taps one of these or leaves.
 *
 * THE ONE THAT AXE CANNOT CATCH. `StickyContactRail` sets `aria-hidden` AND `inert`
 * from the same boolean. The comment beside it names the axe rule (`aria-hidden-focus`)
 * and that rule is real — but axe evaluates a STATIC snapshot, and `e2e/a11y.spec.ts`
 * scans the page in its default state where the rail is hidden and correct. The bug
 * this guards against is the pair drifting apart: keep `aria-hidden` and drop `inert`
 * and a keyboard user tabs into two links a screen reader has been told do not exist.
 * The page passes every scan in the repo the entire time, because the broken state is
 * one the scanner never puts it in.
 *
 * jsdom has no IntersectionObserver, so it is stubbed rather than mocked away — the
 * stub keeps the real callback so the visibility transition is genuinely exercised.
 */

interface StubObserver {
  trigger: (isIntersecting: boolean) => void
  disconnected: boolean
}

let observers: StubObserver[] = []

beforeEach(() => {
  observers = []
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(private readonly cb: (entries: { isIntersecting: boolean }[]) => void) {
        observers.push({
          trigger: (isIntersecting) => this.cb([{ isIntersecting }]),
          disconnected: false,
        })
      }
      observe() {}
      disconnect() {
        const own = observers[observers.length - 1]
        if (own) own.disconnected = true
      }
    },
  )
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
  vi.unstubAllGlobals()
})

let host: HTMLDivElement
let root: Root

const SETTINGS = {
  ...DEFAULT_SITE_SETTINGS,
  email: 'sales@example.com',
  whatsappNumber: '+441234567890',
}

const ENQUIRY: EnquiryContext = {
  productName: 'Velocity Tee',
  productCode: 'N001',
  colourName: 'Wine',
}

const render = (node: React.ReactNode) => act(() => root.render(node))
const anchors = () => [...host.querySelectorAll<HTMLAnchorElement>('a')]

describe('contact buttons (shared by all three surfaces)', () => {
  it.each([
    ['ContactSection', <ContactSection key="s" settings={SETTINGS} enquiry={ENQUIRY} />],
    ['MobileActionBar', <MobileActionBar key="m" settings={SETTINGS} enquiry={ENQUIRY} />],
  ])('%s builds a mailto carrying the garment context', (_label, node) => {
    render(node)

    const mailto = anchors().find((a) => a.getAttribute('href')?.startsWith('mailto:'))
    const href = decodeURIComponent(mailto?.getAttribute('href') ?? '')

    // The pre-filled template is what makes an enquiry answerable — without the
    // product code the sales reply starts with "which garment?".
    expect(href).toContain('sales@example.com')
    expect(href).toContain('N001')
    expect(href).toContain('Wine')
  })

  it.each([
    ['ContactSection', <ContactSection key="s" settings={SETTINGS} enquiry={ENQUIRY} />],
    ['MobileActionBar', <MobileActionBar key="m" settings={SETTINGS} enquiry={ENQUIRY} />],
  ])('%s opens WhatsApp safely in a new tab', (_label, node) => {
    render(node)

    const wa = anchors().find((a) => a.getAttribute('href')?.includes('wa.me'))
    expect(wa?.getAttribute('href')).toContain('441234567890')
    expect(wa?.getAttribute('target')).toBe('_blank')
    expect(wa?.getAttribute('rel')).toContain('noopener')
    expect(wa?.getAttribute('rel')).toContain('noreferrer')
  })

  it('keeps the verb on the mobile action bar, and only the desktop rail is compact', () => {
    /**
     * ⚠️ REVERSED 2026-08-14 BY OWNER DECISION. This asserted the opposite.
     *
     * The action bar is the persistent call to action on the device this product
     * is actually opened with — someone scans a QR code on a garment tag with a
     * phone — and "Email" alone reads as the label of a field rather than as an
     * invitation to do something. It is the one surface where the verb is the
     * point, so it is the one surface that should not have dropped it.
     *
     * Measured at 320px before shipping: both full labels fit on one line. The
     * audit had recorded the layout overflowing at that width, which is why the
     * check was necessary and why it had to come after the header fix.
     *
     * `compact` is kept for <StickyContactRail> — narrow, desktop-only, and
     * beside a page that has already made the offer in full.
     */
    render(<MobileActionBar settings={SETTINGS} enquiry={ENQUIRY} />)
    expect(host.textContent).toContain('Email Us')
    expect(host.textContent).toContain('WhatsApp Us')

    render(<StickyContactRail settings={SETTINGS} enquiry={ENQUIRY} />)
    expect(host.textContent).toContain('Email')
    expect(host.textContent).not.toContain('Email Us')

    render(<ContactSection settings={SETTINGS} enquiry={ENQUIRY} />)
    expect(host.textContent).toContain('Email Us')
  })
})

describe('ContactSection', () => {
  it('is a labelled landmark section', () => {
    render(<ContactSection settings={SETTINGS} enquiry={ENQUIRY} />)

    const section = host.querySelector('section.contact')
    const labelledBy = section?.getAttribute('aria-labelledby')
    expect(labelledBy).toBe('contact-heading')
    // A dangling aria-labelledby is worse than none — the accessible name silently
    // becomes empty rather than falling back to the heading text.
    expect(host.querySelector(`#${labelledBy}`)).not.toBeNull()
  })
})

/**
 * ⚠️ THIS BLOCK USED TO ASSERT THE OPPOSITE, and it was replaced 2026-08-17 by
 * owner decision rather than because the old assertions were wrong.
 *
 * The rail was gated on an IntersectionObserver watching `.stage`: it appeared
 * only once the garment had scrolled out of view. So on a desktop machine, for
 * the whole first screen — which is the entire page for a visitor who does not
 * scroll — there was no way to make contact at all. This is the only conversion
 * path in the product: there is no cart and no form, a buyer either taps one of
 * these or leaves.
 *
 * The observer, the `visible` state, `aria-hidden`, `inert` and the
 * `stageSelector` prop all went together. Their tests went with them: an
 * always-visible rail cannot have the two attributes drift apart, because it no
 * longer sets either.
 */
describe('StickyContactRail', () => {
  it('is visible and interactive from first paint', () => {
    render(<StickyContactRail settings={SETTINGS} enquiry={ENQUIRY} />)
    const rail = host.querySelector('.contact-rail')

    expect(rail, 'no rail rendered at all').not.toBeNull()
    expect(
      rail?.hasAttribute('inert'),
      'inert keeps the links out of the tab order — the rail is always reachable now',
    ).toBe(false)
    expect(
      rail?.getAttribute('aria-hidden'),
      'aria-hidden would conceal the only conversion path from a screen reader',
    ).toBeNull()
  })

  it('needs no stage element, and observes nothing', () => {
    // The rail used to require `.stage` to exist before it would ever appear, so
    // the separate-GLB error path (no stage) silently had no contact rail.
    expect(() => render(<StickyContactRail settings={SETTINGS} enquiry={ENQUIRY} />)).not.toThrow()
    expect(
      observers,
      'the rail still constructs an IntersectionObserver — it should not scroll-gate at all',
    ).toHaveLength(0)
    expect(host.querySelectorAll('a')).toHaveLength(2)
  })
})
