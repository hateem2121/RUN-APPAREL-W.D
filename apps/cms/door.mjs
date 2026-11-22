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
 * The door has an address of its own for the same proof (DOOR_VERSION_PATH, below).
 */
import {
  KEPT_FILES,
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
/**
 * The same key's second value (the admin split, 22 Nov 2026): the door stays on, but sends every
 * visitor to the CMS Worker and never to the site-only Worker. THE SITE-ONLY WORKER'S OFF SWITCH.
 * A value of the key the door already reads, not a key of its own, so it costs no extra KV read.
 */
export const DOOR_FULL = 'full'

/** Cloudflare's header that sends a request to one named version of a Worker (Version overrides). */
export const VERSION_OVERRIDES_HEADER = 'cloudflare-workers-version-overrides'

/** The site's Worker, as the origin behind this route: the request goes on as the visitor sent it. */
async function handOn(request, env) {
  // A local preview has no origin behind it: there the site's Worker is a binding (`ORIGIN`).
  const response = await (env.ORIGIN ? env.ORIGIN.fetch(request) : fetch(request))
  return inVisitorsEncoding(request, response)
}

/**
 * THE SITE-ONLY WORKER (the admin split, 22 Nov 2026, owner's yes). The pages of wear-run.com are
 * drawn and kept by a second, smaller Worker built from the same code without the admin and the
 * CMS API (wrangler.site.jsonc: 16,182 KiB against the CMS Worker's 22,035, measured that day).
 * It has no address. The door reaches it over two bindings: `SITE_ONLY` (its pages and its static
 * files) and `SITE_ONLY_PAGES` (its page store). wear-run.com is still the CMS Worker's Custom
 * Domain, so `handOn` above still reaches the CMS Worker, which still holds the whole website.
 *
 * WHAT GOES WHERE, when both bindings are there and the switch does not say otherwise:
 *   - a GET or HEAD on wear-run.com (a page, a kept page, a script, a photo, the film): the
 *     site-only Worker;
 *   - everything else: the CMS Worker, as before. That is every form post (the three forms need
 *     the mail and Turnstile secrets only the CMS Worker holds), and the garment data, which only
 *     the CMS Worker can draw (`SITE_PAGES`, its store, stays the garment data's store).
 *
 * ⚠️ A PAGE'S SCRIPT FILES MUST COME FROM THE WORKER THAT DREW THE PAGE. The two builds do not
 * share all their files (measured 22 Nov 2026 on one commit: 264 the same, 7 script files only in
 * the site-only build). So `/_next/static` is asked of the site-only Worker first, and of the CMS
 * Worker only when that answers 404: a page the CMS Worker drew a moment before the switch was
 * thrown still finds its scripts.
 *
 * ⚠️ IT MUST NEVER BE THE REASON A PAGE FAILS. A call that throws, or an answer of 500 or more,
 * is asked again of the CMS Worker, and said out loud in the logs. Only GET and HEAD ever go to
 * the site-only Worker, so asking twice repeats nothing.
 *
 * Without the bindings (a test, a preview, the door as it was before 22 Nov 2026) none of this
 * runs and the door is exactly what it was.
 */
export function hasSiteOnly(env) {
  return Boolean(env.SITE_ONLY && env.SITE_ONLY_PAGES)
}

/** Is this a request the site-only Worker may answer? A read of the website's own host. */
export function forSiteOnly(request, url = new URL(request.url)) {
  return url.hostname === SITE_HOST && (request.method === 'GET' || request.method === 'HEAD')
}

/** The folder whose files differ between the two builds (the note above). */
const BUILT_FILES = '/_next/static/'

/** The site-only Worker's answer, or the CMS Worker's when it fails or lacks a built file. */
async function handToSiteOnly(request, env) {
  let response
  try {
    response = await env.SITE_ONLY.fetch(request)
  } catch (error) {
    console.error(
      '[front-door] the site-only Worker could not be asked; asking the CMS Worker',
      error,
    )
    return handOn(request, env)
  }
  if (response.status >= 500) {
    console.error(
      `[front-door] the site-only Worker answered ${response.status}; asking the CMS Worker`,
    )
    await response.body?.cancel()
    return handOn(request, env)
  }
  if (response.status === 404 && new URL(request.url).pathname.startsWith(BUILT_FILES)) {
    await response.body?.cancel()
    return handOn(request, env)
  }
  return inVisitorsEncoding(request, response)
}

/**
 * Does the switch let the site-only Worker be used? Not when KV `front-door` says `full` (its own
 * off switch) or `off` (the whole door's). A read that fails means yes, as it does for the door.
 */
export async function siteOnlyOn(env) {
  if (!hasSiteOnly(env) || !env.SITE_CACHE) return false
  const mode = await memoKvGet(env.SITE_CACHE, DOOR_SWITCH_KEY).catch(() => null)
  return mode !== DOOR_OFF && mode !== DOOR_FULL
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
    NEVER_KEPT_PATHS.test(url.pathname) ||
    isStaticFile(url.pathname)
  )
}

