import { type ViewerApiResponse, viewerApiPath } from '@run-apparel/shared'

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
 * A failed request gets exactly one more go: a transport failure, or a 5xx answer.
 *
 * One retry, not three: the common mobile case is a single dropped connection, and
 * every extra attempt is another `REQUEST_TIMEOUT_MS` the visitor spends watching
 * the preloader. A server that never answers still ends at 16s (RO-04, api.test.ts).
 *
 * ⚠️ A 5xx IS RETRIED SINCE 2026-10-15, AND THIS NOTE USED TO SAY IT COULD NOT HELP.
 * It said a 5xx "is an answer, and re-asking cannot change it". Issue #189 measured the
 * opposite: on 2026-10-14 the CMS answered 500 for r-xmp/wine at 17:20:55 and for
 * r-afp/petrol at 17:20:57 UTC because D1 failed on Cloudflare's side
 * (`D1_ERROR: internal error; reference = …`, the CMS Worker's own log), and a request
 * 0.8s after the second error succeeded. Cloudflare's own advice for such errors is to
 * retry (developers.cloudflare.com/d1/observability/debug-d1/, read 2026-10-15). The
 * load worry stays true for a long outage, which is why it is ONE retry, after a pause.
 *
 * A 404 is still never retried: it is a legitimate, meaningful answer here (unknown
 * product), and retrying it would delay the "reference unavailable" screen for no
 * reason. Nor is any other 4xx: the request itself is wrong, and asking again cannot fix it.
 */
const RETRY_ATTEMPTS = 1

/**
 * How long to wait before asking again after a 5xx: 2.0–2.5s.
 *
 * Not at once: the 14 Oct database errors spanned 3.4s (17:20:53.7 to 17:20:57.1), so an
 * immediate retry lands inside the same failure. Up to 0.5s of random spread, the
 * "backoff with jitter" Cloudflare recommends (d1/best-practices/retry-queries/), keeps
 * every page that failed in the same second from asking again in the same second. A buyer
 * waits this long only when the alternative was the unavailable screen.
 */
export const SERVER_RETRY_DELAY_MS = 2000
export const SERVER_RETRY_JITTER_MS = 500

const pause = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

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
 *
 * ⚠️ THE FIRST CALL IS USUALLY ANSWERED BY A PRELOAD (2026-09-27). The Worker sends
 * `Link: <this url>; rel=preload; as=fetch; crossorigin` with the page, so the request is
 * already under way before this code runs (`worker/apiPreload.ts`). The browser reuses it
 * only if this `fetch` matches it: same URL (hence the shared `viewerApiPath`), CORS mode
 * and default credentials. Do not add `credentials`, `mode` or `cache` options here without
 * re-running `e2e/apiPreload.spec.ts`, which counts the requests on every engine.
 */
export async function fetchViewerData(
  productSlug: string,
  colourSlug: string | null,
): Promise<ViewerApiResponse> {
  const url = `${API_BASE}${viewerApiPath(productSlug, colourSlug)}`

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
    if (res.status >= 500 && attempt < RETRY_ATTEMPTS) {
      // The failed answer's body is never read; release it rather than hold the connection.
      void res.body?.cancel().catch(() => {})
      await pause(SERVER_RETRY_DELAY_MS + Math.random() * SERVER_RETRY_JITTER_MS)
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
