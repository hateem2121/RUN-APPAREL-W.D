/**
 * THE FRONT DOOR (20 Nov 2026, owner's yes that day): a small Worker that Cloudflare runs BEFORE
 * the site's own Worker, so a visitor whose page the store already holds never waits for the big
 * one to start.
 *
 * WHY. siteEdge.mjs has the measurements: the site's Worker is 40.8 MiB and a fresh copy takes
 * 1.2 to 2.0 s to start, on the first requests after any quiet spell, in every region. This one
 * is a few dozen KiB. It runs the same steps (siteEdge.mjs createSiteFetch) with two differences:
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
 * ⚠️ THE WEBSITE BUILD'S NAME COMES FROM KV, NOT FROM THIS WORKER'S OWN DEPLOY (`door-build` in
 * SITE_CACHE). The store's key names the website build (pageCache.mjs keptBuild), because a kept
 * page names script files only that build has. The site's Worker is handed the name when it is
 * uploaded (SITE_BUILD). This Worker is a separate deploy, so a name baked into it would be the
 * old build's for as long as the two deploys are apart, and it would answer visitors with the
 * last build's pages. The deploy therefore DELETES `door-build` before it moves the site's Worker
 * to a new version and writes the new name after: with no name, or one that is not a build's
 * name, this Worker hands every request on. That also makes the key the OFF SWITCH, with no
 * deploy: delete it and within 30 seconds (pageCache.mjs VERSION_CACHE_SECONDS) the door is a
 * pass-through. So does the site's own switch `page-store-build` = `per-deploy`, under which keys
 * name a Worker's own version id, and here that would be this Worker's.
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

/** The KV key (SITE_CACHE) holding the live website build's name; absent = hand everything on. */
export const DOOR_BUILD_KEY = 'door-build'

/** The site's Worker, as the origin behind this route: the request goes on as the visitor sent it. */
function handOn(request, env) {
  // A local preview has no origin behind it: there the site's Worker is a binding (`ORIGIN`).
  return env.ORIGIN ? env.ORIGIN.fetch(request) : fetch(request)
}

/**
 * Is this a request the door has nothing to add to? The site's own files, its admin and API on
 * the site's address, the film and the version check. Asked before anything is read from KV, so
 * a script or a picture costs this Worker one line.
 *
 * @param {URL} url
 */
export function alwaysHandedOn(url) {
  if (url.hostname !== SITE_HOST) return false
  return url.pathname === WORKER_VERSION_PATH || NEVER_KEPT_PATHS.test(url.pathname)
}

/**
 * The live website build's name, or null when the store must not be used: no bindings, no name in
 * KV, a name that is not a build's, or keys that are per deploy (the ⚠️ above). Both reads are
 * remembered for 30 seconds per copy of this Worker (pageCache.mjs memoKvGet).
 *
 * @returns {Promise<string | null>}
 */
export async function liveBuild(env) {
  if (!env.SITE_PAGES || !env.SITE_CACHE) return null
  const [build, keying] = await Promise.all([
    memoKvGet(env.SITE_CACHE, DOOR_BUILD_KEY).catch(() => null),
    memoKvGet(env.SITE_CACHE, STORE_BUILD_KEY).catch(() => null),
  ])
  if (keying === PER_DEPLOY) return null
  return typeof build === 'string' && SITE_BUILD_PATTERN.test(build) ? build : null
}

const site = createSiteFetch({
  draw: (request, env) => handOn(request, env),
  store: (env) => env.SITE_PAGES,
})

export default {
  async fetch(request, env, ctx) {
    try {
      const url = new URL(request.url)
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
