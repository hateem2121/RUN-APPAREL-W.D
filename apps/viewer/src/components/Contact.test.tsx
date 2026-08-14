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

describe('StickyContactRail', () => {
  const renderRail = () => {
    const stage = document.createElement('div')
    stage.className = 'stage'
    document.body.appendChild(stage)
    render(<StickyContactRail settings={SETTINGS} enquiry={ENQUIRY} />)
    return stage
  }

  it('starts hidden, and hidden means BOTH aria-hidden and inert', () => {
    const stage = renderRail()
    const rail = host.querySelector('.contact-rail')

    expect(rail?.getAttribute('aria-hidden')).toBe('true')
    expect(rail?.hasAttribute('inert'), 'inert is what keeps it out of the tab order').toBe(true)
    stage.remove()
  })

  it('becomes visible, and interactive, once the stage scrolls out of view', () => {
    const stage = renderRail()
    act(() => observers[0]?.trigger(false))

    const rail = host.querySelector('.contact-rail')
    expect(rail?.className).toContain('contact-rail--visible')
    expect(rail?.getAttribute('aria-hidden')).toBe('false')
    expect(rail?.hasAttribute('inert')).toBe(false)
    stage.remove()
  })

  /**
   * The invariant, stated once so it cannot drift: these two attributes are set from
   * the SAME boolean and must never disagree. A rail that is aria-hidden but
   * focusable is the axe `aria-hidden-focus` violation the source comment cites, and
   * it is unreachable by the static scan.
   */
  it.each([false, true])(
    'keeps aria-hidden and inert in agreement (stage intersecting: %s)',
    (isIntersecting) => {
      const stage = renderRail()
      act(() => observers[0]?.trigger(isIntersecting))

      const rail = host.querySelector('.contact-rail')
      const ariaHidden = rail?.getAttribute('aria-hidden') === 'true'
      expect(rail?.hasAttribute('inert')).toBe(ariaHidden)
      stage.remove()
    },
  )

  it('does nothing at all when the stage element is absent', () => {
    // A product page rendered without a 3D stage (the separate-GLB error path) must
    // not crash the rail's effect.
    expect(() => render(<StickyContactRail settings={SETTINGS} enquiry={ENQUIRY} />)).not.toThrow()
    expect(observers, 'no stage means no observer to leak').toHaveLength(0)
  })

  it('accepts a custom stage selector', () => {
    const stage = document.createElement('div')
    stage.id = 'custom-stage'
    document.body.appendChild(stage)

    render(
      <StickyContactRail settings={SETTINGS} enquiry={ENQUIRY} stageSelector="#custom-stage" />,
    )
    expect(observers).toHaveLength(1)
    stage.remove()
  })

  it('disconnects its observer on unmount', () => {
    const stage = renderRail()
    act(() => root.unmount())

    expect(
      observers[0]?.disconnected,
      'an undisconnected observer leaks on every route change',
    ).toBe(true)
    stage.remove()
    root = createRoot(host) // afterEach unmounts again; give it a live root
  })
})
