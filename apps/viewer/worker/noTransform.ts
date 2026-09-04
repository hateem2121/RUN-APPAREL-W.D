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
 * "do not modify this response":
 * https://developers.cloudflare.com/bots/reference/javascript-detections/ — "If the origin
 * response includes a `Cache-Control: no-transform` directive, Cloudflare does not inject
 * the JavaScript Detections script."
 *
 * ⚠️⚠️ AND IT DOES NOT STOP THE INJECTION A REAL VISITOR GETS. Measured on the live edge
 * immediately after this shipped, 2026-09-04. **`sec-fetch-mode: navigate` is the trigger**,
 * and it is the ONE header that matters — not the user-agent, not `accept`, not
 * `sec-fetch-dest`, each tested alone on paths never requested before:
 *
 *     GET /rxps/wine <no sec-fetch>            → no-transform present, 0 injected
 *     GET /rxps/wine sec-fetch-mode: navigate  → no-transform GONE,    1 injected
 *
 * On the navigation, `content-length` and `etag` are dropped too and the CSP is byte-identical
 * — the signature of Cloudflare streaming a rewritten body. So it injects on navigations
 * *despite* the directive, and strips the directive on the way out. Which is why this file's
 * measurement above is honest and its conclusion was not: the pair of URLs differed in TWO
 * ways at once, the header AND how they were requested, and I attributed the whole difference
 * to the header. **A control has to vary one thing.**
 *
 * WHAT THIS FILE STILL BUYS, and why it stays: every non-navigation fetch of the shell — a
 * crawler unfurling a link preview, `fetch()`, the post-deploy gates — now gets HTML nobody
 * rewrote. That is worth having and is the documented behaviour. It is simply NOT the fix for
 * Sentry VIEWER-8, and a later session must not read this file and think it was.
 *
 * THE CAUSE, FOUND 2026-09-04 — **Cloudflare Precursor**, and `no-transform` cannot reach it.
 *
 * Read the script the injection actually loads:
 * `/cdn-cgi/challenge-platform/scripts/precursor/main.js`. **`precursor`, not `jsd`** — a
 * different Cloudflare feature from JavaScript Detections, which is the ONLY one whose docs
 * promise `no-transform` suppression. `GET /zones/<id>/precursor` returns
 * `{default_mode: "min-friction", enforcement_rules: []}`: Precursor is on, zone-wide,
 * establishing session state in the background on every navigation.
 *
 * ⚠️ **`enable_js: false` was the FINGERPRINT of the cause, not a clearance.** Cloudflare
 * turns JSD off when Precursor is enabled, so that reading was reassuring for exactly the
 * wrong reason, and it is what sent two sessions looking at bot settings.
 *
 * And the bot settings are ruled out by measurement, this time on the path where the effect
 * happens: `ai_bots_protection` and `crawler_protection` were set to `disabled` **together**
 * and four navigation-shaped requests over 36 s were still injected. Both restored, verified
 * byte-identical by diff of the full config. (The earlier "each disabled in isolation"
 * attempt proved nothing — it probed with a plain client, which is never injected either way.)
 *
 * TWO WAYS OUT, and the second is not verified:
 *   1. Turn Precursor off — Cloudflare dashboard → Security → Settings → Precursor. There is
 *      no documented "off" through the API and its two modes (`min-friction`,
 *      `max-security`) are both on; Precursor Rules choose a mode and cannot stop injection.
 *      Costs the session-based bot verification.
 *   2. A CSP **nonce**. Cloudflare documents parsing the CSP response header and noncing what
 *      it injects — but that promise is on the JSD page, and the Precursor docs say nothing
 *      about CSP at all. So this may simply not work here, and it is the more expensive
 *      change: per-request HTML rewriting on the one page all eleven garments load from,
 *      where apps/viewer/CLAUDE.md records a Worker-built response shipping with all five
 *      security headers absent. Measure it on one path before believing it.
 *
 * NOT fixable in `_headers`: a `/*` rule would also match `/assets/*`, and Cloudflare
 * JOINS duplicate Cache-Control values from every matching rule with a comma rather than
 * picking a winner — the file's own comment records shipping
 * `immutable, public, max-age=0, must-revalidate` that way.
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
