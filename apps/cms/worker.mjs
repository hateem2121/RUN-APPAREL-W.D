/**
 * The site's Worker entry: OpenNext's generated handler, wrapped by the script guard
 * (SE-04, decided 2026-09-18, live from the merge that deploys it), with the stored page
 * cache in front of it (polish X15, 2026-10-04).
 *
 * Every decision is in cspNonce.mjs and pageCache.mjs (pure, tested). This file only applies
 * them.
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
import openNext from './.open-next/worker.js'
import { newNonce, nonceable, noncedHeaders } from './cspNonce.mjs'
import { filmResponse, servesFilm } from './filmRange.mjs'
import {
  CONTENT_VERSION_KEY,
  keepablePage,
  keepablePageRequest,
  keptHeaders,
  keptRenders,
  pageCacheKey,
  pageCacheTiming,
  servedHeaders,
  VERSION_CACHE_SECONDS,
  wholePage,
} from './pageCache.mjs'
import { withRedirectHeaders } from './redirectHeaders.mjs'
import { forwardsToViewer } from './viewerForward.mjs'

export * from './.open-next/worker.js'

/**
 * The kept copy of this page (pageCache.mjs) as `{ key, hit }`, or `{ key }` when there is none
 * yet, or null when the request is not one to keep or the cache cannot be read.
 * ⚠️ EVERY FAILURE FALLS THROUGH TO DRAWING THE PAGE. The cache may make a page faster; it
 * must never be the reason a page fails.
 */
async function findKeptPage(request, env) {
  if (!keepablePageRequest(request)) return null
  const deploy = env.CF_VERSION_METADATA?.id
  if (!deploy || !env.SITE_CACHE) return null
  try {
    const content =
      (await env.SITE_CACHE.get(CONTENT_VERSION_KEY, { cacheTtl: VERSION_CACHE_SECONDS })) ?? 'none'
    const key = pageCacheKey(request.url, deploy, content)
    const copy = await caches.default.match(key)
    if (copy?.status !== 200 || copy.body === null) return { key }
    return {
      key,
      hit: new Response(copy.body, { status: 200, headers: servedHeaders(copy.headers) }),
    }
  } catch (error) {
    console.error('[page-cache] could not read the cache; drawing the page', error)
    return null
  }
}

/**
 * Keep a copy of a page while it streams to the visitor. It is stored only once it has
 * arrived whole, and only if its content came from the database rather than the fallbacks
 * (`render.spoiled`, set by src/lib/content.ts).
 */
function keepWhenWhole(response, key, render, ctx) {
  const [toVisitor, toKeep] = response.body.tee()
  const headers = keptHeaders(response.headers)
  ctx.waitUntil(
    new Response(toKeep)
      .text()
      .then((html) => {
        if (render.spoiled || !wholePage(html)) return
        return caches.default.put(key, new Response(html, { status: 200, headers }))
      })
      .catch((error) => console.error('[page-cache] could not keep the page', error)),
  )
  return new Response(toVisitor, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  })
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

    // The stored page cache (pageCache.mjs): answer from a kept copy, or draw the page and keep it.
    const kept = await findKeptPage(request, env)
    let response
    let cacheState = null
    if (kept?.hit) {
      response = kept.hit
      cacheState = 'hit'
    } else if (kept) {
      const render = { spoiled: false }
      response = await keptRenders().run(render, () => openNext.fetch(request, env, ctx))
      cacheState = 'miss'
      if (keepablePage(response)) response = keepWhenWhole(response, kept.key, render, ctx)
    } else {
      response = await openNext.fetch(request, env, ctx)
    }
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
