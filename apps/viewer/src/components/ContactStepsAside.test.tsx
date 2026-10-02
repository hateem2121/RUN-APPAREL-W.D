import { DEFAULT_SITE_SETTINGS, type EnquiryContext } from '@run-apparel/shared'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ContactSection, MobileActionBar } from './Contact'
;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

/**
 * VA-54 (visual audit, 2026-10-02): the phone's fixed contact bar fades away while the page's own
 * Email and WhatsApp are on screen. `lib/actionBarStepsAside.test.ts` holds WHEN the module sets
 * its attribute; this holds that `<MobileActionBar>` actually starts it, on its own element, and
 * stops it again, which is the part a module test cannot see and which only a browser run would
 * otherwise notice. A separate file from `Contact.test.tsx`, whose stub observer never reports.
 */

let observers: FakeObserver[] = []

class FakeObserver {
  disconnected = false
  constructor(readonly callback: (entries: Partial<IntersectionObserverEntry>[]) => void) {
    observers.push(this)
  }
  observe() {}
  disconnect() {
    this.disconnected = true
  }
  /** The page's pair is this much on screen. */
  report(intersectionRatio: number) {
    this.callback([{ intersectionRatio }])
  }
}

let host: HTMLDivElement
let root: Root

beforeEach(() => {
  observers = []
  vi.stubGlobal('IntersectionObserver', FakeObserver)
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
  vi.unstubAllGlobals()
})

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

/** The garment page's own order: the page's pair inside <main>, the bar after it. */
const page = (
  <>
    <main>
      <ContactSection settings={SETTINGS} enquiry={ENQUIRY} />
    </main>
    <MobileActionBar settings={SETTINGS} enquiry={ENQUIRY} />
  </>
)

const bar = () => host.querySelector<HTMLElement>('aside.action-bar')

describe('<MobileActionBar> steps aside for the page’s own pair (VA-54)', () => {
  it('tucks its own bar when the pair is on screen and untucks it when it is not', () => {
    act(() => root.render(page))
    expect(observers, 'the bar started no watch on the page’s pair').toHaveLength(1)
    expect(bar()?.hasAttribute('data-tucked')).toBe(false)

    observers[0]?.report(1)
    expect(bar()?.hasAttribute('data-tucked'), 'the pair is on screen and the bar stayed').toBe(
      true,
    )

    observers[0]?.report(0)
    expect(
      bar()?.hasAttribute('data-tucked'),
      'the pair scrolled off and the bar stayed away',
    ).toBe(false)
  })

  it('leaves a bar with no pair on the page alone', () => {
    act(() => root.render(<MobileActionBar settings={SETTINGS} enquiry={ENQUIRY} />))
    expect(observers).toHaveLength(0)
    expect(bar()?.hasAttribute('data-tucked')).toBe(false)
  })

  it('stops watching, and gives the bar back, when the bar goes', () => {
    act(() => root.render(page))
    const element = bar()
    observers[0]?.report(1)
    expect(element?.hasAttribute('data-tucked')).toBe(true)

    act(() => root.render(<main />))
    expect(observers[0]?.disconnected, 'the watch outlived the bar').toBe(true)
    expect(element?.hasAttribute('data-tucked'), 'the bar was left tucked').toBe(false)
  })
})
