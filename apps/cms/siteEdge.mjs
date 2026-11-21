/**
 * What answers a visitor's request to the site, written once for the two Workers that can do it
 * (front door, 20 Nov 2026): the site's own Worker (worker.mjs), and the small front-door Worker
 * (door.mjs) that Cloudflare runs before it.
 *
 * WHY TWO. The site's Worker is 40.8 MiB, and a fresh copy of it takes 1.2 to 2.0 s to start
 * (Cloudflare `startupCpuTimeUsP99`, every hour of the 24 to 20 Nov 2026; every other Worker on
 * the account: 9 to 35 ms). A page the store already holds still waited for that start, because
 * the store was asked from inside the big Worker. Probes that day, after 5 quiet minutes: a kept
 * garment page took 966 ms in the US and 1,469 ms in Australia while its two handlers ran for 83
 * and 58 ms, and the host that skips the big Worker answered in 38 to 57 ms from the same probe in
 * the same minute. Cloudflare answers a kept copy over a service binding without running the
 * Worker that keeps it (Workers Cache, "Service bindings", read 20 Nov 2026), so a small Worker
 * can ask the store and the big one starts only when a page has to be drawn.
 *
 * Everything here was worker.mjs's own code until that day, moved word for word. The two things
 * that differ between the Workers are handed in as `edge`:
 *   - `draw(request, env, ctx)`: the page from Next. worker.mjs calls OpenNext; the door hands the
 *     request on to the site's Worker, whose answer already carries its nonce.
 *   - `store(env, ctx)`: the SitePages entrypoint behind Workers Cache. worker.mjs reaches it
 *     through `ctx.exports`; the door through its `SITE_PAGES` service binding.
 * `first(request, env, ctx)` is the Worker's own early answers (worker.mjs: its version and the
 * /products film; the door: what it must never touch).
 *
 * ⚠️ IT FAILS OPEN, as worker.mjs always has: every failure here falls back to `draw`.
 */
import { newNonce, nonceable, noncedHeaders } from './cspNonce.mjs'
import {
  keepablePageRequest,
  keptBuild,
  keptFileRequest,
  keptRenderRequest,
  keptStoreKeys,
  pageCacheTiming,
  servedHeaders,
  storeAnswerLog,
  storeLookupRequest,
  storeState,
} from './pageCache.mjs'
import { answerFromCopy, COPY_KEY_HEADER, copyKey } from './pageCopy.mjs'
import { withRedirectHeaders } from './redirectHeaders.mjs'
import {
  HEDGE_COPY_WAIT_MS,
  HEDGE_HEAD_START_MS,
  hedgeable,
  hedgedAnswer,
  hedgeOn,
} from './storeHedge.mjs'
import {
  keepableTapRequest,
  keptTapStoreKey,
  servedTapHeaders,
  tapDrawRequest,
  tapStoreOn,
} from './tapStore.mjs'
import { answerWarmRequest, serveViewerApi } from './viewerApiCache.mjs'
import { forwardsToViewer } from './viewerForward.mjs'

/**
 * @typedef {{
 *   draw: (request: Request, env: any, ctx: any) => Promise<Response>,
 *   store: (env: any, ctx: any) => { fetch: (request: Request, init?: any) => Promise<Response> } | undefined,
 *   dataStore?: (env: any, ctx: any) => { fetch: (request: Request, init?: any) => Promise<Response> } | undefined,
 *   first?: (request: Request, env: any, ctx: any) => Response | Promise<Response> | null | undefined,
 * }} SiteEdge
 */

/**
 * This request's answer from the shared store as `{ response, state }`, or null when the request
 * is not one to keep or the store cannot be reached (`next start`, a local preview without
 * ctx.exports, a missing binding).
 * ⚠️ EVERY FAILURE FALLS THROUGH TO DRAWING THE PAGE. The store may make a page faster; it must
 * never be the reason a page fails.
 *
 * @param {SiteEdge} edge
 */
