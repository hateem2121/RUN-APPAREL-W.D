import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  findBritishSpellings,
  findBuzzwords,
  findEmoji,
  findPlaceholders,
} from '../../../scripts/copy-rules.mjs'
import { type HoldablePage, pageHeld } from './pageHold'
import {
  type ClosingMenu,
  closeMenuOnLeave,
  holdPageWhileOpen,
  MENU_CLOSING_MS,
  markMenuClosing,
  SITE_BAR_WORDMARK,
  SITE_MENU_ID,
  SITE_MENU_NAME,
  SITE_MENU_LINKS,
  SITE_NAV_LABEL,
  SITE_NAV_LINKS,
  THEME_SWITCH_NAMES,
  THEME_SWITCH_WORDS,
  siteBarAriaSnapshot,
} from './siteBar'

/**
 * The menu bar's words, once, for the public site and the 3D viewer (owner decisions
 * 2026-09-11, 2026-09-17 and 2026-09-23). Both apps render their own header; these
 * constants are what keeps the two saying the same thing, and the aria template is what
 * both browser suites hold the rendered bars to.
 */
describe('the menu bar, once, for both hosts', () => {
  it("keeps the owner's words exactly", () => {
    expect(SITE_MENU_NAME).toBe('Menu')
    expect(SITE_NAV_LABEL).toBe('Main')
    expect(SITE_NAV_LINKS.map((link) => link.label)).toEqual(['Products', 'Contact'])
    expect(THEME_SWITCH_NAMES).toEqual({
      toDark: 'Switch to dark mode',
      toLight: 'Switch to light mode',
    })
    expect(SITE_MENU_LINKS.map((link) => link.label)).toEqual(['Guides'])
    expect(THEME_SWITCH_WORDS).toEqual({ toDark: 'Dark mode', toLight: 'Light mode' })
    const words = [
      SITE_MENU_NAME,
      ...SITE_NAV_LINKS.map((link) => link.label),
      ...SITE_MENU_LINKS.map((link) => link.label),
      THEME_SWITCH_NAMES.toDark,
      THEME_SWITCH_NAMES.toLight,
      THEME_SWITCH_WORDS.toDark,
      THEME_SWITCH_WORDS.toLight,
    ].join(' ')
    expect(findBritishSpellings(words)).toEqual([])
    expect(findBuzzwords(words)).toEqual([])
    expect(findEmoji(words)).toEqual([])
    expect(findPlaceholders(words)).toEqual([])
  })

  it("keeps the switch's shown words inside its spoken names (VA-52, WCAG 2.5.3)", () => {
    // A voice user says what they see; the name must contain it, or "click dark mode" fails.
    for (const way of ['toDark', 'toLight'] as const) {
      expect(THEME_SWITCH_NAMES[way].toLowerCase()).toContain(THEME_SWITCH_WORDS[way].toLowerCase())
    }
    // negative control: words the name does not contain are caught
    expect('Switch to dark mode'.toLowerCase()).not.toContain('night mode')
  })

  it('gives each page one site-relative path', () => {
    const hrefs = [...SITE_NAV_LINKS, ...SITE_MENU_LINKS].map((link) => link.href)
    expect(hrefs).toEqual(['/products', '/contact', '/guides'])
    for (const href of hrefs) expect(href).toMatch(/^\/[a-z-]+$/)
    expect(new Set(hrefs).size).toBe(hrefs.length)
  })

  it('names one popover id, usable unescaped in HTML and in CSS', () => {
    expect(SITE_MENU_ID).toMatch(/^[a-z][a-z-]*$/)
  })

  it("pins the wordmark to the site's setting (TY-08, XS-01)", () => {
    // The viewer set it 900 and 22% wider until 2026-09-24; "the one at wear-run.help"
    // is what the owner chose, so the site's computed values are the contract.
    expect(SITE_BAR_WORDMARK).toEqual({
      fontWeight: '800',
      fontStretch: '100%',
      fontSize: '16px',
      letterSpacing: '-0.32px',
    })
  })
})

