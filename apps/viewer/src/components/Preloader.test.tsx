import { act } from 'react'
import { type Root, createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Preloader } from './Preloader'

const reduced = vi.hoisted(() => ({ value: false }))
vi.mock('../lib/capabilities', () => ({
  prefersReducedMotion: () => reduced.value,
}))
;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

/**
 * ⚠️ WHY THIS FILE EXISTS. `Preloader` had no test of any kind, and shipped two
 * defects that no gate in the repo could see.
 *
 * 1. Under `prefers-reduced-motion: reduce` it returned `null`. `App` renders
 *    `{preloader}` beside `<div className="page" aria-hidden="true" />` while
 *    loading, so the ENTIRE output for such a visitor was one empty div marked
 *    hidden from assistive technology — a blank page for the ~2 s data fetch, and
 *    silence for a screen reader. `docs/DESIGN.md` §5 calls that inversion "the
 *    single most load-bearing line in the motion layer": the preference removes
 *    the MOTION, not the CONTENT. The rule was written about CSS, and this
 *    inversion was in JS, which is why it was missed.
 * 2. The `N°XXX` counter was a rAF-driven curve unrelated to any real work, inside
 *    a `role="status"` region. role=status implies aria-live=polite AND
 *    aria-atomic=true, so every one of its ~90 distinct values in the first 1.7 s
 *    re-announced the whole panel.
 *
 * e2e cannot cover either: `navigator.webdriver` is true under Playwright, which
 * takes the same early-return branch. So this is the only level at which the
 * reduced-motion branch is reachable at all.
 */

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  reduced.value = false
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.restoreAllMocks()
})

const render = (props: { done: boolean; onExited: () => void }) => {
  act(() => root.render(<Preloader {...props} />))
}

describe('Preloader under reduced motion', () => {
  it('still renders something a visitor can see and a screen reader can announce', () => {
    reduced.value = true
    render({ done: false, onExited: () => {} })

    // The regression: this was `null`, so the app rendered a single empty
    // aria-hidden div for the whole data fetch.
    expect(container.textContent?.trim()).not.toBe('')
    expect(container.querySelector('[role="status"]')).not.toBeNull()
  })

  it('names what is happening rather than showing a bare number', () => {
    reduced.value = true
    render({ done: false, onExited: () => {} })
    expect(container.textContent).toMatch(/preparing reference/i)
  })

  it('still hands control to the app once loading finishes', () => {
    // The one thing the old early-return got right, and easy to lose while fixing
    // the rest: if `onExited` never fires, `App` keeps the overlay mounted forever.
    reduced.value = true
    const onExited = vi.fn()
    render({ done: true, onExited })
    expect(onExited).toHaveBeenCalled()
  })
})

describe('Preloader progress reporting', () => {
  it('shows no invented percentage', () => {
    // The counter climbed to 90 on a timer while the 27 MB garment had not even
    // begun to download. Any digit-bearing "N°NNN" or "NN%" in this component is
    // a number the visitor will read as progress, so there must be none — the
    // real figures belong to the stage readout, which counts actual bytes.
    render({ done: false, onExited: () => {} })
    expect(container.textContent ?? '').not.toMatch(/N°\s*\d/i)
    expect(container.textContent ?? '').not.toMatch(/\d+\s*%/)
  })
})
