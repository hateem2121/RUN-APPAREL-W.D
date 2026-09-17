/**
 * Private document links: catalogue./profile.wear-run.help/<code>, and the same two
 * documents on wear-run.com (decided 2026-09-17, live from the merge that deploys it;
 * documents.js explains which hosts and why).
 *
 * WHAT THIS WORKER IS FOR (2026-09-11). It used to serve two PDFs at guessable apex
 * paths — `wear-run.help/catalogue` and `/profile` — which anyone could type. Each
 * document now has its own hostname and opens only with words the owner chose, held as a
 * Worker secret: a page of pictures with a Download PDF button. The apex paths answer 410.
 *
 * ⚠️ HISTORY THAT STILL APPLIES. This Worker was hand-edited in the Cloudflare dashboard
 * on 2026-08-28 and drifted from the repository for two days; CI deploys it now, FIRST
 * (ci.yml). It answered Range requests with its own 206 until 2026-08-30, which made
 * every response uncacheable, because Cloudflare does not store a 206 from a Worker. It
 * returns a whole 200 and Workers Caching slices ranges at the edge.
 *
 * ⚠️ A CACHE HIT NEVER RUNS THIS CODE. Workers Caching keys on the path and the Worker
 * version, NOT the host (developers.cloudflare.com/workers/cache/cache-keys/, 2026-07-06).
 * That is safe only because every cacheable response lives under `/<code>/…`. Every miss —
 * a wrong code, `/`, the retired paths — is `no-store`, so it is always answered here and
 * never shared between the two hostnames. The page, a reading marker and the download stop
 * are `no-store` too (owner decision D32, 2026-09-15), so every open, page read and press
 * of Download reaches this code and can be counted. A picture or the PDF served from the
 * cache never is.
 *
 * ⚠️ THE R2 KEYS ARE SPELLED EXACTLY AS THE OBJECTS ARE NAMED, TYPO INCLUDED
 * (documents.js).
 */

import { codesMatch, normaliseCode } from './codes.js'
import { DOCUMENTS, RETIRED_HOSTS, RETIRED_PATH_NAMES, documentForHost } from './documents.js'
import { pictureKey, validateManifest } from './manifest.js'
import { contentSecurityPolicy, renderDocumentPage, renderMessagePage } from './page.js'
import { createVisitRecorder } from './visits.js'
import { runScheduled } from './weekly.js'

/**
 * The two PDF objects and their download names.
 *
 * EXPORTED for `scripts/backup-r2.mjs`, which derives the keys it backs up from here
 * instead of keeping a second copy (L17-14, 2026-08-31). Only `.key` is read; the
 * path-shaped property names are that script's historical shape.
 */
export const FILES = {
  '/catalogue': { key: DOCUMENTS.catalogue.pdfKey, name: DOCUMENTS.catalogue.downloadName },
  '/profile': { key: DOCUMENTS.profile.pdfKey, name: DOCUMENTS.profile.downloadName },
}

/**
 * Asserted as whole strings in apps/cms/src/apexWorker.test.ts.
 *
 * ⚠️ THE PAGE IS `no-store` ON PURPOSE (owner decision D32, 2026-09-15). It was
 * `public, max-age=300`, and a cache HIT never runs this code, so an open served from that
 * copy could not be counted. The page is HTML built from the manifest on each request; the
 * pictures and the PDF, which are the weight, keep their long cache.
 */
export const CACHE_CONTROL = Object.freeze({
  page: 'no-store',
  picture: 'public, max-age=31536000, immutable',
  download: 'public, max-age=3600',
  none: 'no-store',
})

/**
 * `VISITS` is optional on purpose. Without it nothing is recorded, and every response is
 * exactly what it was before visits: a test, a local run, or a rollback to a version with no
 * binding. The two email settings belong to the Monday summary email; a missing one never
 * stops a deploy.
 *
 * @typedef {{
 *   ASSETS: R2Bucket,
 *   CATALOGUE_CODE?: string,
 *   PROFILE_CODE?: string,
 *   VISITS?: D1Database,
 *   RESEND_API_KEY?: string,
 *   VISITS_EMAIL_TO?: string,
 * }} ApexEnv
 */

