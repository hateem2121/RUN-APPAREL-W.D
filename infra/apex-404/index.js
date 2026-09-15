/**
 * Private document links: catalogue.wear-run.help/<code> and profile.wear-run.help/<code>.
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
 * never shared between the two hostnames.
 *
 * ⚠️ THE R2 KEYS ARE SPELLED EXACTLY AS THE OBJECTS ARE NAMED, TYPO INCLUDED
 * (documents.js).
 */

import { codesMatch, normaliseCode } from './codes.js'
import { DOCUMENTS, RETIRED_HOSTS, RETIRED_PATH_NAMES, documentForHost } from './documents.js'
import { pictureKey, validateManifest } from './manifest.js'
import { contentSecurityPolicy, renderDocumentPage, renderMessagePage } from './page.js'

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

/** Asserted as whole strings in apps/cms/src/apexWorker.test.ts. */
export const CACHE_CONTROL = Object.freeze({
  page: 'public, max-age=300',
  picture: 'public, max-age=31536000, immutable',
  download: 'public, max-age=3600',
  none: 'no-store',
})

/**
 * @typedef {{
 *   ASSETS: R2Bucket,
 *   CATALOGUE_CODE?: string,
 *   PROFILE_CODE?: string,
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
 * @param {{ timingSafeEqual?: import('./codes.js').TimingSafeEqual }} [options]
 * @returns {(request: Request, env: ApexEnv) => Promise<Response>}
 */
export function createHandler({ timingSafeEqual } = {}) {
  return async function handle(request, env) {
    const url = new URL(request.url)
    const method = request.method
    const host = url.hostname.toLowerCase()

    // The retired addresses reach this Worker only through their /catalogue* and
    // /profile* routes (wrangler.jsonc), and all of it is gone: no R2 read, any path.
    if (RETIRED_HOSTS.includes(host)) return finish(method, await messagePage(410))

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
    const other = Object.values(DOCUMENTS).find((candidate) => candidate.id !== doc.id)
    const ownSecret = normalisedSecret(env[doc.secret])
    if (ownSecret !== null && other) {
      const badPrefix = RETIRED_PATH_NAMES.find((name) => ownSecret.startsWith(name))
      const otherSecret = normalisedSecret(env[other.secret])
      const reason = badPrefix
        ? `starts with the retired path "${badPrefix}"`
        : otherSecret !== null && ownSecret === otherSecret
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
    if (!isPage && !isDownload && !isPicture) return finish(method, await messagePage(404))

    if (method !== 'GET' && method !== 'HEAD') {
      const headers = baseHeaders(CACHE_CONTROL.none)
      headers.set('allow', 'GET, HEAD')
      return new Response(null, { status: 405, headers })
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
      return finish(method, new Response(html, { status: 200, headers }))
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
   */
  fetch: (request, env) => handle(request, env),
}
