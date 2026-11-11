/**
 * ONE shared copy of each website page, in R2, for a region whose Workers Cache does not hold it
 * yet (shared page copy plan, owner's yes 10 Nov 2026).
 *
 * WHY. Workers Cache keeps a copy per region (tiered: a lower tier per data centre, regional upper
 * tiers; developers.cloudflare.com/workers/cache, updated 30 Oct 2026). The warm-ups fill the US
 * runner's region and Pakistan, so a reader anywhere else waits while SitePages draws the page:
 * 1–3.7 s. ChatGPT's live reader (ChatGPT-User) gave up on 4 of 61 page reads in 72 hours to
 * 10 Nov, every one in a region nobody warms (Seoul 3,424 ms, Frankfurt 944, Sydney 925,
 * Singapore 527), and got the same pages in 16 ms where they were kept. One R2 object answers
 * every region in one read instead of a drawing.
 *
 * WHY R2, NOT KV. The account's KV was already at its free limits on 10 Nov
 * (`run-apparel-site-page-cache` reads up to 100,905 a day against 100,000). R2's free month is
 * 1 M writes and 10 M reads; the account used 35,356 and 115,283 in the 30 days before.
 *
 * ⚠️ THE KEY NAMES THE BUILD AND THE CONTENT VERSION. A build renames the page's script files (the
 * failure behind the 3D fallback of 21 Oct, store-misses spec option E), and a CMS save writes a
 * new content version, so no copy can outlive either. The bucket's lifecycle rule deletes copies
 * after 8 days (`STALE_SECONDS` + 1 day).
 *
 * ⚠️ NOTHING HERE THROWS. A missing bucket, an R2 error, a damaged object or a read slower than
 * COPY_READ_TIMEOUT_MS all read as "no copy", and the page is drawn as before the copy existed.
 */

import { KEPT_FILES, KEPT_TAGS, keptHeaders, STALE_SECONDS } from './pageCache.mjs'

/** Longer than this, drawing the page is no worse than waiting for R2. */
export const COPY_READ_TIMEOUT_MS = 400

/**
 * The copy's name travels from the default entrypoint (which read the content version for the
 * store key anyway) to SitePages on the clean request, so SitePages reads no extra KV key. Workers
 * Cache keys on `cf.cacheKey`, so this header never splits the store.
 */
export const COPY_KEY_HEADER = 'x-run-copy-key'

/**
 * ⚠️ A PAGE ANSWERED FROM A COPY IS KEPT FOR THREE MINUTES, NOT A DAY. A save writes KV
 * `content-version` and then marks kept copies stale (src/lib/contentVersion.ts), but a region can
 * read the OLD version for about 120 s (KV spreads in about 60 s, plus KV's own VERSION_CACHE_SECONDS,
 * plus pageCache.mjs memoKvGet's 30 s). A refresh in that window would find the copy filed under the
 * old version; kept for a day, the old words would outlive the save. Three minutes covers the window
 * with a margin; then the region asks again and reads the new version.
 *
 * ⚠️ …AND IT MAY BE SERVED STALE WHILE IT IS REFRESHED (11 Nov 2026). With `max-age=180` alone, a
 * data centre that went three minutes without a request lost the page and fetched it again from
 * further away: live, home-page hits after such a gap took a median of 99 ms (65 of 74 over 50 ms),
 * against 6 ms the day before, and the page never got back to being kept a day. The same
 * `stale-while-revalidate` as a page drawn in full (pageCache.mjs KEPT_CACHE_CONTROL) answers at
 * once and refreshes behind the scenes; the three minutes still decide WHEN the region asks again,
 * so a save is still picked up. Never add `s-maxage`, `must-revalidate` or `proxy-revalidate`: any
 * of them switches stale-while-revalidate off (Cloudflare, Workers Cache "Debugging").
 */
export const COPY_SERVED_CACHE_CONTROL = `public, max-age=180, stale-while-revalidate=${STALE_SECONDS}`

/** Only whole website pages: never a tap (`rsc: 1`), never the sitemap, llms.txt or robots.txt. */
function copyable(request, env) {
  if (!copyOn(env) || !request.headers.get(COPY_KEY_HEADER)) return false
  if (request.headers.get('rsc') === '1') return false
  return !KEPT_FILES.includes(new URL(request.url).pathname)
}

/** One Workers Logs line per copy decision: state and milliseconds only (the repo is public). */
export function copyLog(state, ms) {
  return { pageCopy: state, ms: Math.round(ms) }
}

/**
 * SitePages' answer from the shared copy, or null to draw the page as before.
 *
 * @param {Request} request the clean request SitePages was handed
 * @param {{ PAGE_COPIES?: any, PAGE_COPY?: string }} env
 * @returns {Promise<Response | null>}
 */
export async function answerFromCopy(request, env) {
  if (!copyable(request, env)) return null
  const askedAt = Date.now()
  const copy = await readCopy(env.PAGE_COPIES, request.headers.get(COPY_KEY_HEADER))
  console.log(copyLog(copy ? 'hit' : 'miss', Date.now() - askedAt))
  if (!copy) return null
  const headers = keptHeaders(copy.headers, Date.now(), KEPT_TAGS.pages)
  headers.set('cache-control', COPY_SERVED_CACHE_CONTROL)
  return new Response(copy.text, { status: 200, headers })
}

