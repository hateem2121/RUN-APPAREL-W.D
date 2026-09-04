/**
 * How big is the object a product's payload points at?
 *
 * Extracted from `smoke-viewer-payload.mjs` on 2026-09-04 because the answer it gave
 * there was ALWAYS "no idea", and the assertion downstream of it — `MIN_MODEL_BYTES`,
 * the guard that catches a payload pointing at a stub or an error page instead of a
 * garment — had therefore never been able to fire on this domain.
 *
 * THE CAUSE IS THE HTTP CLIENT, NOT THE EDGE. Node's `fetch` sends
 * `accept-encoding: gzip, deflate, br`; Cloudflare compresses the GLB in response and
 * drops `content-length`, and undici strips it again when it decompresses. So a HEAD
 * returns 200 with `content-encoding` present and no length at all. `curl -I`, which
 * sends no accept-encoding, reports `content-length: 28271780` for the same URL in the
 * same minute — which is exactly why this looked healthy to anyone checking by hand.
 *
 * The old code fell back to a ranged GET only on 405/501, so the fallback never ran.
 * A RANGE REQUEST IS EXEMPT FROM COMPRESSION, so `content-range` carries the true
 * object size — the same reason `.claude/skills/check-live/check-live.mjs` measures
 * with `bytes=0-1023` rather than a HEAD.
 *
 * Proven both ways before shipping (a measurement nothing has caught is not known to
 * work): with this in place and `SMOKE_MIN_MODEL_BYTES=99999999` the smoke check exits
 * 1 with "the model is only 28271780 bytes"; with it reverted, the same floor exits 0
 * and prints "size not verified".
 *
 * ⚠️ Do NOT replace the caller's HEAD with a ranged GET to tidy this up. That script
 * deliberately compares a HEAD verdict against a separate bare GET, because on
 * `media.wear-run.help` the two land on DIFFERENT edge cache entries and a model has
 * served `GET 404` while `HEAD` returned 200. Losing that comparison would trade one
 * blind gate for another.
 */

/** The true object size from whatever the edge was willing to say, or 0 if neither. */
export function bytesFromHeaders(headers) {
  const range = headers.get('content-range')
  if (range) {
    const total = Number(range.split('/')[1] || 0)
    if (Number.isFinite(total) && total > 0) return total
  }
  const length = Number(headers.get('content-length') || 0)
  return Number.isFinite(length) && length > 0 ? length : 0
}

/**
 * Read the size of `url`, given a response already in hand from the caller's HEAD.
 *
 * Returns the byte count, or 0 when the edge would not say — which the caller must
 * report as unverified rather than treat as a pass.
 */
export async function measureModelBytes(
  url,
  headResponse,
  { fetchFn = fetch, timeoutMs = 30000 } = {},
) {
  const fromHead = bytesFromHeaders(headResponse.headers)
  if (fromHead) return fromHead

  // The fallback the old code only reached on 405/501.
  const ranged = await fetchFn(url, {
    method: 'GET',
    headers: { range: 'bytes=0-0' },
    signal: AbortSignal.timeout(timeoutMs),
  })
  return bytesFromHeaders(ranged.headers)
}
