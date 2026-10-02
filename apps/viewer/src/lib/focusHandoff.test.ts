import { afterEach, describe, expect, it } from 'vitest'
import { isFocusUnclaimed } from './focusHandoff'

/**
 * VA-05 (visual audit, 2026-10-02). `App.tsx` hands focus to the top of the page when the
 * curtain leaves; this is the question it asks first. The wiring is proved in a real browser by
 * `e2e/focus-handoff.spec.ts`; what jsdom can see is the decision itself, and the one that
 * matters is the NEGATIVE one: a focus the visitor already placed is not unclaimed.
 */

function mount(tag: string, attributes: Record<string, string>, text = ''): HTMLElement {
  const element = document.createElement(tag)
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value)
  element.textContent = text
  document.body.append(element)
  return element
}

afterEach(() => {
  document.body.replaceChildren()
})

describe('isFocusUnclaimed', () => {
  it('is true when nothing has focus — the browser reports <body>', () => {
    mount('a', { href: '#main-content', class: 'skip-link' }, 'Skip to main content')
    expect(document.activeElement).toBe(document.body)
    expect(isFocusUnclaimed(document)).toBe(true)
  })

  it('is false once the visitor has Tabbed to the skip link', () => {
    mount('a', { href: '#main-content', class: 'skip-link' }, 'Skip to main content').focus()
    expect(document.activeElement?.className).toBe('skip-link')
    expect(isFocusUnclaimed(document)).toBe(false)
  })

  it('is false while a button holds focus — the phone menu button, menu open', () => {
    mount('button', { type: 'button', class: 'notch__menu-btn' }, 'Menu').focus()
    expect(isFocusUnclaimed(document)).toBe(false)
  })

  it('is false when the focused element is the page wrapper itself', () => {
    // Not a case the hand-off meets (it is what the hand-off WOULD focus), but it pins the
    // meaning: "unclaimed" is body-or-nothing, never "anything we would have chosen anyway".
    mount('div', { id: 'viewer-top', tabindex: '-1' }).focus()
    expect(document.activeElement?.id).toBe('viewer-top')
    expect(isFocusUnclaimed(document)).toBe(false)
  })

  it('is true when the document reports <html> — a document with no body', () => {
    const doc = {
      activeElement: document.documentElement,
      body: null,
      documentElement: document.documentElement,
    }
    expect(isFocusUnclaimed(doc as unknown as Document)).toBe(true)
  })

  it('is true when the document names no element at all', () => {
    const doc = {
      activeElement: null,
      body: document.body,
      documentElement: document.documentElement,
    }
    expect(isFocusUnclaimed(doc as unknown as Document)).toBe(true)
  })
})
