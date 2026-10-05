import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { startActionBarStepsAside, TUCKED_ATTRIBUTE } from './actionBarStepsAside'

/**
 * VA-54 (visual audit, 2026-10-02). The fixed contact bar fades away while the SAME two buttons
 * are on screen in the page, and returns when they scroll off. This module only sets an attribute
 * on the bar, so what is held here is when it does, and that it fails open: a page without an
 * observer, or without the in-page pair, keeps its bar. The fade, the focus exemption and the
 * reduced-motion behaviour are CSS and are measured in a real browser by
 * `e2e/action-bar-steps-aside.spec.ts`; jsdom has no layout, so both observers are stood in for.
 */

const ON_SCREEN = 0.95

let intersection: FakeIntersectionObserver[] = []
let resizing: FakeResizeObserver[] = []

class FakeIntersectionObserver {
  observed: Element[] = []
  disconnected = false
  constructor(
    readonly callback: (entries: Partial<IntersectionObserverEntry>[]) => void,
    readonly options: IntersectionObserverInit,
  ) {
    intersection.push(this)
  }
  observe(element: Element) {
    this.observed.push(element)
  }
  disconnect() {
    this.disconnected = true
  }
  /** Report the pair at these ratios, oldest first — the way a browser batches entries. */
  report(...ratios: number[]) {
    this.callback(ratios.map((ratio) => ({ intersectionRatio: ratio, isIntersecting: ratio > 0 })))
  }
}

class FakeResizeObserver {
  observed: Element[] = []
  disconnected = false
  constructor(readonly callback: () => void) {
    resizing.push(this)
  }
  observe(element: Element) {
    this.observed.push(element)
  }
  disconnect() {
    this.disconnected = true
  }
}

function barOfHeight(height: number) {
  const bar = document.createElement('aside')
  bar.className = 'action-bar'
  bar.getBoundingClientRect = () => ({ height }) as DOMRect
  document.body.append(bar)
  return bar
}

/** The page's own main contact button, "Ask about this garment" since polish S10. */
function inPagePair() {
  const pair = document.createElement('a')
  pair.className = 'btn btn--primary contact__ask'
  document.body.append(pair)
  return pair
}

const live = () => intersection.filter((observer) => !observer.disconnected)

beforeEach(() => {
  intersection = []
  resizing = []
  vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver)
  vi.stubGlobal('ResizeObserver', FakeResizeObserver)
})

afterEach(() => {
  vi.unstubAllGlobals()
  document.body.replaceChildren()
})

describe('startActionBarStepsAside', () => {
  it('watches the page’s main button against the whole screen, for most of it (polish S10)', () => {
    const bar = barOfHeight(72.4)
    const pair = inPagePair()
    startActionBarStepsAside(bar)
    expect(live()).toHaveLength(1)
    expect(live()[0]?.observed).toEqual([pair])
    // Not the bar's edge: "Ask about this garment" half clear of the bar showed beside the bar's
    // own main button. On screen at all, the bar fades away from over it.
    expect(live()[0]?.options).toEqual({ rootMargin: '0px', threshold: ON_SCREEN })
  })

  it('tucks the bar when the pair is on screen and brings it back when it is not', () => {
    const bar = barOfHeight(72)
    inPagePair()
    startActionBarStepsAside(bar)
    const observer = live()[0]
    observer?.report(0)
    expect(bar.hasAttribute(TUCKED_ATTRIBUTE)).toBe(false)
    observer?.report(1)
    expect(bar.hasAttribute(TUCKED_ATTRIBUTE), 'the pair is on screen and the bar stayed').toBe(
      true,
    )
    observer?.report(0.4)
    expect(
      bar.hasAttribute(TUCKED_ATTRIBUTE),
      'the pair is mostly off and the bar stayed away',
    ).toBe(false)
  })

  it('treats "nearly all of it" as on screen, and half of it as not', () => {
    const bar = barOfHeight(72)
    inPagePair()
    startActionBarStepsAside(bar)
    const observer = live()[0]
    observer?.report(ON_SCREEN)
    expect(bar.hasAttribute(TUCKED_ATTRIBUTE)).toBe(true)
    observer?.report(0.5)
    expect(bar.hasAttribute(TUCKED_ATTRIBUTE)).toBe(false)
  })

  it('believes the newest of several batched entries, not the oldest', () => {
    const bar = barOfHeight(72)
    inPagePair()
    startActionBarStepsAside(bar)
    const observer = live()[0]
    observer?.report(1, 0)
    expect(
      bar.hasAttribute(TUCKED_ATTRIBUTE),
      'it scrolled off again before the callback ran',
    ).toBe(false)
    observer?.report(0, 1)
    expect(bar.hasAttribute(TUCKED_ATTRIBUTE)).toBe(true)
  })

  it('rebuilds the footer’s watcher when the bar changes height, and not when it does not', () => {
    // The bar grows with the visitor's text size (`actionBarHeight.ts`): the margin has to follow.
    let height = 72
    const bar = barOfHeight(height)
    bar.getBoundingClientRect = () => ({ height }) as DOMRect
    pageFooter()
    startActionBarStepsAside(bar)
    expect(resizing[0]?.observed).toEqual([bar])

    resizing[0]?.callback() // same height: nothing to redo
    expect(intersection).toHaveLength(1)

    height = 106.1
    resizing[0]?.callback()
    expect(intersection).toHaveLength(2)
    expect(intersection[0]?.disconnected, 'the old observer was left running').toBe(true)
    expect(live()[0]?.options.rootMargin).toBe('0px 0px -107px 0px')
  })

  it('pulls the footer’s margin by nothing where the layout hides the bar', () => {
    const bar = barOfHeight(0)
    pageFooter()
    startActionBarStepsAside(bar)
    expect(live()[0]?.options.rootMargin).toBe('0px 0px -0px 0px')
  })

  it('fails open: with no in-page pair, or no observer, the bar is left alone', () => {
    const noPair = barOfHeight(72)
    startActionBarStepsAside(noPair)
    expect(intersection).toHaveLength(0)
    expect(noPair.hasAttribute(TUCKED_ATTRIBUTE)).toBe(false)

    inPagePair()
    vi.stubGlobal('IntersectionObserver', undefined)
    const stop = startActionBarStepsAside(noPair)
    expect(noPair.hasAttribute(TUCKED_ATTRIBUTE)).toBe(false)
    stop()
  })

  it('stops observing and gives the bar back when stopped', () => {
    const bar = barOfHeight(72)
    inPagePair()
    const stop = startActionBarStepsAside(bar)
    live()[0]?.report(1)
    expect(bar.hasAttribute(TUCKED_ATTRIBUTE)).toBe(true)
    stop()
    expect(live(), 'an observer is still running').toHaveLength(0)
    expect(resizing[0]?.disconnected).toBe(true)
    expect(bar.hasAttribute(TUCKED_ATTRIBUTE), 'the bar was left tucked').toBe(false)
  })
})

