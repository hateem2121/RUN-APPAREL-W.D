/**
 * The /products hero film, served in pieces (owner's request of 2026-10-01; the film is built by
 * scripts/build-products-film.mjs into public/film/).
 *
 * ⚠️ THE SITE'S STATIC FILES IGNORE A `Range` HEADER, AND iPHONE SAFARI WILL NOT PLAY A VIDEO WITHOUT
 * ONE. Measured on the live site 2026-10-02: `Range: bytes=0-99` for /factory/packing-400.webp came
 * back `200` with all 12,864 bytes, twice (`cf-cache-status: HIT`), while
 * media.wear-run.com (R2) answered the same request `206` with exactly 100 bytes. Apple: "HTTP
 * servers hosting media files for iOS must support byte-range requests, which iOS uses to perform
 * random access in media playback" (Safari Web Content Guide, Configuring Your Server). A local
 * `next start` DOES answer ranges, which is why a prototype played in the simulator.
 *
 * So `wrangler.jsonc` routes `/film/*` to the Worker first (`assets.run_worker_first`), and
 * worker.mjs hands those requests here: the whole file is read from the static assets once and the
 * asked-for bytes are cut from it. The files are under 1 MB, so holding one in memory is cheap.
 * Everything here is pure apart from `env.ASSETS.fetch` (src/filmRange.test.ts).
 */

/** The folder whose files are served in pieces. */
export const FILM_FOLDER = '/film/'

/** Is this a request for one of the film's files? */
export function servesFilm(url) {
  return url.pathname.startsWith(FILM_FOLDER)
}

/**
 * The byte range one `Range` header asks for, against a file of `size` bytes (RFC 9110 §14.1.2).
 * Returns `{ start, end }` (inclusive), `'unsatisfiable'` for a range outside the file, or `null`
 * when the header should be ignored and the whole file sent: an unknown unit, a malformed value,
 * or several ranges, which a video element never asks for.
 */
export function byteRange(header, size) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(String(header).trim())
  if (!match) return null
  const [, first, last] = match
  if (first === '' && last === '') return null
  if (first === '') {
    const suffix = Number(last)
    if (suffix === 0 || size === 0) return 'unsatisfiable'
    return { start: Math.max(0, size - suffix), end: size - 1 }
  }
  const start = Number(first)
  const end = last === '' ? size - 1 : Math.min(Number(last), size - 1)
  if (start >= size || start > end) return 'unsatisfiable'
  return { start, end }
}

/**
 * Answer a request for a film file. Without a `Range` header the static asset goes back as it is,
 * with `Accept-Ranges: bytes` added so the browser knows it may ask for pieces.
 */
export async function filmResponse(request, env) {
  const asset = await env.ASSETS.fetch(new Request(request.url, { method: 'GET' }))
  const head = request.method === 'HEAD'
  if (asset.status !== 200) return asset
  const headers = new Headers(asset.headers)
  headers.set('accept-ranges', 'bytes')
  const header = request.headers.get('range')
  if (!header) return new Response(head ? null : asset.body, { status: 200, headers })

  const body = await asset.arrayBuffer()
  const range = byteRange(header, body.byteLength)
  // The body below is the decoded file, so no transfer encoding the asset carried still applies.
  headers.delete('content-encoding')
  if (range === null) {
    headers.set('content-length', String(body.byteLength))
    return new Response(head ? null : body, { status: 200, headers })
  }
  if (range === 'unsatisfiable') {
    headers.set('content-range', `bytes */${body.byteLength}`)
    headers.delete('content-length')
    return new Response(null, { status: 416, headers })
  }
  const piece = body.slice(range.start, range.end + 1)
  headers.set('content-range', `bytes ${range.start}-${range.end}/${body.byteLength}`)
  headers.set('content-length', String(piece.byteLength))
  return new Response(head ? null : piece, { status: 206, headers })
}
