import type { ViewerAnalyticsEvent } from '@run-apparel/shared'

/**
 * Cloudflare Web Analytics only — cookieless, no fingerprinting, no
 * third-party trackers. The beacon auto-tracks page views (including SPA
 * history changes). Cloudflare's beacon exposes no custom-event API, so the
 * named viewer events are emitted through a DOM CustomEvent seam (and the
 * dev console) — a single place to integrate if richer analytics are ever
 * approved. No form data, names, emails or device fingerprints are ever
 * collected.
 */

export function initAnalytics(): void {
  const token = import.meta.env.VITE_CF_BEACON_TOKEN
  if (!token || document.querySelector('script[data-cf-beacon]')) return
  const script = document.createElement('script')
  script.defer = true
  script.src = 'https://static.cloudflareinsights.com/beacon.min.js'
  script.setAttribute('data-cf-beacon', JSON.stringify({ token, spa: true }))
  document.head.appendChild(script)
}

export function track(event: ViewerAnalyticsEvent, detail?: Record<string, string>): void {
  document.dispatchEvent(new CustomEvent('run:analytics', { detail: { event, ...detail } }))
  if (import.meta.env.DEV) {
    console.debug('[analytics]', event, detail ?? '')
  }
}