/*
 * The footer too (2026-10-03, owner's iPhone screenshot): over the dark footer the paper bar was a
 * white block, extended by Safari into the strip behind its toolbar. The footer carries the email
 * and WhatsApp itself, so the bar steps aside while ANY of the footer is above it.
 */
function pageFooter() {
  const footer = document.createElement('footer')
  footer.className = 'site-footer'
  document.body.append(footer)
  return footer
}

describe('startActionBarStepsAside and the footer', () => {
  it('watches the footer with a watcher of its own: any of it above the bar counts', () => {
    const bar = barOfHeight(72.4)
    const pair = inPagePair()
    const footer = pageFooter()
    startActionBarStepsAside(bar)
    expect(live()).toHaveLength(2)
    expect(live()[0]?.observed, 'the pair keeps its own watcher').toEqual([pair])
    expect(live()[1]?.observed).toEqual([footer])
    expect(live()[1]?.options).toEqual({ rootMargin: '0px 0px -73px 0px', threshold: 0 })
  })

  it('tucks the bar while the footer shows, and while either of the two does', () => {
    const bar = barOfHeight(72)
    inPagePair()
    pageFooter()
    startActionBarStepsAside(bar)
    const [pairWatch, footerWatch] = live()
    footerWatch?.report(0.01)
    expect(bar.hasAttribute(TUCKED_ATTRIBUTE), 'a sliver of footer is above the bar').toBe(true)
    footerWatch?.report(0)
    expect(bar.hasAttribute(TUCKED_ATTRIBUTE)).toBe(false)
    pairWatch?.report(1)
    footerWatch?.report(0.3)
    pairWatch?.report(0)
    expect(bar.hasAttribute(TUCKED_ATTRIBUTE), 'the pair left but the footer still shows').toBe(
      true,
    )
    footerWatch?.report(0)
    expect(bar.hasAttribute(TUCKED_ATTRIBUTE), 'neither shows and the bar stayed away').toBe(false)
  })

  it('watches the footer alone on a page with no in-page pair', () => {
    const bar = barOfHeight(72)
    const footer = pageFooter()
    startActionBarStepsAside(bar)
    expect(live()).toHaveLength(1)
    expect(live()[0]?.observed).toEqual([footer])
    live()[0]?.report(0.2)
    expect(bar.hasAttribute(TUCKED_ATTRIBUTE)).toBe(true)
  })

  it('rebuilds both watchers when the bar changes height, and stops both when stopped', () => {
    let height = 72
    const bar = barOfHeight(height)
    bar.getBoundingClientRect = () => ({ height }) as DOMRect
    inPagePair()
    pageFooter()
    const stop = startActionBarStepsAside(bar)
    height = 106.1
    resizing[0]?.callback()
    expect(intersection).toHaveLength(4)
    expect(
      intersection.slice(0, 2).every((observer) => observer.disconnected),
      'an old watcher was left running',
    ).toBe(true)
    // The main button's watcher uses the whole screen; only the footer's follows the bar.
    expect(live().map((observer) => observer.options.rootMargin)).toEqual([
      '0px',
      '0px 0px -107px 0px',
    ])
    live()[1]?.report(0.5)
    stop()
    expect(live(), 'a watcher is still running').toHaveLength(0)
    expect(bar.hasAttribute(TUCKED_ATTRIBUTE), 'the bar was left tucked').toBe(false)
  })
})
