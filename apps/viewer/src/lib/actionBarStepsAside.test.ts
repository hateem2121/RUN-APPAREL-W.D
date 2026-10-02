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

function inPagePair() {
  const pair = document.createElement('div')
  pair.className = 'contact__buttons'
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
  it('watches the in-page pair, above the bar, for most of the pair', () => {
    const bar = barOfHeight(72.4)
    const pair = inPagePair()
    startActionBarStepsAside(bar)
    expect(live()).toHaveLength(1)
    expect(live()[0]?.observed).toEqual([pair])
    // The bar covers the foot of the screen, so the viewport's bottom edge is pulled up by it,
    // rounded UP: a pair scrolled in underneath the bar is on screen and not usable.
    expect(live()[0]?.options).toEqual({ rootMargin: '0px 0px -73px 0px', threshold: ON_SCREEN })
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

  it('rebuilds the observer when the bar changes height, and not when it does not', () => {
    // The bar grows with the visitor's text size (`actionBarHeight.ts`): the margin has to follow.
    let height = 72
    const bar = barOfHeight(height)
    bar.getBoundingClientRect = () => ({ height }) as DOMRect
    inPagePair()
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

  it('pulls the margin by nothing where the layout hides the bar', () => {
    const bar = barOfHeight(0)
    inPagePair()
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
