/**
 * Cloudflare Web Analytics.
 *
 * WHY THIS ONE. The audit's flat observation was that there is currently no way to tell
 * whether these pages produce a single enquiry. Of the options, this is the only one
 * that costs nothing against a $5/month ceiling, sets NO COOKIES — so it needs no
 * consent banner and collects no personal data — and is already part of the Cloudflare
 * account this site is served from. It reports visitors, pages and referrers, and cannot
 * follow anyone between sites. Google Analytics was declined on the consent-banner and
 * data-sharing grounds; a paid privacy-first tool would break the budget.
 *
 * ⚠️ RENDERS NOTHING UNTIL THE TOKEN EXISTS, AND THAT IS THE INTENDED STATE ON DAY ONE.
 * The token is created in the Cloudflare dashboard against a hostname, so it cannot be
 * generated from here — see docs/OWNER-CHECKLIST.md. Until it is set, this returns null
 * and the site ships no third-party script at all. A missing token must never render a
 * beacon with an empty one: that reports to Cloudflare from an unidentified site, which
 * is worse than not reporting.
 *
 * ⚠️ THE SCRIPT MUST CARRY THE NONCE. `proxy.ts` sets a per-request
 * Content-Security-Policy, and `script-src` governs this tag like any other. Without the
 * nonce the browser silently refuses to run it and analytics quietly records nothing —
 * green, deployed, and blind, which is this repo's most repeated failure shape.
 */
export function Analytics({ nonce }: { nonce?: string }) {
  const token = process.env.CF_ANALYTICS_TOKEN?.trim()
  if (!token) return null

  return (
    <script
      defer
      nonce={nonce}
      src="https://static.cloudflareinsights.com/beacon.min.js"
      // The attribute Cloudflare's beacon reads. JSON.stringify rather than a template
      // string so a malformed token cannot produce malformed JSON.
      data-cf-beacon={JSON.stringify({ token })}
    />
  )
}
