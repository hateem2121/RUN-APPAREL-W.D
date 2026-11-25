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
  keptStoreKeys,
  servedHeaders,
  storeState,
  unkeptHeaders,
} from './pageCache.mjs'
import {
  COPY_KEY_HEADER,
  copyBuckets,
  copyKey,
  copyOn,
  keepCopy,
  raceCopy,
  readFirstCopy,
} from './pageCopy.mjs'
import { HEDGE_COPY_WAIT_MS, HEDGE_HEAD_START_MS, hedgedAnswer, hedgeOn } from './storeHedge.mjs'
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

/** The website's own host, where a card touch asks for a garment to be warmed. */
const SITE_HOST = 'wear-run.com'
/**
 * A product slug, then a colour slug: packages/shared/src/slugs.ts's pattern (lowercase letters and
 * digits in runs joined by single hyphens), which src/viewerApiCache.test.ts holds this to. Review of
 * 27 Oct: the path took any characters, so a crafted address reached the store.
 */
const SLUG = '[a-z0-9]+(?:-[a-z0-9]+)*'
const WARM_PATH = new RegExp(`^/__warm/garment/(${SLUG})/(${SLUG})$`)

/**
 * The garment-data address a same-origin warm request names, or null (faster-taps plan, Task 5).
 * A website page may not call this host itself (its `connect-src` does not list it, and widening
 * it was refused before: src/lib/formSubmission.ts), so a touched card asks
 * `wear-run.com/__warm/garment/<product>/<colour>` and worker.mjs asks the store for this address.
 * The caller checks the method (GET).
 */
export function warmGarmentTarget(url) {
  if (url.hostname !== SITE_HOST || url.search !== '') return null
  const match = WARM_PATH.exec(url.pathname)
  return match ? new URL(`https://${API_HOST}/api/public/viewer/${match[1]}/${match[2]}`) : null
}

/**
 * worker.mjs's answer to a warm request: the garment's data is asked of the store and read to the
 * end (the store keeps an answer only once it is read in full, as scripts/warm-shared-store.mjs
 * found), then 204. Null for any other request. `serve` is serveViewerApi (a parameter for the
 * tests).
 *
 * It answers only once the data is read (review of 27 Oct: it answered 204 at once, so one client
 * could start any number of drawings without waiting for one). The visitor never waits on it:
 * GarmentWarm.tsx fires it with `keepalive` and reads nothing back. The work is also handed to
 * `waitUntil`, so a browser that drops the connection (the tap that opens the garment) does not cut
 * the store fill short. A failed warm-up is still 204.
 */
export async function answerWarmRequest(request, env, ctx, serve = serveViewerApi) {
  if (request.method !== 'GET') return null
  const target = warmGarmentTarget(new URL(request.url))
  if (!target) return null
  const drawn = (async () => {
    const answer = await serve(new Request(target, { method: 'GET' }), env, ctx)
    await answer?.arrayBuffer()
  })().catch((error) => console.error('[api-cache] could not warm a garment', error))
  ctx?.waitUntil?.(drawn)
  await drawn
  return new Response(null, { status: 204, headers: { 'cache-control': 'no-store' } })
}

/** May this request be answered from a kept copy, and its answer kept? */
export function keepableApiRequest(request) {
  if (request.method !== 'GET') return false
  const url = new URL(request.url)
  return url.hostname === API_HOST && url.search === '' && VIEWER_API_PATH.test(url.pathname)
}

/**
 * The request a copy is drawn from: the address and nothing of the visitor's (no Origin), plus
 * the name of this garment's shared copy when there is one to read or write.
 */
function apiRenderRequest(request, copyName) {
  const headers = copyName
    ? { ...API_RENDER_HEADERS, [COPY_KEY_HEADER]: copyName }
    : API_RENDER_HEADERS
  return new Request(request.url, { method: 'GET', headers })
}

