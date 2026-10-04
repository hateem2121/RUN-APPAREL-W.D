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
 * WHAT. worker.mjs keeps each finished public page in Cloudflare's cache (the Cache API: one
 * store per data centre) and answers the next visitor from that copy. A copy answered this
 * way never loads Next or the CMS, because OpenNext imports its server only when a request
 * needs it (`await import(".../handler.mjs")` in .open-next/worker.js).
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
 * ⚠️ TWO VERSIONS IN EVERY KEY, so an old copy becomes unreachable instead of being deleted:
 * - The Worker's version (the CF_VERSION_METADATA binding). A deploy renames every script
 *   file, so a page from the last build would ask for files that no longer exist.
 * - The content version (KV binding SITE_CACHE, key CONTENT_VERSION_KEY). Every save of a
 *   product, a picture or the site settings writes a new one (src/lib/contentVersion.ts).
 *   Other data centres read it through KV's own cache of VERSION_CACHE_SECONDS, so a save
 *   reaches every page within about a minute, as the memory cache already allowed.
 *
 * ⚠️ IT KEEPS ONLY WHAT IS THE SAME FOR EVERYONE. Never a request with a query string
 * (`?family=`, `?_rsc=`, an advert's `?utm_…`), an RSC or prefetch request, a Range, or a
 * visitor carrying a CMS login or a draft cookie. Only a 200 page under the public-page
 * policy, with no cookie of its own, that arrived whole and was drawn from the database
 * rather than from the fallbacks (spoilKeptRender). Pages do not differ between browsers
 * because HTML_LIMITED_BOTS is '.*' (htmlLimitedBots.mjs: every visitor gets the crawler's
 * page shape). src/pageCache.test.ts fails if that changes.
 *
 * Pure apart from AsyncLocalStorage, so vitest reaches every decision; worker.mjs applies them.
 */
import { AsyncLocalStorage } from 'node:async_hooks'
import { nonceable } from './cspNonce.mjs'

/** The only host whose pages are kept. The others redirect, or serve the admin. */
export const SITE_HOST = 'wear-run.com'

/** The KV key every CMS save rewrites (src/lib/contentVersion.ts). */
export const CONTENT_VERSION_KEY = 'content-version'

/** KV's shortest edge-cache time for a read (Cloudflare KV docs: "minimum: 30"). */
export const VERSION_CACHE_SECONDS = 30

/**
 * How long one data centre may keep a copy. A save or a deploy makes a copy unreachable
 * sooner; this bounds only what neither can see, such as a database edit outside the CMS.
 */
export const PAGE_CACHE_SECONDS = 86_400

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
 * The headers kept with a copy: Next's own, with a lifetime the Cache API obeys. No validator
 * is kept, so the cache can never answer a visitor's conditional request with a bare 304.
 */
export function keptHeaders(headers) {
  const out = new Headers(headers)
  out.set('cache-control', `public, max-age=${PAGE_CACHE_SECONDS}`)
  for (const name of ['set-cookie', 'etag', 'last-modified', 'content-length']) out.delete(name)
  return out
}

/** A kept copy's headers, made a page's again: the cache's bookkeeping removed. */
export function servedHeaders(headers) {
  const out = new Headers(headers)
  for (const name of ['age', 'expires', 'cf-cache-status', 'etag', 'last-modified']) {
    out.delete(name)
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
