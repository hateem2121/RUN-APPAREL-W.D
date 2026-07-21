// wdth build: carries both weight (100–900) and width (62–125%) axes, so
// display type can use the DESIGN.md ~122% width.
import '@fontsource-variable/archivo/wdth.css'
import '@fontsource/instrument-serif/400-italic.css'
import './styles/tokens.css'
import './styles/base.css'
import './styles/page.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { initAnalytics } from './lib/analytics'
import { initTelemetry } from './lib/telemetry'

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
