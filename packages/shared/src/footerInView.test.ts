import { describe, expect, it } from 'vitest'
import { FOOTER_IN_VIEW, watchFooterInView } from './footerInView'

/**
 * The page is marked while its footer is on screen, and only then (home page audit, 2026-10-17:
 * iPhone Safari tinted the strip under its bar dark on a pale page). A fake page and observer:
 * this package's tests run in Node.
 */
function fakePage({ footer = true, observer = true } = {}) {
  const attributes = new Set<string>()
  const watched: object[] = []
  let report: ((entries: { isIntersecting: boolean }[]) => void) | null = null
  let disconnected = false
  class View {
    constructor(callback: (entries: { isIntersecting: boolean }[]) => void) {
      report = callback
    }
    observe(element: object) {
      watched.push(element)
    }
    disconnect() {
      disconnected = true
    }
  }
  const root = {
    toggleAttribute: (name: string, on: boolean) => {
      if (on) attributes.add(name)
      else attributes.delete(name)
      return on
    },
    removeAttribute: (name: string) => attributes.delete(name),
  }
  const footerElement = { className: 'site-footer' }
  const doc = {
    documentElement: root,
    querySelector: (selector: string) =>
      footer && selector === '.site-footer' ? footerElement : null,
    defaultView: observer ? { IntersectionObserver: View } : {},
  }
  return {
    doc,
    attributes,
    watched,
    footerElement,
    see: (on: boolean) => report?.([{ isIntersecting: on }]),
    /** One callback carrying several reports, oldest first, as a held-back observer delivers. */
    seeBatch: (reports: boolean[]) => report?.(reports.map((on) => ({ isIntersecting: on }))),
    disconnected: () => disconnected,
  }
}

describe('watchFooterInView', () => {
  it('watches the footer, and marks the page only while it is on screen', () => {
    const page = fakePage()
    const stop = watchFooterInView(page.doc)
    expect(page.watched).toEqual([page.footerElement])
    expect(page.attributes.has(FOOTER_IN_VIEW), 'marked before the footer was seen').toBe(false)
    page.see(true)
    expect(page.attributes.has(FOOTER_IN_VIEW)).toBe(true)
    page.see(false)
    expect(page.attributes.has(FOOTER_IN_VIEW), 'still marked after the footer left').toBe(false)
    page.see(true)
    stop()
    expect(page.disconnected()).toBe(true)
    expect(page.attributes.has(FOOTER_IN_VIEW), 'left marked after clean-up').toBe(false)
  })

  it('reads a batch by its last report: in, then out, is out', () => {
    // A fast fling into the footer and out again, delivered late as ONE callback with both reports,
    // oldest first. The first version marked the page when ANY report said "in", so the marker, and
    // the dark strip behind Safari's bar, outlived the footer.
    const page = fakePage()
    const stop = watchFooterInView(page.doc)
    page.seeBatch([true, false])
    expect(page.attributes.has(FOOTER_IN_VIEW), 'in, out: the page is still marked').toBe(false)
    page.seeBatch([false, true])
    expect(page.attributes.has(FOOTER_IN_VIEW), 'out, in: the page is not marked').toBe(true)
    stop()
  })

  it('does nothing on a page with no footer, or a browser with no observer', () => {
    for (const page of [fakePage({ footer: false }), fakePage({ observer: false })]) {
      const stop = watchFooterInView(page.doc)
      expect(page.watched).toEqual([])
      expect(() => stop()).not.toThrow()
      expect(page.attributes.size).toBe(0)
    }
  })
})
