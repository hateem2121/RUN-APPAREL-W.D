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
 * ⚠️ THIS TAG NEEDS NO NONCE, AND THE COMMENT THAT SAID OTHERWISE DESCRIBED A FILE THAT
 * HAS NEVER EXISTED (audit FA-O-12). It read: "`proxy.ts` sets a per-request
 * Content-Security-Policy... without the nonce the browser silently refuses to run it."
 * There is no `proxy.ts` and there cannot be one — measured 2026-09-05, Next 16's renamed
 * middleware fails `opennextjs-cloudflare build` outright on the Node runtime and fails
 * earlier still with `runtime: 'edge'`, while `pnpm build` and 2,000 tests stay green.
 * `publicSite.test.ts` asserts no such file exists for that reason.
 *
 * What actually admits this script is the HOST in the policy:
 * `script-src 'self' 'unsafe-inline' https://static.cloudflareinsights.com` in
 * `publicViewerHeaders.mjs`, and `connect-src` names the two Insights origins the beacon
 * reports to. Both are pinned by tests. A comment demanding a nonce would send the next
 * reader looking for machinery that cannot be built here.
 *
 * TOKEN SET ON THE WORKER 2026-09-07 (`CF_ANALYTICS_TOKEN`, `run-apparel-viewer-cms`) and
 * verified in `wrangler secret list`. It renders nothing yet, correctly: fetched live the
 * same day, `cms.wear-run.help/` serves a private holding page and the marketing site is
 * not deployed anywhere. The beacon appears when the site does.
 */
export function Analytics() {
  const token = process.env.CF_ANALYTICS_TOKEN?.trim()
  if (!token) return null

  return (
    <script
      defer
      src="https://static.cloudflareinsights.com/beacon.min.js"
      // The attribute Cloudflare's beacon reads. JSON.stringify rather than a template
      // string so a malformed token cannot produce malformed JSON.
      data-cf-beacon={JSON.stringify({ token })}
    />
  )
}
