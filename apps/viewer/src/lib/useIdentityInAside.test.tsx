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

  it('removes its listener on unmount', () => {
    act(() => root.render(<Probe />))
    expect(list.listenerCount).toBe(1)
    unmount()
    expect(list.listenerCount).toBe(0)
  })
})

describe('the CSS and the hook agree on where the aside exists', () => {
  const css = () => stripComments(readFileSync(PAGE_CSS, 'utf8'))

  it('page.css declares the two-column query verbatim', () => {
    expect(
      css().includes(`@media ${TWO_COLUMN_QUERY}`),
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
   * FIRST clause is `(min-width: 900px)`, and IDENTITY_IN_ASIDE_QUERY is that same
   * clause narrowed with `and`. A conjunction can only ever match a subset of its
   * own first conjunct, so the relation holds for every viewport, including the
   * ones nobody thought to test.
   */
  it('the identity query is strictly narrower than the two-column query', () => {
    const minWidth = (query: string) => {
      const match = /\(min-width: (\d+)px\)/.exec(query)
      return match ? Number(match[1]) : null
    }
    // TWO_COLUMN_QUERY is a comma list — a viewport matches if ANY clause does — so
    // the widest viewport it can EXCLUDE is bounded by its most permissive clause.
    const widestTwoColumnFloor = Math.min(
      ...TWO_COLUMN_QUERY.split(',').map((clause) => minWidth(clause) ?? Number.POSITIVE_INFINITY),
    )
    const identityFloor = minWidth(IDENTITY_IN_ASIDE_QUERY)

    expect(identityFloor, 'the identity query has no min-width clause').not.toBeNull()
    expect(
      (identityFloor ?? 0) >= widestTwoColumnFloor,
      `IDENTITY_IN_ASIDE_QUERY floors width at ${identityFloor}px, but the widest ` +
        `viewport TWO_COLUMN_QUERY can exclude is ${widestTwoColumnFloor}px. A ` +
        'narrower identity query renders <ProductIdentity> into a viewport where the ' +
        'two-column block does not apply, so `.product-info--aside` is unstyled — a ' +
        '69px viewport-sized heading in a 260px column.',
    ).toBe(true)
    // `and`, not a comma: a comma would make it a UNION and could match outside the
    // two-column block however high the width floor is.
    expect(
      IDENTITY_IN_ASIDE_QUERY.includes(','),
      'the identity query must be a conjunction, never a comma list',
    ).toBe(false)
  })

  it('the identity query carries a height floor, which is the whole point of it', () => {
    expect(
      /\(min-height: (\d+)px\)/.exec(IDENTITY_IN_ASIDE_QUERY)?.[1],
      'without a height floor a landscape phone gets the paragraph and the band ' +
        'grows to 726px in a 390px viewport — measured 2026-08-21',
    ).toBeDefined()
  })
})