describe('siteBarAriaSnapshot', () => {
  it('is strict at both levels, so an extra or missing control fails rather than half-matches', () => {
    // Playwright's default is `contain`; one extra link in one app would pass it.
    for (const state of ['wide', 'phone-closed', 'phone-open'] as const) {
      expect(siteBarAriaSnapshot(state, 'RUN APPAREL').match(/\/children: equal/g)).toHaveLength(2)
    }
  })

  it('lists what each layout shows, in document order', () => {
    const head = [
      '- banner:',
      '  - /children: equal',
      '  - link "RUN APPAREL"',
      '  - navigation "Main":',
      '    - /children: equal',
    ]
    const theSwitch = '    - button /^(Switch to dark mode|Switch to light mode)$/'
    expect(siteBarAriaSnapshot('wide', 'RUN APPAREL')).toBe(
      [...head, '    - link "Products"', '    - link "Contact"', theSwitch].join('\n'),
    )
    expect(siteBarAriaSnapshot('phone-closed', 'RUN APPAREL')).toBe(
      [...head, '    - button "Menu"'].join('\n'),
    )
    expect(siteBarAriaSnapshot('phone-open', 'RUN APPAREL')).toBe(
      [
        ...head,
        '    - button "Menu"',
        '    - link "Products"',
        '    - link "Contact"',
        '    - link "Guides"',
        theSwitch,
      ].join('\n'),
    )
  })

  it('quotes the wordmark it is given, whatever the CMS says', () => {
    expect(siteBarAriaSnapshot('phone-closed', 'A "QUOTED" NAME')).toContain(
      '  - link "A \\"QUOTED\\" NAME"',
    )
  })
})

describe('markMenuClosing — the exit runs only while the menu closes (VA-51)', () => {
  type Listener = (event: { readonly newState?: string }) => void
  /** A stand-in for the popover: a dataset, and the one event the helper listens to. */
  function fakeMenu() {
    const listeners = new Set<Listener>()
    const menu: ClosingMenu = {
      dataset: {},
      addEventListener: (_type, listener) => void listeners.add(listener),
      removeEventListener: (_type, listener) => void listeners.delete(listener),
    }
    const toggle = (newState: string) => {
      for (const listener of listeners) listener({ newState })
    }
    return { menu, toggle, listeners }
  }

  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('marks the menu the moment it starts to close, and clears the mark once the exit is over', () => {
    const { menu, toggle } = fakeMenu()
    markMenuClosing(menu)
    toggle('open')
    expect(menu.dataset.closing).toBeUndefined()
    toggle('closed')
    expect(menu.dataset.closing, 'not marked as it closes').toBe('')
    vi.advanceTimersByTime(MENU_CLOSING_MS - 1)
    expect(menu.dataset.closing).toBe('')
    vi.advanceTimersByTime(1)
    expect(menu.dataset.closing, 'the mark outlived the exit').toBeUndefined()
  })

  it('opening again mid-exit drops the mark at once, and the old timer cannot clear a new one', () => {
    const { menu, toggle } = fakeMenu()
    markMenuClosing(menu)
    toggle('closed')
    toggle('open')
    expect(menu.dataset.closing).toBeUndefined()
    vi.advanceTimersByTime(MENU_CLOSING_MS - 50)
    toggle('closed')
    vi.advanceTimersByTime(60)
    expect(menu.dataset.closing, "the first close's timer cleared the second close").toBe('')
  })

  it('the clean-up stops listening (negative control: a mark is set without it)', () => {
    const { menu, toggle, listeners } = fakeMenu()
    const stop = markMenuClosing(menu)
    toggle('closed')
    expect(menu.dataset.closing).toBe('')
    vi.advanceTimersByTime(MENU_CLOSING_MS)
    stop()
    expect(listeners.size).toBe(0)
    toggle('closed')
    expect(menu.dataset.closing).toBeUndefined()
  })
})

