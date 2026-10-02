import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  BAR_AUTOHIDE_QUERY,
  BAR_HIDE_AFTER,
  BAR_SHOW_AFTER,
  BAR_TOP_ZONE,
  type BarState,
  barAtRest,
  startBarAutoHide,
  stepBar,
} from './barAutoHide'

/**
 * VA-40 (visual audit, 2026-10-02): on a phone the bar leaves while the visitor scrolls down and
 * returns as they scroll up. What would have to break for these to fail: the bar hiding on a nudge,
 * lingering after an upward flick, hiding over an open menu or a keyboard visitor's focus, hiding
 * on a desktop, or being left hidden when the phone layout ends. The slide, the hairline and the
 * "away means not focusable" are CSS (styles/barEdge.test.ts); this is the one attribute's logic.
 */

describe('stepBar — the pure rule', () => {
  /** Feed a list of scroll positions through the rule, returning the state after each. */
  const run = (positions: number[], held = false, from: BarState = barAtRest(0)) => {
    const states: BarState[] = []
    let state = from
    for (const y of positions) {
      state = stepBar(state, y, held)
      states.push(state)
    }
    return states
  }
  const hiddenAfter = (positions: number[]) => run(positions).map((state) => state.hidden)

  it('starts on screen and stays there at the top of the page, however it is nudged', () => {
    expect(barAtRest().hidden).toBe(false)
    expect(hiddenAfter([2, 5, BAR_TOP_ZONE])).toEqual([false, false, false])
  })

  it('leaves only after BAR_HIDE_AFTER px of travel down since the last turn, not on a nudge', () => {
    const start = 100
    const from = barAtRest(start)
    const below = run([start + BAR_HIDE_AFTER - 1], false, from)
    const at = run([start + BAR_HIDE_AFTER], false, from)
    expect(below[0]?.hidden, 'a nudge below the threshold hid the bar').toBe(false)
    expect(at[0]?.hidden, 'the threshold did not hide the bar').toBe(true)
  })

  it('returns as soon as the visitor scrolls up: after BAR_SHOW_AFTER px, not after a screenful', () => {
    const hidden = run([100, 400], false, barAtRest(100)).at(-1) as BarState
    expect(hidden.hidden).toBe(true)
    expect(
      BAR_SHOW_AFTER,
      '"as soon as they scroll up" is a few pixels, not a screenful',
    ).toBeLessThan(BAR_HIDE_AFTER)
    expect(stepBar(hidden, 400 - (BAR_SHOW_AFTER - 1), false).hidden).toBe(true)
    expect(stepBar(hidden, 400 - BAR_SHOW_AFTER, false).hidden).toBe(false)
  })

  it('counts a direction from where it turned, so jitter does not move the bar', () => {
    // Down 15, a small flick up, down 15 again: never 16 in one direction, so the bar stays.
    const states = run([300, 315, 312, 327], false, barAtRest(300))
    expect(states.map((state) => state.hidden)).toEqual([false, false, false, false])
    // And a long scroll down followed by a flick up of the threshold returns it at once.
    const long = run([500, 500 - BAR_SHOW_AFTER], false, barAtRest(300))
    expect(long.map((state) => state.hidden)).toEqual([true, false])
  })

  it('is on screen whenever something holds it: a menu, keyboard focus, the keyboard', () => {
    const away = run([100, 400], false, barAtRest(100)).at(-1) as BarState
    expect(away.hidden).toBe(true)
    expect(stepBar(away, 500, true).hidden, 'a held bar left').toBe(false)
    expect(run([100, 400], true, barAtRest(100)).at(-1)?.hidden).toBe(false)
  })

  it('returns when the visitor is back at the top, and shows nothing for an unmoved page', () => {
    const away = run([100, 400], false, barAtRest(100)).at(-1) as BarState
    expect(stepBar(away, 400, false)).toBe(away)
    expect(stepBar(away, BAR_TOP_ZONE, false).hidden).toBe(false)
    expect(stepBar(away, 0, false).hidden).toBe(false)
  })
})

