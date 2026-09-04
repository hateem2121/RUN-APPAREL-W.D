/**
 * Put `no-transform` on the HTML a VISITOR actually asks for.
 *
 * ⚠️ `dist/_headers` already carries it — and it has never once applied to a garment.
 * The rule is written against `/index.html`, but `_headers` matches the REQUEST PATH and
 * nobody requests that: they request `/rxps/wine`, which falls through to Static Assets'
 * default. Measured on the live edge 2026-09-04, same site, same second:
 *
 *     GET /index.html   cache-control: …, no-transform   → 0 injected scripts
 *     GET /rxps/wine    cache-control: … (no no-transform) → 1 injected script
 *
 * That injected script is Cloudflare's own
 * `/cdn-cgi/challenge-platform/scripts/precursor/main.js` bootstrap, and the CSP blocks it
 * on every page load (Sentry VIEWER-8) because its inline payload carries a per-request ray
 * id, so no hash can ever cover it. `no-transform` is Cloudflare's documented way to say
 * "do not modify this response", and the pair above is the proof it works here — the
 * control is built into the measurement.
 *
 * NOT fixable in `_headers`: a `/*` rule would also match `/assets/*`, and Cloudflare
 * JOINS duplicate Cache-Control values from every matching rule with a comma rather than
 * picking a winner — the file's own comment records shipping
 * `immutable, public, max-age=0, must-revalidate` that way.
 *
 * Also NOT a zone setting: `crawler_protection` and `ai_bots_protection` were each turned
 * off in isolation and the script kept coming; there are no challenge rules in any WAF
 * ruleset. Both settings were restored, verified by diff.
 *
 * ⚠️ `new Response(response.body, response)` COPIES the headers, so everything
 * `_headers` applied — the CSP included — survives. That is the whole difference from the
 * `new Response('Not found', …)` below, which enters no static-asset path and carries
 * nothing; securityHeaders.ts exists for that case. Non-200s are returned untouched: a 304
 * has no body to inject into, and constructing one with a body throws.
 */
export function withNoTransform(response: Response): Response {
  if (response.status !== 200) return response
  if (!(response.headers.get('content-type') ?? '').includes('text/html')) return response
  const cacheControl = response.headers.get('cache-control') ?? ''
  if (cacheControl.includes('no-transform')) return response
  const next = new Response(response.body, response)
  next.headers.set('cache-control', cacheControl ? `${cacheControl}, no-transform` : 'no-transform')
  return next
}
