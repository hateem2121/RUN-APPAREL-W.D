import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  findBritishSpellings,
  findBuzzwords,
  findEmoji,
  findPlaceholders,
} from '../../../scripts/copy-rules.mjs'
import {
  type ClosingMenu,
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
