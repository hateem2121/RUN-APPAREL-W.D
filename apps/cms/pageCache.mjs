/**
 * The stored page cache (polish audit X15; the owner's answer to Q51, "add the stored page
 * cache"; built 2026-10-04).
 *
 * WHY. Cloudflare's own logs for the seven days to 2026-10-04: the slowest tenth of website
 * pages took 0.9–1.7 s at the server (home 1,628 ms, products 1,418 ms), and even the plain
 * /privacy page spent 0.8 s of PROCESSOR time there. That is a fresh server copy loading
 * Next.js and the CMS before it can draw anything: measured locally, a first request costs
 * 346 ms for Next alone and 161 ms more for the CMS. The 60-second memory cache in
 * src/lib/content.ts cannot help, because it lives inside the copy that has just started.
 *
 * WHAT. worker.mjs keeps each finished public page, and since 2026-10-24 the sitemap, llms.txt
 * and robots.txt, in Cloudflare's Workers Cache in front of its SitePages entrypoint: a store
 * shared by every data centre in two tiers, which answers without running the Worker and joins
 * simultaneous misses into one drawing. Until 2026-10-24 it used the Cache API, one store per
 * data centre, so after every deploy the first visitor in each data centre waited (home page
 * opens, 7 days to 2026-10-24: p75 799 ms, p90 2,338 ms). A copy answered from the store never
 * loads Next or the CMS. ⚠️ A LOCAL PREVIEW DOES NOT KEEP ANYTHING: measured 2026-10-24, a page
 * fetched again 5 s later in `opennextjs-cloudflare preview` was drawn again. Only the live
 * site can show a hit (Server-Timing `page-cache;desc="hit"`).
 *
 * ⚠️ THE COPY IS KEPT BEFORE THE SCRIPT GUARD STAMPS IT. worker.mjs stamps every answer, kept
 * or fresh, with its own nonce, so no visitor's nonce is ever served twice (cspNonce.mjs).
 * scripts/public-security-probe.mjs fetches each page twice and fails on a repeat.
 *
 * ⚠️ WHY NOT OPENNEXT'S OWN INCREMENTAL CACHE, the plan's first idea. It stores only what
 * Next builds ahead of time, and these pages are drawn per request, because the build has
 * no database. Next does pre-build six routes (.next/prerender-manifest.json, 2026-10-04),
 * /sitemap.xml among them, with no garments in it. Today the missing cache makes OpenNext
 * redraw it on every visit (live: 217 URLs, `x-nextjs-cache: MISS`). An R2 incremental cache
 * would have served the build's copy and dropped all 200 garment pages from the sitemap.
 *
 * ⚠️ THE DEPLOY IS IN EVERY KEY, so an old copy becomes unreachable instead of being deleted:
 * the Worker's version (the CF_VERSION_METADATA binding). A deploy renames every script file,
 * so a page from the last build would ask for files that no longer exist.
 *
 * ⚠️ A SAVE NO LONGER EMPTIES THE STORE (2026-10-25, owner's plan); IT MARKS THE COPIES OLD.
 * Until then every save of a product, a picture or the site settings wrote a new content
 * version into the key, so every region's next visitor waited while the page was drawn again:
 * 25 Oct 08:00-18:40 UTC, 57 of the home page's 84 slow opens (over 600 ms) waited 2.2-4.6 s for
 * a drawing, after a deploy or after seven picture deletions at 17:42. In practice each region
 * keeps its own copy (sitemap that day: US data centres warm from 16:39, Marseille drew its own
 * at 18:11, Muscat at 18:26). Now each copy carries a tag (Cache-Tag, KEPT_TAGS) and a
 * stale-while-revalidate lifetime, and a save calls Workers Cache's invalidate() for the tags
 * (worker.mjs SitePages.invalidateKept, called from src/lib/contentVersion.ts): the copy is
 * marked stale, not deleted, so it is served while a new one is drawn. Cloudflare docs read
 * 2026-10-25: invalidate() added 2026-09-29, "keeps them but marks them stale"; asynchronous
 * stale-while-revalidate since 2026-02-26. ⚠️ NOT PROVEN BEFORE IT SHIPPED: the docs do not say
 * whether a visitor waits while an invalidated copy is revalidated, and a local preview keeps
 * nothing, so it was proven live after the merge.
 *
 * ⚠️ AND IT HAS AN OFF SWITCH. The KV value STORE_MODE_KEY = 'versioned' puts the content
 * version back in the key (the behaviour before 2026-10-25) within VERSION_CACHE_SECONDS, with
 * no deploy. Every save still writes a new content version, so the switch works either way.
 *
 * ⚠️ IT KEEPS ONLY WHAT IS THE SAME FOR EVERYONE. Never a request with a query string
 * (`?family=`, `?_rsc=`, an advert's `?utm_…`), an RSC or prefetch request, a Range, or a
 * visitor carrying a CMS login or a draft cookie. Only a 200 page under the public-page
 * policy, with no cookie of its own, that arrived whole and was drawn from the database
 * rather than from the fallbacks (spoilKeptRender). Pages do not differ between browsers
 * because HTML_LIMITED_BOTS is '.*' (htmlLimitedBots.mjs: every visitor gets the crawler's
 * page shape). src/pageCache.test.ts fails if that changes. And a page that will be kept is
 * drawn from a clean request carrying none of the visitor's headers (keptRenderRequest).
 *
 * Pure apart from AsyncLocalStorage, so vitest reaches every decision; worker.mjs applies them.
 */
