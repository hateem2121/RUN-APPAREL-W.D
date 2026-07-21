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
  document.documentElement.setAttribute('data-theme', theme)
  try {
    localStorage.setItem(STORAGE_KEY, theme)
  } catch {
    /* storage unavailable — the attribute still applies for this visit */
  }
}

export function toggleTheme(): Theme {
  const next: Theme = appliedTheme() === 'dark' ? 'light' : 'dark'
  setTheme(next)
  return next
}