/** @param {string} cacheControl */
function baseHeaders(cacheControl) {
  return new Headers({
    'cache-control': cacheControl,
    'x-robots-tag': 'noindex, nofollow',
    'referrer-policy': 'no-referrer',
    'x-content-type-options': 'nosniff',
  })
}

/** @param {404 | 410} status */
async function messagePage(status) {
  const headers = baseHeaders(CACHE_CONTROL.none)
  headers.set('content-type', 'text/html; charset=utf-8')
  headers.set('content-security-policy', await contentSecurityPolicy())
  return new Response(renderMessagePage(), { status, headers })
}

/** A broken upload or a missing object: distinct from a refusal, and never cached. */
function unavailable() {
  const headers = baseHeaders(CACHE_CONTROL.none)
  headers.set('content-type', 'text/plain; charset=utf-8')
  return new Response('This document is temporarily unavailable.', { status: 503, headers })
}

/**
 * The answer to every reading marker (page.js): a 1×1 transparent GIF, 42 bytes. Decoded
 * once per isolate. The Fetch standard copies the bytes a Response is given, so this one
 * array serves every marker.
 */
const MARKER_GIF = Uint8Array.from(
  atob('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'),
  (character) => character.charCodeAt(0),
)

/**
 * This zone sends Speed Brain speculation rules. A speculative prefetch of the download
 * would pull 54 MB nobody asked for, so it is refused; the real click still works.
 *
 * @param {Request} request
 */
function isPrefetch(request) {
  const purpose = `${request.headers.get('sec-purpose') ?? ''} ${request.headers.get('purpose') ?? ''}`
  return /\bprefetch\b/i.test(purpose)
}

/**
 * HEAD gets the same status and headers with no body.
 *
 * @param {string} method
 * @param {Response} response
 */
function finish(method, response) {
  return method === 'HEAD'
    ? new Response(null, { status: response.status, headers: response.headers })
    : response
}

/**
 * Trim and lower-case a Worker secret for comparing it against the retired path names
 * and the other document's own secret. Never used against a request's candidate code —
 * that stays `codesMatch`'s job alone, unchanged (apps/cms/src/apexWorker.test.ts pins
 * its call site structurally).
 *
 * @param {string | undefined} secret
 * @returns {string | null}
 */
function normalisedSecret(secret) {
  if (typeof secret !== 'string') return null
  const trimmed = secret.trim().toLowerCase()
  return trimmed === '' ? null : trimmed
}

/**
 * @param {ApexEnv} env
 * @param {import('./documents.js').DocumentConfig} doc
 * @returns {Promise<import('./manifest.js').Manifest | null>}
 */
async function loadManifest(env, doc) {
  const object = await env.ASSETS.get(doc.manifestKey)
  if (!object) return null
  let value
  try {
    value = JSON.parse(await object.text())
  } catch {
    console.error(`[apex] ${doc.id} manifest is not JSON`)
    return null
  }
  const result = validateManifest(value, doc)
  if (!result.ok) {
    console.error(`[apex] ${doc.id} manifest rejected: ${result.reason}`)
    return null
  }
  return result.manifest
}

/**
 * `recordVisit` can be replaced, so a test can fix the clock and the salt.
 *
 * A visit is offered to it only for a GET, and only once the response is built. The
 * recorder hands its write to `ctx.waitUntil`, and does nothing at all without both
 * `env.VISITS` and `ctx` (visits.js). So a visitor never waits for the database, and a
 * failed write cannot change a response.
 *
 * @param {{
 *   timingSafeEqual?: import('./codes.js').TimingSafeEqual,
 *   recordVisit?: (
 *     env: ApexEnv,
 *     ctx: import('./visits.js').WaitUntil | undefined,
 *     visit: import('./visits.js').Visit,
 *   ) => void,
 * }} [options]
 * @returns {(
 *   request: Request,
 *   env: ApexEnv,
 *   ctx?: import('./visits.js').WaitUntil,
 * ) => Promise<Response>}
 */