import { AsyncLocalStorage } from 'node:async_hooks'
import { nonceable } from './cspNonce.mjs'

/** The only host whose pages are kept. The others redirect, or serve the admin. */
export const SITE_HOST = 'wear-run.com'

/** The KV key every CMS save rewrites (src/lib/contentVersion.ts). */
export const CONTENT_VERSION_KEY = 'content-version'

/** The KV key of the off switch: 'versioned' keys copies by the content version again. */
export const STORE_MODE_KEY = 'page-store-mode'
export const VERSIONED_MODE = 'versioned'

/** What a save marks stale: Workers Cache invalidates by these (Cache-Tag on each copy). */
export const KEPT_TAGS = Object.freeze({ pages: 'site-pages', garmentData: 'garment-data' })

/** KV's shortest edge-cache time for a read (Cloudflare KV docs: "minimum: 30"). */
export const VERSION_CACHE_SECONDS = 30

/**
 * How long one data centre may keep a copy. A save or a deploy makes a copy unreachable
 * sooner; this bounds only what neither can see, such as a database edit outside the CMS.
 */
export const PAGE_CACHE_SECONDS = 86_400

/**
 * How long a copy past its lifetime, or marked stale by a save, may still be served while a new
 * one is drawn in the background. A week: longer than any gap between visits on this site, so a
 * returning region gets an old page at once rather than a wait. The deploy in the key still
 * retires every copy at the next deploy.
 */
export const STALE_SECONDS = 604_800

/** The lifetime a kept copy carries for the store (never sent to a browser: servedHeaders). */
export const KEPT_CACHE_CONTROL = `public, max-age=${PAGE_CACHE_SECONDS}, stale-while-revalidate=${STALE_SECONDS}`

const NEVER_KEPT_PATHS = /^\/(?:admin|api|_next|cdn-cgi|film|\.well-known)(?:\/|$)/
const REQUEST_HEADERS_NEVER_KEPT = [
  'rsc',
  'next-router-prefetch',
  'next-router-state-tree',
  'next-action',
  'range',
]
const SIGNED_IN_OR_DRAFT = /(?:^|;\s*)(?:payload-token|__prerender_bypass)=/

/** May this request be answered from a kept copy, and its answer kept? */
export function keepablePageRequest(request) {
  if (request.method !== 'GET') return false
  const url = new URL(request.url)
  if (url.hostname !== SITE_HOST || url.search !== '') return false
  if (NEVER_KEPT_PATHS.test(url.pathname)) return false
  if (REQUEST_HEADERS_NEVER_KEPT.some((name) => request.headers.has(name))) return false
  return !SIGNED_IN_OR_DRAFT.test(request.headers.get('cookie') ?? '')
}