/**
 * ⚠️ THE GARMENT DATA HAS A SHARED COPY TOO (21 Nov 2026, owner's yes). Until then only pages had
 * one (pageCopy.mjs), so a region whose store did not hold a garment's data had nothing to read
 * and SitePages drew it: 23 minutes after a deploy that changed the data's shape, three of thirty
 * US first visits took 2,171 to 2,344 ms (r-atw/turquoise and r-xmp/wine, each a drawing of 1.3 to
 * 1.4 s on a Worker that had just started).
 *
 * The copy's name holds the data's SHAPE and the CONTENT VERSION, as a page's holds the build and
 * the content version. That is what keeps it honest: the store's own key says `live` and relies
 * on a Cache-Tag purge after a CMS save, and R2 has no purge. A product save bumps the content
 * version (src/collections/Products.ts keptPagesAfterChange), so the next request asks for a name
 * no old copy has. A copy is believed only if it is still a whole, real garment
 * (keepableApiAnswer), exactly the test a drawing must pass to be kept.
 */
export function apiCopyName(url, contentVersion) {
  return copyKey(url, VIEWER_DATA_SHAPE, contentVersion)
}

/** One Workers Logs line per garment-data copy decision (state, ms, bucket: the repo is public). */
export function dataCopyLog(state, ms, from) {
  return { dataCopy: state, ms: Math.round(ms), ...(from ? { from } : {}) }
}

/**
 * This garment's data from its shared copy, marked as a kept answer, or null.
 *
 * @param {Request} request the render request, carrying the copy's name
 * @param {{ PAGE_COPIES?: any, PAGE_COPIES_ENAM?: any, PAGE_COPIES_EEUR?: any, PAGE_COPY?: string }} env
 * @param {number} [timeoutMs]
 * @returns {Promise<Response | null>}
 */
