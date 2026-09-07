import { withPayload } from '@payloadcms/next/withPayload'
import { initOpenNextCloudflareForDev } from '@opennextjs/cloudflare'
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
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
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
  transpilePackages: ['@run-apparel/shared'],
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
