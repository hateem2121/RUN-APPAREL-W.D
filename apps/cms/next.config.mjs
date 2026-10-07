import { withPayload } from '@payloadcms/next/withPayload'
import { initOpenNextCloudflareForDev } from '@opennextjs/cloudflare'
import { HTML_LIMITED_BOTS } from './htmlLimitedBots.mjs'
import { withPublicViewerVary } from './publicViewerHeaders.mjs'
import { siteRedirects, siteRewrites } from './siteHostRules.mjs'

// Makes wrangler.jsonc bindings (local D1/R2 emulation) available during `next dev`.
initOpenNextCloudflareForDev()

/**
 * Security headers.
 *
 * The CMS shipped with NONE — no HSTS, no framing protection, no MIME sniffing
 * protection — including on `/admin`, which is the login for the system that
 * owns every product record and the R2 buckets. The viewer has had a strict,
 * build-generated CSP since launch (apps/viewer/scripts/gen-headers.mjs); the
 * side with the password had nothing.
 *
 * Deliberately NOT a full CSP on `/admin`. Payload's admin bundle uses inline
 * styles and dynamic imports, and a script-src tight enough to be worth having
 * would need a nonce threaded through Payload's own document renderer. A CSP
 * that has to carry 'unsafe-inline' 'unsafe-eval' is a false sense of safety,
 * so what is here is the set that is unambiguously correct and testable. The
 * public API routes are unaffected: they set their own Cache-Control and are
 * read-only projections (see src/endpoints/publicViewer.ts).
 */
const SECURITY_HEADERS = [
  /*
   * Two years. The zone is HTTPS-only already; this stops the first request of a session
   * being downgradeable.
   *
   * ⚠️ THE `preload` TOKEN IS NOT ON THE WIRE, AND HAS NEVER BEEN (audit FA-O-04).
   * Measured live 2026-09-07: `cms.wear-run.help` answers
   * `strict-transport-security: max-age=63072000; includeSubDomains` — the max-age and
   * the subdomain flag exactly as declared here, and no `preload`. Cloudflare's own HSTS
   * setting owns this header at the edge and its preload switch is off.
   *
   * It is left in place rather than deleted because the value is right and the intent is
   * right; what would be wrong is believing the site is preload-eligible on the strength
   * of this line. It is not, and it will not be until someone turns the switch on in
   * Cloudflare AND submits the domain.
   *
   * ⚠️ AND THAT IS A ONE-WAY DOOR, WHICH IS WHY NOBODY HAS DONE IT HERE. Once a domain is
   * on the browsers' preload list, every subdomain must serve valid HTTPS for as long as
   * it takes to be removed — months, shipped in browser releases. `media.wear-run.help`,
   * `viewer.`, `cms.` and anything added later are all inside `includeSubDomains`. It is
   * an owner decision with a long tail, not a header change, and it sits on
   * docs/OWNER-CHECKLIST.md.
   */
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  // The admin panel has no reason to be framed, and framing it is how an
  // admin's click gets borrowed.
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  /*
   * `same-origin` since 2026-09-18 (was strict-origin-when-cross-origin): nothing about a
   * page leaves for another site, and internet.nl rates it good.
   *
   * Why not `no-referrer`, which looks stricter: it also drops the Referer on this site's
   * OWN page-to-page navigations, and it makes a browser send `Origin: null` on a native
   * form POST — the Fetch standard's "append a request `Origin` header" nulls it for any
   * non-GET request whose mode is not "cors" (read 2026-09-18). The contact form is one.
   * Payload 3.88 (`auth/extractJWT.js`) refuses the login cookie when a present Origin is
   * not on its csrf list, so any cookie-authenticated form post would break. The admin's
   * own saves are `fetch()` calls (mode "cors") and keep their Origin either way.
   * The document hosts keep `no-referrer`: they have no forms and make no requests.
   */
  { key: 'Referrer-Policy', value: 'same-origin' },
  // Nothing in a CMS needs these, and denying them means a compromised
  // dependency cannot quietly ask for them.
  {
    key: 'Permissions-Policy',
    value:
      'accelerometer=(), camera=(), geolocation=(), gyroscope=(), microphone=(), payment=(), usb=()',
  },
]

