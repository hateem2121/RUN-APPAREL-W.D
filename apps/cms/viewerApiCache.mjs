/**
 * The garment data, kept (2026-10-07): `GET /api/public/viewer/<product>[/<colour>]` on the
 * admin host, answered from Cloudflare's cache the way pageCache.mjs answers the website's pages.
 *
 * WHY. Measured 2026-10-07 from Pakistan: an uncached answer took 4.0–4.5 s. The CMS Worker runs
 * beside the visitor (every answer said `cf-placement: local-ISB`), the database is in ENAM about
 * 0.4 s away, and an answer made about ten trips there. A garment page cannot ask for its poster
 * or its model until this answers, and a search robot waits about 3 s on every garment page,
 * because the viewer Worker fetches the same answer over its `CMS` binding to write the page's
 * head. The 60-second memory in src/endpoints/viewerCache.ts almost never hits: it lives in one
 * copy of the Worker, and at a few visits a day the next visitor meets a fresh one. Fewer trips
 * (publicViewer.ts) shortens a miss; this removes the trips from every answer after the first in
 * each data centre.
 *
 * ⚠️ THE SAME TWO VERSIONS IN THE KEY AS THE PAGES. The deploy (CF_VERSION_METADATA) and the
 * content version every save of a product, a picture or the site settings rewrites in KV
 * (src/lib/contentVersion.ts). A save reaches every data centre within about a minute (KV's
 * 30-second read cache), as it does for the pages.
 *
 * ⚠️ THE ANSWER'S CORS HEADERS ARE NEVER KEPT; THEY ARE WORKED OUT FOR EACH REQUEST. Payload
 * answers `Access-Control-Allow-Origin: <the visitor's Origin>` only to an origin on
 * VIEWER_ALLOWED_ORIGINS (wrangler.jsonc; payload.config.ts `cors`), and nothing to anyone else.
 * The Cache API ignores `Vary`, so a kept copy carrying one visitor's header would be served to
 * the next: a browser on wear-run.com handed `viewer.wear-run.help`'s header refuses the answer,
 * and the garment page shows "REFERENCE UNAVAILABLE" (publicViewer.ts, the L1 incident of
 * 2026-08-18). So the copy is drawn from a CLEAN request carrying no Origin, kept with every
 * per-visitor header removed, and every answer this path sends gets `withViewerCors` for the
 * Origin of the request in hand, by Payload's own rule (exact match; credentials allowed).
 *
 * ⚠️ ONLY A WHOLE, REAL GARMENT IS KEPT. A 404, a 500, anything that is not JSON naming a
 * product and a colour, or an answer that went out without its "More from" list because the
 * list failed (spoilKeptRender, relatedGarments.ts), stays a bad request instead of becoming a
 * bad day. While it draws a copy to keep, publicViewer.ts reads the database, never its
 * 60-second memory, which could hold the content from before a save under the version that
 * names the save.
 *
 * ⚠️ NOTHING ELSE. Only this host, only GET, only these two path shapes, no query string. The
 * admin, every other `/api` path, the website's pages (pageCache.mjs) and the old hosts never
 * reach this file's cache. src/viewerApiCache.test.ts holds each of these.
 *
 * Every failure falls through to the Worker as it was before: the cache may make an answer
 * faster, it must never be the reason one fails.
 */
import {
  CONTENT_VERSION_KEY,
  keptRenders,
  servedHeaders,
  VERSION_CACHE_SECONDS,
} from './pageCache.mjs'
import { PUBLIC_VIEWER_VARY } from './publicViewerHeaders.mjs'

/** The admin and API host: the only one whose answers this keeps. */
export const API_HOST = 'cms.wear-run.help'

/** `/api/public/viewer/<product>` and `/api/public/viewer/<product>/<colour>`, nothing deeper. */
const VIEWER_API_PATH = /^\/api\/public\/viewer\/[^/]+(?:\/[^/]+)?$/

/**
 * How long one data centre may keep a copy: a day, as for the pages (PAGE_CACHE_SECONDS). A save
 * or a deploy makes a copy unreachable sooner; this bounds only a database edit outside the CMS.
 */
export const API_CACHE_SECONDS = 86_400

/** Payload's fallback when the variable is missing (payload.config.ts, CMS_TRUSTED.viewer). */
const FALLBACK_ALLOWED_ORIGIN = 'https://wear-run.com'

/** Where a kept copy holds the answer's own Cache-Control while the Cache API obeys its own. */
const ORIGINAL_CACHE_CONTROL = 'x-run-api-cache-control'

/** Never kept: they belong to one visitor or to the copy's bookkeeping. */
const NEVER_KEPT_HEADERS = [
  'access-control-allow-origin',
  'access-control-allow-credentials',
  'set-cookie',
  'etag',
  'last-modified',
  'content-length',
  'server-timing',
]

/** The request a kept copy is drawn from: the address, and nothing of the visitor's. */
export const API_RENDER_HEADERS = Object.freeze({
  accept: 'application/json',
  'user-agent': 'RUN APPAREL api cache',
})

/** May this request be answered from a kept copy, and its answer kept? */
export function keepableApiRequest(request) {
  if (request.method !== 'GET') return false
  const url = new URL(request.url)
  return url.hostname === API_HOST && url.search === '' && VIEWER_API_PATH.test(url.pathname)
}