describe('startBarAutoHide — on a page', () => {
  let shell: HTMLElement
  let menu: HTMLElement
  let wordmark: HTMLAnchorElement
  let y = 0
  let phone: { matches: boolean; listeners: Array<() => void> }

  /** The page's scroll, as a phone would report it. 3000px of document in a 768px window. */
  const scrollTo = (to: number) => {
    y = to
    window.dispatchEvent(new Event('scroll'))
  }
  const hidden = () => shell.hasAttribute('data-bar-hidden')
  const toggleMenu = (newState: 'open' | 'closed') => {
    const event = new Event('toggle')
    Object.assign(event, { newState })
    menu.dispatchEvent(event)
  }
  /** What the browser reports for the focused element: from the keyboard, or not. */
  const focusFrom = (keyboard: boolean) => {
    vi.spyOn(wordmark, 'matches').mockImplementation((selector) =>
      selector === ':focus-visible' ? keyboard : false,
    )
    wordmark.focus()
  }

  beforeEach(() => {
    y = 0
    phone = { matches: true, listeners: [] }
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      get matches() {
        return phone.matches && query === BAR_AUTOHIDE_QUERY
      },
      media: query,
      addEventListener: (_: string, listener: () => void) => phone.listeners.push(listener),
      removeEventListener: (_: string, listener: () => void) => {
        phone.listeners = phone.listeners.filter((entry) => entry !== listener)
      },
    }))
    Object.defineProperty(window, 'scrollY', { configurable: true, get: () => y })
    Object.defineProperty(document.documentElement, 'scrollHeight', {
      configurable: true,
      value: 3000,
    })
    // The bar's own shape: a shell, the bar, the name (a link) and, in a nav, the menu button and
    // its popover list.
    shell = document.createElement('header')
    shell.className = 'notch-shell'
    const bar = document.createElement('div')
    bar.className = 'notch'
    wordmark = document.createElement('a')
    wordmark.className = 'notch__wordmark'
    wordmark.href = '/'
    const nav = document.createElement('nav')
    const button = document.createElement('button')
    button.className = 'notch__menu-btn'
    menu = document.createElement('div')
    menu.setAttribute('popover', 'auto')
    nav.append(button, menu)
    bar.append(wordmark, nav)
    shell.append(bar)
    document.body.replaceChildren(shell)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    document.body.replaceChildren()
    delete (window as { scrollY?: number }).scrollY
    delete (document.documentElement as { scrollHeight?: number }).scrollHeight
  })

  it('asks the browser the same phone question the stylesheet asks', () => {
    const stop = startBarAutoHide(shell)
    expect(window.matchMedia).toHaveBeenCalledWith(BAR_AUTOHIDE_QUERY)
    stop()
  })

  it('is on screen at first, leaves on the way down and returns on the way up', () => {
    const stop = startBarAutoHide(shell)
    expect(hidden()).toBe(false)
    scrollTo(100)
    scrollTo(100 + BAR_HIDE_AFTER)
    expect(hidden()).toBe(true)
    scrollTo(100 + BAR_HIDE_AFTER - BAR_SHOW_AFTER)
    expect(hidden()).toBe(false)
    scrollTo(500)
    scrollTo(900)
    expect(hidden()).toBe(true)
    scrollTo(0)
    expect(hidden(), 'back at the top it must show').toBe(false)
    stop()
  })

  it('does not leave while its menu is open, and may once it is closed', () => {
    const stop = startBarAutoHide(shell)
    scrollTo(200)
    toggleMenu('open')
    scrollTo(900)
    scrollTo(1500)
    expect(hidden(), 'the bar left over its own open menu').toBe(false)
    toggleMenu('closed')
    scrollTo(1800)
    scrollTo(2000)
    expect(hidden()).toBe(true)
    stop()
  })

  it('brings the bar back when the menu opens', () => {
    const stop = startBarAutoHide(shell)
    scrollTo(200)
    scrollTo(900)
    expect(hidden()).toBe(true)
    toggleMenu('open')
    expect(hidden()).toBe(false)
    stop()
  })

  it('does not leave while keyboard focus is inside it, and does when the focus came from a tap', () => {
    const stop = startBarAutoHide(shell)
    scrollTo(200)
    focusFrom(true)
    scrollTo(900)
    scrollTo(1500)
    expect(hidden(), 'the bar left over a focused control').toBe(false)
    wordmark.blur()
    scrollTo(1800)
    scrollTo(2000)
    expect(hidden()).toBe(true)
    scrollTo(1500)
    expect(hidden()).toBe(false)
    // Android's Chrome leaves a TAPPED button focused; that is not keyboard focus and holds nothing.
    focusFrom(false)
    scrollTo(1800)
    scrollTo(2000)
    expect(hidden(), 'a tapped control held the bar for good').toBe(true)
    stop()
  })

  it('returns when focus reaches it, however it got there', () => {
    const stop = startBarAutoHide(shell)
    scrollTo(200)
    scrollTo(900)
    expect(hidden()).toBe(true)
    wordmark.dispatchEvent(new FocusEvent('focusin', { bubbles: true }))
    expect(hidden()).toBe(false)
    stop()
  })

  it('returns on a Tab press and stays while the visitor is on the keyboard, until a touch', () => {
    const stop = startBarAutoHide(shell)
    scrollTo(200)
    scrollTo(900)
    expect(hidden()).toBe(true)
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }))
    expect(hidden(), 'a Tab press did not bring the bar back').toBe(false)
    scrollTo(1500)
    scrollTo(2000)
    expect(hidden(), 'the bar left on a keyboard visitor').toBe(false)
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }))
    document.dispatchEvent(new Event('touchstart'))
    scrollTo(2100)
    scrollTo(2300)
    expect(hidden(), 'a touch did not hand the bar back to the scroll').toBe(true)
    stop()
  })

  it('never leaves on a desktop, whatever the scroll', () => {
    phone.matches = false
    const stop = startBarAutoHide(shell)
    scrollTo(200)
    scrollTo(1500)
    scrollTo(2200)
    expect(hidden()).toBe(false)
    stop()
  })

  it('returns when the phone layout ends, such as a window widened past it', () => {
    const stop = startBarAutoHide(shell)
    scrollTo(200)
    scrollTo(900)
    expect(hidden()).toBe(true)
    phone.matches = false
    for (const listener of phone.listeners) listener()
    expect(hidden()).toBe(false)
    stop()
  })

  it('ignores the bounce past the end of the page, which is not a scroll up', () => {
    const stop = startBarAutoHide(shell)
    const farthest = 3000 - window.innerHeight
    scrollTo(farthest - 200)
    scrollTo(farthest)
    expect(hidden()).toBe(true)
    scrollTo(farthest + 60)
    scrollTo(farthest + 20)
    scrollTo(farthest)
    expect(hidden(), 'the iOS bounce at the foot showed the bar').toBe(true)
    stop()
  })

  it('stops, and puts the bar back, when it is stopped', () => {
    const stop = startBarAutoHide(shell)
    scrollTo(200)
    scrollTo(900)
    expect(hidden()).toBe(true)
    stop()
    expect(hidden()).toBe(false)
    scrollTo(1500)
    scrollTo(2200)
    expect(hidden(), 'a stopped watcher still moved the bar').toBe(false)
    expect(phone.listeners).toHaveLength(0)
  })

  it('does nothing, and does not throw, where matchMedia does not exist', () => {
    // biome-ignore lint/suspicious/noExplicitAny: removing a method to model an old browser
    ;(window as any).matchMedia = undefined
    const stop = startBarAutoHide(shell)
    scrollTo(200)
    scrollTo(900)
    expect(hidden()).toBe(false)
    expect(() => stop()).not.toThrow()
  })
})
