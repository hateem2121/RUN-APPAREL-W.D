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
import RenderPage from './RenderPage'

initErrorTracking()
initTelemetry()

const root = createRoot(document.getElementById('root')!)

// `/render` (task 13/14) is a separate, bare page for the shrink robot's
// screenshot session — no header, no nav, no colour buttons, no footer, and
// deliberately mounted BEFORE any of App's own chrome exists rather than as a
// conditional inside it. See RenderPage.tsx's header for the routing subtlety
// this avoids: parseViewerPath would otherwise read "render" as a product
// slug.
if (window.location.pathname === '/render') {
  root.render(
    <StrictMode>
      <RenderPage />
    </StrictMode>,
  )
} else {
  // Dark-mode grain overlay (hidden in light mode via CSS). Skipped on
  // /render: it is a full-viewport, always-present texture layer, which is
  // exactly the "no UI at all" this route promises NOT to show, and on a dark
  // background it would show up in every captured poster (task 14 brief).
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
}
