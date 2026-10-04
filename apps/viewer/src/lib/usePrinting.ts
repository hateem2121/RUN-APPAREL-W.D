import { useSyncExternalStore } from 'react'
import { flushSync } from 'react-dom'

/**
 * True while the browser prints the page: from `beforeprint` to `afterprint` (polish F14).
 *
 * MDN "Window: beforeprint event" (modified 2026-08-21; Baseline since September 2019): the pair
 * exists so a page can "change their content before printing starts" and "revert those changes
 * after printing has completed". Two changes are made here, both because a printer lays the page
 * out at the paper's width while the page keeps the arrangement it chose for the screen:
 *
 *   - App.tsx takes the one-column arrangement. On a computer the name sits beside the garment
 *     and the facts in the window's corners, and a sheet of paper is a narrow window; printed
 *     that way the corners would sit on the picture.
 *   - Stage.tsx lets the colour's still picture load (it stands in for the 3D on paper).
 *
 * ⚠️ `flushSync`, BECAUSE THE BROWSER DOES NOT WAIT. It lays the sheet out straight after the
 * event; a re-render left to React's own schedule could arrive after that.
 */
let printing = false

function subscribe(onChange: () => void): () => void {
  const toPaper = () => {
    printing = true
    flushSync(onChange)
  }
  const toScreen = () => {
    printing = false
    flushSync(onChange)
  }
  window.addEventListener('beforeprint', toPaper)
  window.addEventListener('afterprint', toScreen)
  return () => {
    window.removeEventListener('beforeprint', toPaper)
    window.removeEventListener('afterprint', toScreen)
  }
}

export function usePrinting(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => printing,
    // Server snapshot: required by the API; this SPA never server-renders.
    () => false,
  )
}