/**
 * ⚠️ A PAGE THAT WILL BE KEPT IS DRAWN FROM A CLEAN REQUEST (2026-10-04), so nothing one visitor
 * sends can shape the copy everyone then gets. The key holds the page, the deploy and the content,
 * so the drawing may depend on nothing else. Next.js 16.3.8 (30 Sep 2026) fixed four advisories
 * of one kind, a crafted request that makes a cache keep the wrong answer (GHSA-4jqv-mc3x-m676,
 * GHSA-mcj8-r9mp-w47p and two more). Probed the same day on the local edge preview with fifteen
 * crafted requests (`x-matched-path`, `x-invoke-query`, `next-url`, `x-forwarded-host` and more):
 * fourteen drew the same page as a plain visit, and `x-middleware-prefetch: 1` drew an empty 200
 * that only keepablePage's checks refused. A list of headers to refuse is always one name short, so the
 * drawing gets a fixed request instead: the same address, and only what every visitor's copy is
 * drawn with. The user agent is fixed because HTML_LIMITED_BOTS ('.*') gives every agent the
 * crawler's page shape (src/pageCache.test.ts pins both).
 *
 * ⚠️ AND THE HOST, because the site's forwards are matched against the Host header and a Request
 * made in code has none (2026-10-10: plain wear-run.com/factory answered 404 live while every
 * variant that skipped this request forwarded; OpenNext reads only the request's own headers).
 * It is the same for every visitor: keepablePageRequest keeps nothing on another host.
 */
export const KEPT_RENDER_HEADERS = Object.freeze({
  accept: 'text/html',
  host: SITE_HOST,
  'user-agent': 'RUN APPAREL page cache',
})

/**
 * The request a kept page is drawn from: the visitor's address and nothing else of theirs.
 * `cf` carries the shared store's key (sharedCacheKey) on the call into SitePages.
 */
export function keptRenderRequest(request, cf) {
  const init = { method: 'GET', headers: KEPT_RENDER_HEADERS }
  return new Request(request.url, cf ? { ...init, cf } : init)
}

/**
 * A HEAD asks for a page's headers. The store keeps GET answers only, so a HEAD was drawn in full
 * every time: 16 home-page HEADs on 25 Oct (the README's Shields.io badge and a Go client) at a
 * median 636 ms of processor time. It is looked up as the GET it describes, and worker.mjs sends
 * the headers without the body. Anything else is returned as it came.
 */
export function storeLookupRequest(request) {
  if (request.method !== 'HEAD') return request
  return new Request(request.url, { method: 'GET', headers: request.headers })
}

/**
 * The key for this request in the shared store: the deploy, and the content version only when
 * the off switch says 'versioned' (see the note at the top). A switch that cannot be read is
 * left as it was set: on, the new behaviour.
 *
 * @param {string} url
 * @param {string} deployVersion
 * @param {{ get: (key: string, options: { cacheTtl: number }) => Promise<string | null> }} kv
 */
export async function keptStoreKey(url, deployVersion, kv) {
  const [mode, content] = await Promise.all([
    kv.get(STORE_MODE_KEY, { cacheTtl: VERSION_CACHE_SECONDS }).catch(() => null),
    kv.get(CONTENT_VERSION_KEY, { cacheTtl: VERSION_CACHE_SECONDS }),
  ])
  const versioned = mode === VERSIONED_MODE
  return sharedCacheKey(url, deployVersion, versioned ? (content ?? 'none') : 'live')
}

/**
 * The key in the SHARED store (Workers Cache in front of worker.mjs's SitePages entrypoint,
 * 2026-10-24). It replaces the path and query in Workers Cache's own key, which already holds
 * the Worker version; the deploy is named here too so a copy can never cross deploys even if
 * cross-version caching were switched on (a page from the last build asks for script files
 * that no longer exist).
 *
 * ⚠️ IT NAMES THE HOST because Workers Cache leaves the host out of its key ("a request to
 * /api/users/42 hits the same cached entry whether it came in through api.example.com …",
 * developers.cloudflare.com/workers/cache/cache-keys, updated 12 Oct 2026), and this Worker
 * answers on five hostnames: the admin host's robots.txt must never be served on the site.
 */
export function sharedCacheKey(url, deployVersion, contentVersion) {
  const { hostname, pathname } = new URL(url)
  const deploy = encodeURIComponent(deployVersion)
  const content = encodeURIComponent(contentVersion)
  return `/__kept/${hostname}/${deploy}/${content}${pathname}`
}

