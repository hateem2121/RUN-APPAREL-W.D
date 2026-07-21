import { beforeEach, describe, expect, it, vi } from 'vitest'
import { currentRoute, onRouteChange, setColourwayUrl } from './router'

beforeEach(() => {
  window.history.pushState({}, '', '/')
})

describe('currentRoute', () => {
  it('parses a valid viewer path', () => {
    window.history.pushState({}, '', '/n001/navy')
    expect(currentRoute()).toEqual({ productSlug: 'n001', colourSlug: 'navy' })
  })
  it('returns null for an invalid path', () => {
    window.history.pushState({}, '', '/')
    expect(currentRoute()).toBeNull()
  })
})

describe('setColourwayUrl', () => {
  it('pushes a new colourway path', () => {
    window.history.pushState({}, '', '/n001/navy')
    setColourwayUrl('n001', 'black')
    expect(window.location.pathname).toBe('/n001/black')
  })
  it('replaces the entry when replace=true', () => {
    window.history.pushState({}, '', '/n001/navy')
    setColourwayUrl('n001', 'crimson', true)
    expect(window.location.pathname).toBe('/n001/crimson')
  })
  it('is a no-op when the path is unchanged', () => {
    window.history.pushState({}, '', '/n001/navy')
    const spy = vi.spyOn(window.history, 'pushState')
    setColourwayUrl('n001', 'navy')
    expect(spy).not.toHaveBeenCalled()
  })
})

describe('onRouteChange', () => {
  it('subscribes to popstate and unsubscribes cleanly', () => {
    const listener = vi.fn()
    const off = onRouteChange(listener)
    window.dispatchEvent(new PopStateEvent('popstate'))
    expect(listener).toHaveBeenCalledTimes(1)
    off()
    window.dispatchEvent(new PopStateEvent('popstate'))
    expect(listener).toHaveBeenCalledTimes(1)
  })
})
