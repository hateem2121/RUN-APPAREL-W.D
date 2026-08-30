/**
 * The apex: two PDFs, and a fast 404 for everything else.
 *
 * ⚠️ RECONCILED 2026-08-30 FROM THE DEPLOYED SCRIPT, NOT WRITTEN FRESH.
 *
 * Between 2026-08-19 and 2026-08-30 this file was a lie. It returned 404 for every
 * path and declared no bindings, while the deployed Worker — hand-edited in the
 * Cloudflare dashboard on 2026-08-28 (version 45581e64, "Added R2 bucket binding
 * ASSETS", then 8153ee99, both `Source: version_upload`) — served the customer-facing
 * catalogue and company-profile PDFs out of R2. `git log --all -S 'run-assets'` found
 * nothing here that ever added that binding, and no workflow deployed this directory,
 * so nothing noticed. A routine `wrangler deploy` from this folder would have taken
 * both PDFs offline and reported success.
 *
 * The deployed source was recovered with `wrangler init --from-dash` and is
 * reproduced below with its logic unchanged and its formatting restored — the
 * dashboard editor had collapsed the handler onto one line. Verified BEHAVIOURALLY
 * rather than by byte-diff, because Biome formats this directory: see
 * `apps/cms/src/apexWorker.test.ts`, which exercises the routing and header rules
 * against a stub R2 bucket.
 *
 * ⚠️ THE R2 KEYS ARE SPELLED EXACTLY AS THE OBJECTS ARE NAMED, TYPO INCLUDED.
 * "RUN PRODUCT CATALOUGE.pdf" is not a mistake in this file — it is the object's
 * real key in the `run-assets` bucket. Correcting the spelling here 404s the
 * catalogue. Rename the object first if it ever matters.
 *
 * ⚠️ `run-assets` IS SHARED with the separate `run-apparel` commercial site, which
 * binds the same bucket. Nothing written down says who owns it. Deleting "old files"
 * from either side breaks the other.
 *
 * WHAT THIS WORKER IS FOR, ORIGINALLY. `GET https://wear-run.help/` used to return
 * 522 after ~20.2 s: Cloudflare timing out against an origin that was never there.
 * The 522 was BY DESIGN and owner-confirmed — nothing is bound to the bare apex, and
 * every QR deep link on a physical garment tag uses viewer.wear-run.help. The
 * DURATION was the finding: a typo, an accidental link or a crawler hung for twenty
 * seconds. 404 rather than 410, because 410 asserts the resource once existed here.
 *
 * ⚠️ Do NOT delete the apex DNS record. It must stay proxied or this Worker is never
 * reached and both PDFs stop resolving.
 *
 * ⚠️ A previous version of this comment claimed `/catalogue` was answered by a Single
 * Redirect (301 to a Google Drive PDF) and could not be affected by this Worker. That
 * was true once and is now false in both halves: the PDFs live in R2, this Worker
 * serves them, and a plain GET returns 200 with no `Location` at all.
 */

/**
 * The two public documents, keyed by the path a customer visits.
 *
 * `key` is the R2 object name; `name` is what the browser shows in its title bar and
 * uses if the reader saves the file.
 */
const FILES = {
  '/catalogue': { key: 'RUN PRODUCT CATALOUGE.pdf', name: 'RUN-Apparel-Catalogue.pdf' },
  '/profile': { key: 'Company Profile.pdf', name: 'RUN-Apparel-Company-Profile.pdf' },
}

const NOT_FOUND = 'Not found. This reference lives at https://viewer.wear-run.help'

/** Shared by both plain-text responses. 5 minutes: long enough to absorb a crawler. */
const TEXT = {
  'content-type': 'text/plain; charset=utf-8',
  'cache-control': 'public, max-age=300',
}

/**
 * Normalise a request path to a FILES key.
 *
 * Deliberately forgiving in three specific ways, because these are printed on paper
 * and typed by hand: case is ignored, trailing slashes are dropped, and a trailing
 * `.pdf` is accepted. Everything else 404s — this is a two-path allowlist, NOT a
 * generic proxy onto the bucket, so `run-assets` is not enumerable through the apex.
 *
 * @param {string} pathname
 * @returns {string}
 */
function normalise(pathname) {
  let path = pathname.toLowerCase()
  while (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1)
  if (path.endsWith('.pdf')) path = path.slice(0, -4)
  return path
}

/**
 * @param {Request} request
 * @param {{ ASSETS: R2Bucket }} env
 * @returns {Promise<Response>}
 */
export async function handle(request, env) {
  const file = FILES[normalise(new URL(request.url).pathname)]
  if (!file) return new Response(NOT_FOUND, { status: 404, headers: TEXT })

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('Method not allowed', { status: 405, headers: { allow: 'GET, HEAD' } })
  }

  // Range requests matter here: the catalogue is 54 MB, and a browser's PDF viewer
  // asks for the first pages rather than the whole file.
  const rangeHeader = request.headers.get('range')
  const object = rangeHeader
    ? await env.ASSETS.get(file.key, { range: request.headers })
    : await env.ASSETS.get(file.key)

  if (!object) {
    return new Response('That document is temporarily unavailable.', { status: 404, headers: TEXT })
  }

  const headers = new Headers()
  object.writeHttpMetadata(headers)
  headers.set('etag', object.httpEtag)
  headers.set('content-type', 'application/pdf')
  // `inline` so it opens in the browser instead of forcing a download.
  headers.set('content-disposition', `inline; filename="${file.name}"`)
  headers.set('cache-control', 'public, max-age=3600')
  headers.set('accept-ranges', 'bytes')
  headers.set('x-content-type-options', 'nosniff')

  let status = 200
  if (rangeHeader && object.range) {
    const size = object.size
    const offset = typeof object.range.offset === 'number' ? object.range.offset : 0
    const length = typeof object.range.length === 'number' ? object.range.length : size - offset
    // A range covering the whole object is a 200, not a 206 — R2 reports a range even
    // when the request asked for everything.
    if (offset !== 0 || length !== size) {
      headers.set('content-range', `bytes ${offset}-${offset + length - 1}/${size}`)
      status = 206
    }
  }

  return new Response(request.method === 'HEAD' ? null : object.body, { status, headers })
}

export default { fetch: handle }