/**
 * ⚠️ A FILE IS NEVER A PAGE (21 Nov 2026, 09:52 to 11:05 UTC, live). In the site's Worker the
 * shared steps never see a static file: Cloudflare serves `public/` (the factory photos, the
 * favicon, the standards logos) before that Worker's code runs. The door is on a ROUTE, in front
 * of those files too, so `/factory/inspection-1536.webp` reached the page store as if it were a
 * page: SitePages drew it with Next, Next has no such page, and the door sent Next's 404 in place
 * of the photo. Every file in `public/` answered 404 on wear-run.com for 73 minutes (Ahrefs'
 * crawl of that hour: 128 pages with a broken image, 31 broken images, 10 of them linked from
 * /press) while the same files answered 200 on www.wear-run.help, which the door is not on. The
 * off switch ended it (KV `front-door` = `off`, owner's yes, 11:05:45 UTC).
 *
 * So an address that ends in a file extension is handed on untouched, as `/_next` is, and the
 * site answers it from its static files. The three generated text files the store keeps
 * (pageCache.mjs KEPT_FILES) are the exception. src/door.test.ts walks `public/` and holds every
 * file in it to this, so a file this rule does not recognise fails there, not in production.
 */
const FILE_EXTENSION = /\.[a-z0-9]{1,8}$/i
/**
 * The one static file the site's build writes WITHOUT an extension (Next's `BUILD_ID`; found
 * 21 Nov 2026 by listing all 342 files of a build against the rule above). No page links to it,
 * but it answered 200 before the door and must not answer Next's 404 behind it.
 */
const EXTENSIONLESS_FILES = Object.freeze(['/BUILD_ID'])
export function isStaticFile(pathname) {
  if (EXTENSIONLESS_FILES.includes(pathname)) return true
  return FILE_EXTENSION.test(pathname) && !KEPT_FILES.includes(pathname)
}

/** What this copy of the Worker last read from the site's static files, and when. */
let remembered = { at: 0, build: /** @type {string | null} */ (null), reading: null, split: false }

/** Forget the remembered name: for tests, which each need a fresh copy of the Worker. */
export function forgetBuild() {
  remembered = { at: 0, build: null, reading: null, split: false }
}