/** The cache key: the address, the deploy that drew it, and the content it was drawn from. */
export function apiCacheKey(url, deployVersion, contentVersion) {
  const { pathname } = new URL(url)
  const deploy = encodeURIComponent(deployVersion)
  const content = encodeURIComponent(contentVersion)
  return `https://${API_HOST}/__api-cache/${deploy}/${content}${pathname}`
}

/** The request a copy is drawn from. */
function apiRenderRequest(request) {
  return new Request(request.url, { method: 'GET', headers: API_RENDER_HEADERS })
}

/** The origins Payload answers with CORS headers: wrangler.jsonc's VIEWER_ALLOWED_ORIGINS. */
export function allowedOrigins(env) {
  return (env?.VIEWER_ALLOWED_ORIGINS ?? FALLBACK_ALLOWED_ORIGIN)
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
}

/**
 * The answer's headers for THIS request: any CORS grant already on them removed, then granted
 * again only if this request's Origin is on the list, exactly as Payload's `headersWithCors`
 * does (payload 3.90.2: exact match; `Access-Control-Allow-Credentials: true` with it). `Vary`
 * always names Origin (publicViewerHeaders.mjs, PUBLIC_VIEWER_VARY).
 */
export function withViewerCors(headers, requestOrigin, allowed) {
  const out = new Headers(headers)
  out.delete('access-control-allow-origin')
  out.delete('access-control-allow-credentials')
  if (requestOrigin && allowed.includes(requestOrigin)) {
    out.set('access-control-allow-credentials', 'true')
    out.set('access-control-allow-origin', requestOrigin)
  }
  out.set('vary', PUBLIC_VIEWER_VARY)
  return out
}

/** Is this the whole answer for a real garment? Anything else is never kept. */
export function keepableApiAnswer(response, text) {
  if (response.status !== 200) return false
  if (response.headers.has('set-cookie')) return false
  if (!(response.headers.get('content-type') ?? '').includes('application/json')) return false
  const encoding = (response.headers.get('content-encoding') ?? 'identity').toLowerCase()
  if (encoding !== 'identity') return false
  try {
    const body = JSON.parse(text)
    return (
      !!body &&
      typeof body === 'object' &&
      !('error' in body) &&
      typeof body.product?.slug === 'string' &&
      typeof body.selectedColourway?.slug === 'string'
    )
  } catch {
    return false
  }
}

/** The headers kept with a copy: the answer's own, minus anything per visitor. */
export function keptApiHeaders(headers) {
  const out = new Headers(headers)
  for (const name of NEVER_KEPT_HEADERS) out.delete(name)
  const original = out.get('cache-control')
  if (original) out.set(ORIGINAL_CACHE_CONTROL, original)
  out.set('cache-control', `public, max-age=${API_CACHE_SECONDS}`)
  return out
}

/** A kept copy's headers, made an answer's again, for this request's Origin. */
export function servedApiHeaders(headers, requestOrigin, allowed) {
  const out = servedHeaders(headers)
  const original = out.get(ORIGINAL_CACHE_CONTROL)
  out.delete(ORIGINAL_CACHE_CONTROL)
  if (original) out.set('cache-control', original)
  else out.delete('cache-control')
  return withViewerCors(out, requestOrigin, allowed)
}

/** For the network panel and a `curl -D -`: did this answer come from a kept copy? */
function apiCacheTiming(state) {
  return `api-cache;desc="${state}"`
}

/**
 * Answer a garment-data request from a kept copy, or draw it and keep it. Returns null when this
 * request is not one to keep or the cache cannot be read: worker.mjs then serves it as before.
 * `draw` is OpenNext's handler; `cache` is `caches.default` (a parameter for the tests).
 */
export async function serveViewerApi(request, env, ctx, draw, cache = globalThis.caches?.default) {
  if (!keepableApiRequest(request)) return null
  const deploy = env?.CF_VERSION_METADATA?.id
  if (!deploy || !env.SITE_CACHE || !cache) return null
  const requestOrigin = request.headers.get('origin')
  const allowed = allowedOrigins(env)

  let key
  try {
    const content =
      (await env.SITE_CACHE.get(CONTENT_VERSION_KEY, { cacheTtl: VERSION_CACHE_SECONDS })) ?? 'none'
    key = apiCacheKey(request.url, deploy, content)
    const copy = await cache.match(key)
    if (copy?.status === 200 && copy.body !== null) {
      const headers = servedApiHeaders(copy.headers, requestOrigin, allowed)
      headers.append('server-timing', apiCacheTiming('hit'))
      return new Response(copy.body, { status: 200, headers })
    }
  } catch (error) {
    console.error('[api-cache] could not read the cache; answering as before', error)
    return null
  }

  const render = { spoiled: false }
  const response = await keptRenders().run(render, () => draw(apiRenderRequest(request)))
  const headers = withViewerCors(response.headers, requestOrigin, allowed)
  headers.append('server-timing', apiCacheTiming('miss'))
  const init = { status: response.status, statusText: response.statusText, headers }
  if (response.status !== 200 || response.body === null) return new Response(response.body, init)

  const text = await response.text()
  if (!render.spoiled && keepableApiAnswer(response, text)) {
    const kept = new Response(text, { status: 200, headers: keptApiHeaders(response.headers) })
    ctx.waitUntil(
      cache.put(key, kept).catch((error) => console.error('[api-cache] could not keep', error)),
    )
  }
  return new Response(text, init)
}
