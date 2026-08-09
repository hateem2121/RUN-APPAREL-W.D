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

initErrorTracking()
initTelemetry()

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
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