/**
 * The site's build-name file, asked for over the `SITE_FILES` service binding.
 *
 * ⚠️ NEVER BY A PUBLIC FETCH (21 Nov 2026, the hour after the door's route became
 * `wear-run.com/*`). The file's address then sat on the door's OWN route. A door started by a
 * website page (zone wear-run.com) still read it: a same-zone fetch goes past the routes to the
 * Custom Domain. A door started by the garment data (cms.wear-run.help, the OTHER zone) could
 * not, got no build name, and handed every garment-data request to the site's Worker, silently:
 * US bursts read p90 1,163 and 933 ms where stage 1 had read 145, 293 and 181. Measured from
 * Lahore the same minute: 4 of 4 data requests sent alone reached the site's Worker; 9 of 9 sent
 * within 10 s of a page (the memo below) were answered here in 2 to 3 ms.
 *
 * A service binding does not pass through any zone's routes or firewall, so the read is the same
 * wherever this Worker was started (Cloudflare, Workers "Custom Domains" and "Limits", read
 * 21 Nov 2026: Worker-to-Worker calls on one account belong on service bindings). And it does not
 * start the site's Worker: a static file asked over a binding is served without the bound
 * Worker's code running (measured that day on the `VIEWER` binding: 180 `/assets/*` requests
 * through the door, 0 invocations of the viewer Worker for them; the build file is outside
 * wrangler.jsonc's `run_worker_first`). Without the binding (a local preview, a test) the file
 * is asked as before.
 */
function readBuildFile(env, split = false) {
  const ask = new Request(`https://${SITE_HOST}${SITE_BUILD_PATH}`)
  // The build that will draw the page: the site-only Worker's when it is in use (22 Nov 2026),
  // read from ITS static files, which names ITS store's keys. Never the other Worker's name.
  if (split) return env.SITE_ONLY.fetch(ask)
  return env.SITE_FILES ? env.SITE_FILES.fetch(ask) : handOn(ask, env)
}

/**
 * The live website build's name from the site's static files, or null. Requests that arrive
 * while a read is in flight share it; a failed read is not remembered, so the next request asks
 * again (and is handed on meanwhile).
 *
 * @returns {Promise<string | null>}
 */
