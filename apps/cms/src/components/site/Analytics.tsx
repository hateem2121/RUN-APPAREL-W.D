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
 * ⚠️ THE NONCE IS ADDED OUTSIDE REACT. Since 2026-09-18, apps/cms/worker.mjs stamps a
 * per-request nonce on every <script> of a public page, this one included (SE-04). Nothing
 * here should read or pass a nonce. A comment once demanded one from a `proxy.ts`. That file
 * cannot exist on this stack (audit FA-O-12, measured 2026-09-05), and `publicSite.test.ts`
 * asserts that none does.
 *
 * This tag is also admitted by its HOST: `script-src … https://static.cloudflareinsights.com`
 * in `publicViewerHeaders.mjs`, with `connect-src` naming the two Insights origins the beacon
 * reports to. Both are pinned by tests.
 *
 * ⚠️ NO `integrity` ATTRIBUTE, DELIBERATELY (decided 2026-09-18). MDN Observatory takes 5
 * points for it. Cloudflare's own FAQ says a MANUALLY embedded beacon cannot safely carry
 * `integrity`, because Cloudflare does not support version-pinning `beacon.min.js` and updates
 * it in place (measured: its bytes changed on 2026-09-02). Only Cloudflare's AUTOMATIC
 * injection adds a hash, and that injected tag carries no nonce, so the script guard would
 * block it. Keep this manual tag and accept the −5, which does not stop an A+ once
 * 'unsafe-inline' is gone.
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
