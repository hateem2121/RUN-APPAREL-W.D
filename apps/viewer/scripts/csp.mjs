import { createHash } from 'node:crypto'

/**
 * The Content-Security-Policy the viewer ships, as a pure function.
 *
 * Split out of gen-headers.mjs on 2026-08-05 so it can be tested. That script
 * reads `dist/` and writes `_headers` at import time, so importing it from a test
 * ran the build step; nothing here touches the filesystem, the environment, or
 * `process`. See csp.test.ts.
 *
 * Two values are computed from the build rather than hard-coded, so the policy
 * cannot drift from what actually ships:
 *
 *  1. A sha256 hash of every INLINE <script> in the built HTML → script-src allows
 *     exactly those, and never 'unsafe-inline'.
 *  2. The API origin the app was built against → connect-src/img-src always include
 *     wherever the build calls the API.
 *
 * gstatic.com used to be allowed here for model-viewer's built-in Draco and KTX2
 * decoder locations. It is gone: scripts/copy-decoders.mjs self-hosts all three
 * decoders, so the policy needs no third-party origin for them at all.
 */

/** Where the API lives when the build-time URL is missing or unparseable. */
export const FALLBACK_API_ORIGIN = 'https://cms.wear-run.help'

/**
 * Cloudflare Web Analytics.
 *
 * The beacon is embedded MANUALLY (a `<script src>` in index.html), because
 * Automatic Setup injects an inline bootstrap at the edge — after this file has
 * already computed its hashes — so the policy blocked it on every single page load
 * and the beacon never ran. Pinning the injected hash is not an option either: it
 * changes on every Cloudflare update.
 *
 * A manual embed loads from static.cloudflareinsights.com and POSTs its measurements
 * to cloudflareinsights.com/cdn-cgi/rum. (Automatic setup posts to the site's own
 * origin instead — which is why these two entries are not interchangeable.)
 */
const CF_SCRIPT = 'https://static.cloudflareinsights.com'
const CF_CONNECT = 'https://cloudflareinsights.com https://static.cloudflareinsights.com'

/**
 * Covers media served from cms/api/media.wear-run.help regardless of which host the
 * build points `VITE_API_BASE_URL` at.
 */
const ZONE = 'https://*.wear-run.help'

/**
 * sha256 hashes for every inline <script> in `html`, formatted for a CSP source list.
 *
 * The negative lookahead is the load-bearing part: a script carrying a `src` is
 * covered by an origin in script-src, and its element body is never executed, so
 * hashing that body would put an entry in the policy that authorises nothing. The
 * `!body` guard alone will NOT do this job — it only catches the common case where
 * a src script's body happens to be empty.
 */
export function inlineScriptHashes(html) {
  const hashes = []
  for (const match of html.matchAll(/<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/gi)) {
    const body = match[1]
    if (!body) continue
    hashes.push(`'sha256-${createHash('sha256').update(body, 'utf8').digest('base64')}'`)
  }
  return hashes
}

/** Parse an origin, falling back rather than emitting a broken policy. */
function originOr(url, fallback) {
  if (!url) return fallback
  try {
    return new URL(url).origin
  } catch {
    return fallback
  }
}

/**
 * @param {object} input
 * @param {string} input.html        The BUILT index.html, so hashes match what ships.
 * @param {string} [input.apiBaseUrl] Value of VITE_API_BASE_URL at build time.
 * @param {string} [input.sentryDsn]  Value of VITE_SENTRY_DSN at build time, if any.
 * @returns {string} The policy, ready for the `Content-Security-Policy` header.
 */
