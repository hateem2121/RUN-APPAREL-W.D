/**
 * The site's Worker entry: OpenNext's generated handler, wrapped by the script guard
 * (SE-04, decided 2026-09-18, live from the merge that deploys it), with the shared page
 * store in front of it (Workers Cache on the SitePages entrypoint, 2026-10-24; it replaced
 * polish X15's per-data-centre cache of 2026-10-04) and the garment data kept in the Cache
 * API (viewerApiCache.mjs, 2026-10-07).
 *
 * Every decision is in cspNonce.mjs, pageCache.mjs and viewerApiCache.mjs (pure, tested), and
 * the order they are applied in is siteEdge.mjs (since 20 Nov 2026, so the front-door Worker,
 * door.mjs, applies the very same steps). This file gives it OpenNext to draw with.
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
import { filmResponse, servesFilm } from './filmRange.mjs'
import {
  KEPT_FILES,
  KEPT_TAGS,
  keepableFile,
  keepablePage,
  keptHeaders,
  keptRenders,
  unkeptHeaders,
  wholeFile,
  wholePage,
} from './pageCache.mjs'
import { answerFromCopy, keepCopy, raceCopy } from './pageCopy.mjs'
import { createSiteFetch } from './siteEdge.mjs'
import { keepableTapAnswer, keptTapHeaders } from './tapStore.mjs'
import { keepableApiRequest, keepApiAnswer } from './viewerApiCache.mjs'
import { reportToSentry } from './src/lib/sentry.ts'
import { runTemplateRetention } from './templateDownloadRetention.mjs'
import { workerVersionResponse } from './workerVersion.mjs'

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
    // The garment data on the admin host (viewerApiCache.mjs decides what is kept there).
    if (keepableApiRequest(request)) {
      return keepApiAnswer(request, (clean) => openNext.fetch(clean, this.env, this.ctx))
    }
    // A whole page this region does not hold yet: the drawing starts AT ONCE and races one R2
    // read (pageCopy.mjs raceCopy, 11 Nov 2026: asking first made every miss wait up to 400 ms).
    // Null for a tap, a kept file, no copy, R2 slow or down, or PAGE_COPY = "off": use the drawing.
    const render = { spoiled: false }
    const drawing = keptRenders().run(render, () => openNext.fetch(request, this.env, this.ctx))
    const copied = await raceCopy(answerFromCopy(request, this.env), drawing, this.ctx)
    if (copied) return copied
    const response = await drawing
    // Tap data (tapStore.mjs): only fromSharedStore sends an `rsc` request here, already checked.
    if (request.headers.get('rsc') === '1') {
      const init = { status: response.status, statusText: response.statusText }
      if (response.status !== 200 || response.body === null) {
        return new Response(response.body, { ...init, headers: unkeptHeaders(response.headers) })
      }
      const text = await response.text()
      const keep = !render.spoiled && keepableTapAnswer(response, text)
      const headers = keep ? keptTapHeaders(response.headers) : unkeptHeaders(response.headers)
      return new Response(text, { ...init, headers })
    }
    const { pathname } = new URL(request.url)
    const file = KEPT_FILES.includes(pathname)
    const init = { status: response.status, statusText: response.statusText }
    if (!(file ? keepableFile(response) : keepablePage(response))) {
      return new Response(response.body, { ...init, headers: unkeptHeaders(response.headers) })
    }
    const text = await response.text()
    const whole = !render.spoiled && (file ? wholeFile(pathname, text) : wholePage(text))
    // Only a whole page drawn from the database is copied for every region; keepCopy refuses files.
    if (whole && !file) keepCopy(request, this.env, this.ctx, response.headers, text)
    const headers = whole ? keptHeaders(response.headers) : unkeptHeaders(response.headers)
    return new Response(text, { ...init, headers })
  }

  /**
   * Mark every kept copy with these tags stale (2026-10-25): src/lib/contentVersion.ts calls this
   * after a CMS save, through `ctx.exports.SitePages`. It has to run HERE because Workers Cache
   * scopes purge and invalidate to the entrypoint that owns the copies; Cloudflare's own example
   * (Workers Cache, "Examples", leaderboard) does exactly this. An RPC method, so the call never
   * goes through the cache itself. Returns false where the runtime has no Workers Cache (a local
   * preview), and never throws: a save must never fail because the store could not be told.
   */
  async invalidateKept(tags = Object.values(KEPT_TAGS)) {
    const cache = this.ctx?.cache
    if (typeof cache?.invalidate !== 'function') return false
    try {
      await cache.invalidate({ tags: [...tags] })
      return true
    } catch (error) {
      console.error('[page-cache] could not mark the kept copies stale', error)
      return false
    }
  }
}

export default {
  /**
   * The daily clean-up of template download records (wrangler.jsonc `triggers`; the rules and the
   * reasons are in templateDownloadRetention.mjs). It never throws: a failure is reported to
   * Sentry through the same hand-rolled envelope as every other CMS error (src/lib/sentry.ts) and
   * logged by name only, and the Worker's other requests are unaffected.
   */
  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(
      runTemplateRetention(env, (error) =>
        reportToSentry({
          dsn: env.SENTRY_DSN,
          error,
          context: { routerKind: 'scheduled', routePath: 'template-retention', routeType: 'cron' },
          environment: 'production',
        }),
      ),
    )
  },

  /**
   * Every request: siteEdge.mjs answers it (the garment pages, the store, the nonce), exactly as
   * this file did until the front door (20 Nov 2026) needed the same steps. This Worker's own
   * early answers stay here, and it draws a page with OpenNext.
   */
  fetch: createSiteFetch({
    draw: (request, env, ctx) => openNext.fetch(request, env, ctx),
    store: (_env, ctx) => ctx?.exports?.SitePages,
    first(request, env) {
      const url = new URL(request.url)
      // Which version answered: the deploy's proof its pre-live checks reached the new version
      // (workerVersion.mjs, 2026-11-07). Before OpenNext and the page store, so nothing keeps it.
      const version = workerVersionResponse(url, env.CF_VERSION_METADATA)
      if (version) return version
      // The /products film, in the pieces iPhone Safari asks for: the static assets would send the
      // whole file to every range request (filmRange.mjs has the measurements). Only `/film/*` reaches
      // this line before the assets do (`run_worker_first` in wrangler.jsonc).
      if (servesFilm(url)) return filmResponse(request, env)
      return null
    },
  }),
}
