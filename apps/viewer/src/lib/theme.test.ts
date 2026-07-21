import { beforeEach, describe, expect, it, vi } from 'vitest'
import { appliedTheme, setTheme, storedTheme, toggleTheme } from './theme'

function mockMatchMedia(matches: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }))
}

beforeEach(() => {
  localStorage.clear()
  document.documentElement.removeAttribute('data-theme')
  mockMatchMedia(false)
})

describe('storedTheme', () => {
  it('returns a stored valid choice', () => {
    localStorage.setItem('run-theme', 'dark')
    expect(storedTheme()).toBe('dark')
  })
  it('returns null when unset or invalid', () => {
    expect(storedTheme()).toBeNull()
    localStorage.setItem('run-theme', 'chartreuse')
    expect(storedTheme()).toBeNull()
  })
})

describe('appliedTheme', () => {
  it('prefers the stored choice over the system preference', () => {
    localStorage.setItem('run-theme', 'light')
    mockMatchMedia(true) // system says dark
    expect(appliedTheme()).toBe('light')
  })
  it('falls back to the system preference', () => {
    mockMatchMedia(true)
    expect(appliedTheme()).toBe('dark')
    mockMatchMedia(false)
    expect(appliedTheme()).toBe('light')
  })
})

describe('setTheme / toggleTheme', () => {
  it('persists the choice and applies data-theme', () => {
    setTheme('dark')
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    expect(localStorage.getItem('run-theme')).toBe('dark')
  })
  it('toggles from the currently applied theme', () => {
    setTheme('light')
    expect(toggleTheme()).toBe('dark')
    expect(toggleTheme()).toBe('light')
  })
})