export async function buildFromSite(env, now = Date.now(), split = false) {
  // A name read from one Worker is never used for the other: the switch forgets it.
  if (remembered.split !== split) remembered = { at: 0, build: null, reading: null, split }
  if (remembered.at > 0 && now - remembered.at < BUILD_MEMO_MS) return remembered.build
  if (remembered.reading) return remembered.reading
  const reading = (async () => {
    try {
      const answer = await readBuildFile(env, split)
      const text = answer.ok ? (await answer.text()).trim() : ''
      const build = SITE_BUILD_PATTERN.test(text) ? text : null
      // A read that answered is remembered even when it names no build: the site said so.
      if (answer.ok || answer.status === 404) remembered = { at: now, build, reading: null, split }
      else {
        // Said out loud: on 21 Nov 2026 this failed without a word for every garment-data request.
        console.error(`[front-door] the site build read answered ${answer.status}; handing on`)
        remembered.reading = null
      }
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
export async function liveBuild(env, now = Date.now(), split = false) {
  if (!env.SITE_PAGES || !env.SITE_CACHE) return null
  // Remembered reads (pageCache.mjs memoKvGet): 30 seconds per copy of this Worker.
  const [door, keying] = await Promise.all([
    memoKvGet(env.SITE_CACHE, DOOR_SWITCH_KEY).catch(() => null),
    memoKvGet(env.SITE_CACHE, STORE_BUILD_KEY).catch(() => null),
  ])
  if (door === DOOR_OFF || keying === PER_DEPLOY) return null
  return buildFromSite(env, now, split)
}

const site = createSiteFetch({
  draw: (request, env) => handOn(request, env),
  store: (env) => env.SITE_PAGES,
})

/** The same steps with the site-only Worker drawing and keeping the pages (the note on hasSiteOnly). */
const splitSite = createSiteFetch({
  draw: (request, env) =>
    forSiteOnly(request) ? handToSiteOnly(request, env) : handOn(request, env),
  store: (env) => env.SITE_ONLY_PAGES,
  // The garment data is drawn and kept by the CMS Worker alone.
  dataStore: (env) => env.SITE_PAGES,
})

/**
 * Which version of THIS Worker answered: the proof a deploy needs that its pre-live checks pass
 * through the NEW door (scripts/version-overrides.mjs `verify`).
 *
 * WHY (21 Nov 2026). The deploy used to update the door AFTER its pre-live checks, and those
 * checks pass through the live door. The deploys of #435 and #438 (runs 44767665680 and
 * 44781104367) both failed PF-13 on all 42 products through the door that was live, and #438 was
 * the fix for that very door: it could not get past the copy it replaced. The door is now staged
 * at 0% with the other two Workers and the checks name its new version in the override header;
 * this address is how `verify` knows the header reached it.
 *
 * Under `/products/`, because that route has carried the door since its first day, so the address
 * is reachable whatever else the door is routed on. Answered before the viewer forward (which
 * would read it as a garment page) and before the override hand-on (the check sends the header).
 */
export const DOOR_VERSION_PATH = '/products/__door/version'
export const DOOR_NAME = 'run-apparel-site-door'

/**
 * @param {URL} url
 * @param {{ id?: string } | undefined} metadata
 * @returns {Response | null}
 */
export function doorVersionResponse(url, metadata) {
  if (url.hostname !== SITE_HOST || url.pathname !== DOOR_VERSION_PATH) return null
  return new Response(`${JSON.stringify({ worker: DOOR_NAME, version: metadata?.id ?? null })}\n`, {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      'x-robots-tag': 'noindex',
    },
  })
}

export default {
  async fetch(request, env, ctx) {
    try {
      const url = new URL(request.url)
      const version = doorVersionResponse(url, env.CF_VERSION_METADATA)
      if (version) return version
      // ⚠️ A DEPLOY'S PRE-LIVE CHECK ASKS FOR A NEW VERSION BY HEADER, and must reach it. The
      // deploy tests each new version at 0% through `Cloudflare-Workers-Version-Overrides`
      // (scripts/version-overrides.mjs, owner decision 7 Nov 2026). A kept answer from the store,
      // or the viewer's live version over the binding, would pass that check without the new
      // version ever running. So such a request is handed on whole, header and all, and the
      // site's Worker answers it exactly as it did before the door.
      //
      // ⚠️ WITH THE SITE-ONLY WORKER (22 Nov 2026) THE CHECK GOES WHERE A VISITOR'S PAGE WOULD, AND
      // WHATEVER THE SWITCH SAYS. The header carries through a forwarded binding call (Cloudflare,
      // "Version overrides", "Service bindings", updated 12 Nov 2026), so the deploy's checks run
      // the site-only Worker's NEW version before it serves anyone. The switch is not asked: a
      // Worker that is switched off must still be checked, or a faulty one could be switched on,
      // and a switch that is off must not fail the deploy (the door's own lesson of 20 Nov 2026).
      // No second try here: a check must see the site-only Worker's own answer.
      if (request.headers.has(VERSION_OVERRIDES_HEADER)) {
        if (hasSiteOnly(env) && forSiteOnly(request, url)) {
          return inVisitorsEncoding(request, await env.SITE_ONLY.fetch(request))
        }
        return handOn(request, env)
      }
      // Garment pages and the viewer's files: straight to the small viewer Worker.
      if (env.VIEWER && forwardsToViewer(url)) return env.VIEWER.fetch(request)
      // Asked only when the site-only Worker is bound: without it a file still costs no KV read.
      const split = hasSiteOnly(env) && (await siteOnlyOn(env))
      if (alwaysHandedOn(url)) {
        return split && forSiteOnly(request, url)
          ? handToSiteOnly(request, env)
          : handOn(request, env)
      }
      const build = await liveBuild(env, Date.now(), split)
      if (!build) return handOn(request, env)
      // The steps read the build's name off `env`, as they do in the site's Worker.
      return await (split ? splitSite : site)(request, { ...env, SITE_BUILD: build }, ctx)
    } catch (error) {
      // The door may make a page faster; it must never be the reason one fails.
      console.error('[front-door] failed; handing the request on', error)
      return handOn(request, env)
    }
  },
}