export async function answerFromApiCopy(request, env, timeoutMs = HEDGE_COPY_WAIT_MS) {
  const name = request.headers.get(COPY_KEY_HEADER)
  if (!copyOn(env) || !name) return null
  const askedAt = Date.now()
  const copy = await readFirstCopy(copyBuckets(env), name, timeoutMs)
  const whole = copy
    ? keepableApiAnswer(new Response(null, { status: 200, headers: copy.headers }), copy.text)
    : false
  console.log(
    dataCopyLog(whole ? 'hit' : copy ? 'refused' : 'miss', Date.now() - askedAt, copy?.from),
  )
  if (!copy || !whole) return null
  return new Response(copy.text, { status: 200, headers: keptApiHeaders(copy.headers) })
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
export async function keepApiAnswer(request, draw, copies) {
  const render = { spoiled: false }
  // The drawing starts at once and races one read of the shared copy, as a page's does
  // (worker.mjs SitePages, pageCopy.mjs raceCopy): a miss costs nothing, a found copy saves the
  // drawing. `copies` is { env, ctx }; without it (a test, a preview) the data is drawn as before.
  const drawing = keptRenders().run(render, () => draw(request))
  if (copies) {
    const copied = await raceCopy(answerFromApiCopy(request, copies.env), drawing, copies.ctx)
    if (copied) return copied
  }
  const response = await drawing
  const init = { status: response.status, statusText: response.statusText }
  if (response.status !== 200 || response.body === null) {
    return new Response(response.body, { ...init, headers: unkeptHeaders(response.headers) })
  }
  const text = await response.text()
  const keep = !render.spoiled && keepableApiAnswer(response, text)
  // Only an answer the store keeps is copied for the other regions (keepCopy needs the name).
  if (keep && copies) keepCopy(request, copies.env, copies.ctx, response.headers, text)
  const headers = keep ? keptApiHeaders(response.headers) : unkeptHeaders(response.headers)
  return new Response(text, { ...init, headers })
}

/**
 * What a kept garment-data copy is keyed by, in place of the deploy: a fingerprint of the code that
 * shapes the answer (the files and package versions listed in src/viewerApiCache.test.ts).
 *
 * ⚠️ WHY NOT THE DEPLOY (4 Nov 2026). Keyed by the deploy, every deploy emptied the store, and 26
 * runs reached main in the week to 4 Nov. The warm-up refills all 42 garments in the US but only
 * 10 in Pakistan, so the first QR scan of each other garment there waited for a fresh drawing:
 * Workers Logs that day, SitePages drawing r-au/bone in 2,629 ms (1,437 ms of processor time) and
 * a robot's garment page waiting 2-5 s. With `cross_version_cache` on (wrangler.jsonc) this key
 * alone decides, so a deploy that leaves these files alone leaves every region's copies warm; a CMS
 * save still marks them stale at once (Cache-Tag, contentVersion.ts). The test recomputes the
 * fingerprint and fails until it is updated, so a changed answer can never meet an old copy.
 */
export const VIEWER_DATA_SHAPE = 'shape-975bca44cd0f199d'

/**
 * For the network panel and a `curl -D -`: did this answer come from a kept copy, and where did
 * its time go? `kv` is the flag reads that name the key (0 while this isolate still holds them,
 * pageCache.mjs memoKvGet), `store` the call into Workers Cache in front of SitePages. Both are
 * milliseconds read around an `await`, the only place a Worker's clock moves: Cloudflare's
 * Performance API page (read 2026-11-19) says timers advance only after I/O.
 *
 * ⚠️ WHY (19 Nov 2026). An answer labelled `hit` took 0.8-1.8 s on 7 of 20 probes from US
 * locations, and Workers Logs showed Ahrefs' slow garment pages waiting 1-7 s in this call at
 * about 0 processor time, with no redraw behind about two thirds of them. The label alone could
 * not say whether the wait was the flag reads or the store.
 */
function apiCacheTiming(state, spans) {
  const ms = (value) => Math.round(value * 10) / 10
  return `api-cache;desc="${state}", kv;dur=${ms(spans.keyMs)}, store;dur=${ms(spans.storeMs)}`
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
  let keyMs = 0
  let storeMs = 0
  let state = null
  try {
    const startedAt = performance.now()
    // The deploy id above only says this is the deployed Worker; the key names the data's shape.
    const keys = await keptStoreKeys(request.url, VIEWER_DATA_SHAPE, env.SITE_CACHE)
    const cf = { cacheKey: keys.cacheKey }
    const keyedAt = performance.now()
    const copies = copyOn(env)
    const render = apiRenderRequest(
      request,
      copies ? apiCopyName(request.url, keys.contentVersion) : undefined,
    )
    // Never follow a redirect from the store (worker.mjs's call says why: #247, 2026-10-25).
    const askStore = () => store.fetch(render, { cf, redirect: 'manual' })
    if (copies && hedgeOn(env) && ctx?.waitUntil) {
      // A region that does not hold this garment's data: after the head start the copy is read
      // HERE too, so the answer does not wait for SitePages to start (storeHedge.mjs). No direct
      // drawing: the store's is the only one, and it is read to the end so the region keeps it.
      const answer = await hedgedAnswer({
        askStore,
        askCopy: () => answerFromApiCopy(render, env),
        headStartMs: HEDGE_HEAD_START_MS,
        waitUntil: (p) => ctx.waitUntil(p),
      })
      if (!answer) return null
      kept = answer.response
      if (answer.winner === 'copy') state = 'miss-copy'
    } else {
      kept = await askStore()
    }
    keyMs = keyedAt - startedAt
    storeMs = performance.now() - keyedAt
  } catch (error) {
    console.error('[api-cache] could not reach the shared store; answering as before', error)
    return null
  }
  const headers = servedApiHeaders(kept.headers, requestOrigin, allowed)
  headers.append(
    'server-timing',
    apiCacheTiming(state ?? storeState(kept.headers), { keyMs, storeMs }),
  )
  return new Response(kept.body, { status: kept.status, statusText: kept.statusText, headers })
}
