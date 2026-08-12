/**
 * Security headers for responses this Worker BUILDS ITSELF.
 *
 * PURE, and deliberately dependency-free — same reason as preview.ts and
 * renderGuard.ts (see their headers): plain objects and strings only, so it
 * type-checks under the Worker's `lib: ["ES2022"]` and under vitest's jsdom
 * without either lib. worker/index.ts is not testable here (it needs
 * HTMLRewriter and a service binding), so the decision lives out here where a
 * test can reach it.
 *
 * WHY THIS EXISTS. `dist/_headers` is applied by Cloudflare's STATIC ASSET
 * HANDLER, not by the Worker. A response returned from `env.ASSETS.fetch()`
 * carries it; a response built with `new Response(...)` never enters that path
 * and carries nothing. apps/viewer/CLAUDE.md measured that `_headers` SURVIVES
 * `env.ASSETS.fetch()` — true, and it does not cover this case, because a
 * from-scratch response was never in that experiment.
 *
 * Measured on the live edge 2026-08-12, same route, two outcomes:
 *
 *   GET /render?model=https://media.wear-run.help/x.glb  → 200, asset-served:
 *     content-security-policy, strict-transport-security, permissions-policy,
 *     referrer-policy, x-content-type-options  ALL PRESENT
 *   GET /render?model=https://evil.com/x.glb             → 400, Worker-built:
 *     ALL FIVE ABSENT
 *
 * The 400 body is a fixed string with no caller-controlled input, so nothing was
 * exploitable — the cost of leaving it would have been the precedent. The day a
 * Worker-built response carries HTML, it ships with no CSP and no test says so.
 *
 * ⚠️ The e2e fixture server does NOT have this bug and therefore cannot catch it:
 * apps/viewer/e2e/serve.mjs sets its GLOBAL_HEADERS on every response before the
 * `/render` check runs, so its 400 was always correct while production's was not.
 * A test asserting "the refusal carries a CSP" passed locally and was false live.
 * That is the fixture-cannot-exhibit-the-failure pattern at the top of the root
 * CLAUDE.md, inverted — the fixture was too GOOD.
 */

/**
 * The four non-CSP headers, byte-identical to the `/*` rule in `dist/_headers`.
 *
 * Duplicated values, pinned rather than trusted: securityHeaders.test.ts parses
 * `buildHeadersFile()`'s own output (scripts/csp.mjs — the thing that actually
 * writes `_headers`) and fails if any of these four drifts from it. Changing the
 * HSTS max-age in one place and not the other is exactly the kind of split-brain
 * this repo keeps getting bitten by, so it is a test rather than a comment
 * asking the next person to remember.
 */
export const SHARED_SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
  'Permissions-Policy':
    'accelerometer=(), camera=(), geolocation=(), gyroscope=(), microphone=(), payment=(), usb=()',
}

/**
 * CSP for a Worker-built response. Deliberately NOT the SPA's policy.
 *
 * These responses are plain text — a refusal, an error. They load no script, no
 * style, no image and no font, so `default-src 'none'` is both correct and
 * strictly tighter than what the app needs. Copying the SPA policy here would
 * have been the drift seam worth avoiding: it names hashes computed from the
 * BUILT index.html, which this file has no access to and no reason to want.
 *
 * `frame-ancestors 'none'` rather than the SPA's `'self' https://cms.wear-run.help`
 * for the same reason — the CMS live-preview iframe has no business framing an
 * error string, and the narrowest thing that works is the right default.
 */
export const WORKER_RESPONSE_CSP = "default-src 'none'; frame-ancestors 'none'; base-uri 'none'"

/**
 * Headers for a response this Worker builds itself.
 *
 * `contentType` is explicit rather than inferred: the runtime's default for a
 * string body is `text/plain;charset=UTF-8`, which is right for today's only
 * caller, but "the runtime picked something sensible" is not a property worth
 * relying on for a response that also carries `nosniff`.
 */
export function workerResponseHeaders(
  contentType = 'text/plain; charset=utf-8',
): Record<string, string> {
  return {
    ...SHARED_SECURITY_HEADERS,
    'Content-Security-Policy': WORKER_RESPONSE_CSP,
    'Content-Type': contentType,
  }
}
