/**
 * The site's Worker entry: OpenNext's generated handler, wrapped by the script guard
 * (SE-04, decided 2026-09-18, live from the merge that deploys it), with the shared page
 * store in front of it (Workers Cache on the SitePages entrypoint, 2026-10-24; it replaced
 * polish X15's per-data-centre cache of 2026-10-04) and the garment data kept in the Cache
 * API (viewerApiCache.mjs, 2026-10-07).
 *
 * Every decision is in cspNonce.mjs, pageCache.mjs and viewerApiCache.mjs (pure, tested). This
 * file only applies them.
 *
 * ⚠️ IT FAILS OPEN — UNTIL THE BODY STARTS STREAMING. Any exception while deciding, or a policy
 * or encoding it does not recognise, returns OpenNext's response unchanged. Every page then keeps
 * working under PUBLIC_PAGE_CSP, which still carries 'unsafe-inline'. That state is loud, not
 * silent: scripts/public-security-probe.mjs fails after every deploy and daily when a public
 * page's script-src still allows 'unsafe-inline', and the `[csp-nonce]` lines reach Workers logs.
 * An error once HTMLRewriter is streaming CANNOT fall back: the status and headers have already
 * gone, so the page would arrive cut off. The probe fails that too: every page must end in
 * `</html>` (independent review, 2026-09-22).
 *
 * ⚠️ `next start` NEVER RUNS THIS FILE, so the CMS e2e suite tests the fallback, not the
 * guard. Prove the guard with e2e/csp-nonce-edge.mjs against `opennextjs-cloudflare preview`
 * (apps/cms/CLAUDE.md, "Browser tests for the public site").
 *
 * ⚠️ `export *` IS DELIBERATE. OpenNext exports Durable Object classes (DOQueueHandler,
 * DOShardedTagCache and BucketCachePurge on 1.20.2), and an explicit list would silently
 * drop one a later OpenNext adds. `export *` never re-exports `default`, which this file
 * replaces.
 */
import { WorkerEntrypoint } from 'cloudflare:workers'
import openNext from './.open-next/worker.js'
import { newNonce, nonceable, noncedHeaders } from './cspNonce.mjs'
import { filmResponse, servesFilm } from './filmRange.mjs'
import {
  CONTENT_VERSION_KEY,
  KEPT_FILES,
  keepableFile,
  keepablePage,
  keepablePageRequest,
  keptFileRequest,
  keptHeaders,
  keptRenderRequest,
  keptRenders,
  pageCacheTiming,
  servedHeaders,
  sharedCacheKey,
  storeState,
  unkeptHeaders,
  VERSION_CACHE_SECONDS,
  wholeFile,
  wholePage,
} from './pageCache.mjs'
import { withRedirectHeaders } from './redirectHeaders.mjs'
import { serveViewerApi } from './viewerApiCache.mjs'
import { forwardsToViewer } from './viewerForward.mjs'

export * from './.open-next/worker.js'

/**
 * THE SHARED PAGE STORE (W1-A, 2026-10-24). Cloudflare's Workers Cache sits in front of this
 * entrypoint only (wrangler.jsonc `exports`): a hit is answered from a two-tier cache shared by
 * every data centre without running it, and simultaneous misses are collapsed into one drawing.
 * It replaced the per-data-centre Cache API, which made the first visitor in each data centre
 * wait after every deploy (home page opens, 7 days to 2026-10-24: p75 799 ms, p90 2,338 ms).
 *
 * It draws from the CLEAN request the default entrypoint hands it (keptRenderRequest) and decides
 * whether Cloudflare may keep the answer: only a whole page or file drawn from the database, with
 * nothing personal in it, gets the kept lifetime; anything else goes out `no-store` and is never
 * stored. It never stamps a nonce: the default entrypoint does that on every answer, hit or miss.
 */
