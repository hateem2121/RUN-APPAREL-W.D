/**
 * Optional structured error tracking (Sentry, free tier) — complements the
 * first-party telemetry that lands in the CMS Events collection and the Workers
 * Logs on the API side, adding aggregated client-side stack traces.
 *
 * No-op unless VITE_SENTRY_DSN is set at build time. Because the DSN is a
 * build-time constant, when it is unset the `if` below is dead code and Vite
 * eliminates the dynamic import entirely — @sentry/browser never enters the
 * bundle, so there is zero runtime/bundle/perf cost by default.
 */
export function initErrorTracking(): void {
  const dsn = import.meta.env.VITE_SENTRY_DSN
  if (!dsn) return
  void import('@sentry/browser').then((Sentry) => {
    Sentry.init({
      dsn,
      environment: import.meta.env.MODE,
      release: import.meta.env.VITE_SENTRY_RELEASE,
      // Errors only — no performance/replay traffic, to stay comfortably inside
      // the free tier and send nothing the viewer doesn't need.
      tracesSampleRate: 0,
    })
  })
}
