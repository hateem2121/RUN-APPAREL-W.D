import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { usePrinting } from './usePrinting'
;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

/**
 * The page rearranges itself for paper between `beforeprint` and `afterprint` (polish F14). The
 * browser lays the sheet out straight after `beforeprint`, so the change must be in the document
 * BEFORE the event returns: these tests read the DOM in the same breath as the dispatch, outside
 * `act()`, which is the only way to see a re-render that waited for React's own schedule.
 */

function Probe() {
  return <p>{usePrinting() ? 'paper' : 'screen'}</p>
}

let host: HTMLDivElement
let root: Root

beforeEach(() => {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  act(() => root.render(<Probe />))
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

describe('usePrinting', () => {
  it('is false on a screen', () => {
    expect(host.textContent).toBe('screen')
  })

  it('is true from beforeprint, already in the document when the event returns', () => {
    window.dispatchEvent(new Event('beforeprint'))
    expect(host.textContent).toBe('paper')
    window.dispatchEvent(new Event('afterprint'))
    expect(host.textContent).toBe('screen')
  })

  it('stops listening once nothing reads it', () => {
    act(() => root.unmount())
    window.dispatchEvent(new Event('beforeprint'))
    root = createRoot(host)
    act(() => root.render(<Probe />))
    // A listener left behind would have set the shared flag; the new reader would see "paper".
    expect(host.textContent).toBe('screen')
    window.dispatchEvent(new Event('afterprint'))
  })
})
