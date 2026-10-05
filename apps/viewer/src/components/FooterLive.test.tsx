import { publishCursor, resetCursorBus } from '@run-apparel/shared'
import { act } from 'react'
import { type Root, createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FooterGlow, FooterWordmark } from './FooterLive'
;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

/**
 * The garment footer's live parts (visual audit VA-31): they follow the website's islands line
 * for line, so these pin the behaviour a visitor sees from each — the light following the cursor
 * ring, and the wordmark refitting.
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
  vi.useRealTimers()
  vi.unstubAllGlobals()
  resetCursorBus()
})

const render = (node: React.ReactNode) => act(() => root.render(node))

// The clock's tests left with the clock (polish Q42). The website keeps its clock; the rules it
// shows (Sialkot time, open or closed) are tested in packages/shared/src/footerHours.test.ts, and
// the website's footer suite holds the clock's line to the shared template.

describe('FooterGlow', () => {
  // jsdom has no hit-testing; each test says what the point is over.
  const over = (el: () => Element | null) => {
    document.elementFromPoint = () => el()
  }
  afterEach(() => {
    delete (document as unknown as { elementFromPoint?: unknown }).elementFromPoint
  })
  const slab = () => host.querySelector<HTMLElement>('.site-footer__slab')
  const mount = () =>
    render(
      <div className="site-footer__slab">
        <FooterGlow />
        <p className="footer-q">Question</p>
      </div>,
    )

  it('lights the slab from the ring’s point, and switches off when the pointer leaves', () => {
    // jsdom lays nothing out: every box is 0×0 at the origin, so (0, 0) is "inside".
    over(() => host.querySelector('.footer-q'))
    mount()
    act(() => publishCursor({ x: 0, y: 0, placed: true, now: 1000 }))
    expect(slab()?.dataset.glow).toBe('true')
    expect(slab()?.dataset.over).toBe('true')
    expect(slab()?.style.getPropertyValue('--gx')).toBe('0px')

    act(() => publishCursor({ x: 0, y: 0, placed: false, now: 1016 }))
    expect(slab()?.dataset.glow).toBe('false')
  })

  it('stops listening when it leaves the page', () => {
    over(() => null)
    mount()
    act(() => root.unmount())
    root = createRoot(host)
    // A publish after unmount must reach no slab and throw nothing.
    expect(() => publishCursor({ x: 0, y: 0, placed: true, now: 2000 })).not.toThrow()
  })
})

describe('FooterWordmark', () => {
  it('draws the name twice, both hidden from assistive technology', () => {
    render(<FooterWordmark text="RUN APPAREL" />)
    const layers = [...host.querySelectorAll('.footer-mark__layer')]
    expect(layers.map((l) => l.textContent)).toEqual(['RUN APPAREL', 'RUN APPAREL'])
    expect(layers.every((l) => l.getAttribute('aria-hidden') === 'true')).toBe(true)
  })

  it('refits on every resize, and stops watching when it leaves the page', () => {
    const observed: Element[] = []
    let refit = () => {}
    let disconnected = false
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: () => void) {
          refit = callback
        }
        observe(el: Element) {
          observed.push(el)
        }
        disconnect() {
          disconnected = true
        }
      },
    )
    render(<FooterWordmark text="RUN APPAREL" />)
    const mark = host.querySelector<HTMLElement>('.footer-mark')
    expect(observed).toEqual([mark])
    if (mark) mark.style.fontSize = '99px'
    act(() => refit())
    // Each fit starts from the stylesheet's size, never from the last fit's.
    expect(mark?.style.fontSize).not.toBe('99px')
    act(() => root.unmount())
    root = createRoot(host)
    expect(disconnected).toBe(true)
  })
})