/**
 * The copy's answer if it comes before the drawing finishes; null to use the drawing.
 *
 * ⚠️ SITEPAGES STARTS DRAWING FIRST, THEN ASKS (11 Nov 2026). Asked before drawing, the copy read
 * cost every miss its whole wait: in the first ~25 minutes live, a found copy took p50 344 ms
 * (n=15) and 92 of 93 misses ran into the 400 ms limit, all of it added to a 1–3.7 s drawing.
 * Racing the two, a miss costs nothing and a hit still answers in about 0.35 s.
 *
 * THE PRICE: when the copy wins, the drawing has already started. It is drained in waitUntil and
 * its body cancelled (Cloudflare, Workers Best Practices, "Always await or waitUntil your
 * Promises", read 11 Nov 2026), so a hit costs the CPU of a drawing, as every request did before
 * the copy existed. When the drawing wins, the copy read still running goes to waitUntil too.
 *
 * @param {Promise<Response | null>} copy answerFromCopy(...), already started
 * @param {Promise<Response>} drawing the drawing, already started
 * @param {{ waitUntil: (p: Promise<unknown>) => void }} ctx
 * @returns {Promise<Response | null>}
 */
export async function raceCopy(copy, drawing, ctx) {
  const asked = copy.catch(() => null)
  // A drawing that fails leaves the copy to answer if it can; the caller's await then rethrows.
  const drawn = drawing.then(
    () => 'drawn',
    () => asked,
  )
  const first = await Promise.race([asked, drawn])
  if (first instanceof Response) {
    ctx.waitUntil(drawing.then((response) => response.body?.cancel()).catch(() => {}))
    return first
  }
  if (first === 'drawn') ctx.waitUntil(asked)
  return null
}

/**
 * After SitePages drew a WHOLE page it keeps (the caller checks keepablePage, wholePage and that
 * the render was not spoiled), write the copy in waitUntil. True when a write was started.
 *
 * @param {Request} request
 * @param {{ PAGE_COPIES?: any, PAGE_COPY?: string }} env
 * @param {{ waitUntil: (p: Promise<unknown>) => void }} ctx
 * @param {HeadersInit} headers the drawn page's own headers
 * @param {string} text
 */
export function keepCopy(request, env, ctx, headers, text) {
  if (!copyable(request, env)) return false
  const key = request.headers.get(COPY_KEY_HEADER)
  ctx.waitUntil(
    writeCopy(env.PAGE_COPIES, key, headers, text).then((written) => {
      console.log(copyLog(written ? 'written' : 'write-failed', 0))
    }),
  )
  return true
}

/** The shape written to R2; a different `v` reads as no copy. */
const COPY_FORMAT = 1

/** Headers never kept with a copy: anything personal, or tied to one answer. */
const NEVER_COPIED = ['set-cookie', 'content-length', 'content-encoding', 'etag', 'last-modified']

/**
 * The object's name: host, build, content version, then the path (the home page is `index`). The
 * query is dropped: SitePages draws from `withoutTracking`, and no website page varies by query.
 *
 * @param {string} url
 * @param {string} build keptBuild(env)
 * @param {string | null} contentVersion KV `content-version`, or null when unset
 */
export function copyKey(url, build, contentVersion) {
  const { hostname, pathname } = new URL(url)
  const path = pathname.replace(/^\/+|\/+$/g, '') || 'index'
  const segments = path.split('/').map(encodeURIComponent).join('/')
  const content = encodeURIComponent(contentVersion ?? 'none')
  return `pages/${hostname}/${encodeURIComponent(build)}/${content}/${segments}`
}

/**
 * Off with the Worker var PAGE_COPY = "off" (a deploy, no KV read: KV is at its limit), or when
 * the PAGE_COPIES binding is missing.
 *
 * @param {{ PAGE_COPIES?: unknown, PAGE_COPY?: string } | undefined} env
 */
export function copyOn(env) {
  return Boolean(env?.PAGE_COPIES) && env?.PAGE_COPY !== 'off'
}

/**
 * The copy for this key, or null.
 *
 * @param {{ get: (key: string) => Promise<{ text: () => Promise<string> } | null> }} bucket
 * @param {string} key
 * @param {number} [timeoutMs]
 * @returns {Promise<{ headers: Headers, text: string } | null>}
 */
export async function readCopy(bucket, key, timeoutMs = COPY_READ_TIMEOUT_MS) {
  let timer
  const late = new Promise((resolve) => {
    timer = setTimeout(() => resolve(null), timeoutMs)
  })
  const read = (async () => {
    const object = await bucket.get(key)
    if (!object) return null
    const stored = JSON.parse(await object.text())
    if (stored?.v !== COPY_FORMAT || typeof stored.text !== 'string') return null
    return { headers: new Headers(stored.headers), text: stored.text }
  })().catch(() => null)
  try {
    return await Promise.race([read, late])
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Write a whole page's copy. True when R2 took it; false on any failure (logged by the caller).
 *
 * @param {{ put: (key: string, value: string, options?: object) => Promise<unknown> }} bucket
 * @param {string} key
 * @param {HeadersInit} headers the drawn page's own headers, before the store's are added
 * @param {string} text
 */
export async function writeCopy(bucket, key, headers, text) {
  try {
    const kept = [...new Headers(headers)].filter(([name]) => !NEVER_COPIED.includes(name))
    const body = JSON.stringify({ v: COPY_FORMAT, headers: kept, text })
    await bucket.put(key, body, { httpMetadata: { contentType: 'application/json' } })
    return true
  } catch {
    return false
  }
}
