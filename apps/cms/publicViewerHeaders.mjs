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
 * the Cloudflare build, the one that actually produces a deploy, fails. Nothing inside Next
 * can generate a per-request nonce: a layout cannot set a response header, and hashes cannot
 * work against dynamically-rendered pages whose inline flight data changes per request.
 * Since 2026-09-18, `worker.mjs` does it OUTSIDE Next (SE-04; see PUBLIC_PAGE_CSP below).
 *
 * So this constant's `script-src` still carries 'unsafe-inline'. next.config.mjs rightly
 * calls that a false sense of safety AGAINST INLINE INJECTION, and it is now only the
 * fallback the guard rewrites. The rest of this policy is not
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

/**
 * ⚠️ THIS IS NOW THE FALLBACK, and the script guard's TRIGGER (SE-04, decided 2026-09-18).
 * worker.mjs rewrites every HTML response carrying EXACTLY this string. On that response it
 * swaps script-src's 'unsafe-inline' for a fresh 'nonce-…' and stamps the nonce on every
 * <script> (cspNonce.mjs). If the guard ever fails, pages are served with this policy
 * unchanged, and scripts/public-security-probe.mjs goes red.
 *
 * Editing this string changes the trigger. src/cspNonce.test.ts and src/cspNonceMarker.test.ts
 * pin that the five pages and the 404 carry exactly this string, and that the admin and the API
 * do not.
 */
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

/**
 * The CSP for everything else — which in practice means THE 404 (audit FA-O-01).
 *
 * ⚠️ THE BRANDED 404 SHIPPED WITH NO POLICY AT ALL. Measured 2026-09-07 on the real
 * build: `/` and `/products` answered with the full `PUBLIC_PAGE_CSP`, and
 * `/definitely-not-a-page` answered `content-security-policy: frame-ancestors 'none'` —
 * no `default-src`, no `script-src`, no `form-action`. `PUBLIC_PAGE_SOURCES` is an
 * explicit list of five paths and a 404 is by definition not on any list, so the page a
 * visitor reaches by mistyping a URL was the one page with no policy.
 *
 * ⚠️ AND AN EXPLICIT LIST IS STILL RIGHT FOR THOSE FIVE. This rule is appended BEFORE
 * them, so for `/`, `/products`, `/contact`, `/privacy` and `/terms` the later, explicit
 * rule wins — last matching rule wins in Next, which is the whole mechanism this file
 * exists to exploit. Nothing about those five changes.
 *
 * ⚠️ THE LOOKAHEAD IS THE DANGEROUS PART, AND IT IS WHY THIS IS VERIFIED IN THE BUILD.
 * The comment on PUBLIC_PAGE_SOURCES warns that a wrong negative lookahead reaches
 * `/admin` — where this policy has no `unsafe-eval` and would break the Payload login,
 * on the side of the system that holds the password. `sourceMatches` below cannot model
 * a custom regex parameter (it rewrites `:name` to `[^/]+` and knows nothing of
 * `(?!…)`), so asserting against it would prove nothing. `src/notFoundCsp.test.ts`
 * compiles the regex Next actually emitted into `.next/routes-manifest.json` and checks
 * `/admin` and `/api/*` against THAT.
 *
 * ⚠️ AND SINCE 2026-09-16 COOP AND CORP TOO, with CORP deliberately `cross-origin`. This
 * rule reaches the text files the site's code serves as well as documents, and
 * `same-origin` here would change how other origins may fetch /robots.txt, as a side
 * effect. It does not reach the static images in production. See OTHER_PATH_ISOLATION.
 */
/*
 * ⚠️ THE ROOTS, NOT THE PREFIXES. The first version was `(?!admin|api/)`, which also
 * excluded `/administrator` — a path that does not exist here, and whose 404 would
 * therefore have been the one page still shipping without a policy. `(?:/|$)` pins the
 * exclusion to the two real route roots.
 */
export const OTHER_PAGE_CSP_SOURCE = '/:path((?!admin(?:/|$)|api(?:/|$)).*)'

/**
 * Cross-origin headers for everything the five pages do not cover (audit SE-05): the 404
 * and the text files the site's code serves (/robots.txt, /sitemap.xml, /llms.txt).
 * Measured live 2026-09-16: those answered with neither header.
 *
 * ⚠️ NOT THE STATIC FILES. /og-default.png, /icon.svg, /favicon.ico and
 * /apple-touch-icon.png are answered by Workers Static Assets BEFORE the Worker runs
 * (wrangler.jsonc sets no `run_worker_first`), so no next.config header reaches them in
 * production. Measured live 2026-09-17: they carry no Content-Security-Policy either,
 * while /robots.txt and the 404 do. Only `next start`, which the browser tests use,
 * applies this rule to them.
 *
 * `Cross-Origin-Opener-Policy: same-origin` only ever applies to a document, so on a text
 * file it does nothing, and on the 404 it does what it does on the five pages.
 *
 * `Cross-Origin-Resource-Policy: cross-origin`, deliberately NOT `same-origin`: the text
 * files are meant to be read by anyone, and `cross-origin` says so openly without changing
 * anything that works today. The five pages still end `same-origin`, because their own
 * rules come later and win.
 */
export const OTHER_PATH_ISOLATION = [
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  { key: 'Cross-Origin-Resource-Policy', value: 'cross-origin' },
]

export const notFoundCspRule = {
  source: OTHER_PAGE_CSP_SOURCE,
  headers: [{ key: 'Content-Security-Policy', value: PUBLIC_PAGE_CSP }, ...OTHER_PATH_ISOLATION],
}

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
      // Before the five explicit pages on purpose — they must win for themselves, and
      // this catches everything else, which in practice is the 404. See its docblock.
      notFoundCspRule,
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
