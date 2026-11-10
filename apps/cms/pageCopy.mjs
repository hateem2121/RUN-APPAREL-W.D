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

/** Longer than this, drawing the page is no worse than waiting for R2. */
export const COPY_READ_TIMEOUT_MS = 400

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
