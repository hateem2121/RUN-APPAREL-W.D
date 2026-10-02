import {
  SITE_MENU_ID,
  SITE_MENU_LINKS,
  SITE_MENU_NAME,
  SITE_NAV_LABEL,
  SITE_NAV_LINKS,
  THEME_SWITCH_NAMES,
  THEME_SWITCH_WORDS,
} from '@run-apparel/shared'
import { act } from 'react'
import { type Root, createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SITE_ORIGIN } from '../lib/siteLinks'
import { Header } from './Header'
;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

/**
 * The website's bar, in the viewer (since 2026-09-24; owner decisions 2026-09-11, 2026-09-17 and
 * 2026-09-23). The markup is the site's (apps/cms/src/components/site/SiteHeader.tsx);
 * apps/cms/src/auditGuards.test.ts checks both headers carry the same markers, and both
 * browser suites check the rendered accessibility tree against packages/shared.
 */
let host: HTMLDivElement
let root: Root

beforeEach(() => {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }))
  localStorage.clear()
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  act(() => root.render(<Header wordmark="RUN APPAREL" />))
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

describe("Header — the website's bar", () => {
  it('links the name home to the site (D5), and each page to the site', () => {
    expect(host.querySelector('a.notch__wordmark')?.getAttribute('href')).toBe(SITE_ORIGIN)
    expect(
      [...host.querySelectorAll(`#${SITE_MENU_ID} a.nav-link`)].map((link) => [
        link.textContent,
        link.getAttribute('href'),
      ]),
    ).toEqual(
      // The bar's two, then the phone menu's own (VA-37: Guides), all to the site.
      [...SITE_NAV_LINKS, ...SITE_MENU_LINKS].map(({ href, label }) => [
        label,
        `${SITE_ORIGIN}${href}`,
      ]),
    )
    expect(host.querySelector('nav')?.getAttribute('aria-label')).toBe(SITE_NAV_LABEL)
  })

  it("declares the browser's own popover, the list straight after its button", () => {
    const button = host.querySelector('button.notch__menu-btn')
    const list = host.querySelector(`#${SITE_MENU_ID}`)
    expect(button?.getAttribute('popovertarget')).toBe(SITE_MENU_ID)
    expect(list?.getAttribute('popover')).toBe('auto')
    expect(button?.nextElementSibling).toBe(list)
    // the icon is decoration; the name is the visually hidden word
    expect(button?.querySelector('.notch__icon')?.getAttribute('aria-hidden')).toBe('true')
    expect(button?.querySelectorAll('.notch__icon-line')).toHaveLength(3)
    expect(button?.textContent?.trim()).toBe(SITE_MENU_NAME)
    for (const attribute of ['aria-expanded', 'aria-haspopup', 'aria-controls', 'role']) {
      expect(button?.hasAttribute(attribute), `${attribute} is the browser's to supply`).toBe(false)
    }
  })

  it('puts the switch in the menu, named by its two faces, with no aria-label', () => {
    const theSwitch = host.querySelector(`#${SITE_MENU_ID} button.theme-toggle`)
    expect(theSwitch).not.toBeNull()
    expect(theSwitch?.hasAttribute('aria-label')).toBe(false)
    for (const [way, face] of [
      ['toDark', '.theme-toggle__face--to-dark'],
      ['toLight', '.theme-toggle__face--to-light'],
    ] as const) {
      const shown = theSwitch?.querySelector(face)
      // What assistive technology hears: the face minus what is hidden from it.
      const spoken = [...(shown?.querySelectorAll(':scope > :not([aria-hidden="true"])') ?? [])]
        .map((node) => node.textContent)
        .join('')
      expect(spoken).toBe(THEME_SWITCH_NAMES[way])
      // What the phone menu shows beside the icon (VA-52), hidden from assistive technology.
      expect(shown?.querySelector('.theme-toggle__words[aria-hidden="true"]')?.textContent).toBe(
        THEME_SWITCH_WORDS[way],
      )
    }
    // light system, nothing stored: a press would switch to dark
    expect(theSwitch?.getAttribute('title')).toBe(THEME_SWITCH_NAMES.toDark)
  })
})
