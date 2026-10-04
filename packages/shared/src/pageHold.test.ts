import { describe, expect, it } from 'vitest'
import { type HoldablePage, holdPage, pageHeld } from './pageHold'
import { holdPageWhileOpen, type ToggleSource } from './siteBar'

/**
 * Polish F2 and F3 (2026-10-04): the page slid 1,200px behind the open HD picture, and scrolled
 * behind the open phone menu. What would have to break for these to fail: Lenis no longer told
 * that a lock holds the page, the menu no longer holding it, or the hold moving the page sideways
 * on a computer with a classic scrollbar. The browser half is in the e2e suites.
 */

/**
 * A stand-in page: the inline styles a lock writes, the two widths that reveal a scrollbar, and
 * <html>'s own overflow (`visible` on this site, so the page scrolls by <body>'s).
 */
function stage({ scrollbar = 0, gutter = true, htmlOverflow = 'visible' } = {}) {
  const html = {
    style: { overflowX: '', overflowY: '', scrollbarGutter: '' },
    clientWidth: 1280 - scrollbar,
  }
  const body = { style: { overflowX: '', overflowY: '' } }
  const page: HoldablePage = {
    documentElement: html,
    body,
    defaultView: {
      innerWidth: 1280,
      CSS: { supports: () => gutter },
      getComputedStyle: (element) =>
        element === html
          ? { overflowX: htmlOverflow, overflowY: htmlOverflow }
          : { overflowX: 'visible', overflowY: 'visible' },
    },
  }
  return { page, html, body }
}

/** A stand-in phone menu: the one event both helpers listen to. */
function phoneMenu() {
  const listeners = new Set<(event: { readonly newState?: string }) => void>()
  const menu: ToggleSource = {
    addEventListener: (_type, listener) => void listeners.add(listener),
    removeEventListener: (_type, listener) => void listeners.delete(listener),
  }
  const toggle = (newState: 'open' | 'closed') => {
    for (const listener of listeners) listener({ newState })
  }
  return { menu, toggle, listening: () => listeners.size }
}

describe('a page held by a pop-up', () => {
  it('is not held at rest', () => {
    expect(pageHeld(stage().page)).toBe(false)
  })

  it('is held by base-ui’s lock on <html>', () => {
    const { page, html } = stage()
    html.style.overflowY = 'hidden'
    expect(pageHeld(page)).toBe(true)
  })

  it('is held by base-ui’s lock on <body>, its classic-scrollbar path', () => {
    const { page, html, body } = stage()
    html.style.overflowY = 'scroll'
    body.style.overflowY = 'hidden'
    expect(pageHeld(page)).toBe(true)
  })

  it('counts `clip`, and not a page that merely scrolls', () => {
    const { page, html } = stage()
    html.style.overflowY = 'clip'
    expect(pageHeld(page)).toBe(true)
    html.style.overflowY = 'auto'
    expect(pageHeld(page)).toBe(false)
  })
})

describe('holding the page for the menu', () => {
  it('holds <body>, the page’s scroller when <html> has no overflow of its own (this site)', () => {
    const { page, html, body } = stage()
    body.style.overflowY = 'auto'
    const release = holdPage(page)
    // Both axes: with one, WebKit's page stayed a scroller and a wheel moved it 900px.
    expect(body.style).toEqual({ overflowX: 'hidden', overflowY: 'hidden' })
    expect(html.style, 'WebKit scrolls a page held on <html> here').toEqual({
      overflowX: '',
      overflowY: '',
      scrollbarGutter: '',
    })
    expect(pageHeld(page), 'Lenis would still scroll a page held this way').toBe(true)
    release()
    expect(body.style, 'the release did not put back what was there').toEqual({
      overflowX: '',
      overflowY: 'auto',
    })
  })

  it('holds <html> when <html> has an overflow of its own, as base-ui does', () => {
    const { page, html, body } = stage({ htmlOverflow: 'auto' })
    const release = holdPage(page)
    expect(html.style.overflowY).toBe('hidden')
    expect(body.style.overflowY).toBe('')
    release()
    expect(html.style.overflowY).toBe('')
  })

  it('with a classic scrollbar showing: its space is kept on <html>, so nothing moves sideways', () => {
    const { page, html, body } = stage({ scrollbar: 15 })
    const release = holdPage(page)
    expect(html.style.scrollbarGutter).toBe('stable')
    expect(body.style.overflowY).toBe('hidden')
    release()
    expect(html.style).toEqual({ overflowX: '', overflowY: '', scrollbarGutter: '' })
    expect(body.style).toEqual({ overflowX: '', overflowY: '' })
  })

  it('does not hold at all where the space cannot be kept, rather than jump sideways', () => {
    const { page, html, body } = stage({ scrollbar: 15, gutter: false })
    const release = holdPage(page)
    expect([html.style.overflowY, html.style.scrollbarGutter, body.style.overflowY]).toEqual([
      '',
      '',
      '',
    ])
    release()
    expect(pageHeld(page)).toBe(false)
  })

  it('does nothing without a window or a body', () => {
    const { page, html, body } = stage()
    const noWindow = holdPage({ ...page, defaultView: null })
    const noBody = holdPage({ ...page, body: null })
    expect([html.style.overflowY, body.style.overflowY]).toEqual(['', ''])
    noWindow()
    noBody()
  })
})

describe('the phone menu holds the page while it is open', () => {
  it('holds on open and lets go on close', () => {
    const { page } = stage()
    const { menu, toggle } = phoneMenu()
    holdPageWhileOpen(menu, page)
    toggle('open')
    expect(pageHeld(page)).toBe(true)
    toggle('closed')
    expect(pageHeld(page)).toBe(false)
  })

  it('a second open does not stack a second hold that would outlive the close', () => {
    const { page } = stage()
    const { menu, toggle } = phoneMenu()
    holdPageWhileOpen(menu, page)
    toggle('open')
    toggle('open')
    toggle('closed')
    expect(pageHeld(page)).toBe(false)
  })

  it('lets go when the page that owns it goes, and stops listening', () => {
    const { page } = stage()
    const { menu, toggle, listening } = phoneMenu()
    const cleanUp = holdPageWhileOpen(menu, page)
    toggle('open')
    cleanUp()
    expect(pageHeld(page)).toBe(false)
    expect(listening()).toBe(0)
  })
})
