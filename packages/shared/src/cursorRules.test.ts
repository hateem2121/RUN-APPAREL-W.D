import { describe, expect, it } from 'vitest'
import {
  CURSOR_INTERACTIVE,
  cursorGrows,
  cursorOverThreeD,
  keepAboveTopLayer,
  type TopLayerDocument,
  type TopLayerElement,
} from './cursorRules'

/**
 * Polish F4 and F5 (2026-10-04). What would have to break for these to fail: the ring not
 * growing over a form box, the dot and ring staying over the 3D window, or the pointer falling
 * back under the open menu. The browser half (what the visitor sees) is in both e2e suites.
 */

/**
 * A stand-in top layer, ordered as the spec orders it: showing appends, hiding removes, and the
 * LAST element is drawn on top. The browser fires `toggle` after each change; so does this.
 */
function topLayer() {
  const layer: TopLayerElement[] = []
  const listeners = new Set<(event: { target: unknown; newState?: string }) => void>()
  const element = (): TopLayerElement => {
    const self: TopLayerElement = {
      popover: null,
      matches: (selectors) => selectors === ':popover-open' && layer.includes(self),
      showPopover() {
        if (layer.includes(self)) throw new Error('InvalidStateError: already showing')
        layer.push(self)
      },
      hidePopover() {
        const at = layer.indexOf(self)
        if (at >= 0) layer.splice(at, 1)
      },
    }
    return self
  }
  const doc: TopLayerDocument = {
    querySelectorAll: () => layer.slice(),
    addEventListener: (_type, listener) => void listeners.add(listener),
    removeEventListener: (_type, listener) => void listeners.delete(listener),
  }
  const fire = (target: TopLayerElement, newState: 'open' | 'closed') => {
    for (const listener of listeners) listener({ target, newState })
  }
  const open = (target: TopLayerElement) => {
    target.showPopover()
    fire(target, 'open')
  }
  const close = (target: TopLayerElement) => {
    target.hidePopover()
    fire(target, 'closed')
  }
  return { layer, element, doc, open, close, fire, listening: () => listeners.size }
}

describe('where the ring grows (F4)', () => {
  it('names every kind of control a visitor can click, type in or pick from', () => {
    for (const kind of [
      'a[href]',
      'button',
      'input',
      'select',
      'textarea',
      'label',
      '[role="tab"]',
    ]) {
      expect(CURSOR_INTERACTIVE).toContain(kind)
    }
  })

  it('asks the target itself, and copes with no target', () => {
    const asked: string[] = []
    const target = {
      closest: (selectors: string) => {
        asked.push(selectors)
        return {}
      },
    }
    expect(cursorGrows(target)).toBe(true)
    expect(asked).toEqual([CURSOR_INTERACTIVE])
    expect(cursorGrows({ closest: () => null })).toBe(false)
    expect(cursorGrows(null)).toBe(false)
  })
})

describe('the 3D window (F4, Q19)', () => {
  it('is the model-viewer host, which every event from inside it is retargeted to', () => {
    expect(cursorOverThreeD({ localName: 'model-viewer' })).toBe(true)
  })

  it('is not a control laid over the model, nor anything else', () => {
    expect(cursorOverThreeD({ localName: 'button' })).toBe(false)
    expect(cursorOverThreeD({ localName: 'canvas' })).toBe(false)
    expect(cursorOverThreeD(null)).toBe(false)
  })
})

describe('the dot and ring stay above the open menu (F5)', () => {
  it('join the top layer after the menu, so they are drawn on top of it', () => {
    const { layer, element, doc, open } = topLayer()
    const [dot, ring, menu] = [element(), element(), element()]
    keepAboveTopLayer([dot, ring], doc)
    expect(layer).toEqual([])
    open(menu)
    expect(layer).toEqual([menu, dot, ring])
    expect([dot.popover, ring.popover]).toEqual(['manual', 'manual'])
  })

  it('are re-added after each newcomer, so they stay last', () => {
    const { layer, element, doc, open } = topLayer()
    const [dot, ring, menu, other] = [element(), element(), element(), element()]
    keepAboveTopLayer([dot, ring], doc)
    open(menu)
    open(other)
    expect(layer).toEqual([menu, other, dot, ring])
  })

  it('leave once nothing else is in the top layer, back to their place in the page', () => {
    const { layer, element, doc, open, close } = topLayer()
    const [dot, ring, menu, other] = [element(), element(), element(), element()]
    keepAboveTopLayer([dot, ring], doc)
    open(menu)
    open(other)
    close(other)
    expect(layer, 'they left while the menu was still open').toEqual([menu, dot, ring])
    close(menu)
    expect(layer).toEqual([])
    expect([dot.popover, ring.popover]).toEqual([null, null])
  })

  it('a <details> opening is not the top layer, so nothing moves', () => {
    const { layer, element, doc, fire } = topLayer()
    const [dot, ring, details] = [element(), element(), element()]
    keepAboveTopLayer([dot, ring], doc)
    fire(details, 'open')
    expect(layer).toEqual([])
  })

  it('join at once if the menu is already open, and stop listening on clean-up', () => {
    const { layer, element, doc, open, listening } = topLayer()
    const [dot, ring, menu] = [element(), element(), element()]
    open(menu)
    const cleanUp = keepAboveTopLayer([dot, ring], doc)
    expect(layer).toEqual([menu, dot, ring])
    cleanUp()
    expect(layer).toEqual([menu])
    expect(listening()).toBe(0)
  })

  it('does nothing in a browser without the Popover API', () => {
    const { element, doc, open, listening } = topLayer()
    const old = { ...element(), showPopover: undefined } as unknown as TopLayerElement
    keepAboveTopLayer([old], doc)
    expect(listening()).toBe(0)
    open(element())
  })

  it('never throws out of a refused show: the pointer just keeps its old place', () => {
    const { element, doc, open } = topLayer()
    const dot = {
      ...element(),
      showPopover() {
        throw new Error('NotSupportedError')
      },
    }
    keepAboveTopLayer([dot], doc)
    expect(() => open(element())).not.toThrow()
  })
})
