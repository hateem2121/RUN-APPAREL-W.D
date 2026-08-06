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
    `frame-ancestors 'none'`,
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
