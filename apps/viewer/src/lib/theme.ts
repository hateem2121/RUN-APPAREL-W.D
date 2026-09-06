import { prefersReducedMotion } from './capabilities'

export type Theme = 'light' | 'dark'

const STORAGE_KEY = 'run-theme'

/** The explicit manual choice, if the visitor made one. */
export function storedTheme(): Theme | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY)
    return value === 'light' || value === 'dark' ? value : null
  } catch {
    return null
  }
}

/** The theme currently in effect (manual choice, else system preference). */
export function appliedTheme(): Theme {
  const stored = storedTheme()
  if (stored) return stored
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

/** Persist an explicit choice and apply it via data-theme on <html>. */
export function setTheme(theme: Theme): void {
  const apply = () => {
    document.documentElement.setAttribute('data-theme', theme)
    try {
      localStorage.setItem(STORAGE_KEY, theme)
    } catch {
      /* storage unavailable — the attribute still applies for this visit */
    }
  }
  // Silky cross-fade between themes via the View Transitions API where
  // available; instant swap otherwise or under reduced motion.
  //
  // ⚠️ `startViewTransition` RETURNS PROMISES, AND `ready` REJECTS ROUTINELY.
  // Sentry VIEWER-9, 2026-09-04: `InvalidStateError: Transition was aborted
  // because of invalid state` (DOMException code 11), arriving through
  // `onunhandledrejection` — i.e. logged as an UNCAUGHT error from the live page.
  // The browser rejects `ready` whenever it *skips* a transition, and two ordinary
  // visitor actions do exactly that: tapping the toggle twice before the 500ms
  // cross-fade finishes, and toggling then backgrounding the tab, because a hidden
  // document cannot run one.
  //
  // Nothing is broken for the visitor either way — `apply()` has already run, so
  // the theme changes regardless. The cost is Sentry quota, which matters here:
  // the plan allows 5,000 events/month and noise has exhausted it in 3.5 days
  // before (the measurement is in `sentry.ts`).
  //
  // Two deliberate non-catches, so nobody "tidies" them in:
  //   - `finished` RESOLVES on a skipped transition, so catching it is dead code.
  //   - `updateCallbackDone` rejects only if `apply()` itself throws, which is a
  //     real bug and SHOULD reach Sentry. Swallowing it would hide the one failure
  //     in this function worth hearing about.
  type ViewTransitionLike = { ready?: Promise<unknown> }
  const doc = document as Document & {
    startViewTransition?: (cb: () => void) => ViewTransitionLike | undefined
  }
  if (typeof doc.startViewTransition === 'function' && !prefersReducedMotion()) {
    const transition = doc.startViewTransition(apply)
    // A skipped transition is a normal outcome, not an error worth reporting.
    void transition?.ready?.catch(() => {})
  } else {
    apply()
  }
}

export function toggleTheme(): Theme {
  const next: Theme = appliedTheme() === 'dark' ? 'light' : 'dark'
  setTheme(next)
  return next
}
