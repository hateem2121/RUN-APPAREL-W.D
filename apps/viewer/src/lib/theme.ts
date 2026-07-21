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
  const doc = document as Document & { startViewTransition?: (cb: () => void) => void }
  if (typeof doc.startViewTransition === 'function' && !prefersReducedMotion()) {
    doc.startViewTransition(apply)
  } else {
    apply()
  }
}

export function toggleTheme(): Theme {
  const next: Theme = appliedTheme() === 'dark' ? 'light' : 'dark'
  setTheme(next)
  return next
}