export async function fromSharedStore(edge, request, env, ctx) {
  // Tap data first (faster-taps plan, Task 3): an `rsc` request is never a page or a kept file.
  if (await keepableTapRequest(request)) return fromTapStore(edge, request, env, ctx)
  // A HEAD is looked up as the GET it describes, and answered without the body (storeLookupRequest).
  const asked = storeLookupRequest(request)
  if (!keepablePageRequest(asked) && !keptFileRequest(asked)) return null
  // The website build, not the deploy (pageCache.mjs keptBuild, 4 Nov 2026): a deploy that left the
  // website alone leaves every region’s pages kept.
  const deploy = keptBuild(env)
  const store = edge.store(env, ctx)
  if (!deploy || !env.SITE_CACHE || !store) return null
  try {
    const { cacheKey, contentVersion, named } = await keptStoreKeys(
      request.url,
      deploy,
      env.SITE_CACHE,
      env.CF_VERSION_METADATA?.id,
    )
    // Drawn from a clean request: nothing this visitor sent may shape everyone's copy.
    const cf = { cacheKey }
    // The shared page copy's name (pageCopy.mjs, 10 Nov 2026): SitePages asks R2 for it before
    // drawing, so a region that does not hold the page yet is answered in one read.
    const clean = keptRenderRequest(request, cf)
    clean.headers.set(COPY_KEY_HEADER, copyKey(clean.url, named, contentVersion))
    // ⚠️ `redirect: 'manual'`, or a 308 from the store is FOLLOWED: this call has Fetch semantics
    // and follows a redirect out over the internet by default (Cloudflare, Workers RPC "Reserved
    // methods"). Live on 2026-10-25 (#247), /factory answered 200 with the factory page instead of
    // its 308. Manual hands the redirect back to withRedirectHeaders below, as before the store.
    const askedAt = Date.now()
    const askStore = () => store.fetch(clean, { cf, redirect: 'manual' })
    // A visitor's page the store does not hold is not left waiting on a cold SitePages
    // (storeHedge.mjs, 11 Nov 2026): after the head start the copy is read and the page drawn here.
    let kept
    if (hedgeable(request) && hedgeOn(env)) {
      const answer = await hedgedAnswer({
        askStore,
        askCopy: () => answerFromCopy(clean, env, HEDGE_COPY_WAIT_MS),
        drawDirect: () => edge.draw(request, env, ctx),
        headStartMs: HEDGE_HEAD_START_MS,
        waitUntil: (p) => ctx.waitUntil(p),
      })
      if (!answer) return null
      if (answer.winner === 'direct') {
        console.log(storeAnswerLog('page', 'miss-direct', Date.now() - askedAt))
        return { state: 'miss-direct', response: answer.response }
      }
      if (answer.winner === 'copy') {
        console.log(storeAnswerLog('page', 'miss-copy', Date.now() - askedAt))
        const copied = answer.response
        return {
          state: 'miss-copy',
          response: new Response(copied.body, {
            status: copied.status,
            statusText: copied.statusText,
            headers: servedHeaders(copied.headers),
          }),
        }
      }
      kept = answer.response
    } else {
      kept = await askStore()
    }
    console.log(storeAnswerLog('page', storeState(kept.headers), Date.now() - askedAt))
    if (request.method === 'HEAD') await kept.body?.cancel()
    return {
      state: storeState(kept.headers),
      response: new Response(request.method === 'HEAD' ? null : kept.body, {
        status: kept.status,
        statusText: kept.statusText,
        headers: servedHeaders(kept.headers),
      }),
    }
  } catch (error) {
    console.error('[page-cache] could not reach the shared store; drawing the page', error)
    return null
  }
}

/**
 * A tap's data from the shared store (tapStore.mjs): one copy per destination, drawn from a clean
 * request and keyed by the deploy. Null when the off switch (KV `rsc-store` = 'off') or a missing
 * binding says so, and on any failure: the tap is then drawn as it was before.
 *
 * @param {SiteEdge} edge
 */
