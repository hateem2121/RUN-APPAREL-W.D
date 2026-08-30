/**
 * ⛔⛔ DO NOT `wrangler deploy` FROM THIS DIRECTORY. ⛔⛔
 *
 * THIS FILE IS STALE. The deployed Worker is NOT this code.
 *
 * On 2026-08-28 `run-apparel-apex-404` was edited in the Cloudflare dashboard
 * (version 45581e64, "Added R2 bucket binding ASSETS", then 8153ee99 — both
 * `Source: version_upload`, i.e. not from this repo). It now serves the customer-
 * facing catalogue and company-profile PDFs out of the `run-assets` R2 bucket:
 *
 *   GET https://wear-run.help/catalogue -> 200 application/pdf  54,336,461 B
 *   GET https://wear-run.help/profile   -> 200 application/pdf  16,891,515 B
 *
 * The handler below returns 404 for EVERY path and declares NO bindings. Deploying
 * it replaces the live script and takes both PDFs offline — and reports success,
 * because a deploy that uploads the wrong code is still a successful deploy.
 *
 * Reconcile first: pull the deployed source
 * (`GET /accounts/<acct>/workers/scripts/run-apparel-apex-404/content`), commit it
 * here, and add the `r2_buckets` binding to wrangler.jsonc. Until then this
 * directory is a record of what the apex USED to do, not what it does.
 *
 * Measured and recorded 2026-08-30 —
 * docs/AUDIT-2026-08-30-CLOUDFLARE-AND-GITHUB.md, finding A1.1.
 *
 * ---
 *
 * L6 — the bare apex answers instantly instead of hanging.
 *
 * `GET https://wear-run.help/` used to return 522 after ~20.2s: Cloudflare timing
 * out against an origin that was never there. The 522 itself is BY DESIGN and
 * owner-confirmed — nothing is bound to the bare apex, and every QR deep link on a
 * physical garment tag uses viewer.wear-run.help. The DURATION was the finding: a
 * typo, an accidental link or a crawler hung for twenty seconds.
 *
 * 404 rather than 410: 410 asserts the resource once existed here, which it did not.
 *
 * ❌ THE PARAGRAPH BELOW IS NOW FALSE — kept only so the correction is legible.
 * There is no Single Redirect any more. `/catalogue` is answered by THIS Worker,
 * out of R2, and a plain GET returns 200 with no `Location` at all. Measured
 * 2026-08-30. The reasoning about Rules execution order was correct; its premise
 * died when the PDFs moved off Google Drive.
 *
 * ⚠️ /catalogue IS NOT AFFECTED, and that is guaranteed rather than hoped. It is
 * answered by a Single Redirect (301 to a Drive PDF), and Cloudflare's documented
 * Rules execution order runs Single Redirects FIRST — before Snippets and before
 * Workers — while Redirect is a TERMINATING action, so evaluation stops there and
 * this Worker is never reached for that path. Verified against the Cloudflare docs
 * and then re-measured live immediately after deploying.
 *
 * ⚠️ Do NOT delete the apex DNS record to "fix" this instead. It must stay proxied
 * for the /catalogue redirect to fire at all; removing it trades a 20-second hang
 * for a broken catalogue button, which is the one apex path the product uses.
 *
 * The route is apex-only (`wear-run.help/*`). It does not match viewer., cms. or
 * media., which are separate hostnames on their own Workers custom domains.
 */
export default {
  async fetch() {
    return new Response('Not found. This reference lives at https://viewer.wear-run.help\n', {
      status: 404,
      headers: {
        'content-type': 'text/plain; charset=utf-8',
        'cache-control': 'public, max-age=300',
      },
    })
  },
}
