/**
 * The two headers that mark a per-garment rewrite as user-agent-dependent, and stop
 * Cloudflare injecting into it (SO-02, SO-03).
 *
 * Split out of `index.ts`'s `fetch()` handler, the same reason `withNoTransform` in
 * `noTransform.ts` was: HTMLRewriter and the fetch handler are not testable under
 * vitest, but a pure `Headers -> Headers` step is.
 *
 * ⚠️ `Vary: User-Agent` IS WHAT DISTINGUISHES THE CRAWLER BRANCH FROM THE BROWSER ONE —
 * the browser path goes through `withNoTransform()` in `noTransform.ts`, which never adds
 * Vary, because a plain visitor's response does NOT depend on their user-agent. This
 * function is only ever called on the rewritten, crawler-shaped response, so it always
 * appends both.
 *
 * `no-transform` on this path is appended EXPLICITLY here rather than reusing
 * `withNoTransform()`, because that helper's first line refuses anything that already
 * carries the directive — safe for a response coming straight from Static Assets, wrong
 * here where the directive may or may not already be present on the object this hand-built
 * `Response` was copied from. `carriesNoTransform` below is the shared predicate so the two
 * files cannot drift on what "already has it" means.
 */

/** True once `cacheControl` already carries the `no-transform` directive, in any position. */
export function carriesNoTransform(cacheControl: string | null): boolean {
  return (cacheControl ?? '').includes('no-transform')
}

/** True once `vary` already names `User-Agent`, case-sensitively as this file writes it. */
export function variesOnUserAgent(vary: string | null): boolean {
  return (vary ?? '')
    .split(',')
    .map((part) => part.trim())
    .includes('User-Agent')
}

/**
 * Mutates and returns the same `Headers` instance (matching the call site in `index.ts`,
 * which builds a fresh `Headers` from the rewritten response before calling this).
 */
export function applyCrawlerCacheHeaders(headers: Headers): Headers {
  // Google documents Vary as the correct signal for user-agent-dependent serving, and it
  // stops any cache in front of this handing a crawler's copy to a visitor.
  headers.append('Vary', 'User-Agent')
  const cacheControl = headers.get('cache-control')
  if (!carriesNoTransform(cacheControl)) {
    headers.set('cache-control', cacheControl ? `${cacheControl}, no-transform` : 'no-transform')
  }
  return headers
}
