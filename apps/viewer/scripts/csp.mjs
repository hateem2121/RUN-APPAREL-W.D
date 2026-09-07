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
 * Sentry's CSP report endpoint, derived from the DSN rather than stored twice.
 *
 * A DSN is `https://<publicKey>@<ingestHost>/<projectId>`, and Sentry's documented
 * security endpoint is
 * `https://<ingestHost>/api/<projectId>/security/?sentry_key=<publicKey>` — the same
 * three parts rearranged. Deriving it means there is ONE place the project can be
 * wrong, which matters because a report-uri pointing at the wrong project fails
 * silently: the browser posts, something 4xxs, and nothing appears anywhere.
 *
 * Returns '' for a missing or unparseable DSN, so the policy simply omits the
 * directive rather than shipping `report-uri undefined`.
 */
function sentryReportUri(dsn) {
  if (!dsn) return ''
  try {
    const url = new URL(dsn)
    const projectId = url.pathname.replace(/^\//, '')
    if (!url.username || !projectId) return ''
    return `${url.origin}/api/${projectId}/security/?sentry_key=${url.username}`
  } catch {
    return ''
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
  const reportUri = sentryReportUri(sentryDsn)

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
    // ⚠️ THIRTEEN DIRECTIVES AND NOWHERE TO REPORT A BLOCK, until 2026-08-31. Every
    // one of them can refuse something, and a refusal was visible only to whoever
    // happened to have devtools open on the right page at the right moment. The
    // `report-to` header on these responses belongs to Cloudflare's NEL and reports
    // to Cloudflare, not here.
    //
    // This matters more than it sounds: a CSP violation is how this project would
    // FIRST learn that a production garment stopped rendering. The Meshopt decoder
    // builds its worker through a blob: URL, and when that was missing from
    // connect-src EVERY production model tripped a violation on load while 177 tests
    // stayed green — the seeded fixture was uncompressed, so no test could exhibit it.
    //
    // Costs nothing to allow: the Sentry ingest origin is already in connect-src
    // above, and a report-uri is a browser-initiated POST that no directive gates.
    // Omitted entirely when no DSN is configured. Audit 2026-08-30 PM, finding L6-09.
    ...(reportUri ? [`report-uri ${reportUri}`] : []),
  ].join('; ')
}

/**
 * The full `dist/_headers` file. Honoured by Cloudflare Pages and Workers Static
 * Assets.
 *
 * ⚠️ AR SHIPPED, AND THIS WARNING WAS ABOUT A DIFFERENT KIND OF AR. Corrected
 * 2026-09-07 (audit FA-O-11). It read: "`camera=()` WILL block `<model-viewer ar>`.
 * There is no AR mode today (no `ar` attribute anywhere in src/, no USDZ)" — and
 * `Stage.tsx` has shipped `ar ar-modes="quick-look" ar-placement="floor"
 * ar-scale="fixed"` since 2026-09-05. A load-bearing comment in the one file whose
 * job is to stop someone loosening a header had come to describe code that no
 * longer exists, which is the way a header gets widened for a reason that is not
 * true.
 *
 * The premise was false and so was the consequence, and BOTH halves were measured
 * in the installed `@google/model-viewer@4.3.1` rather than reasoned:
 *
 *   - `getUserMedia` appears in ZERO files under `lib/`. The positive control for
 *     that grep is that the same search does find `relList.supports`, so the empty
 *     result is a real absence rather than a bad pattern.
 *   - the quick-look gate is `IS_AR_QUICKLOOK_CANDIDATE` (`lib/constants.js:67`),
 *     which on iOS is `anchor.relList.supports('ar')` (and a straight `true` for
 *     the listed third-party iOS browsers) — Safari's AR Quick Look is an OS
 *     viewer reached by a LINK, not a camera stream in the page.
 *
 * So `camera=()` does not block what shipped, and it stays. What WOULD be blocked
 * is WebXR (`ar-modes="webxr"`), which does need camera access — if that is ever
 * wanted, this is the line to change, and `docs/DECISION-AR-SCOPE.md` records why
 * it is not wanted today (Android's Scene Viewer cannot read the `blob:` URL this
 * viewer loads the GLB from). Same for `accelerometer`/`gyroscope` if a future
 * device-orientation camera control is wanted; ordinary drag-to-rotate uses
 * pointer events.
 *
 * ⚠️ NOT VERIFIED END TO END: the iOS Simulator has no ARKit, so
 * `relList.supports('ar')` is false there and "the button appears and launches
 * Quick Look" has never been observed on a real iPhone. The claim above is about
 * what the HEADER can block, which is measurable here; the launch is not.
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

# The RUNTIME assets are not hashed, and until 2026-08-19 they revalidated on
# every single visit.
#
# The /assets/* rule covers what the bundler emits. It does not cover anything
# copied from public/, so these four fell through to Workers Static Assets'
# default -- measured on the live edge that day:
#     GET /env/studio-soft.hdr -> cache-control: public, max-age=0, must-revalidate
# Every one of them is on the path to the FIRST rendered frame: model-viewer will
# not decode a production GLB without the Meshopt decoder (see Stage.tsx), and it
# cannot light the garment without the environment map. So a phone that already
# has the bytes still paid a round trip for each before any 3D could start --
# on the connection also carrying the model itself (1.9-8.2 MB since 2026-09-03).
#
# SEPARATE RULES, NEVER /*. Cloudflare JOINS duplicate headers from every
# matching rule with a comma rather than picking a winner, so a Cache-Control on
# /* would append to the /assets/* rule above and ship
#   public, max-age=31536000, immutable, public, max-age=0, must-revalidate
# on every hashed bundle. The paths below cannot collide with /assets/*.
#
# immutable is honest here for a different reason than it is above: these are
# not content-hashed, so they are pinned by VERSION instead. copy-decoders.mjs
# copies the decoder matching the meshoptimizer the pipeline encodes with, and a
# bump changes the bytes at the same URL -- so a decoder or environment change
# needs a cache purge, exactly as a _headers change does.
# Content-Type added 2026-09-05. Measured on the live edge that day:
#     GET /env/studio-soft.hdr -> 200, content-type: (empty)
# Workers Static Assets derives the type from the file extension and has no entry
# for .hdr, so it served the environment map with no type at all. It works today
# only because model-viewer's loader never checks; it is one proxy or one browser
# hardening pass away from breaking the lighting on every garment.
#
# image/vnd.radiance is the registered type for a Radiance .hdr file.
#
# ⚠️ APPENDED TO THIS BLOCK, NOT GIVEN ITS OWN /env/* RULE — see the comma-joining
# trap above. A second rule matching the same path would have Cloudflare join the
# two Cache-Control values rather than pick one.
#
# ⚠️ This asserts a type for EVERY file under /env/. public/env/ holds exactly one
# file and envDirectory.test.ts fails if anything that is not .hdr appears there,
# because a second format would silently be mislabelled by this line.
/env/*
  Cache-Control: public, max-age=31536000, immutable
  Content-Type: image/vnd.radiance

/draco/*
  Cache-Control: public, max-age=31536000, immutable

/basis/*
  Cache-Control: public, max-age=31536000, immutable

/meshopt_decoder.js
  Cache-Control: public, max-age=31536000, immutable

# Link-preview images — L1-06, 2026-08-31.
#
# /og/<product>/<colour>.jpg fell through every rule above and landed on Workers
# Static Assets' default of \`max-age=0, must-revalidate\`, so every crawler that
# re-read a card paid a full round trip for a file that changes only when the
# garment does. These are the images WhatsApp, Slack, iMessage and every search
# crawler fetch when somebody shares a product link.
#
# ⚠️ BOUNDED, NOT immutable — and the distinction is the whole reason this rule is
# separate from the four above. Those URLs are pinned by content hash or by version,
# so \`immutable\` is honest: the bytes at that URL cannot change. An /og/ path is
# NOT: re-processing a garment rewrites the poster behind the same address. An
# immutable year would leave a stale card in every crawler's cache with no way to
# purge theirs. One hour is long enough that a card being shared around is served
# from cache, and short enough that a re-processed garment corrects itself.
#
# Cannot collide with /assets/* — see the comma-joining trap above.
/og/*
  Cache-Control: public, max-age=3600

# Icons and llms.txt — 2026-09-05.
#
# Same L1-06 problem the /og/ rule above was written for: these are copied from
# public/ so the /assets/* rule never reaches them, and they landed on Workers
# Static Assets' default of \`max-age=0, must-revalidate\`. A browser asks for
# /favicon.ico on essentially every visit, unbidden.
#
# ⚠️ BOUNDED, NOT immutable, and for the same reason as /og/*: none of these is
# content-hashed or version-pinned, so the bytes at these URLs CAN change. A year of
# immutable would leave a stale mark in every cache with no way to purge it. A day
# is long enough to stop the per-visit round trip and short enough that a brand
# change corrects itself.
#
# Separate rules rather than one glob: none of these paths can collide with
# /assets/*, which is what makes them safe from the comma-joining trap above.
/favicon.ico
  Cache-Control: public, max-age=86400

/favicon.svg
  Cache-Control: public, max-age=86400

/apple-touch-icon.png
  Cache-Control: public, max-age=86400

/llms.txt
  Cache-Control: public, max-age=86400

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
