import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { IDENTITY_IN_ASIDE_QUERY, TWO_COLUMN_QUERY, useIdentityInAside } from './useIdentityInAside'
;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

/**
 * ⚠️ WHY THIS FILE EXISTS, and the last describe block is the important half.
 *
 * TWO media queries govern one piece of layout, and they are written in two
 * languages that cannot read each other:
 *
 *   `TWO_COLUMN_QUERY`        CSS. Decides whether `.stage__aside` exists as a
 *                             column, and carries every `.product-info--aside`
 *                             rule including the container-query heading size.
 *   `IDENTITY_IN_ASIDE_QUERY` JS. Decides whether <ProductIdentity> is rendered
 *                             into that column.
 *
 * The second is deliberately NARROWER than the first — it adds a height floor,
 * because a landscape phone is two columns and is still the wrong home for a
 * paragraph (measured: a 726px band in a 390px viewport). That relation is what
 * makes the pair safe, and it is what the tests below pin, in both directions:
 *
 *   too WIDE  -> the identity renders where the two-column block does not apply,
 *                so `.product-info--aside` is unstyled: a viewport-sized 69px
 *                heading in a 260px column.
 *   too NARROW-> nothing renders it, and the page loses its only <h1>.
 *
 * Neither shows up in a typecheck, a lint or an axe scan, because every string
 * involved is individually valid CSS and individually valid JavaScript. Only
 * comparing them catches it.
 *
 * ⚠️ `.tsx`, not `.ts`. `vitest.config.ts` matches both, but a JSX file named `.ts`
 * fails to parse — and this repo already records the inverse trap, where the glob
 * matched only `.ts` and every component test would have been silently absent.
 */

const PAGE_CSS = join(import.meta.dirname, '..', 'styles', 'page.css')

/**
 * Blank comment BODIES while preserving offsets, exactly as `tokens.test.ts` does.
 *
 * Not optional here: `page.css` and `useTwoColumnLayout.ts` both DISCUSS this query
 * in prose, and `.stage__more`'s comment quotes it while explaining why the scroll
 * cue is hidden in two columns. Counting a mention in a comment as a declaration
 * would let the real rule be deleted while this test stayed green.
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, ' '))
}

class FakeMediaQueryList {
  matches: boolean
  private readonly listeners = new Set<() => void>()
  constructor(matches: boolean) {
    this.matches = matches
  }
  addEventListener(_type: string, listener: () => void) {
    this.listeners.add(listener)
  }
  removeEventListener(_type: string, listener: () => void) {
    this.listeners.delete(listener)
  }
  set(matches: boolean) {
    this.matches = matches
    for (const listener of this.listeners) listener()
  }
  get listenerCount() {
    return this.listeners.size
  }
}

let list: FakeMediaQueryList
let host: HTMLDivElement
let root: Root
let mounted: boolean

function Probe() {
  return useIdentityInAside() ? 'aside' : 'content'
}

const unmount = () => {
  if (!mounted) return
  mounted = false
  act(() => root.unmount())
}

beforeEach(() => {
  list = new FakeMediaQueryList(false)
  // jsdom implements no `matchMedia` at all, so this is an install rather than a
  // spy — the same shape `useCoarsePointer.test.tsx` uses and for the same reason.
  window.matchMedia = ((query: string) => {
    if (query !== IDENTITY_IN_ASIDE_QUERY) throw new Error(`unexpected query: ${query}`)
    return list
  }) as unknown as typeof window.matchMedia
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  mounted = true
})

afterEach(() => {
  unmount()
  host.remove()
})

describe('useIdentityInAside', () => {
  it('reports the layout the query currently matches', () => {
    list.matches = true
    act(() => root.render(<Probe />))
    expect(host.textContent).toBe('aside')
  })

  /**
   * THE ASSERTION THAT MATTERS. Rotating a tablet crosses this query mid-session,
   * and the block this hook places is the page's own <h1>. A hook that only read
   * the value at mount would pass a first-render test and leave the heading in the
   * wrong column until a reload — precisely the bug `useCoarsePointer` was written
   * to fix, one query over.
   */
  it('follows the query across a change, without a remount', () => {
    act(() => root.render(<Probe />))
    expect(host.textContent).toBe('content')

    act(() => list.set(true))
    expect(host.textContent).toBe('aside')

    act(() => list.set(false))
    expect(host.textContent).toBe('content')
  })

  /**
   * THE SECOND SIGNAL, AND WHY IT IS NOT REDUNDANT.
   *
   * `matches` is changed here WITHOUT notifying the media-query listeners, which is
   * exactly what headless WebKit does on a viewport change: the query's answer moves
   * and no `change` event arrives. Measured 2026-08-31 — the e2e assertion "the
   * product heading moves between columns" failed on `viewer-mobile-safari` in two
   * of three CI runs while passing locally, with the page holding exactly one
   * visible <h1> that was still in the wrong column 5 seconds later.
   *
   * Without the `resize` listener this test hangs on the old value forever, which is
   * the whole point: a subscription that never fires is indistinguishable from a
   * constant.
   */
  it('still follows the query when only a resize arrives, and no change event', () => {
    act(() => root.render(<Probe />))
    expect(host.textContent).toBe('content')

    // The query's answer moves; the media-query listeners are deliberately NOT called.
    list.matches = true
    expect(host.textContent, 'nothing should have re-read the query yet').toBe('content')

    act(() => window.dispatchEvent(new Event('resize')))
    expect(host.textContent).toBe('aside')
  })

  it('removes the resize listener on unmount too', () => {
    act(() => root.render(<Probe />))
    unmount()

    // If the listener outlived the component, this would throw — React errors on a
    // store update after unmount — or silently keep a detached tree subscribed.
    list.matches = true
    expect(() => window.dispatchEvent(new Event('resize'))).not.toThrow()
    expect(host.textContent).toBe('')
  })

  it('removes its listener on unmount', () => {
    act(() => root.render(<Probe />))
    expect(list.listenerCount).toBe(1)
    unmount()
    expect(list.listenerCount).toBe(0)
  })
})

