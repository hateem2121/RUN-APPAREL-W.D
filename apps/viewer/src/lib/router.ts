import {
  buildViewerPath,
  GARMENT_PATH_PREFIX,
  isGarmentPagePath,
  parseViewerPath,
} from '@run-apparel/shared'

export interface Route {
  productSlug: string
  /** null = "/n001" — the visitor named no colour, so the default is served. */
  colourSlug: string | null
}

/** Parse the current location into a viewer route (null = invalid path). */
export function currentRoute(): Route | null {
  return parseViewerPath(window.location.pathname)
}

/**
 * Client-side colourway navigation — updates the URL without a reload.
 * `replace` is used for the silent retired-colourway normalisation.
 */
export function setColourwayUrl(productSlug: string, colourSlug: string, replace = false): void {
  // Stay on the address shape the visitor arrived on: `/products/…` on the website,
  // the bare shape on the old viewer host.
  const prefix = isGarmentPagePath(window.location.pathname) ? GARMENT_PATH_PREFIX : ''
  const path = buildViewerPath(productSlug, colourSlug, prefix)
  if (window.location.pathname === path) return
  if (replace) {
    window.history.replaceState({}, '', path)
  } else {
    window.history.pushState({}, '', path)
  }
}

/** Subscribe to back/forward navigation. Returns an unsubscribe function. */
export function onRouteChange(listener: () => void): () => void {
  window.addEventListener('popstate', listener)
  return () => window.removeEventListener('popstate', listener)
}