async function fromTapStore(edge, request, env, ctx) {
  const deploy = keptBuild(env)
  const store = edge.store(env, ctx)
  if (!deploy || !env.SITE_CACHE || !store) return null
  try {
    if (!(await tapStoreOn(env.SITE_CACHE))) return null
    const draw = await tapDrawRequest(request)
    const deployId = env.CF_VERSION_METADATA?.id
    const cf = { cacheKey: await keptTapStoreKey(draw.url, deploy, env.SITE_CACHE, deployId) }
    // Never follow a redirect from the store: Next answers a wrong code with a 307 (#247's lesson).
    const askedAt = Date.now()
    const askStore = async () =>
      store.fetch(await tapDrawRequest(request, cf), { cf, redirect: 'manual' })
    // A visitor's tap the store does not hold: drawn here after the head start (storeHedge.mjs).
    let kept
    if (hedgeable(request) && hedgeOn(env)) {
      const answer = await hedgedAnswer({
        askStore,
        drawDirect: () => edge.draw(request, env, ctx),
        headStartMs: HEDGE_HEAD_START_MS,
        waitUntil: (p) => ctx.waitUntil(p),
      })
      if (!answer) return null
      if (answer.winner === 'direct') {
        console.log(storeAnswerLog('tap', 'miss-direct', Date.now() - askedAt))
        return { state: 'miss-direct', response: answer.response }
      }
      kept = answer.response
    } else {
      kept = await askStore()
    }
    console.log(storeAnswerLog('tap', storeState(kept.headers), Date.now() - askedAt))
    // SitePages never keeps a redirect, so one here came from this drawing alone. Handed on, a code
    // Next read differently in the drawing would bounce every tap to this page between two codes
    // (review, 27 Oct); the visitor's own request is drawn instead, as before the store.
    if (kept.status >= 300 && kept.status < 400) {
      await kept.body?.cancel()
      return null
    }
    return {
      state: storeState(kept.headers),
      response: new Response(kept.body, {
        status: kept.status,
        statusText: kept.statusText,
        headers: servedTapHeaders(kept.headers),
      }),
    }
  } catch (error) {
    console.error('[tap-store] could not reach the shared store; drawing the tap', error)
    return null
  }
}

/** Does this answer already say what the store did (a `page-cache` entry in Server-Timing)? */
export function saysStoreState(headers) {
  return /(?:^|,)\s*page-cache;/.test(headers.get('server-timing') ?? '')
}

/**
 * A page on its way out: a redirect gets its security headers, a public page gets this request's
 * nonce (and its doctype first), and everything else leaves as it came, saying whether the store
 * answered. `cacheState` is null when the store was not asked.
 *
 * A page that already carries a nonce is not a public-page policy any more, so `nonceable` says no
 * and it leaves untouched: that is how the front door hands on a page the site's Worker drew.
 */
export function sendPage(response, cacheState, env) {
  try {
    // ⚠️ ONE ANSWER ABOUT THE STORE PER PAGE (21 Nov 2026, the trial route `wear-run.com/guides*`).
    // A page the front door could not get from the store is drawn by handing the request on, and
    // the site's Worker answers it with its OWN `page-cache` timing. The door then added a second:
    // the live 404 under /guides carried `page-cache;desc="miss-direct"` twice, and the two can
    // disagree (the site's Worker may answer "hit" from its store to the door's "miss-direct").
    // The Worker that asked the store last is the one that knows, so its answer stands alone.
    if (cacheState === 'miss-direct' && saysStoreState(response.headers)) cacheState = null
    // The old addresses and www. answer redirects, which OpenNext sends bare
    // (redirectHeaders.mjs). A redirect is never a page, so the nonce guard has no work.
    if (response.status >= 300 && response.status < 400) return withRedirectHeaders(response)
    if (!nonceable(response)) {
      // Tap data and kept files are not HTML, so they need no nonce, but they still say whether
      // the store answered (the measure-taps script and the warm-up read it).
      if (!cacheState) return response
      const headers = new Headers(response.headers)
      headers.append('server-timing', pageCacheTiming(cacheState, keptBuild(env)))
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      })
    }
    const nonce = newNonce()
    const headers = noncedHeaders(response.headers, nonce)
    if (headers === null) {
      console.error(
        '[csp-nonce] the page arrived with a policy or encoding the guard does not know; serving the fallback',
      )
      return response
    }
    if (cacheState) headers.append('server-timing', pageCacheTiming(cacheState, keptBuild(env)))
    const init = { status: response.status, statusText: response.statusText, headers }
    if (response.body === null) return new Response(null, init)
    /*
     * ⚠️ THE DOCTYPE COMES FIRST, BECAUSE ON CLOUDFLARE NEXT CAN PUT A SCRIPT BEFORE IT
     * (2026-10-03, found by lighthouse-live after #116: best-practices/doctype failed on every
     * website page, and the live home page reported `document.compatMode` "BackCompat").
     * Next slips its legacy-browser script into the head by finding `</head>` in the FIRST
     * piece of the page it streams; when the head is longer than that piece it puts the script
     * before everything instead, a fallback written for partial prerendering
     * (`createHeadInsertionTransformStream`, next/dist/server/stream-utils/
     * node-web-streams-helper.js, 16.3.6). The head carries the whole stylesheet (RO-08, 74,525
     * bytes on the home page), and this runtime streams smaller pieces than `next start`, so
     * pages began `<script …></script><!DOCTYPE html>` and browsers drew them in quirks mode
     * (`next start`, the browser suites' server, never showed it; neither setting of
     * htmlLimitedBots changed it, measured in `opennextjs-cloudflare preview`).
     *
     * A doctype written ahead of the first element seen before the real one restores standards
     * mode and changes nothing else: the browser already parses that script into the head, and
     * a doctype met inside the head is ignored (HTML parsing, "in head": a DOCTYPE token is a
     * parse error and is dropped), so the page's tree is exactly what it was.
     * e2e/csp-nonce-edge.mjs checks standards mode on every page, in three engines.
     */
    let doctypeSeen = false
    let doctypeWritten = false
    // Every <script>: inline, external and JSON-LD. The nonce is harmless on the last two,
    // and it keeps working if 'strict-dynamic' is ever added.
    const rewritten = new HTMLRewriter()
      .onDocument({
        doctype() {
          doctypeSeen = true
        },
      })
      .on('script, link, meta, style', {
        element(element) {
          if (doctypeSeen || doctypeWritten) return
          element.before('<!DOCTYPE html>', { html: true })
          doctypeWritten = true
        },
      })
      .on('script', {
        element(element) {
          element.setAttribute('nonce', nonce)
        },
      })
      .transform(response)
    return new Response(rewritten.body, init)
  } catch (error) {
    console.error('[csp-nonce] failed; serving the fallback', error)
    return response
  }
}

