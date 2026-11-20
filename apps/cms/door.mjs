/**
 * THE FRONT DOOR (20 Nov 2026, owner's yes that day): a small Worker that Cloudflare runs BEFORE
 * the site's own Worker, so a visitor whose page the store already holds never waits for the big
 * one to start.
 *
 * WHY. siteEdge.mjs has the measurements: the site's Worker is 40.8 MiB and a fresh copy takes
 * 1.2 to 2.0 s to start, on the first requests after any quiet spell, in every region. This one
 * is 38 KiB. It runs the same steps (siteEdge.mjs createSiteFetch) with two differences:
 *   - it reaches the store through the `SITE_PAGES` service binding. Cloudflare answers a kept
 *     copy over a binding without running the Worker that keeps it (Workers Cache, "Service
 *     bindings", read 20 Nov 2026);
 *   - it draws nothing itself. A page the store does not hold, and everything that is not a page,
 *     is handed on to the site's Worker exactly as the visitor sent it. That Worker answers as it
 *     always has, nonce included, so this one sends its answer on untouched.
 *
 * HOW IT IS REACHED. By ROUTES on the site's addresses (wrangler.door.jsonc). A Worker on a route
 * runs before the Worker on the Custom Domain, which is then its origin: `fetch(request)` from
 * here reaches it (Cloudflare, Workers "Custom Domains", read 20 Nov 2026). The site's Worker
 * keeps its Custom Domains and all of its own code, so DELETING THE ROUTES IS THE WHOLE UNDO: the
 * site then answers exactly as it did before this file existed.
 *
 * ⚠️ THE WEBSITE BUILD'S NAME IS READ FROM THE SITE'S OWN STATIC FILES, NEVER BAKED IN HERE. The
 * store's key names the website build (pageCache.mjs keptBuild), because a kept page names script
 * files only that build has. This Worker is a separate deploy from the site's, so a name baked
 * into it would be the last build's whenever the two deploys are apart, and it would hand
 * visitors the last build's pages. The site's deploy writes the name into `/__site-build.txt`
 * (siteBuild.mjs writeSiteBuildAsset), one of the static files Cloudflare serves with the deployed
 * version and without starting the site's Worker, so it changes at the moment the pages' script
 * files do. It is read at most every BUILD_MEMO_MS per copy of this Worker. Anything that is not a
 * build's name (no file, `per-deploy`, a failed read) means: hand every request on.
 *
 * THE OFF SWITCH, WITH NO DEPLOY: KV `front-door` = `off` in SITE_CACHE. Within 30 seconds
 * (pageCache.mjs VERSION_CACHE_SECONDS) the door is a pass-through. The site's own switch
 * `page-store-build` = `per-deploy` does the same, since keys then name a Worker's own version id,
 * and here that would be this Worker's.
 *
 * ⚠️ NEVER ANSWER `/__worker/version` HERE. The deploy reads it to prove its pre-live checks
 * reached the site Worker's NEW version (workerVersion.mjs); this Worker's id would be a lie. It
 * is handed on with everything else that is never kept (`/_next`, `/api`, `/admin`, `/film`).
 */
import {
  memoKvGet,
  NEVER_KEPT_PATHS,
  PER_DEPLOY,
  SITE_BUILD_PATTERN,
  SITE_HOST,
  STORE_BUILD_KEY,
} from './pageCache.mjs'
import { createSiteFetch } from './siteEdge.mjs'
import { forwardsToViewer } from './viewerForward.mjs'
import { WORKER_VERSION_PATH } from './workerVersion.mjs'

/** Where the site's deploy writes the live website build's name (siteBuild.mjs SITE_BUILD_ASSET). */
export const SITE_BUILD_PATH = '/__site-build.txt'

/** How long one copy of this Worker trusts the name it read. A deploy is followed within this. */
export const BUILD_MEMO_MS = 10_000

/** The KV key (SITE_CACHE) that switches the door off without a deploy: `off`. */
export const DOOR_SWITCH_KEY = 'front-door'
export const DOOR_OFF = 'off'

