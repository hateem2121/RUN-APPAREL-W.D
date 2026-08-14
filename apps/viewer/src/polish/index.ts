import { isCoarsePointer, prefersReducedMotion } from '../lib/capabilities'
import { startReveals } from './reveal'
import { startSmoothScroll } from './smooth-scroll'

/**
 * The refined-motion layer, dynamically imported after first paint so its
 * dependencies (Motion + Lenis) stay in lazy chunks. Idempotent.
 *
 * ⚠️ THIS MODULE IMPORTS NO REACT, AND THAT IS DELIBERATE.
 *
 * It used to call `createRoot`/`createElement` here to host the cursor. That put
 * React in this module's static graph, and the bundler — grouping shared
 * dependencies with whichever named chunk already needed them — resolved
 * `createElement` out of the MOTION chunk. The result was a static
 * `import … from "./motion-*.js"` in the polish chunk, so every visitor
 * downloaded Motion (150 kB raw) no matter what the pointer gate below decided.
 *
 * The config looked correct while doing the opposite of its intent, and the only
 * way to see it was to read the built chunk's own import statements. Mounting is
 * now owned by ./Cursor, which is the only module that needs React for this and
 * is already behind the dynamic import. Do not reintroduce a React import here.
 */
let started = false
let stopCursor: (() => void) | null = null

export function startPolish(): void {
  if (started || typeof document === 'undefined') return
  started = true
  startSmoothScroll()
  startReveals()

  /**
   * The gate runs BEFORE the import, which is the whole point.
   *
   * `motion` is imported by exactly one module — ./Cursor — and Cursor renders
   * null on any touch device, under reduced motion, and under automation. A
   * static import meant the phone that scans a QR tag downloaded a spring-physics
   * library for a crosshair it can never show, on the connection already
   * carrying a 27 MB model. The component performs this same check itself;
   * performing it before the import is what turns a wasted download into no
   * download.
   *
   * Owner decision 2026-08-14: keep the cursor, make it cost what it should.
   */
  if (isCoarsePointer() || prefersReducedMotion() || navigator.webdriver) return

  void import('./Cursor')
    .then(({ mountCursor }) => {
      stopCursor = mountCursor()
    })
    .catch(() => {
      // A decorative cursor is the one thing on this page that may simply fail
      // to arrive. Nothing else depends on it.
    })
}

/** Exposed for tests and for symmetry; the cursor is never torn down in the app. */
export function stopPolish(): void {
  stopCursor?.()
  stopCursor = null
}