export function buildCsp({ html, apiBaseUrl, sentryDsn }) {
  const inlineHashes = inlineScriptHashes(html)
  const apiOrigin = originOr(apiBaseUrl, FALLBACK_API_ORIGIN)
  // Empty (and omitted) when no DSN is configured, so no origin is added.
  const sentryOrigin = originOr(sentryDsn, '')

  return [
    `default-src 'self'`,
    `base-uri 'self'`,
    `object-src 'none'`,
    // Was `'none'` until 2026-08-11. The CMS now shows the real customer page in
    // a panel beside the edit form (Products.admin.livePreview), and Payload's
    // live preview is an iframe — under `'none'` it renders a blank frame with
    // no console error, which is the confusing failure this comment exists to
    // pre-empt. This is the narrowest form that works: any other site embedding
    // the viewer is still refused, which is what the directive is for.
    // Pinned by csp.test.ts.
    `frame-ancestors 'self' https://cms.wear-run.help`,
    `form-action 'none'`,
    // 'wasm-unsafe-eval' — model-viewer's Draco/KTX2 wasm decoders; no eval.
    `script-src 'self' 'wasm-unsafe-eval' ${inlineHashes.join(' ')} ${CF_SCRIPT}`
      .replace(/\s+/g, ' ')
      .trim(),
    // 'unsafe-inline' for styles only — the motion layer animates via style
    // attributes and model-viewer injects styles into its shadow DOM. Style
    // injection is far lower risk than script injection (which stays hash-locked).
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data: blob: ${apiOrigin} ${ZONE}`,
    `font-src 'self'`,
    // blob: — the Meshopt decoder builds its worker's source as a Blob and loads
    // it through a blob: URL (meshoptimizer/meshopt_decoder.cjs, initWorkers), and
    // Chromium checks that fetch against connect-src as well as worker-src. EVERY
    // production GLB is EXT_meshopt_compression, so without this the real garment
    // trips a CSP violation on every load.
    //
    // Nothing caught it until seed:assets started merging with --meshopt: the
    // seeded placeholder was uncompressed, so the e2e suite exercised a codepath
    // production never uses. Same blind spot that let the missing decoder location
    // reach production on 2026-07-29.
    //
    // Narrow: blob: permits fetches to blobs this page itself created, not to any
    // remote origin. Script execution stays hash-locked by script-src.
    `connect-src 'self' blob: ${apiOrigin} ${ZONE} ${CF_CONNECT} ${sentryOrigin}`
      .replace(/\s+/g, ' ')
      .trim(),
    `worker-src 'self' blob:`,
    `manifest-src 'self'`,
    `upgrade-insecure-requests`,
  ].join('; ')
}

/**
 * The full `dist/_headers` file. Honoured by Cloudflare Pages and Workers Static
 * Assets.
 *
 * ⚠️ `camera=()` in Permissions-Policy WILL block `<model-viewer ar>`. There is no
 * AR mode today (no `ar` attribute anywhere in src/, no USDZ), so denying it is
 * free — but if AR is ever added for iOS Quick Look, this is the line that makes it
 * silently fail. Same for `accelerometer`/`gyroscope` if a future device-orientation
 * camera control is wanted; ordinary drag-to-rotate uses pointer events.
 *
 * Strict-Transport-Security and Permissions-Policy were both absent until
 * 2026-08-03; only nosniff, Referrer-Policy and the CSP were emitted.
 *
 * @param {Parameters<typeof buildCsp>[0]} input
 * @returns {string}
 */
export function buildHeadersFile(input) {
  return `# GENERATED by scripts/gen-headers.mjs — do not edit by hand.
# The policy is built by scripts/csp.mjs, which has tests. CSP origins are baked in
# from VITE_API_BASE_URL at build time.

# Hashed build assets are immutable.
# Deliberately NOT given no-transform: see the SPA shell rule below for why that
# directive is confined to HTML.
/assets/*
  Cache-Control: public, max-age=31536000, immutable

# The SPA shell must always revalidate so new deploys go live immediately.
#
# no-transform is NOT a caching decision. It stops Cloudflare injecting Bot Fight
# Mode's JavaScript Detections script into the HTML — an inline script that trips
# the CSP on every single page load. No hash can ever cover it: it embeds a
# per-request ray id, so its sha256 differs on every response (three values measured
# inside one minute on 2026-08-06). Cloudflare bundles JSD with Bot Fight Mode and
# documents that it "cannot be disabled" separately, so refusing the transform is
# the only fix that neither widens script-src to 'unsafe-inline' nor turns off bot
# protection for the entire zone, CMS login included.
#
# ⚠️ THIS ONLY REACHES THE LITERAL /index.html. It does NOT reach the SPA routes
# visitors actually open, so it does NOT currently stop the injection. Measured
# 2026-08-06 after deploying:
#     /index.html  -> public, max-age=0, must-revalidate, no-transform
#     /            -> public, max-age=0, must-revalidate
#     /n001/wine   -> public, max-age=0, must-revalidate
# The last two are Workers Static Assets' own default for SPA-fallback HTML, which
# happens to be byte-identical to this rule minus no-transform — so an earlier
# check that compared the two saw a match and wrongly concluded the rule applied.
#
# It cannot simply be moved to /*. Cloudflare joins duplicate headers from multiple
# matching rules WITH A COMMA rather than picking a winner, so a Cache-Control on
# /* would append to the /assets/* one and produce
#   public, max-age=31536000, immutable, public, max-age=0, must-revalidate
# on every hashed bundle. Placeholders do not help either: /:product/:colourway
# also matches /assets/index-abc.js.
#
# Left in place because it is correct and harmless for the one path it covers.
# Closing the gap needs either Bot Fight Mode off (a dashboard toggle, which also
# removes the datacenter-403 problem) or a Worker script that sets the header by
# content-type. See CLAUDE.md.
#
# Side effect: no Cloudflare HTML rewriting at all, so Web Analytics auto-injection
# would not work either. Harmless — the beacon is embedded manually in index.html,
# precisely because an edge-injected script cannot be hashed.
/index.html
  Cache-Control: public, max-age=0, must-revalidate, no-transform

/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
  Permissions-Policy: accelerometer=(), camera=(), geolocation=(), gyroscope=(), microphone=(), payment=(), usb=()
  Content-Security-Policy: ${buildCsp(input)}
`
}
