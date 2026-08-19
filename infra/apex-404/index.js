/**
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