describe('closeMenuOnLeave — the menu closes when you tap the page you are on, and when focus leaves (audit 2026-10-17)', () => {
  type Handler = (event: { target?: unknown; relatedTarget?: unknown }) => void
  type ToggleHandler = (event: { readonly newState?: string }) => void

  /**
   * A stand-in for the open phone menu, its button and the page behind them. `hidePopover` fires
   * `beforetoggle` with `newState: 'closed'` as the browser does, so the page hold is the real
   * `holdPageWhileOpen` and the test sees whether a new close path lets it go.
   */
  function fakeBar() {
    const link = { name: 'Products link' }
    const darkMode = { name: 'Dark mode switch' }
    const button = { name: 'Menu button' }
    const pageLink = { name: 'a link in the page behind' }
    const inMenu = new Set<unknown>([link, darkMode])
    const handlers: Record<string, Handler[]> = {}
    const toggles = new Set<ToggleHandler>()
    const state = { open: true, active: darkMode as unknown }
    const on = (owner: string) => (type: string, handler: Handler) => {
      handlers[`${owner}:${type}`] = [...(handlers[`${owner}:${type}`] ?? []), handler]
    }
    const off = (owner: string) => (type: string, handler: Handler) => {
      handlers[`${owner}:${type}`] = (handlers[`${owner}:${type}`] ?? []).filter(
        (existing) => existing !== handler,
      )
    }
    const hidePopover = vi.fn(() => {
      state.open = false
      for (const toggle of toggles) toggle({ newState: 'closed' })
    })
    const menu = {
      contains: (node: unknown) => inMenu.has(node),
      matches: (selector: string) => selector === ':popover-open' && state.open,
      hidePopover,
      addEventListener: (type: string, handler: Handler | ToggleHandler) => {
        if (type === 'beforetoggle') toggles.add(handler as ToggleHandler)
        else on('menu')(type, handler as Handler)
      },
      removeEventListener: (type: string, handler: Handler | ToggleHandler) => {
        if (type === 'beforetoggle') toggles.delete(handler as ToggleHandler)
        else off('menu')(type, handler as Handler)
      },
    }
    const buttonNode = {
      contains: (node: unknown) => node === button,
      addEventListener: on('button'),
      removeEventListener: off('button'),
    }
    const page = {
      get activeElement() {
        return state.active
      },
    }
    const fire = (owner: string, type: string, event: object) => {
      for (const handler of handlers[`${owner}:${type}`] ?? []) handler(event)
    }
    const count = () => Object.values(handlers).reduce((sum, list) => sum + list.length, 0)
    return {
      link,
      darkMode,
      button,
      pageLink,
      menu,
      buttonNode,
      page,
      state,
      fire,
      count,
      toggles,
      hidePopover,
    }
  }

  /** What a held page looks like to `pageHeld`: only <body>'s inline overflow is written. */
  function heldPage() {
    const body = { style: { overflowX: '', overflowY: '' } }
    const page: HoldablePage = {
      documentElement: {
        style: { overflowX: '', overflowY: '', scrollbarGutter: '' },
        clientWidth: 1280,
      },
      body,
      defaultView: {
        innerWidth: 1280,
        CSS: { supports: () => true },
        getComputedStyle: () => ({ overflowX: 'visible', overflowY: 'visible' }),
      },
    }
    return page
  }

  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('closes on a tap on any link inside the menu, and leaves the navigation alone', () => {
    const bar = fakeBar()
    closeMenuOnLeave(bar.menu, bar.buttonNode, bar.page)
    const preventDefault = vi.fn()
    // The path does not change here: nothing but the tap itself can close it (the bug).
    bar.fire('menu', 'click', { target: { closest: () => bar.link }, preventDefault })
    expect(
      bar.hidePopover,
      'a tap on the link to the page you are on left the menu open',
    ).toHaveBeenCalledTimes(1)
    expect(preventDefault, 'closing the menu must not cancel the navigation').not.toHaveBeenCalled()
  })

  it('a tap on the menu that is not on a link leaves it open (the switch, the padding)', () => {
    const bar = fakeBar()
    closeMenuOnLeave(bar.menu, bar.buttonNode, bar.page)
    bar.fire('menu', 'click', { target: { closest: () => null } })
    // An anchor that is somehow outside the menu is not the menu's link.
    bar.fire('menu', 'click', { target: { closest: () => bar.pageLink } })
    bar.fire('menu', 'click', { target: null })
    expect(bar.hidePopover).not.toHaveBeenCalled()
  })

  it('closes when Tab takes focus from the last item to the page, once focus has landed there', () => {
    const bar = fakeBar()
    closeMenuOnLeave(bar.menu, bar.buttonNode, bar.page)
    bar.state.active = bar.pageLink
    bar.fire('menu', 'focusout', { relatedTarget: bar.pageLink })
    // Not inside the event: hidePopover() there can hand focus back to the button and eat the Tab.
    expect(bar.hidePopover).not.toHaveBeenCalled()
    vi.advanceTimersByTime(0)
    expect(bar.hidePopover, 'focus left the menu and it stayed open').toHaveBeenCalledTimes(1)
  })

  it('does not close on a focusout that names no new element (a tap on padding, another window)', () => {
    const bar = fakeBar()
    closeMenuOnLeave(bar.menu, bar.buttonNode, bar.page)
    bar.state.active = null
    bar.fire('menu', 'focusout', { relatedTarget: null })
    bar.fire('menu', 'focusout', {})
    vi.runAllTimers()
    expect(bar.hidePopover).not.toHaveBeenCalled()
  })

  it('does not close while focus moves between the menu’s items and its button', () => {
    const bar = fakeBar()
    closeMenuOnLeave(bar.menu, bar.buttonNode, bar.page)
    bar.fire('menu', 'focusout', { relatedTarget: bar.darkMode })
    bar.fire('menu', 'focusout', { relatedTarget: bar.button })
    bar.fire('button', 'focusout', { relatedTarget: bar.link })
    vi.runAllTimers()
    expect(bar.hidePopover).not.toHaveBeenCalled()
  })

  it('closes when focus leaves from the button to the page (Shift+Tab to the wordmark)', () => {
    const bar = fakeBar()
    closeMenuOnLeave(bar.menu, bar.buttonNode, bar.page)
    bar.state.active = bar.pageLink
    bar.fire('button', 'focusout', { relatedTarget: bar.pageLink })
    vi.runAllTimers()
    expect(bar.hidePopover).toHaveBeenCalledTimes(1)
  })

  it('stays open if focus is back inside by the time the task runs (Shift+Tab straight back)', () => {
    const bar = fakeBar()
    closeMenuOnLeave(bar.menu, bar.buttonNode, bar.page)
    bar.fire('menu', 'focusout', { relatedTarget: bar.pageLink })
    bar.state.active = bar.darkMode
    vi.runAllTimers()
    expect(bar.hidePopover).not.toHaveBeenCalled()
  })

  it('never calls hidePopover on a menu that is already closed', () => {
    const bar = fakeBar()
    closeMenuOnLeave(bar.menu, bar.buttonNode, bar.page)
    bar.state.open = false
    bar.state.active = bar.pageLink
    bar.fire('menu', 'focusout', { relatedTarget: bar.pageLink })
    bar.fire('menu', 'click', { target: { closest: () => bar.link } })
    vi.runAllTimers()
    expect(bar.hidePopover).not.toHaveBeenCalled()
  })

  it('lets the page go on both new close paths (no stuck page)', () => {
    // negative control first: the hold is real, so a page that is never released would show here
    const bar = fakeBar()
    const page = heldPage()
    holdPageWhileOpen(bar.menu, page)
    closeMenuOnLeave(bar.menu, bar.buttonNode, bar.page)
    const reopen = () => {
      bar.state.open = true
      for (const toggle of bar.toggles) toggle({ newState: 'open' })
    }
    reopen()
    expect(pageHeld(page), 'the instrument cannot see a held page').toBe(true)
    bar.fire('menu', 'click', { target: { closest: () => bar.link } })
    expect(pageHeld(page), 'a tap on a link left the page held').toBe(false)

    reopen()
    expect(pageHeld(page)).toBe(true)
    bar.state.active = bar.pageLink
    bar.fire('menu', 'focusout', { relatedTarget: bar.pageLink })
    vi.runAllTimers()
    expect(pageHeld(page), 'leaving by focus left the page held').toBe(false)
  })

  it('the clean-up stops listening and cancels a close still waiting (negative control: it closes without)', () => {
    const bar = fakeBar()
    const stop = closeMenuOnLeave(bar.menu, bar.buttonNode, bar.page)
    expect(bar.count()).toBe(3)
    bar.state.active = bar.pageLink
    bar.fire('menu', 'focusout', { relatedTarget: bar.pageLink })
    stop()
    expect(bar.count(), 'a listener outlived the clean-up').toBe(0)
    vi.runAllTimers()
    expect(bar.hidePopover, 'a pending close ran after the clean-up').not.toHaveBeenCalled()
    bar.fire('menu', 'click', { target: { closest: () => bar.link } })
    expect(bar.hidePopover).not.toHaveBeenCalled()
  })
})
