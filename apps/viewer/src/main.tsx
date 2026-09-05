// wdth build: carries both weight (100–900) and width (62–125%) axes, so
// display type can use the 122% width (docs/DESIGN.md § Type). Swapping this for
// the weight-only build silently flattens every headline back to normal width.
import '@fontsource-variable/archivo/wdth.css'
import '@fontsource/instrument-serif/400-italic.css'
import './styles/tokens.css'
import './styles/base.css'
import './styles/page.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { ErrorBoundary } from './components/ErrorBoundary'
import { initErrorTracking } from './lib/sentry'
import { initTelemetry } from './lib/telemetry'
import { initWebVitals } from './lib/webVitals'

initErrorTracking()
initTelemetry()

// Reported when the page is hidden, on the flush telemetry already performs.
initWebVitals()
/**
 * Never restore a previous scroll position here.
 *
 * The browser default is `'auto'`: on a reload, or on a back-navigation into
 * this document, it puts the visitor back where they were. That is right for a
 * long article and wrong for this page — every arrival is a fresh QR scan of a
 * physical garment tag, and the first thing the visitor must see is the garment.
 * Restoring a scroll drops them into the middle of specifications for a product
 * they have not looked at yet.
 *
 * Paired with the `preventScroll` fix in App.tsx (see its comment): that one
 * removed the scroll this app CAUSED, this one removes the scroll the browser
 * causes. Both were needed — fixing only the first still leaves a reload
 * part-way down.
 *
 * Feature-detected because `scrollRestoration` is not in every engine's History
 * implementation, and a throw here would take the whole bundle down before
 * React mounts.
 */
if ('scrollRestoration' in history) {
  history.scrollRestoration = 'manual'
}

const root = createRoot(document.getElementById('root')!)

/**
 * ⚠️ `/render` LIVED HERE UNTIL 2026-08-17 — a bare, chrome-less page mounted
 * instead of <App/> so the shrink robot's headless browser had something to
 * photograph. It went with the automatic photography job it existed for (owner
 * decision; Browser Rendering is billed per session-second). Nothing else ever
 * navigated to it.
 *
 * Removing it also takes ~293 lines and their imports out of the bundle EVERY QR
 * SCAN downloads: the route was chosen by a runtime `pathname` check, so
 * `RenderPage` was a static import and shipped in the entry chunk for every
 * visitor, to serve a path only a robot ever requested.
 */

// Dark-mode grain overlay (hidden in light mode via CSS).
const grain = document.createElement('div')
grain.className = 'grain'
grain.setAttribute('aria-hidden', 'true')
document.body.appendChild(grain)

// ErrorBoundary sits INSIDE StrictMode but OUTSIDE App, so a throw anywhere in the
// tree — including the lazily-imported polish layer and <Stage> — lands on the
// branded unavailable state rather than an empty <div id="root">. Placing it
// outside StrictMode would also work; inside keeps the double-invoke checks
// applying to the fallback too.
root.render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
