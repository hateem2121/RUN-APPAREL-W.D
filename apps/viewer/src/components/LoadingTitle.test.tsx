import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { LoadingTitle } from './LoadingTitle'
;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

/**
 * ⚠️ WHY THIS FILE EXISTS. A browser's translation replaces a page's text nodes with new ones, and
 * React then removes the ORIGINAL node when a loose piece of text goes away — which throws
 * NotFoundError, because that node is no longer in the page (facebook/react#11538; a Spanish
 * Safari visitor lost a garment page to it on 2026-10-08). jsdom throws the same error a browser
 * does, so this plants the translation and drops the percent the way the end of a download does.
 */

/** What Safari's and Chrome's translation do to an element: every text node swapped for a new one. */
function translate(el: Element): number {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
  const words: Text[] = []
  while (walker.nextNode()) words.push(walker.currentNode as Text)
  for (const word of words) word.replaceWith(document.createTextNode(`${word.data}·es`))
  return words.length
}

describe('LoadingTitle', () => {
  let container: HTMLDivElement
  let root: Root
  let crashes: unknown[]

  beforeEach(() => {
    container = document.createElement('div')
    document.body.append(container)
    crashes = []
    root = createRoot(container, { onUncaughtError: (error) => crashes.push(error) })
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  it('reads as the download runs, then as it prepares', () => {
    act(() => root.render(<LoadingTitle phase="downloading" percent={null} />))
    expect(container.textContent).toBe('LOADING 3D MODEL')
    act(() => root.render(<LoadingTitle phase="downloading" percent={42} />))
    expect(container.textContent).toBe('LOADING 3D MODEL · 42%')
    act(() => root.render(<LoadingTitle phase="preparing" percent={null} />))
    expect(container.textContent).toBe('PREPARING 3D MODEL…')
  })

  it('survives a translated page when the percent goes away', () => {
    act(() => root.render(<LoadingTitle phase="downloading" percent={100} />))
    expect(translate(container), 'the planted translation changed nothing').toBeGreaterThan(0)
    act(() => root.render(<LoadingTitle phase="preparing" percent={null} />))
    expect(crashes, 'React threw removing a node the translation replaced').toEqual([])
    expect(container.textContent).toBe('PREPARING 3D MODEL…')
  })
})
