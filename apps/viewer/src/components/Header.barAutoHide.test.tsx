import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BAR_AUTOHIDE_QUERY, BAR_HIDE_AFTER } from '../lib/barAutoHide'
import { Header } from './Header'
;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

/**
 * VA-40: the garment pages' bar leaves on a phone while the visitor scrolls down. The rule is
 * `lib/barAutoHide.ts` and the slide is notch.css; what only a render can show is that THE HEADER
 * starts the watcher on its own `<header>`, and stops it. Take `startBarAutoHide(shell.current)`
 * out of Header.tsx and the bar never moves on any phone, with every other test green.
 */

let host: HTMLDivElement
let root: Root
let y = 0

const scrollTo = (to: number) => {
  y = to
  act(() => {
    window.dispatchEvent(new Event('scroll'))
  })
}

beforeEach(() => {
  y = 0
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query === BAR_AUTOHIDE_QUERY,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }))
  Object.defineProperty(window, 'scrollY', { configurable: true, get: () => y })
  Object.defineProperty(document.documentElement, 'scrollHeight', {
    configurable: true,
    value: 3000,
  })
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})

afterEach(() => {
  root.unmount()
  host.remove()
  delete (window as { scrollY?: number }).scrollY
  delete (document.documentElement as { scrollHeight?: number }).scrollHeight
})

describe('Header — the bar that leaves (VA-40)', () => {
  it('sets data-bar-hidden on its shell while a phone scrolls down, and clears it going up', () => {
    act(() => root.render(<Header wordmark="RUN APPAREL" />))
    const shell = host.querySelector('header.notch-shell') as HTMLElement
    expect(shell.hasAttribute('data-bar-hidden')).toBe(false)
    scrollTo(200)
    scrollTo(200 + BAR_HIDE_AFTER)
    expect(shell.hasAttribute('data-bar-hidden')).toBe(true)
    scrollTo(0)
    expect(shell.hasAttribute('data-bar-hidden')).toBe(false)
  })

  it('stops watching, and shows the bar, when the header unmounts', () => {
    act(() => root.render(<Header wordmark="RUN APPAREL" />))
    const shell = host.querySelector('header.notch-shell') as HTMLElement
    scrollTo(200)
    scrollTo(900)
    expect(shell.hasAttribute('data-bar-hidden')).toBe(true)
    act(() => root.render(<div />))
    expect(shell.hasAttribute('data-bar-hidden'), 'an unmounted header kept its bar away').toBe(
      false,
    )
  })
})
