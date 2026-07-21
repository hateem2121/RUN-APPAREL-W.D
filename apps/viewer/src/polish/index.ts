import { createElement } from 'react'
import { type Root, createRoot } from 'react-dom/client'
import { Cursor } from './Cursor'
import { startReveals } from './reveal'
import { startSmoothScroll } from './smooth-scroll'

/**
 * The refined-motion layer, dynamically imported after first paint so its
 * dependencies (Motion + Lenis) stay in a lazy chunk. Idempotent.
 */
let started = false
let root: Root | null = null

export function startPolish(): void {
  if (started || typeof document === 'undefined') return
  started = true
  startSmoothScroll()
  startReveals()
  const host = document.createElement('div')
  host.id = 'polish-cursor-root'
  document.body.appendChild(host)
  root = createRoot(host)
  root.render(createElement(Cursor))
}
