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

/**
 * The PUBLIC MARKETING PAGES' Content-Security-Policy.
 *
 * ⚠️ THERE IS NO NONCE HERE, AND IT IS NOT FOR WANT OF TRYING. A nonce-based policy is
 * the right answer and is impossible on this stack today. Measured 2026-09-05:
 *
 *   `proxy.ts` on the Node runtime  ->  `opennextjs-cloudflare build` fails:
 *                                        "Node.js middleware is not currently supported"
 *   the same file with `runtime: 'edge'` ->  the build fails earlier:
 *                                        "Proxy does not support Edge runtime"
 *
 * Both were reached with `pnpm build`, `pnpm typecheck` and the full suite GREEN — only
 * the Cloudflare build, the one that actually produces a deploy, fails. Nothing else can
 * generate a per-request nonce: a layout cannot set a response header, and hashes cannot
 * work against dynamically-rendered pages whose inline flight data changes per request.
 *
 * So `script-src` carries 'unsafe-inline', which next.config.mjs rightly calls a false
 * sense of safety AGAINST INLINE INJECTION — and the rest of this policy is not
 * theatre. `object-src 'none'`, `base-uri 'self'` and `form-action 'self'` each close a
 * real attack class that has nothing to do with inline scripts: base-tag hijacking of
 * every relative URL on the page, plugin-based execution, and a stolen page posting
 * credentials elsewhere. Those are worth having on their own.
 *
 * ⚠️ SCOPED TO AN EXPLICIT LIST OF PUBLIC PATHS. `/admin` keeps only `frame-ancestors
 * 'none'` from SECURITY_HEADERS, deliberately — see the note in next.config.mjs. Widening
 * this source would break the Payload login rather than fail loudly.
 *
 * ⚠️ WHICH MEANS A NEW PUBLIC PAGE SHIPS WITH NO CSP UNTIL IT IS ADDED HERE, and nothing
 * about that failure is visible: the page renders, every test passes, and only a header
 * dump shows the policy missing. `/privacy` and `/terms` were added on 2026-09-07 in the
 * same commit that created them. `publicSite.test.ts` pins this list, so at least the
 * omission cannot happen silently twice.
 */
export const PUBLIC_PAGE_SOURCES = ['/', '/products', '/contact', '/privacy', '/terms']

export const PUBLIC_PAGE_CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://static.cloudflareinsights.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https://media.wear-run.help",
  "font-src 'self'",
  "connect-src 'self' https://cloudflareinsights.com https://static.cloudflareinsights.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ')

/**
 * Cross-origin isolation for the HTML surfaces (audit FA-O-07).
 *
 * `Cross-Origin-Opener-Policy: same-origin` severs the `window.opener` relationship, so a
 * page this site opens — or one that opens it — cannot reach into its browsing context.
 * Nothing here opens a cross-origin popup that needs to talk back, so it costs nothing.
 *
 * `Cross-Origin-Resource-Policy: same-origin` says this DOCUMENT may not be embedded as a
 * subresource by another origin. It complements `frame-ancestors 'none'` rather than
 * repeating it: that one covers frames, this one covers every other embedding path.
 *
 * ⚠️ COEP IS DELIBERATELY ABSENT, AND THAT IS THE WHOLE REASON THIS BLOCK IS SCOPED TO
 * PAGES. `Cross-Origin-Embedder-Policy: require-corp` demands a CORP header from every
 * cross-origin subresource — which here means every poster on media.wear-run.help. Any
 * that lacked one would silently stop rendering, and the gallery's whole content is
 * posters. It buys cross-origin isolation this site has no use for: there is no
 * SharedArrayBuffer and no high-resolution timer anywhere in it.
 *
 * ⚠️ AND WHY THESE ARE NOT IN `SECURITY_HEADERS`, which applies to every route including
 * `/api/*`. The viewer fetches the public API from another origin. CORP's interaction with
 * a CORS fetch is subtler than it looks, and the failure mode — the 3D pages rendering
 * "REFERENCE UNAVAILABLE" intermittently — is the exact incident `src/endpoints/
 * publicViewer.ts` already documents from the Vary/ACAO episode. Scoping to the five
 * pages that are documents makes that impossible rather than unlikely.
 */
export const PUBLIC_PAGE_ISOLATION = [
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
]

export const publicPageCspRules = PUBLIC_PAGE_SOURCES.map((source) => ({
  source,
  headers: [{ key: 'Content-Security-Policy', value: PUBLIC_PAGE_CSP }, ...PUBLIC_PAGE_ISOLATION],
}))

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
    // ⚠️ ORDER IS THE WHOLE MECHANISM. Next applies matching rules in order and the LAST
    // one wins, and `withPayload` appends its own blanket `/:path*` rule after whatever
    // nextConfig.headers() returns. These therefore go after BOTH: the Vary rule for the
    // public viewer API, then the CSP for the three marketing pages, which overrides the
    // weaker `frame-ancestors`-only policy SECURITY_HEADERS sets for everything else.
    headers: async () => [
      ...((await inner?.()) ?? []),
      publicViewerVaryRule,
      ...publicPageCspRules,
    ],
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
