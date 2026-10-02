import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { startActionBarHeight } from './actionBarHeight'

/**
 * `--action-bar-h` is what `.page` and `.stage-block` reserve at the bottom so the last content
 * clears the fixed bar (actionBarHeight.ts has the measurements). These pin the three things the
 * module promises and nothing in the browser suite isolates: the value written is the bar's own
 * height rounded UP (a reserve short by a fraction leaves content under the bar), a hidden bar
 * hands the token back to the stylesheet instead of reserving 0px, and stopping leaves nothing
 * behind. jsdom has no layout and no ResizeObserver, so both are stood in for here.
 */
const TOKEN = '--action-bar-h'
let observers: FakeObserver[] = []

class FakeObserver {
  observed: Element[] = []
  disconnected = false
  constructor(readonly callback: () => void) {
    observers.push(this)
  }
  observe(element: Element) {
    this.observed.push(element)
  }
  disconnect() {
    this.disconnected = true
  }
}

function barOfHeight(height: number) {
  const bar = document.createElement('div')
  bar.className = 'action-bar'
  bar.getBoundingClientRect = () => ({ height }) as DOMRect
  document.body.appendChild(bar)
  return bar
}

const token = () => document.documentElement.style.getPropertyValue(TOKEN)

beforeEach(() => {
  observers = []
  vi.stubGlobal('ResizeObserver', FakeObserver)
})

afterEach(() => {
  vi.unstubAllGlobals()
  document.body.replaceChildren()
  document.documentElement.style.removeProperty(TOKEN)
})

describe('startActionBarHeight', () => {
  it('writes the bar’s height, rounded up, and follows it when the bar resizes', () => {
    const bar = barOfHeight(106.1)
    const stop = startActionBarHeight()
    expect(token(), 'a reserve 0.1px short would leave content under the bar').toBe('107px')
    expect(observers[0]?.observed).toEqual([bar])

    // The visitor's text size grows the bar's labels onto a second line.
    bar.getBoundingClientRect = () => ({ height: 72 }) as DOMRect
    observers[0]?.callback()
    expect(token()).toBe('72px')
    stop()
  })

  it('hands the token back to the stylesheet while the bar is hidden, rather than reserving 0px', () => {
    document.documentElement.style.setProperty(TOKEN, '90px')
    barOfHeight(0)
    const stop = startActionBarHeight()
    expect(token(), 'a hidden bar (two-column layouts) must not keep a stale reserve').toBe('')
    stop()
  })

  it('stops observing and removes its value when stopped', () => {
    barOfHeight(80)
    const stop = startActionBarHeight()
    expect(token()).toBe('80px')
    stop()
    expect(observers[0]?.disconnected).toBe(true)
    expect(token()).toBe('')
  })

  it('does nothing on a page without the bar, or a browser without ResizeObserver', () => {
    const noBar = startActionBarHeight()
    expect(observers).toHaveLength(0)
    expect(token()).toBe('')
    noBar()

    vi.stubGlobal('ResizeObserver', undefined)
    barOfHeight(80)
    const noObserver = startActionBarHeight()
    expect(token()).toBe('')
    noObserver()
  })
})