export class SitePages extends WorkerEntrypoint {
  async fetch(request) {
    const render = { spoiled: false }
    const response = await keptRenders().run(render, () =>
      openNext.fetch(request, this.env, this.ctx),
    )
    const { pathname } = new URL(request.url)
    const file = KEPT_FILES.includes(pathname)
    const init = { status: response.status, statusText: response.statusText }
    if (!(file ? keepableFile(response) : keepablePage(response))) {
      return new Response(response.body, { ...init, headers: unkeptHeaders(response.headers) })
    }
    const text = await response.text()
    const whole = !render.spoiled && (file ? wholeFile(pathname, text) : wholePage(text))
    const headers = whole ? keptHeaders(response.headers) : unkeptHeaders(response.headers)
    return new Response(text, { ...init, headers })
  }
}

/**
 * This request's answer from the shared store as `{ response, state }`, or null when the request
 * is not one to keep or the store cannot be reached (`next start`, a local preview without
 * ctx.exports, a missing binding).
 * ⚠️ EVERY FAILURE FALLS THROUGH TO DRAWING THE PAGE. The store may make a page faster; it must
 * never be the reason a page fails.
 */
async function fromSharedStore(request, env, ctx) {
  if (!keepablePageRequest(request) && !keptFileRequest(request)) return null
  const deploy = env.CF_VERSION_METADATA?.id
  const store = ctx?.exports?.SitePages
  if (!deploy || !env.SITE_CACHE || !store) return null
  try {
    const content =
      (await env.SITE_CACHE.get(CONTENT_VERSION_KEY, { cacheTtl: VERSION_CACHE_SECONDS })) ?? 'none'
    const cacheKey = sharedCacheKey(request.url, deploy, content)
    // Drawn from a clean request: nothing this visitor sent may shape everyone's copy.
    const kept = await store.fetch(keptRenderRequest(request, { cacheKey }))
    return {
      state: storeState(kept.headers),
      response: new Response(kept.body, {
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

export default {
  async fetch(request, env, ctx) {
    // Garment pages and the viewer's files go to the viewer Worker unchanged, BEFORE
    // OpenNext (viewerForward.mjs says which, and why). Its response carries its own CSP
    // from `_headers`, so the nonce guard below must never see it. Without the binding
    // (a local preview) the request falls through to Next and 404s, which is honest.
    if (env.VIEWER && forwardsToViewer(new URL(request.url))) return env.VIEWER.fetch(request)
    // The /products film, in the pieces iPhone Safari asks for: the static assets would send the
    // whole file to every range request (filmRange.mjs has the measurements). Only `/film/*` reaches
    // this line before the assets do (`run_worker_first` in wrangler.jsonc).
    if (servesFilm(new URL(request.url))) return filmResponse(request, env)

    // The garment data on cms.wear-run.help, kept like the pages (viewerApiCache.mjs, 2026-10-07:
    // 4.0–4.5 s uncached from Pakistan, ~10 database trips from local-ISB to ENAM). The viewer
    // Worker's `CMS` binding asks for the same address, so a robot's garment page gains too.
    // Its CORS headers are worked out per request there; null = not one to keep, serve as before.
    const garmentData = await serveViewerApi(request, env, ctx, (clean) =>
      openNext.fetch(clean, env, ctx),
    )
    if (garmentData) return garmentData

    // The shared page store (SitePages above): Cloudflare answers a kept copy, or SitePages draws.
    const kept = await fromSharedStore(request, env, ctx)
    const response = kept ? kept.response : await openNext.fetch(request, env, ctx)
    const cacheState = kept ? kept.state : null
    try {
      // The old addresses and www. answer redirects, which OpenNext sends bare
      // (redirectHeaders.mjs). A redirect is never a page, so the nonce guard has no work.
      if (response.status >= 300 && response.status < 400) return withRedirectHeaders(response)
      if (!nonceable(response)) return response
      const nonce = newNonce()
      const headers = noncedHeaders(response.headers, nonce)
      if (headers === null) {
        console.error(
          '[csp-nonce] the page arrived with a policy or encoding the guard does not know; serving the fallback',
        )
        return response
      }
      if (cacheState) headers.append('server-timing', pageCacheTiming(cacheState))
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
  },
}