/**
 * The Worker's `fetch`: garment pages to the viewer, the Worker's own early answers, the garment
 * data and a card's warm request from the store, then the page from the store or from `draw`.
 *
 * @param {SiteEdge} edge
 * @returns {(request: Request, env: any, ctx: any) => Promise<Response>}
 */
export function createSiteFetch(edge) {
  return async function siteFetch(request, env, ctx) {
    // Garment pages and the viewer's files go to the viewer Worker unchanged, BEFORE
    // OpenNext (viewerForward.mjs says which, and why). Its response carries its own CSP
    // from `_headers`, so the nonce guard below must never see it. Without the binding
    // (a local preview) the request falls through to Next and 404s, which is honest.
    if (env.VIEWER && forwardsToViewer(new URL(request.url))) return env.VIEWER.fetch(request)
    const early = await edge.first?.(request, env, ctx)
    if (early) return early

    // The garment data on cms.wear-run.help, kept like the pages (viewerApiCache.mjs, 2026-10-07:
    // 4.0–4.5 s uncached from Pakistan, ~10 database trips from local-ISB to ENAM). The viewer
    // Worker's `CMS` binding asks for the same address, so a robot's garment page gains too.
    // Its CORS headers are worked out per request there; null = not one to keep, serve as before.
    // The garment data's store is the CMS Worker's, whichever Worker runs this (`dataStore`,
    // 22 Nov 2026: the site-only Worker cannot draw it). An edge that names none uses its `store`.
    const store = edge.dataStore ? edge.dataStore(env, ctx) : edge.store(env, ctx)
    const garmentData = await serveViewerApi(request, env, ctx, store)
    if (garmentData) return garmentData
    // A touched garment card's warm request (faster-taps plan, Task 5): the store is asked and
    // read, then 204, so the garment page's own data request finds it drawn or drawing. The card
    // sends it with `keepalive` and never waits on it (viewerApiCache.mjs answerWarmRequest).
    const warmed = await answerWarmRequest(request, env, ctx, (asked, e, c) =>
      serveViewerApi(asked, e, c, store),
    )
    if (warmed) return warmed

    // The shared page store (SitePages): Cloudflare answers a kept copy, or SitePages draws.
    const kept = await fromSharedStore(edge, request, env, ctx)
    const response = kept ? kept.response : await edge.draw(request, env, ctx)
    return sendPage(response, kept ? kept.state : null, env)
  }
}
