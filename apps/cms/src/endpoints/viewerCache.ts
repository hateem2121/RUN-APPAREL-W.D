/**
 * A short in-process cache for the public viewer payload — the hottest endpoint in the
 * product, and by a long way the slowest thing on a QR scan.
 *
 * MEASURED 2026-09-06, five consecutive samples per URL with `curl -w` so connection setup
 * is separated from server time:
 *
 *   viewer HTML     viewer.wear-run.help    41–49 ms      cf-cache-status HIT
 *   model (1 KB)    media.wear-run.help     37–42 ms      HIT, age 209,704 s
 *   THIS ENDPOINT   cms.wear-run.help    1,178–1,291 ms   no cf-cache-status at all
 *
 * The API is 25× slower than everything else on the page, and it is not a cold start —
 * five samples land inside a 113 ms band. Isolated against `/api/health` on the same host
 * (265–338 ms), **~900 ms of it is the database read and the projection**, and it is the
 * same for two unrelated products, so it is per-request work rather than one slow row.
 *
 * What a visitor experiences: the page HTML arrives in 45 ms, and then nothing happens for
 * 1.2 s while the page asks which model to load. The poster's address only arrives in this
 * answer, so nothing can paint before it.
 *
 * ⚠️ THE `Cache-Control` ON THAT RESPONSE DOES NOTHING, AND THIS IS NOT A SECOND ATTEMPT AT
 * IT. `public, s-maxage=60` is correct for the day a shared cache sits in front of this,
 * and there is no such cache: a Worker's own response does not pass through Cloudflare's
 * edge, which is why the live headers carry no `cf-cache-status` of any kind. The fix has
 * to be inside the Worker.
 *
 * ⚠️ THIS CACHES THE PROJECTED BODY, NOT THE `Response`, AND THAT CHOICE IS THE WHOLE
 * SAFETY ARGUMENT. This response's `Access-Control-Allow-Origin` VARIES by request Origin
 * — Payload's `cors: allowedOrigins` is an allowlist, verified live. `publicViewer.ts`
 * states the consequence in advance: a cache keyed without Origin can store the no-ACAO
 * variant and serve it to the viewer's cross-origin fetch, which the browser blocks, and
 * the page renders "REFERENCE UNAVAILABLE" intermittently. Cloudflare's Cache API IGNORES
 * `Vary`, so the existing `Vary: Origin` would not have saved a `caches.default`
 * implementation.
 *
 * The body contains no ACAO and no per-visitor anything — it is the same published,
 * whitelisted projection for everyone. The headers are rebuilt per request by the handler
 * and CORS is applied per request by Payload, so the varying part never enters the cache.
 * That removes the hazard rather than managing it.
 *
 * ⚠️ WHAT THIS IS NOT. Not shared between Workers isolates, and not cleared when the CMS is
 * saved — so an edit can take up to TTL_MS to reach the viewer. That is the same trade the
 * owner accepted on 2026-09-05 for the public pages (`src/lib/content.ts`), for the same
 * reason: the alternative needs a new R2 bucket for Next's incremental cache plus a tag
 * table in the production database. Nothing here blocks that upgrade.
 *
 * ⚠️ AND IT DOES NOT HELP THE FIRST SCAN OF A COLD ISOLATE, which is worth saying plainly
 * rather than letting a benchmark imply otherwise. A QR tag is by definition a first visit
 * to one of ~335 product/colour URLs. What it does fix is every request after that one in
 * the same isolate: a colourway switch, a second person at the same table, a buyer coming
 * back, a crawler walking the catalogue.
 *
 * ⚠️ FAILURES ARE NEVER CACHED. A 404 or a D1 wobble stays a bad request rather than
 * becoming a bad minute. Only a successful projection is stored — same rule as content.ts.
 */

const TTL_MS = 60_000

/**
 * 67 products x 5 colourways is 335 real keys, so this ceiling is not reachable by ordinary
 * traffic. It exists because the key contains the origin, and an unbounded map in a
 * long-lived isolate is a slow leak rather than an error. Unknown slugs 404 and are never
 * stored, so the map cannot be grown by a hostile URL.
 */
const MAX_ENTRIES = 400

type Entry = { value: unknown; expires: number }

const store = new Map<string, Entry>()

/**
 * ⚠️ THE ORIGIN IS PART OF THE KEY BECAUSE IT IS PART OF THE BODY. `buildViewerResponse`
 * resolves every poster and model URL against the request origin, so the same product
 * genuinely has different payloads on `cms.wear-run.help` and on localhost. Keying without
 * it would serve a preview's URLs to production, or the reverse, and both would look like
 * a broken asset rather than a caching mistake.
 */
export function viewerCacheKey(
  origin: string,
  productSlug: string,
  colourSlug: string | null,
): string {
  return `${origin} ${productSlug} ${colourSlug ?? ''}`
}

export function readViewerCache<T>(key: string, now: number = Date.now()): T | null {
  const hit = store.get(key)
  if (!hit) return null
  if (hit.expires <= now) {
    store.delete(key)
    return null
  }
  return hit.value as T
}

export function writeViewerCache(key: string, value: unknown, now: number = Date.now()): void {
  if (store.size >= MAX_ENTRIES && !store.has(key)) evict(now)
  store.set(key, { value, expires: now + TTL_MS })
}

/**
 * Expired entries first — they are free to lose. Only if that frees nothing does this drop
 * the oldest live entry, which `Map` gives in insertion order.
 */
function evict(now: number): void {
  for (const [key, entry] of store) {
    if (entry.expires <= now) store.delete(key)
  }
  if (store.size < MAX_ENTRIES) return
  const oldest = store.keys().next()
  if (!oldest.done) store.delete(oldest.value)
}

/** Exported for the tests, which must not depend on wall-clock timing to prove a miss. */
export function __clearViewerCache(): void {
  store.clear()
}

/** Exported for the tests only. */
export function __viewerCacheSize(): number {
  return store.size
}