export function createHandler({ timingSafeEqual, recordVisit = createVisitRecorder() } = {}) {
  return async function handle(request, env, ctx) {
    const url = new URL(request.url)
    const method = request.method
    const host = url.hostname.toLowerCase()

    // The retired addresses reach this Worker only through their /catalogue* and
    // /profile* routes (wrangler.jsonc), and all of it is gone: no R2 read, any path.
    // Someone still following an old link is worth knowing about, so a GET is offered to
    // the recorder as that document's old-link try; visits.js keeps it only for a person.
    if (RETIRED_HOSTS.includes(host)) {
      const response = finish(method, await messagePage(410))
      const path = url.pathname.toLowerCase()
      const retired = RETIRED_PATH_NAMES.find((name) => path.startsWith(`/${name}`))
      if (method === 'GET' && retired) {
        recordVisit(env, ctx, { event: 'old-link', document: retired, request })
      }
      return response
    }

    const doc = documentForHost(host)
    if (!doc) {
      const headers = baseHeaders(CACHE_CONTROL.none)
      headers.set('content-type', 'text/plain; charset=utf-8')
      return finish(method, new Response('Not found.', { status: 404, headers }))
    }

    // ⚠️ THE WORD RULE (review Important 1, owner decision D18, 2026-09-15). Workers
    // Caching keys on path, not host (file header above), and the four retired routes
    // in wrangler.jsonc match any suffix — so a code shaped like a retired path name, or
    // shared between the two documents, could be served from a cache entry the retired
    // route still matches, or from the other document's host. Checked against the
    // deployed secret itself, never the request, so a correctly-typed code is still
    // refused when the SECRET is the misconfigured one — and it costs no R2 read either
    // way. documents.js explains why these particular words. Never logs a secret's value.
    // The prefix check runs whenever this document HAS a secret, whether or not there
    // is another document to compare against — only the equals-check needs `other`.
    // Before this change both checks sat behind `&& other`, which cannot go dark today
    // (DOCUMENTS always holds two), but would have if it ever held one (re-review, New
    // Breakage, 2026-09-15).
    const other = Object.values(DOCUMENTS).find((candidate) => candidate.id !== doc.id)
    const ownSecret = normalisedSecret(env[doc.secret])
    if (ownSecret !== null) {
      const badPrefix = RETIRED_PATH_NAMES.find((name) => ownSecret.startsWith(name))
      const otherSecret = other ? normalisedSecret(env[other.secret]) : null
      const reason = badPrefix
        ? `starts with the retired path "${badPrefix}"`
        : other && otherSecret !== null && ownSecret === otherSecret
          ? `equals ${other.id}'s code`
          : null
      if (reason) {
        console.error(`[apex] ${doc.id}'s code ${reason} and cannot be served`)
        return finish(method, await messagePage(404))
      }
    }

    // Decided before anything touches R2. A wrong, missing or malformed code — or the
    // other document's — costs one constant-time comparison and nothing else.
    const [first = '', ...rest] = url.pathname.slice(1).split('/')
    const code = normaliseCode(first)
    if (code === null || !codesMatch(code, env[doc.secret], timingSafeEqual)) {
      return finish(method, await messagePage(404))
    }

    const isPage = rest.length === 0 || (rest.length === 1 && rest[0] === '')
    const isDownload = rest.length === 1 && rest[0] === 'download'
    const isPicture = rest.length === 3 && rest[0] === 'p'
    // Page numbers 1 to 999, the manifest's own limit (manifest.js, MAX_PAGES). Any other
    // `seen/…` shape is the not-active page, like every unknown path.
    const isMarker = rest.length === 2 && rest[0] === 'seen' && /^[1-9][0-9]{0,2}$/.test(rest[1])
    const isStop = rest.length === 1 && rest[0] === 'get'
    if (!isPage && !isDownload && !isPicture && !isMarker && !isStop) {
      return finish(method, await messagePage(404))
    }

    if (method !== 'GET' && method !== 'HEAD') {
      const headers = baseHeaders(CACHE_CONTROL.none)
      headers.set('allow', 'GET, HEAD')
      return new Response(null, { status: 405, headers })
    }

    // A READING MARKER (page.js). Answered without reading R2, and never cached, so every
    // reader's lazy load reaches this code. `same-origin`, like the pictures.
    if (isMarker) {
      const headers = baseHeaders(CACHE_CONTROL.none)
      headers.set('content-type', 'image/gif')
      headers.set('cross-origin-resource-policy', 'same-origin')
      const response = finish(method, new Response(MARKER_GIF, { status: 200, headers }))
      if (method === 'GET') {
        const page = Number(rest[1])
        recordVisit(env, ctx, { event: 'marker', document: doc.id, request, page })
      }
      return response
    }

    // THE DOWNLOAD STOP. The Download button points here, not at /download: the PDF is cached
    // for an hour, and a HIT never runs this code, so the press is counted here and the
    // browser is sent on. The location is RELATIVE (a browser resolves `download` against
    // /<code>/get), so no response header ever carries the code. A prefetch is refused
    // exactly as the download refuses one, and is not a press.
    if (isStop) {
      if (isPrefetch(request)) {
        return new Response(null, { status: 503, headers: baseHeaders(CACHE_CONTROL.none) })
      }
      const headers = baseHeaders(CACHE_CONTROL.none)
      headers.set('location', 'download')
      const response = finish(method, new Response(null, { status: 302, headers }))
      if (method === 'GET') {
        recordVisit(env, ctx, { event: 'download', document: doc.id, request })
      }
      return response
    }

    if (isDownload) {
      if (isPrefetch(request)) {
        return new Response(null, { status: 503, headers: baseHeaders(CACHE_CONTROL.none) })
      }
      // A whole 200, never this Worker's own partial response, and never the request's
      // Range passed to R2: Workers Caching stores the whole body and slices at the edge.
      const object = await env.ASSETS.get(doc.pdfKey)
      if (!object) return finish(method, unavailable())
      const headers = baseHeaders(CACHE_CONTROL.download)
      headers.set('content-type', 'application/pdf')
      headers.set('content-disposition', `attachment; filename="${doc.downloadName}"`)
      headers.set('etag', object.httpEtag)
      headers.set('accept-ranges', 'bytes')
      return finish(method, new Response(object.body, { status: 200, headers }))
    }

    const manifest = await loadManifest(env, doc)
    if (!manifest) return finish(method, unavailable())

    if (isPage) {
      const headers = baseHeaders(CACHE_CONTROL.page)
      headers.set('content-type', 'text/html; charset=utf-8')
      headers.set('content-security-policy', await contentSecurityPolicy())
      const html = renderDocumentPage({ doc, manifest, code })
      const response = finish(method, new Response(html, { status: 200, headers }))
      if (method === 'GET') {
        const pagesTotal = manifest.pages.length
        recordVisit(env, ctx, { event: 'open', document: doc.id, request, pagesTotal })
      }
      return response
    }

    const key = pictureKey(manifest, rest[1], rest[2])
    if (key === null) return finish(method, await messagePage(404))
    const object = await env.ASSETS.get(key)
    if (!object) return finish(method, unavailable())
    const headers = baseHeaders(CACHE_CONTROL.picture)
    headers.set('content-type', 'image/webp')
    headers.set('etag', object.httpEtag)
    headers.set('cross-origin-resource-policy', 'same-origin')
    return finish(method, new Response(object.body, { status: 200, headers }))
  }
}

export const handle = createHandler()

export default {
  /**
   * @param {Request} request
   * @param {ApexEnv} env
   * @param {ExecutionContext} ctx
   */
  fetch: (request, env, ctx) => handle(request, env, ctx),
  /**
   * The two cron triggers in wrangler.jsonc. runScheduled never throws, so a failed job is a
   * `failed` week in the database or one log line naming the error, never an exception.
   *
   * @param {ScheduledController} controller
   * @param {ApexEnv} env
   * @param {ExecutionContext} ctx
   */
  scheduled: (controller, env, ctx) => ctx.waitUntil(runScheduled(controller.cron, env)),
}