/** @type {import('next').NextConfig} */
const nextConfig = {
  // L3, 2026-08-18. Next sets `x-powered-by: Next.js` by default and Payload
  // appends itself; measured live as `x-powered-by: Next.js, Payload` on
  // cms.wear-run.help, and absent on viewer.wear-run.help. Nothing consumes it,
  // and it narrows an attacker's search space for version-specific advisories
  // against the side of this system that holds the password.
  poweredByHeader: false,
  /*
   * `next dev` APPENDS A BLOCK TO apps/cms/CLAUDE.md ON EVERY RUN, and that file is
   * hand-maintained and test-gated (src/claudeMd.test.ts checks its citations, and
   * docs/CLAUDE-MD-MAINTENANCE.md governs its size). The generator is
   * next/dist/server/lib/generate-agent-files.js; its own injected text says removing
   * the block only recreates it. Turning it off at the source is the same move this
   * repo already makes for NODE_ENV (pinned in the build script) and PORT (owned by
   * playwright.config.ts): stop the environment reaching the file, rather than
   * cleaning up after it every session.
   */
  agentRules: false,
  /*
   * Every visitor receives a finished `<head>` instead of streamed metadata (owner's choice,
   * 2026-10-02, visual audit VA-15): Lighthouse 13 no longer names itself, so it was served
   * the streamed head and sometimes found no description. htmlLimitedBots.mjs carries the
   * measurements, and the earlier list of crawlers that needed one.
   */
  htmlLimitedBots: HTML_LIMITED_BOTS,
  /*
   * ⚠️ THE BROWSERS SUPPORTED ARE NEXT'S OWN, AND THE "LEGACY JAVASCRIPT" FINDING IS NEXT'S OWN
   * (polish X15, 2026-10-05). There is no `browserslist` here or in package.json, so Next 16.3.8
   * builds for its documented default: Chrome and Edge 111+, Firefox 111+, Safari 16.4+ (nextjs.org
   * "Supported Browsers", for 16.3.8, updated 2026-07-28). Lighthouse 13.5.0 priced "about 35 KB of
   * code only very old browsers need" on every website page (audit, 3 October). Run over the live
   * scripts on 2026-10-05, its detector matched one script a modern browser loads: the framework
   * chunk, through Next's `polyfill-module` (Array.prototype.at, flat, flatMap, Object.fromEntries,
   * Object.hasOwn, trimStart, trimEnd), which is 1,380 bytes; Lighthouse prices the core-js modules
   * those names stand for (43,785 B before compression). `next/dist/client/app-globals.js` imports
   * it for every browser, so no browserslist removes it (vercel/next.js#86785, open). The other
   * match, 112 KB of polyfills, is a `nomodule` script these browsers never fetch. The finding
   * weighs 0 in the performance score, so it is left alone: removing it would mean aliasing a file
   * inside Next for about 1 KB, and its `URL.canParse` is still needed by Chrome 111-119, Firefox
   * 111-114 and Safari 16.4-16.x.
   */
  transpilePackages: ['@run-apparel/shared'],
  /*
   * 🔴 INLINE CSS IS OFF, AND MUST STAY OFF WHILE THE WEBSITE'S CSS IS ONE LARGE SHEET
   * (2026-10-07, after a live incident). From 2026-09-25 (RO-08) `inlineCss: true` put the
   * stylesheet inside each page so slow-3G first paint did not wait for a download. The cost
   * was invisible: Next also writes the whole minified sheet (124 KB) into every route's
   * `page_client-reference-manifest.js`, FOUR times (the page, the layout, error and
   * not-found), and the Worker bundles every manifest. 51 manifests made 22 MB of the CMS
   * Worker, every new page added 0.5 MB, and every 1 KB of CSS about 200 KB. On 2026-10-07
   * the pages PR took the Worker to 64,905 KiB, 99% of Cloudflare's 64 MiB limit
   * (developers.cloudflare.com/workers/platform/limits, read 2026-10-07): the warm copies
   * served, but a fresh copy failed to load, so a burst of 16+ requests got Error 1101 for
   * everything past the first ~10, and no Worker recorded an error (GraphQL analytics, tail).
   * Off, the Worker measured 42,994 KiB and a page manifest 14.6 KB.
   *
   * Next's own page on the option (v16.4.0, updated 2026-03-03) calls it experimental, "not
   * recommended for production", and says to skip it for "large CSS bundles" and "many pages
   * sharing styles" — both true here. The stylesheet is one hashed, immutable file instead,
   * cached across every page a buyer opens. `scripts/check-cms-worker-size.mjs` fails CI
   * before the Worker can creep back towards the limit. The price, measured: slow-3G first
   * paint went from 1.1 s to 3.5 s on the local harness, past RO-08's 3 s, because the sheet is
   * now 127 KB raw (22 KB gzip); `e2e/firstPaint.spec.ts` holds that number until a smaller
   * sheet brings it back.
   */
  experimental: { inlineCss: false },
  async headers() {
    return [{ source: '/:path*', headers: SECURITY_HEADERS }]
  },
  /*
   * ONE ADDRESS. www -> the main address; the cms host's public pages -> the main
   * address; /admin and /api on the main address -> the branded 404. siteHostRules.mjs
   * carries the decisions and the anchoring warning; src/hostRulesManifest.test.ts
   * reads .next/routes-manifest.json after every build and fails if any rule did not
   * land — a rule that reads fine here and never reaches the build is the same failure
   * shape the Vary header had. withPayload wraps only headers(), so these are untouched.
   */
  async redirects() {
    return siteRedirects()
  },
  async rewrites() {
    return siteRewrites()
  },
}

// ⚠️ withPublicViewerVary MUST wrap the withPayload result, not nextConfig.
// withPayload appends its own blanket `/:path*` rule — including
// `Vary: Sec-CH-Prefers-Color-Scheme` — AFTER whatever nextConfig.headers()
// returns, and Next lets the last matching rule win. That is why L1's first fix
// shipped green and inert: the handler set the right header and this rule
// overrode it in production. publicViewerHeaders.mjs has the full account.
export default withPublicViewerVary(withPayload(nextConfig))
