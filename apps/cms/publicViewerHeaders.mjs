/**
 * L1, second attempt — 2026-08-18.
 *
 * ⚠️ READ THIS BEFORE MOVING THE `Vary` HEADER ANYWHERE ELSE. The first fix set
 * `Vary: 'Origin, Sec-CH-Prefers-Color-Scheme'` inside the route handler
 * (`src/endpoints/publicViewer.ts`), its unit test asserted the returned
 * `Response` carried it, the test passed, the change merged and deployed — and
 * production still answered `vary: Sec-CH-Prefers-Color-Scheme`, with no
 * `Origin`, for the whole time it was believed fixed.
 *
 * WHY. `withPayload` builds its own `headers()` that calls the app's and appends
 * its own rule AFTER it, matching every path:
 *
 *   headers: async () => {
 *     const headersFromConfig = 'headers' in nextConfig ? await nextConfig.headers() : []
 *     return [...(headersFromConfig || []), {
 *       headers: [Accept-CH, Vary: 'Sec-CH-Prefers-Color-Scheme', Critical-CH, ...],
 *       source: '/:path*',
 *     }]
 *   }
 *
 * Next applies matching rules in order and the LAST one wins, so Payload's blanket
 * rule overrides both the handler's `Response` header and anything added to
 * SECURITY_HEADERS. Ordering inside `nextConfig.headers()` cannot win either — the
 * whole array is spread first by construction.
 *
 * So the rule has to be appended to the config `withPayload` RETURNS, which is what
 * `withPublicViewerVary` does. It is scoped to the public viewer API alone, and it
 * re-states `Sec-CH-Prefers-Color-Scheme` because overriding Payload's rule on that
 * path would otherwise drop the admin's colour-scheme hint from it.
 *
 * Verified live before the change: /api/health, /admin and the *.workers.dev host
 * all returned the identical `vary: Sec-CH-Prefers-Color-Scheme`. The workers.dev
 * host sits outside the wear-run.help zone, which is what ruled out a Cloudflare
 * Transform Rule and pointed here.
 */

/** The public viewer API — the only path whose ACAO varies by request Origin. */
export const PUBLIC_VIEWER_SOURCE = '/api/public/viewer/:path*'

/**
 * Both tokens, deliberately. This rule overrides Payload's on this path, so
 * dropping `Sec-CH-Prefers-Color-Scheme` here would silently narrow it.
 */
export const PUBLIC_VIEWER_VARY = 'Origin, Sec-CH-Prefers-Color-Scheme'

export const publicViewerVaryRule = {
  source: PUBLIC_VIEWER_SOURCE,
  headers: [{ key: 'Vary', value: PUBLIC_VIEWER_VARY }],
}

/**
 * Append the rule AFTER whatever the wrapped config produced — including
 * Payload's blanket `/:path*` rule. Last matching rule wins in Next, and being
 * last is the entire point of this function.
 */
export function withPublicViewerVary(config) {
  const inner = config.headers
  return {
    ...config,
    headers: async () => [...((await inner?.()) ?? []), publicViewerVaryRule],
  }
}

/**
 * Model Next's own matching well enough to assert PRECEDENCE in a test.
 *
 * This exists because the previous fix was verified against the handler's return
 * value, which was genuinely correct and still not what shipped. A test has to ask
 * "what does the last matching rule say", not "did we set it somewhere".
 */
export function sourceMatches(source, pathname) {
  const pattern = source
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\/:[A-Za-z_][A-Za-z0-9_]*\*/g, '(?:/.*)?')
    .replace(/:[A-Za-z_][A-Za-z0-9_]*/g, '[^/]+')
  return new RegExp(`^${pattern}$`).test(pathname)
}

/** The value a client actually receives: last matching rule wins. */
export function effectiveHeader(rules, pathname, key) {
  let value
  for (const rule of rules ?? []) {
    if (!sourceMatches(rule.source, pathname)) continue
    for (const header of rule.headers ?? []) {
      if (header.key.toLowerCase() === key.toLowerCase()) value = header.value
    }
  }
  return value
}