/**
 * The generated text files kept like the pages (W1-A, 2026-10-24). Measured that week in Workers
 * logs: /sitemap.xml took a median 966 ms and 595 ms of processor time, redrawn on every request,
 * because only HTML was kept. Each file's check proves it arrived whole.
 * /.well-known/ai-catalog.json is NOT one of them: it is a deliberate 404
 * (apps/viewer/worker/notFound.ts), and nothing under /.well-known is kept.
 */
const WHOLE_FILE = Object.freeze({
  '/sitemap.xml': (text) => /<\/urlset>\s*$/.test(text) && text.includes('<loc>'),
  '/llms.txt': (text) => text.startsWith('# '),
  '/robots.txt': (text) => /^User-agent:/im.test(text) && /^Sitemap:/im.test(text),
})

export const KEPT_FILES = Object.freeze(Object.keys(WHOLE_FILE))

/** May this request for one of the generated files be answered from the shared store? */
export function keptFileRequest(request) {
  if (request.method !== 'GET') return false
  const url = new URL(request.url)
  if (url.hostname !== SITE_HOST || url.search !== '') return false
  if (!Object.hasOwn(WHOLE_FILE, url.pathname)) return false
  if (REQUEST_HEADERS_NEVER_KEPT.some((name) => request.headers.has(name))) return false
  return !SIGNED_IN_OR_DRAFT.test(request.headers.get('cookie') ?? '')
}

/** Did this generated file arrive whole? A cut-off sitemap must not be served for a day. */
export function wholeFile(pathname, text) {
  return Object.hasOwn(WHOLE_FILE, pathname) && WHOLE_FILE[pathname](text)
}

/** May this generated file's answer be kept? Same rules as a page, but text or XML. */
export function keepableFile(response) {
  if (response.status !== 200 || response.body === null) return false
  if (response.headers.has('set-cookie')) return false
  if ((response.headers.get('vary') ?? '').includes('*')) return false
  const encoding = (response.headers.get('content-encoding') ?? 'identity').toLowerCase()
  const type = response.headers.get('content-type') ?? ''
  return encoding === 'identity' && /^(?:text\/plain|application\/xml|text\/xml)\b/.test(type)
}

/**
 * Where a copy holds the answer's own Cache-Control while the store obeys the kept lifetime.
 * robots.txt asks browsers for 5 minutes and the sitemap for none; servedHeaders restores it.
 */
export const BROWSER_CACHE_CONTROL = 'x-run-browser-cache-control'

/**
 * SitePages's own verdict on each answer: `yes` (given the kept lifetime) or `no` (sent out
 * `no-store`). Without it a miss and a refusal look the same from outside, locally and in Workers
 * logs. servedHeaders removes it before the visitor sees the answer.
 */
export const KEPT_MARK = 'x-run-kept'

/**
 * When SitePages drew a kept copy (epoch ms). Cloudflare's docs do not say whether a loopback
 * answer carries `Cf-Cache-Status` (measured locally 2026-10-24: it carried neither that nor
 * `Age`), so the age of the drawing is what tells a stored copy from a fresh one. A fresh
 * drawing is read the moment it arrives; anything older than STORED_AFTER_MS came from the store.
 */
export const DRAWN_AT = 'x-run-drawn-at'
const STORED_AFTER_MS = 2_000

/**
 * Did the shared store answer this (`Cf-Cache-Status`, or an `Age` it added), did SitePages draw
 * it (`miss`), or did SitePages refuse to keep it (`skip`: not whole, drawn from fallbacks, not a
 * 200, or personal)?
 */
export function storeState(headers, now = Date.now()) {
  if (headers.get(KEPT_MARK) === 'no') return 'skip'
  const status = (headers.get('cf-cache-status') ?? '').toUpperCase()
  if (['HIT', 'STALE', 'UPDATING', 'REVALIDATED'].includes(status)) return 'hit'
  if (Number(headers.get('age') ?? '0') > 0) return 'hit'
  const drawnAt = Number(headers.get(DRAWN_AT))
  return drawnAt > 0 && now - drawnAt > STORED_AFTER_MS ? 'hit' : 'miss'
}

