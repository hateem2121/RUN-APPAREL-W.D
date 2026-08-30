import type { ViewerColourway } from '@run-apparel/shared'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { COLOURWAY_PANEL_ID, ColourwayTabs, colourwayTabId } from './ColourwayTabs'

// The preview path is not what these tests are about, and a fine pointer is the
// case where keyboard focus also previews.
//
// ⚠️ MOCKS THE HOOK, not `../lib/capabilities`. It mocked the module until
// 2026-08-17, when the component moved to `useCoarsePointer()` — which subscribes
// to `window.matchMedia`, a function **jsdom does not implement at all**. Every
// test in this file died with "window.matchMedia is not a function" the moment the
// real hook ran. Mocking at this level keeps the stated intent (the pointer is not
// under test here) and leaves the hook's own subscribe/unsubscribe behaviour to
// lib/useCoarsePointer.test.tsx, where it is the subject.
vi.mock('../lib/useCoarsePointer', () => ({ useCoarsePointer: () => false }))
;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

/**
 * ⚠️ WHY THIS FILE EXISTS. `ColourwayTabs` carried `role="tablist"` and `role="tab"`
 * with no arrow-key navigation, no roving tabindex and no `aria-controls` — an
 * incomplete pattern that **axe does not flag**, because none of those omissions is
 * invalid ARIA on its own. The a11y gate in `e2e/a11y.spec.ts` was green across five
 * page states the whole time.
 *
 * So the repo's own rule applies directly: "ask what would have to break for it to
 * fail. If the answer is nothing that happens in production, it is not a test." An
 * axe scan could never have failed on this. Pressing a key can.
 */

const COLOURWAYS: ViewerColourway[] = ['wine', 'navy', 'black'].map((slug, i) => ({
  // ⚠️ CLO-SHAPED ON PURPOSE, AND IT USED TO BE `N001-${slug.toUpperCase()}`.
  // That derived id made `variantId` look like a meaningful, slug-like value, so
  // sending it to analytics read as reasonable — and App.tsx did, until 2026-08-30.
  // What CLO actually writes is an opaque counter with no relation to the colour or
  // even to the position, so a fixture derived from the slug cannot exhibit the bug.
  variantId: `Colorway ${slug.length}`,
  displayName: slug,
  slug,
  sequence: i,
  poster: { url: `/${slug}.jpg`, width: 100, height: 100, alt: slug },
  glbUrl: null,
  isDefault: i === 0,
  altText: slug,
  hexSwatch: '#123456',
})) as ViewerColourway[]

let host: HTMLDivElement
let root: Root
// Typed to the prop's own signature — a bare `vi.fn()` widens to a constructable
// mock that does not satisfy `(colourway: ViewerColourway) => void`.
let onSelect: ReturnType<typeof vi.fn<(colourway: ViewerColourway) => void>>

function render(selectedSlug = 'wine') {
  const selected = COLOURWAYS.find((c) => c.slug === selectedSlug)!
  act(() => {
    root.render(
      <ColourwayTabs
        colourways={COLOURWAYS}
        selected={selected}
        onSelect={onSelect}
        onPreview={() => {}}
      />,
    )
  })
}

const tabs = () => Array.from(host.querySelectorAll<HTMLButtonElement>('[role="tab"]'))

/** Indexed access under `noUncheckedIndexedAccess`, failing loudly rather than `!`. */
function tabAt(index: number): HTMLButtonElement {
  const tab = tabs()[index]
  if (!tab) throw new Error(`no tab at index ${index} — rendered ${tabs().length}`)
  return tab
}

/** A real event, so `defaultPrevented` is observable. */
function press(el: HTMLElement, key: string) {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
  act(() => {
    el.dispatchEvent(event)
  })
  return event
}

beforeEach(() => {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  onSelect = vi.fn<(colourway: ViewerColourway) => void>()
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

describe('ColourwayTabs keyboard pattern', () => {
  it('is a single tab stop — only the selected tab is reachable by Tab', () => {
    render('navy')
    expect(tabs().map((t) => t.tabIndex)).toEqual([-1, 0, -1])
  })

  it('moves focus with Right/Left and wraps at both ends', () => {
    render('wine')
    const [wine, navy, black] = [tabAt(0), tabAt(1), tabAt(2)]

    wine.focus()
    press(wine, 'ArrowRight')
    expect(document.activeElement).toBe(navy)

    press(navy, 'ArrowRight')
    expect(document.activeElement).toBe(black)

    // Wrap forward off the end…
    press(black, 'ArrowRight')
    expect(document.activeElement).toBe(wine)

    // …and backward off the start.
    press(wine, 'ArrowLeft')
    expect(document.activeElement).toBe(black)
  })

  it('treats Up/Down like Left/Right, because the list wraps on narrow screens', () => {
    render('wine')
    const [wine, navy] = [tabAt(0), tabAt(1)]
    wine.focus()
    press(wine, 'ArrowDown')
    expect(document.activeElement).toBe(navy)
    press(navy, 'ArrowUp')
    expect(document.activeElement).toBe(wine)
  })

  it('jumps to first and last with Home and End', () => {
    render('navy')
    const [wine, navy, black] = [tabAt(0), tabAt(1), tabAt(2)]
    navy.focus()
    press(navy, 'End')
    expect(document.activeElement).toBe(black)
    press(black, 'Home')
    expect(document.activeElement).toBe(wine)
  })

  /**
   * Manual activation, pinned. Selecting rebinds every material on the model,
   * rewrites the URL and fires a `colourway_selected` analytics event — so
   * auto-activating on arrow keys would log selections nobody made for every
   * colourway the user arrowed past.
   */
  it('does not select while arrowing — only moves focus', () => {
    render('wine')
    const [wine, navy] = [tabAt(0), tabAt(1)]
    wine.focus()
    press(wine, 'ArrowRight')
    press(navy, 'ArrowRight')
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('still selects on click', () => {
    render('wine')
    act(() => {
      tabAt(2).click()
    })
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ slug: 'black' }))
  })

  /**
   * ⚠️ The handler must fall through for keys it does not own. An unconditional
   * preventDefault() would swallow Tab and trap keyboard focus inside the tablist —
   * strictly worse than the missing arrow keys this fix is about.
   */
  it('leaves Tab alone rather than trapping focus', () => {
    render('wine')
    const wine = tabAt(0)
    wine.focus()
    const event = press(wine, 'Tab')
    expect(event.defaultPrevented).toBe(false)
    expect(document.activeElement).toBe(wine)
  })
})

describe('ColourwayTabs ARIA wiring', () => {
  it('points every tab at the stage panel', () => {
    render()
    for (const tab of tabs()) {
      expect(tab.getAttribute('aria-controls')).toBe(COLOURWAY_PANEL_ID)
    }
  })

  /**
   * The panel is labelled by the SELECTED tab's id (see App.tsx), so these ids must
   * be stable and unique. If they drift, `aria-labelledby` silently points at
   * nothing and the stage is announced unlabelled — which axe also would not catch,
   * since a dangling reference on an element that has other names is not an error.
   */
  it('gives each tab the id App.tsx labels the panel with', () => {
    render()
    expect(tabs().map((t) => t.id)).toEqual(['wine', 'navy', 'black'].map(colourwayTabId))
    expect(new Set(tabs().map((t) => t.id)).size).toBe(3)
  })

  it('marks exactly one tab selected', () => {
    render('black')
    expect(tabs().map((t) => t.getAttribute('aria-selected'))).toEqual(['false', 'false', 'true'])
  })
})
