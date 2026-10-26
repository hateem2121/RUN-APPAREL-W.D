/**
 * The garment data, kept (2026-10-07): `GET /api/public/viewer/<product>[/<colour>]` on the
 * admin host, answered from Cloudflare's cache the way pageCache.mjs answers the website's pages.
 * Since 2026-10-24 that is the shared store (Workers Cache in front of worker.mjs's SitePages,
 * one store for every data centre; it was the per-data-centre Cache API): 7 days to that date,
 * 51,030 answers had a median of 55 ms but 1 in 10 waited 677 ms or more. A copy lives a day
 * (pageCache.mjs PAGE_CACHE_SECONDS); a save or a deploy makes it unreachable sooner.
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
 * ⚠️ THE SAME KEY AND THE SAME SAVE RULE AS THE PAGES (pageCache.mjs keptStoreKey). The deploy is
 * in the key; since 2026-10-25 a save marks the copies stale (tag KEPT_TAGS.garmentData) instead of
 * changing the key, so a garment page is answered at once while the new copy is drawn, and the
 * same off switch puts the content version back in the key. Garment data, 25 Oct: p90 721 ms
 * against a 250 ms target, from the same per-region drawings as the pages.
 *
 * ⚠️ THE ANSWER'S CORS HEADERS ARE NEVER KEPT; THEY ARE WORKED OUT FOR EACH REQUEST. Payload
 * answers `Access-Control-Allow-Origin: <the visitor's Origin>` only to an origin on
 * VIEWER_ALLOWED_ORIGINS (wrangler.jsonc; payload.config.ts `cors`), and nothing to anyone else.
 * A kept copy carrying one visitor's header would be served to the next (the Cache API ignored
 * `Vary`; the shared store keys on none of the visitor's headers, because it is always asked with
 * the clean request): a browser on wear-run.com handed `viewer.wear-run.help`'s header refuses the answer,
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
  KEPT_TAGS,
  keptHeaders,
  keptRenders,
  keptStoreKey,
  servedHeaders,
  storeState,
  unkeptHeaders,
} from './pageCache.mjs'
import { PUBLIC_VIEWER_VARY } from './publicViewerHeaders.mjs'

/** The admin and API host: the only one whose answers this keeps. */
export const API_HOST = 'cms.wear-run.help'

/** `/api/public/viewer/<product>` and `/api/public/viewer/<product>/<colour>`, nothing deeper. */
const VIEWER_API_PATH = /^\/api\/public\/viewer\/[^/]+(?:\/[^/]+)?$/

/** Payload's fallback when the variable is missing (payload.config.ts, CMS_TRUSTED.viewer). */
const FALLBACK_ALLOWED_ORIGIN = 'https://wear-run.com'

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

/** The request a copy is drawn from: the address and nothing of the visitor's (no Origin). */
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

/**
 * The headers kept with a copy: the answer's own, minus anything per visitor, with the store's
 * lifetime (pageCache.mjs keptHeaders carries the answer's own Cache-Control alongside).
 */
export function keptApiHeaders(headers) {
  const out = new Headers(headers)
  for (const name of NEVER_KEPT_HEADERS) out.delete(name)
  return keptHeaders(out, Date.now(), KEPT_TAGS.garmentData)
}

/** A kept copy's headers, made an answer's again, for this request's Origin. */
export function servedApiHeaders(headers, requestOrigin, allowed) {
  return withViewerCors(servedHeaders(headers), requestOrigin, allowed)
}

/**
 * Draw a garment-data answer for the shared store and say whether it may be kept: SitePages calls
 * this for the API host (worker.mjs). Only a whole, real garment drawn from the database gets the
 * kept lifetime; anything else goes out `no-store`, and Workers Cache stores nothing.
 */
export async function keepApiAnswer(request, draw) {
  const render = { spoiled: false }
  const response = await keptRenders().run(render, () => draw(request))
  const init = { status: response.status, statusText: response.statusText }
  if (response.status !== 200 || response.body === null) {
    return new Response(response.body, { ...init, headers: unkeptHeaders(response.headers) })
  }
  const text = await response.text()
  const keep = !render.spoiled && keepableApiAnswer(response, text)
  const headers = keep ? keptApiHeaders(response.headers) : unkeptHeaders(response.headers)
  return new Response(text, { ...init, headers })
}

/** For the network panel and a `curl -D -`: did this answer come from a kept copy? */
function apiCacheTiming(state) {
  return `api-cache;desc="${state}"`
}

/**
 * Answer a garment-data request from the shared store (Workers Cache in front of SitePages,
 * 2026-10-24), which draws it through keepApiAnswer on a miss. Returns null when this request is
 * not one to keep or the store cannot be reached: worker.mjs then serves it as before.
 * `store` is the SitePages loopback binding (a parameter for the tests).
 */
export async function serveViewerApi(request, env, ctx, store = ctx?.exports?.SitePages) {
  if (!keepableApiRequest(request)) return null
  const deploy = env?.CF_VERSION_METADATA?.id
  if (!deploy || !env.SITE_CACHE || !store) return null
  const requestOrigin = request.headers.get('origin')
  const allowed = allowedOrigins(env)

  let kept
  try {
    const cf = { cacheKey: await keptStoreKey(request.url, deploy, env.SITE_CACHE) }
    // Never follow a redirect from the store (worker.mjs's call says why: #247, 2026-10-25).
    kept = await store.fetch(apiRenderRequest(request), { cf, redirect: 'manual' })
  } catch (error) {
    console.error('[api-cache] could not reach the shared store; answering as before', error)
    return null
  }
  const headers = servedApiHeaders(kept.headers, requestOrigin, allowed)
  headers.append('server-timing', apiCacheTiming(storeState(kept.headers)))
  return new Response(kept.body, { status: kept.status, statusText: kept.statusText, headers })
}
