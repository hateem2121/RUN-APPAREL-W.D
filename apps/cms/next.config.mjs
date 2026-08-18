import { withPayload } from '@payloadcms/next/withPayload'
import { initOpenNextCloudflareForDev } from '@opennextjs/cloudflare'
import { withPublicViewerVary } from './publicViewerHeaders.mjs'

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
  // Two years, preload-eligible. The zone is HTTPS-only already; this stops the
  // first request of a session being downgradeable.
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
  transpilePackages: ['@run-apparel/shared'],
  async headers() {
    return [{ source: '/:path*', headers: SECURITY_HEADERS }]
  },
}

// ⚠️ withPublicViewerVary MUST wrap the withPayload result, not nextConfig.
// withPayload appends its own blanket `/:path*` rule — including
// `Vary: Sec-CH-Prefers-Color-Scheme` — AFTER whatever nextConfig.headers()
// returns, and Next lets the last matching rule win. That is why L1's first fix
// shipped green and inert: the handler set the right header and this rule
// overrode it in production. publicViewerHeaders.mjs has the full account.
export default withPublicViewerVary(withPayload(nextConfig))
