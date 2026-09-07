import type { ViewerApiResponse } from '@run-apparel/shared'

const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? 'https://cms.wear-run.help').replace(
  /\/$/,
  '',
)

/**
 * How long to wait for the payload before giving up on one attempt.
 *
 * ⚠️ THERE WAS NO TIMEOUT AT ALL UNTIL 2026-09-04, AND THE FAILURE MODE WAS SILENT.
 * `App.tsx` holds `{ kind: 'loading' }` until this resolves, and while it does the
 * whole document sits under `aria-hidden="true"` behind the preloader. So a CMS
 * that was *slow* rather than *down* — a stalled mobile connection, a dropped
 * TCP handshake — left the visitor on a loading screen forever, and left a screen
 * reader on a page reporting itself as empty. There was no upper bound of any kind.
 *
 * 8000ms is not a guess, and it is not arbitrary:
 *   - the slowest CMS response ever recorded in this repo is 2.27s
 *     (`worker/index.ts`, measured 2026-08-08; re-measured 0.56-0.72s across all
 *     11 products on 2026-09-04), so this is ~3.5x the worst observed and will not
 *     fire on a merely-slow-but-working request;
 *   - it is the SAME number as `CMS_TIMEOUT_MS` in `apps/viewer/worker/index.ts`,
 *     deliberately, so the crawler path and the visitor path cannot drift apart.
 *     The constant is duplicated rather than imported because `src/` and `worker/`
 *     are separate bundles with a lint-enforced boundary; this comment is the link.
 */
const REQUEST_TIMEOUT_MS = 8000

/**
 * A transport failure gets exactly one more go.
 *
 * One retry, not three: the common mobile case is a single dropped connection, and
 * every extra attempt is another `REQUEST_TIMEOUT_MS` the visitor spends watching
 * the preloader. Worst case is now ~16s and bounded, against unbounded before.
 *
 * ⚠️ ONLY transport failures are retried. An HTTP *response* — including a 404 and
 * including a 5xx — is an answer, and re-asking cannot change it; retrying a 5xx
 * would just double the load on a CMS that is already struggling. A 404 in
 * particular is a legitimate, meaningful answer here (unknown product), and
 * retrying it would delay the "reference unavailable" screen for no reason.
 */
const RETRY_ATTEMPTS = 1

/**
 * Why the payload could not be fetched — and it matters because the viewer used to
 * answer all three with the same sentence.
 *
 * Audit FA-P-05/FA-P-06, measured on the live site: with the API forced to 500,
 * and again with the device offline, a buyer holding the garment was told
 * "THIS REFERENCE IS NO LONGER LIVE — the QR code you scanned points to a garment
 * we no longer show here". That is the correct copy for exactly one case, a 404,
 * and it is a lie in the other two: nothing has been retired, and there was no way
 * to try again.
 *
 *   offline  the device says it has no network (`navigator.onLine === false`)
 *   network  the request never got an answer — DNS, TLS, CORS, our own 8s timeout
 *   server   an answer arrived and it was not one we can use (5xx)
 *
 * `offline` is split from `network` because it is the only one whose cause the
 * VISITOR can see and act on, and because the service worker makes it reachable:
 * the shell is precached, so the page loads perfectly and only the payload is
 * missing. A factory floor with no signal is a real place this product is opened.
 */
export type ViewerFetchFailure = 'offline' | 'network' | 'server'

export class ViewerFetchError extends Error {
  readonly kind: ViewerFetchFailure

  constructor(kind: ViewerFetchFailure, message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'ViewerFetchError'
    this.kind = kind
  }
}

/**
 * ⚠️ READ AT THE MOMENT OF FAILURE, never cached. `navigator.onLine` is false only
 * when the OS is certain there is no network; it is true on a captive portal and on
 * a connection that drops mid-request, which is why a `true` here means "we do not
 * know" and falls through to `network` rather than to a confident claim.
 * `typeof navigator` is guarded for the unit run, where the module is imported
 * outside a document.
 */
function transportKind(): ViewerFetchFailure {
  return typeof navigator !== 'undefined' && navigator.onLine === false ? 'offline' : 'network'
}

/**
 * Fetch the published viewer payload.
 *
 * `colourSlug: null` is "/n001" — no colour named. The segment is dropped rather
 * than sent empty or stringified: `/n001/null` and `/n001/` are both read by the
 * API as a mangled colour and 404, which is the bug this path exists to fix.
 */
export async function fetchViewerData(
  productSlug: string,
  colourSlug: string | null,
): Promise<ViewerApiResponse> {
  const path =
    colourSlug === null
      ? `/api/public/viewer/${encodeURIComponent(productSlug)}`
      : `/api/public/viewer/${encodeURIComponent(productSlug)}/${encodeURIComponent(colourSlug)}`
  const url = `${API_BASE}${path}`

  let lastError: unknown
  for (let attempt = 0; attempt <= RETRY_ATTEMPTS; attempt++) {
    let res: Response
    try {
      res = await fetch(url, {
        headers: { accept: 'application/json' },
        // AbortSignal.timeout is supported by every browser that can run WebGL 2
        // here; guarded anyway because jsdom in the unit suite has shipped without
        // it, and an undefined `signal` is simply "no timeout" rather than a throw.
        signal: AbortSignal.timeout?.(REQUEST_TIMEOUT_MS),
      })
    } catch (error) {
      // Timeout, offline, DNS, CORS preflight failure — no response exists.
      lastError = error
      continue
    }
    if (!res.ok && res.status !== 404) {
      throw new ViewerFetchError('server', `Viewer API responded ${res.status}`)
    }
    return (await res.json()) as ViewerApiResponse
  }
  // The message keeps the underlying error's text — it is what reaches the
  // diagnostic beacon, and "TimeoutError: signal timed out" and "Failed to fetch"
  // are different enough to be worth telling apart in Sentry. The KIND is what the
  // visitor sees, and it deliberately carries less detail than this.
  throw new ViewerFetchError(
    transportKind(),
    lastError instanceof Error ? lastError.message : `Viewer API unreachable: ${String(lastError)}`,
    { cause: lastError },
  )
}
