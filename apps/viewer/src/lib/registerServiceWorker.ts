/**
 * Register the offline shell service worker.
 *
 * Scope, and the four measured reasons the 53.69 MB of garments are NOT cached:
 * `docs/DECISION-OFFLINE-SCOPE.md`. The worker itself is generated at build time by
 * the `run-offline-shell` plugin in `vite.config.ts`.
 *
 * ⚠️ PRODUCTION ONLY, AND NOT BECAUSE OF TIDINESS. The plugin carries
 * `apply: 'build'`, so `dev` emits no `sw.js` at all — registering there would ask
 * for a file that does not exist, and Vite's SPA fallback would answer with
 * `index.html`. The browser refuses to install a worker served as `text/html`, so
 * the console would carry a registration error on every single dev page load, which
 * is exactly the kind of permanent noise that trains people to ignore the console.
 *
 * ⚠️ AFTER `load`, NOT AT MODULE SCOPE. Registration competes for the same
 * connection as the shell it is trying to cache. `apps/viewer/CLAUDE.md` records
 * what that costs here — a static import of one 700-byte helper put 287 KB of
 * three.js on the critical path — and this page is already fetching a garment of
 * several megabytes.
 *
 * **The kill switch, if this ever needs to be withdrawn:** replace the generated
 * worker's body with `self.registration.unregister()`. Deleting `sw.js` from the
 * build does NOT remove an installed worker — it stays resident on every device
 * that ever loaded the site, serving its cache from a file that no longer exists.
 */

import { garmentPathPrefix } from '@run-apparel/shared'

/** Exported for the test; the browser has exactly one. */
export const SERVICE_WORKER_URL = '/sw.js'

interface RegisterOptions {
  /**
   * Defaults to `navigator`. Pass `null` to assert the absent case — an explicit
   * `undefined` cannot, because a destructuring default treats it as omitted and
   * the real global takes over. A test written the other way passes under jsdom
   * while measuring nothing.
   */
  navigatorLike?: Pick<Navigator, 'serviceWorker'> | null
  /** Defaults to `import.meta.env.PROD`. */
  production?: boolean
  /** Defaults to `window`. `null` asserts the absent case; see above. */
  windowLike?: Pick<Window, 'addEventListener'> | null
  /** Defaults to `window.location.pathname`. */
  pathname?: string
}

/**
 * The folder the worker looks after.
 *
 * ⚠️ ON wear-run.com THE VIEWER SHARES ITS HOST WITH THE WEBSITE (2026-09-28). A worker
 * at `/sw.js` defaults to scope `/`, which would put it in front of every WEBSITE page
 * and answer them offline with a garment shell. A scope NARROWER than the script's own
 * folder needs no `Service-Worker-Allowed` header, so `/products/` is simply asked for.
 * On the old viewer host the viewer owns the whole origin and keeps the default.
 */
function scopeFor(pathname: string): RegistrationOptions | undefined {
  // Each language's garment folder is its own scope (`/ru/products/` since 2026-11-16).
  const prefix = garmentPathPrefix(pathname)
  return prefix ? { scope: `${prefix}/` } : undefined
}

/**
 * @returns whether registration was ATTEMPTED. `false` means a guard refused, which
 *   is a normal outcome rather than a failure — the caller has nothing to report.
 */
export function registerServiceWorker(options: RegisterOptions = {}): boolean {
  const {
    navigatorLike = typeof navigator === 'undefined' ? undefined : navigator,
    production = import.meta.env.PROD,
    windowLike = typeof window === 'undefined' ? undefined : window,
    pathname = typeof window === 'undefined' ? '/' : window.location.pathname,
  } = options

  if (!production) return false
  // Absent in older engines, and absent on any insecure origin — the feature detect
  // covers the secure-context requirement without a second check.
  if (!navigatorLike?.serviceWorker) return false
  if (!windowLike) return false

  windowLike.addEventListener('load', () => {
    // A rejected registration must never reach the error boundary. Offline caching
    // is an enhancement; the page works without it, and a visitor whose browser
    // refuses the worker should see the garment, not a branded failure screen.
    //
    // ⚠️ `register` IS NOT ALWAYS THE BROWSER'S OWN (Sentry VIEWER-N, 20 Nov 2026: 10 unhandled
    // "Cannot read properties of undefined (reading 'catch')" in 3 seconds on a live garment
    // page). The breadcrumb 9 ms before read "Service Worker registration blocked by
    // Playwright": an automated browser had replaced `register` with a stand-in that returned
    // no promise, so chaining `.catch` straight onto the call threw. `Promise.resolve` takes
    // whatever comes back, and the `try` covers a stand-in that throws at once.
    try {
      Promise.resolve(
        navigatorLike.serviceWorker.register(SERVICE_WORKER_URL, scopeFor(pathname)),
      ).catch(() => {})
    } catch {
      // Refused outright: the page works without the offline shell.
    }
  })
  return true
}