/** Cloudflare's header that sends a request to one named version of a Worker (Version overrides). */
export const VERSION_OVERRIDES_HEADER = 'cloudflare-workers-version-overrides'

/** The site's Worker, as the origin behind this route: the request goes on as the visitor sent it. */
async function handOn(request, env) {
  // A local preview has no origin behind it: there the site's Worker is a binding (`ORIGIN`).
  const response = await (env.ORIGIN ? env.ORIGIN.fetch(request) : fetch(request))
  return inVisitorsEncoding(request, response)
}

/**
 * ⚠️ HANDED ON, A PAGE CAME BACK IN THE DOOR'S ENCODING, NOT THE VISITOR'S (20 Nov 2026).
 * `fetch(request)` from here is a NEW request, made by this Worker, so the Worker behind sees this
 * Worker's Accept-Encoding in `request.cf.clientAcceptEncoding`, not the visitor's. The viewer
 * chooses its compression from that list (apps/viewer/worker/compression.ts) and marks every
 * garment page `no-transform` (noTransform.ts), under which Cloudflare does not re-encode a body
 * for a visitor who cannot read it. So a visitor offering only gzip was sent the page brotli'd for
 * the door, and Cloudflare handed it on uncompressed. Measured: the deploy of #435 (run
 * 44767665680) failed its pre-live check PF-13 on all 42 products ("came back uncompressed to a
 * browser offering only gzip"), while "br, gzip" passed on every one; its pre-live checks are the
 * one route that goes through this function for every garment page (the version-overrides header).
 *
 * The fix re-chooses from the VISITOR's own list, with the viewer's rule, and lets the runtime
 * re-encode: `fetch()` hands this Worker the body already decoded, and a Response that carries
 * `Content-Encoding` with the default `encodeBody` is compressed to it on the way out (Workers,
 * "Response", read 20 Nov 2026; the same mechanism compression.ts relies on). A visitor whose
 * choice equals what came back (every browser offering br) gets the response untouched, at no
 * cost. Only br and gzip are re-chosen, the two the runtime writes; anything else, a plain
 * response, and a request with no `cf` (vitest, a local preview) pass through as they are.
 */
export function inVisitorsEncoding(request, response) {
  const sent = response.headers.get('content-encoding')
  if (sent !== 'br' && sent !== 'gzip') return response
  const cf = /** @type {{ cf?: { clientAcceptEncoding?: unknown } }} */ (request).cf
  if (!cf) return response
  const visitor = typeof cf.clientAcceptEncoding === 'string' ? cf.clientAcceptEncoding : null
  const wanted = chooseEncoding(visitor)
  if (wanted === sent) return response
  const next = new Response(response.body, response)
  if (wanted) next.headers.set('content-encoding', wanted)
  else next.headers.delete('content-encoding')
  next.headers.delete('content-length')
  return next
}

/**
 * The best encoding a visitor's list accepts, honouring `q=0`; null means plain. Kept in step with
 * chooseEncoding in apps/viewer/worker/compression.ts (an app may not import another app's code,
 * biome.jsonc noRestrictedImports); door.test.ts holds the two to the same answers.
 *
 * @param {string | null} acceptEncoding
 * @returns {'br' | 'gzip' | null}
 */
export function chooseEncoding(acceptEncoding) {
  const offered = new Map()
  for (const part of (acceptEncoding ?? '').split(',')) {
    const [name = '', ...params] = part.trim().toLowerCase().split(';')
    if (!name) continue
    const q = params.map((param) => param.trim()).find((param) => param.startsWith('q='))
    const weight = q === undefined ? 1 : Number(q.slice(2))
    offered.set(name, Number.isFinite(weight) ? weight : 0)
  }
  const accepts = (name) => (offered.get(name) ?? offered.get('*') ?? 0) > 0
  if (accepts('br')) return 'br'
  if (accepts('gzip')) return 'gzip'
  return null
}

/**
 * Is this a request the door has nothing to add to? The site's own files, its admin and API on
 * the site's address, the film and the version check. Asked before anything else is read, so a
 * script or a picture costs this Worker one line.
 *
 * @param {URL} url
 */