/** The cache key: the page, the deploy that drew it, and the content it was drawn from. */
export function pageCacheKey(url, deployVersion, contentVersion) {
  const { pathname } = new URL(url)
  const deploy = encodeURIComponent(deployVersion)
  const content = encodeURIComponent(contentVersion)
  return `https://${SITE_HOST}/__page-cache/${deploy}/${content}${pathname}`
}

/** May this answer be kept? Only an ordinary public page with nothing personal in it. */
export function keepablePage(response) {
  if (response.status !== 200 || response.body === null) return false
  if (response.headers.has('set-cookie')) return false
  if ((response.headers.get('vary') ?? '').includes('*')) return false
  const encoding = (response.headers.get('content-encoding') ?? 'identity').toLowerCase()
  return encoding === 'identity' && nonceable(response)
}

/** A page that stopped mid-stream must not be served for a day. Every page ends `</html>`. */
export function wholePage(html) {
  return /<\/html>\s*$/i.test(html)
}

/**
 * The headers kept with a copy: Next's own, with the store's lifetime and the tag a save marks
 * stale. No validator is kept, so the cache can never answer a visitor's conditional request with
 * a bare 304, and a revalidation after a save gets the whole new answer.
 *
 * @param {HeadersInit} headers
 * @param {number} [now]
 * @param {string} [tag] one of KEPT_TAGS
 */
export function keptHeaders(headers, now = Date.now(), tag = KEPT_TAGS.pages) {
  const out = new Headers(headers)
  const own = out.get('cache-control')
  if (own) out.set(BROWSER_CACHE_CONTROL, own)
  out.set('cache-control', KEPT_CACHE_CONTROL)
  out.set('cache-tag', tag)
  out.set(KEPT_MARK, 'yes')
  out.set(DRAWN_AT, String(now))
  for (const name of ['set-cookie', 'etag', 'last-modified', 'content-length']) out.delete(name)
  return out
}

/**
 * An answer the store must not keep (not whole, drawn from fallbacks, a redirect, an error):
 * `no-store` makes Workers Cache bypass it, and the answer's own rule rides along for the browser.
 */
export function unkeptHeaders(headers) {
  const out = new Headers(headers)
  const own = out.get('cache-control')
  out.delete(BROWSER_CACHE_CONTROL)
  if (own) out.set(BROWSER_CACHE_CONTROL, own)
  out.set('cache-control', 'no-store')
  out.set(KEPT_MARK, 'no')
  return out
}

/** A kept copy's headers, made a page's again: the cache's bookkeeping removed. */
export function servedHeaders(headers) {
  const out = new Headers(headers)
  const bookkeeping = ['age', 'expires', 'cf-cache-status', 'etag', 'last-modified', 'cache-tag']
  for (const name of [...bookkeeping, KEPT_MARK, DRAWN_AT]) out.delete(name)
  if (out.has(BROWSER_CACHE_CONTROL)) {
    out.set('cache-control', out.get(BROWSER_CACHE_CONTROL))
    out.delete(BROWSER_CACHE_CONTROL)
  } else if (out.get('cache-control') === KEPT_CACHE_CONTROL) {
    // The store's lifetime, never the browser's.
    out.delete('cache-control')
  }
  return out
}

/** For the browser's network panel: did this answer come from a kept copy? */
export function pageCacheTiming(state) {
  return `page-cache;desc="${state}"`
}

/**
 * "This render will be kept." worker.mjs draws a page it means to keep inside this store,
 * and src/lib/content.ts then reads the database instead of its 60-second memory. A copy
 * drawn from memory could carry the content from BEFORE a save, filed under the version
 * that names the save, for a whole day.
 *
 * ⚠️ IT LIVES ON globalThis because Next bundles its own copy of this module. Two
 * module-level stores would never see each other.
 */
export function keptRenders() {
  globalThis.__runKeptRenders ??= new AsyncLocalStorage()
  return globalThis.__runKeptRenders
}

/** True while drawing a page that worker.mjs means to keep. */
export function drawingToKeep() {
  return globalThis.__runKeptRenders?.getStore() !== undefined
}

/** The page fell back to defaults (the database was unhappy): never keep it. */
export function spoilKeptRender() {
  const render = globalThis.__runKeptRenders?.getStore()
  if (render) render.spoiled = true
}