describe('the CSS and the hook agree on where the aside exists', () => {
  const css = () => stripComments(readFileSync(PAGE_CSS, 'utf8'))

  // Whitespace-blind: Biome wraps a media query this long over two lines (since polish F11), and a
  // line break inside a query list means nothing to CSS.
  it('page.css declares the two-column query verbatim', () => {
    expect(
      css().replace(/\s+/g, ' ').includes(`@media ${TWO_COLUMN_QUERY}`),
      `page.css must contain "@media ${TWO_COLUMN_QUERY}" verbatim. That block is ` +
        'what creates `.stage__aside` as a column AND what styles ' +
        '`.product-info--aside`; if the breakpoint moved, move TWO_COLUMN_QUERY with it.',
    ).toBe(true)
  })

  /**
   * The negative control for the check above. It is a substring test, so it would
   * also pass if TWO_COLUMN_QUERY were shortened to something present in any
   * stylesheet. This proves it can fail.
   */
  it('would fail for a query page.css does not declare', () => {
    expect(css().includes('@media (min-width: 901px)')).toBe(false)
  })

  /**
   * THE ASSERTION THIS FILE IS FOR.
   *
   * Every viewport that matches IDENTITY_IN_ASIDE_QUERY must also match
   * TWO_COLUMN_QUERY, or the identity renders into a column that does not exist
   * and without the styles that size its heading.
   *
   * Proved structurally rather than by sampling viewports: TWO_COLUMN_QUERY's
   * FIRST clause is `(min-width: 900px)`, and each step of IDENTITY_IN_ASIDE_QUERY
   * is a `(min-width: …)` of at least that, narrowed with `and`. A conjunction can
   * only ever match a subset of its own first conjunct, and a list of subsets is a
   * subset, so the relation holds for every viewport, including the ones nobody
   * thought to test.
   *
   * ⚠️ IT WAS ONE CONJUNCTION, AND A COMMA WAS REFUSED OUTRIGHT, until VA-60
   * (2026-10-02) needed two steps: 880px of height from 1100px wide, 800px from
   * 1280px. A comma is safe exactly when EVERY step carries the width floor, which is
   * what is checked now; a step without one could match a landscape phone however
   * high the other step's floor is, and the control below proves that is caught.
   *
   * ⚠️ THE COMPUTER CLAUSE IS `(min-width: 900px) and (orientation: landscape)` SINCE
   * POLISH F11 (2026-10-04): an upright tablet is one column. So a step is a subset of it
   * only if it is floored at 900px or more AND held to landscape too; the third control
   * below is the step that forgot the orientation, which an upright iPad Pro (1024x1366)
   * would match while the page drew one column.
   */
  const steps = (query: string) => query.split(',').map((step) => step.trim())
  const minWidth = (query: string) => {
    const match = /\(min-width: (\d+)px\)/.exec(query)
    return match ? Number(match[1]) : null
  }
  // TWO_COLUMN_QUERY's computer clause (the one with no aspect ratio): every viewport that wide
  // AND landscape is two columns. Its other clause (700px) holds only for a 3:2 shape, so a step
  // floored at 700 could still match a 700x900 portrait window outside the block. Until VA-60
  // this took the SMALLEST floor of the list (700), which let exactly that pass; the control
  // below proves it is refused.
  const computerClause = steps(TWO_COLUMN_QUERY).find((c) => !c.includes('aspect-ratio')) ?? ''
  const widestTwoColumnFloor = minWidth(computerClause) as number
  const landscapeOnly = computerClause.includes('(orientation: landscape)')
  /** What makes a step unsafe; empty when every step is narrower than the two-column query. */
  const wideSteps = (query: string) =>
    steps(query).flatMap((step) => {
      const floor = minWidth(step)
      if (floor === null) return [`"${step}" has no width floor`]
      if (floor < widestTwoColumnFloor) return [`"${step}" floors width at ${floor}px`]
      if (landscapeOnly && !step.includes('(orientation: landscape)'))
        return [`"${step}" is not held to landscape`]
      if (/\bor\b|\bnot\b/.test(step)) return [`"${step}" is not a plain conjunction`]
      return []
    })

  it('reads the computer clause it compares against', () => {
    expect(widestTwoColumnFloor).toBe(900)
    expect(landscapeOnly).toBe(true)
  })

  it('the identity query is strictly narrower than the two-column query, step by step', () => {
    expect(
      wideSteps(IDENTITY_IN_ASIDE_QUERY),
      `The widest viewport TWO_COLUMN_QUERY can exclude is ${widestTwoColumnFloor}px. A ` +
        'step narrower than that renders <ProductIdentity> into a viewport where the ' +
        'two-column block does not apply, so `.product-info--aside` is unstyled — a ' +
        '69px viewport-sized heading in a 260px column.',
    ).toEqual([])
  })

  /** The control for the check above: a step without the width floor must be reported. */
  it('would report a step that a landscape phone could match', () => {
    expect(
      wideSteps(
        '(min-width: 1280px) and (min-height: 800px) and (orientation: landscape), (min-height: 880px)',
      ),
    ).toEqual(['"(min-height: 880px)" has no width floor'])
    expect(
      wideSteps('(min-width: 700px) and (min-height: 880px) and (orientation: landscape)'),
    ).toEqual([
      '"(min-width: 700px) and (min-height: 880px) and (orientation: landscape)" floors width at 700px',
    ])
  })

  it('would report a step that an upright tablet could match (F11)', () => {
    expect(wideSteps('(min-width: 1024px) and (min-height: 501px)')).toEqual([
      '"(min-width: 1024px) and (min-height: 501px)" is not held to landscape',
    ])
  })

  it('every step of the identity query carries a height floor, which is the whole point of it', () => {
    for (const step of steps(IDENTITY_IN_ASIDE_QUERY)) {
      expect(
        /\(min-height: (\d+)px\)/.exec(step)?.[1],
        `"${step}": without a height floor a landscape phone gets the paragraph and ` +
          'the band grows to 726px in a 390px viewport — measured 2026-08-21',
      ).toBeDefined()
    }
  })
})