export function alwaysHandedOn(url) {
  if (url.hostname !== SITE_HOST) return false
  return (
    url.pathname === WORKER_VERSION_PATH ||
    url.pathname === SITE_BUILD_PATH ||
    NEVER_KEPT_PATHS.test(url.pathname)
  )
}

/** What this copy of the Worker last read from the site's static files, and when. */
let remembered = { at: 0, build: /** @type {string | null} */ (null), reading: null }

/** Forget the remembered name: for tests, which each need a fresh copy of the Worker. */
export function forgetBuild() {
  remembered = { at: 0, build: null, reading: null }
}

/**
 * The live website build's name from the site's static files, or null. Requests that arrive
 * while a read is in flight share it; a failed read is not remembered, so the next request asks
 * again (and is handed on meanwhile).
 *
 * @returns {Promise<string | null>}
 */
export async function buildFromSite(env, now = Date.now()) {
  if (remembered.at > 0 && now - remembered.at < BUILD_MEMO_MS) return remembered.build
  if (remembered.reading) return remembered.reading
  const reading = (async () => {
    try {
      const answer = await handOn(new Request(`https://${SITE_HOST}${SITE_BUILD_PATH}`), env)
      const text = answer.ok ? (await answer.text()).trim() : ''
      const build = SITE_BUILD_PATTERN.test(text) ? text : null
      // A read that answered is remembered even when it names no build: the site said so.
      if (answer.ok || answer.status === 404) remembered = { at: now, build, reading: null }
      else remembered.reading = null
      return build
    } catch (error) {
      console.error('[front-door] could not read the site build; handing requests on', error)
      remembered.reading = null
      return null
    }
  })()
  remembered.reading = reading
  return reading
}

/**
 * The live website build's name, or null when the store must not be used: no bindings, the off
 * switch, keys that are per deploy (the note above), or no build name among the site's files.
 *
 * @returns {Promise<string | null>}
 */
export async function liveBuild(env, now = Date.now()) {
  if (!env.SITE_PAGES || !env.SITE_CACHE) return null
  // Remembered reads (pageCache.mjs memoKvGet): 30 seconds per copy of this Worker.
  const [door, keying] = await Promise.all([
    memoKvGet(env.SITE_CACHE, DOOR_SWITCH_KEY).catch(() => null),
    memoKvGet(env.SITE_CACHE, STORE_BUILD_KEY).catch(() => null),
  ])
  if (door === DOOR_OFF || keying === PER_DEPLOY) return null
  return buildFromSite(env, now)
}

const site = createSiteFetch({
  draw: (request, env) => handOn(request, env),
  store: (env) => env.SITE_PAGES,
})

export default {
  async fetch(request, env, ctx) {
    try {
      const url = new URL(request.url)
      // ⚠️ A DEPLOY'S PRE-LIVE CHECK ASKS FOR A NEW VERSION BY HEADER, and must reach it. The
      // deploy tests each new version at 0% through `Cloudflare-Workers-Version-Overrides`
      // (scripts/version-overrides.mjs, owner decision 7 Nov 2026). A kept answer from the store,
      // or the viewer's live version over the binding, would pass that check without the new
      // version ever running. So such a request is handed on whole, header and all, and the
      // site's Worker answers it exactly as it did before the door.
      if (request.headers.has(VERSION_OVERRIDES_HEADER)) return handOn(request, env)
      // Garment pages and the viewer's files: straight to the small viewer Worker.
      if (env.VIEWER && forwardsToViewer(url)) return env.VIEWER.fetch(request)
      if (alwaysHandedOn(url)) return handOn(request, env)
      const build = await liveBuild(env)
      if (!build) return handOn(request, env)
      // The steps read the build's name off `env`, as they do in the site's Worker.
      return await site(request, { ...env, SITE_BUILD: build }, ctx)
    } catch (error) {
      // The door may make a page faster; it must never be the reason one fails.
      console.error('[front-door] failed; handing the request on', error)
      return handOn(request, env)
    }
  },
}
