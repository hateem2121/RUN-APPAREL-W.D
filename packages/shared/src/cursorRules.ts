/**
 * Where the custom pointer (the dot and its trailing ring) behaves differently, for both of its
 * implementations: apps/cms/src/components/site/Cursor.tsx (plain DOM) and
 * apps/viewer/src/polish/Cursor.tsx (Motion). Owner's answer to Q19 (2026-10-04): the dot and
 * ring everywhere, with no second pointer beside them, and the browser's own grab hand over the
 * 3D window only. packages/ui/src/base.css hides the browser's pointer to match.
 */

/**
 * Everything a visitor can click, type in or pick from: the ring grows over it (polish F4).
 * It grew over links, buttons and tabs only, so over the form's boxes, the country list and the
 * file box the ring did not say "this does something". A disabled control does nothing, and an
 * anchor without an address goes nowhere, so neither counts.
 */
export const CURSOR_INTERACTIVE = [
  'a[href]',
  'button:not(:disabled)',
  '[role="tab"]',
  '[role="button"]',
  '[data-cursor="pointer"]',
  'input:not(:disabled)',
  'select:not(:disabled)',
  'textarea:not(:disabled)',
  'label',
  'summary',
].join(', ')

/** As much of an event target as these rules read. An Element satisfies it. */
interface PointerTarget {
  readonly localName?: string
  closest?(selectors: string): unknown
}

/** Does the ring grow over this target? */
export function cursorGrows(target: PointerTarget | null): boolean {
  return Boolean(target?.closest?.(CURSOR_INTERACTIVE))
}

/**
 * Is this the 3D window, where the dot and ring step aside for the browser's grab hand (Q19)?
 * `<model-viewer>` draws that hand itself: its controls write `cursor: grab` (`grabbing` while
 * dragging) inline on an element inside its shadow root (lib/three-components/SmoothControls.js,
 * model-viewer 4.3.1), and every event from in there reaches the page retargeted to the host. A
 * control laid over the model (the AR button, a camera button) is its own target, so the dot and
 * ring come back over it.
 */
export function cursorOverThreeD(target: PointerTarget | null): boolean {
  return target?.localName === 'model-viewer'
}

/** As much of a pointer element as `keepAboveTopLayer` touches. An HTMLElement satisfies it. */
export interface TopLayerElement {
  popover: string | null
  matches(selectors: string): boolean
  showPopover(): void
  hidePopover(): void
}

/** As much of the document as `keepAboveTopLayer` touches. A browser's `document` satisfies it. */
export interface TopLayerDocument {
  querySelectorAll(selectors: string): ArrayLike<unknown>
  addEventListener(type: 'toggle', listener: (event: ToggleLike) => void, capture: boolean): void
  removeEventListener(type: 'toggle', listener: (event: ToggleLike) => void, capture: boolean): void
}

interface ToggleLike {
  readonly target: unknown
  readonly newState?: string
}

/**
 * ⚠️ THE DOT AND RING STAY ABOVE THE OPEN MENU (polish F5, 2026-10-04). The phone menu is a
 * popover, and a popover is drawn in the browser's TOP LAYER, above every z-index on the page;
 * between top-layer elements the last one added is drawn on top (CSS Positioned Layout 4, "top
 * layer", Editor's Draft of 25 Dec 2025). So the pointer, at --z-cursor, passed under the menu,
 * and over the menu's links, where the browser's pointer is hidden too, there was no pointer at
 * all (second check, 2026-10-03). While anything else is in the top layer, the dot and ring join
 * it as `manual` popovers, re-added after each newcomer so they stay last; once it is empty again
 * they leave, back to their place in the page's own stack. `toggle` does not bubble, so it is
 * heard in the capture phase. Returns the clean-up for a React effect.
 */
export function keepAboveTopLayer(
  elements: readonly TopLayerElement[],
  doc: TopLayerDocument,
): () => void {
  // A browser without the Popover API has no top layer to rise above.
  if (elements.some((element) => typeof element.showPopover !== 'function')) return () => {}
  const ours = new Set<unknown>(elements)
  const othersOpen = () =>
    Array.from(doc.querySelectorAll(':popover-open')).some((element) => !ours.has(element))
  // Decorative: if the browser refuses, the pointer keeps its old place rather than throw.
  const join = () => {
    try {
      for (const element of elements) {
        element.popover = 'manual'
        if (element.matches(':popover-open')) element.hidePopover()
        element.showPopover()
      }
    } catch {}
  }
  const leave = () => {
    try {
      for (const element of elements) {
        if (element.popover === null) continue
        if (element.matches(':popover-open')) element.hidePopover()
        element.popover = null
      }
    } catch {}
  }
  const onToggle = (event: ToggleLike) => {
    if (ours.has(event.target)) return
    // `toggle` also fires for a <details>, which never enters the top layer.
    if (event.newState === 'open' && othersOpen()) join()
    else if (event.newState !== 'open' && !othersOpen()) leave()
  }
  doc.addEventListener('toggle', onToggle, true)
  if (othersOpen()) join()
  return () => {
    doc.removeEventListener('toggle', onToggle, true)
    leave()
  }
}
