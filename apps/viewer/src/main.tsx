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
import { initAnalytics } from './lib/analytics'
import { initErrorTracking } from './lib/sentry'
import { initTelemetry } from './lib/telemetry'

initErrorTracking()
initAnalytics()
initTelemetry()

// Dark-mode grain overlay (hidden in light mode via CSS).
const grain = document.createElement('div')
grain.className = 'grain'
grain.setAttribute('aria-hidden', 'true')
document.body.appendChild(grain)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
