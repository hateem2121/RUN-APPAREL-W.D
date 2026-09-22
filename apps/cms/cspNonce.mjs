/**
 * The script guard's decisions (SE-04, decided 2026-09-18, live from the merge that deploys it).
 *
 * WHY. The five public pages and the 404 used to let ANY inline script run
 * (`'unsafe-inline'`). Next cannot make a per-request nonce on this stack, because no
 * middleware or proxy deploys (apps/cms/CLAUDE.md). So `worker.mjs`, the Worker entry, wraps
 * OpenNext's handler. On every HTML response carrying exactly PUBLIC_PAGE_CSP it stamps a
 * fresh nonce on every <script>, and swaps script-src's 'unsafe-inline' for 'nonce-…'.
 *
 * ⚠️ PURE ON PURPOSE. It uses no Workers APIs, so vitest reaches every branch
 * (src/cspNonce.test.ts). worker.mjs is the HTMLRewriter shell, proven live by
 * e2e/csp-nonce-edge.mjs and scripts/public-security-probe.mjs. It is the same split as
 * apps/viewer's worker/preview.ts.
 *
 * ⚠️ THE TRIGGER IS THE POLICY ITSELF, NOT A PATH LIST. `/admin` carries its own policy, and
 * the API answers JSON, so neither can be rewritten by construction. There is no second list
 * to drift from PUBLIC_PAGE_SOURCES. src/cspNonceMarker.test.ts proves, from the BUILD, that
 * the five pages and the 404 carry exactly PUBLIC_PAGE_CSP. Any mismatch makes that path fall
 * open silently, so the test fails first.
 */
import { PUBLIC_PAGE_CSP } from './publicViewerHeaders.mjs'

const UNSAFE_INLINE = "'unsafe-inline'"

/** 16 bytes in base64: 22 characters plus `==`. Anything else is refused. */
export const NONCE_PATTERN = /^[A-Za-z0-9+/]{22}==$/

/** 128 random bits, fresh per call. `random` exists only so a test can pin the output. */
export function newNonce(random = (bytes) => crypto.getRandomValues(bytes)) {
  const bytes = random(new Uint8Array(16))
  return btoa(String.fromCharCode(...bytes))
}

/** True only for an HTML response whose policy is exactly the public-page policy. */
export function nonceable(response) {
  const type = (response.headers.get('content-type') ?? '').toLowerCase()
  return (
    type.startsWith('text/html') &&
    response.headers.get('content-security-policy') === PUBLIC_PAGE_CSP
  )
}

/**
 * The policy with script-src's single 'unsafe-inline' replaced by this response's nonce.
 * Every other directive stays byte-identical: style-src keeps its 'unsafe-inline', which is out
 * of scope. Any unexpected shape returns null, and the shell then serves the fallback unchanged.
 * A malformed header is worse than the old policy.
 */
export function withNonce(policy, nonce) {
  if (!NONCE_PATTERN.test(nonce)) return null
  const directives = policy.split('; ')
  const index = directives.findIndex((d) => d.startsWith('script-src '))
  if (index === -1) return null
  const tokens = directives[index].split(' ')
  if (tokens.filter((t) => t === UNSAFE_INLINE).length !== 1) return null
  directives[index] = tokens.map((t) => (t === UNSAFE_INLINE ? `'nonce-${nonce}'` : t)).join(' ')
  return directives.join('; ')
}

/**
 * Headers for the rewritten page: the nonced policy, and NO Content-Length or ETag.
 * - Stamping attributes changes the body's length, and a stale length makes the runtime reject
 *   or cut off the stream. The 404 arrives with one (17,947 bytes under `next start`, measured
 *   2026-09-18).
 * - It also changes the bytes on every request, so an ETag computed over the original body no
 *   longer describes what is sent. The live 404 carries one (measured 2026-09-22); the five
 *   pages do not.
 */
export function noncedHeaders(headers, nonce) {
  const policy = withNonce(headers.get('content-security-policy') ?? '', nonce)
  if (policy === null) return null
  const out = new Headers(headers)
  out.set('content-security-policy', policy)
  out.delete('content-length')
  out.delete('etag')
  return out
}
