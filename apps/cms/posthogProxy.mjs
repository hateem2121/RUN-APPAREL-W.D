/**
 * POSTHOG THROUGH THE SITE'S OWN ADDRESS (26 Nov 2026, owner's choice "A": a path on wear-run.com,
 * no new DNS record). After Accept the page loads PostHog from `wear-run.com/rw/...` and sends to
 * the same place; this file passes each request on to PostHog's US hosts and sends the answer
 * back.
 *
 * WHY. Ad blockers refuse requests to PostHog's own hosts. PostHog's health check for this project
 * had said "No reverse proxy detected. Ad blockers may affect tracking accuracy" since 6 Oct 2026,
 * and its docs put the loss at "10-30%" of events (posthog.com/docs/advanced/proxy, read 26 Nov
 * 2026). The visitor's choice is unchanged: nothing here runs unless the page has started PostHog,
 * and it starts PostHog only after Accept (packages/shared/src/consent.ts).
 *
 * HOW, FROM POSTHOG'S OWN CLOUDFLARE WORKER (posthog.com/docs/advanced/proxy/cloudflare and its
 * proxy reference, both read 26 Nov 2026):
 *   - `/static/*` and `/array/*` (its code and the project's settings) go to the ASSET host,
 *     everything else (events, recordings, flags) to the API host;
 *   - the visitor's IP goes along as `X-Forwarded-For` from `CF-Connecting-IP`, or every visit
 *     would be placed in a Cloudflare data centre. The project drops IPs on arrival
 *     (`anonymize_ips: true`, read through PostHog's API 26 Nov 2026); the privacy page's words
 *     are unchanged;
 *   - the `Cookie` header is DELETED: the site's own cookies are not PostHog's business;
 *   - `Authorization` goes on only when it is a PostHog key (`Bearer phc_/phs_/phx_`);
 *   - the body is read whole before it is sent on: the guide says passing the stream on can drop
 *     events.
 *
 * ⚠️ THE PATH IS `/rw`, AND `consent.ts` POSTHOG_PROXY_PATH MUST SAY THE SAME (posthogProxy.test.ts
 * pins the two). PostHog's guide warns that blockers catch obvious names (`/analytics`, `/tracking`,
 * `/telemetry`, `/posthog`, `/ph`). It answered 404 on wear-run.com before this file (curl, 26 Nov
 * 2026).
 *
 * The answer is sent back as PostHog gave it. Its script came back `cache-control: public,
 * max-age=300` and brotli, with no `no-transform` (curl, 26 Nov 2026), so Cloudflare re-encodes it
 * for a browser that cannot read brotli: the trap door.mjs inVisitorsEncoding fixes for the
 * garment pages (which ARE `no-transform`) does not arise here.
 *
 * ⚠️ BOTH WORKERS ANSWER IT. The front door (door.mjs) answers first, so a PostHog request never
 * starts the site's 22 MiB Worker. The site's Worker answers it too (worker.mjs `first`), because
 * deleting the door's routes is that Worker's documented undo, and an undo must not quietly
 * switch PostHog off.
 */
import { SITE_HOST } from './pageCache.mjs'

export const POSTHOG_PROXY_PATH = '/rw'
export const POSTHOG_API_HOST = 'us.i.posthog.com'
export const POSTHOG_ASSET_HOST = 'us-assets.i.posthog.com'

/**
 * This site's PostHog project, the same public token consent.ts starts PostHog with
 * (posthogProxy.test.ts pins the two). Only ITS settings file is served: see posthogTarget.
 */
export const POSTHOG_PROJECT_TOKEN = 'phc_koNg9SmLSye49u8trEjUf9kd5cTYUveERNRDYKbW9p5y'

/**
 * ⚠️ AN ALLOW-LIST OF CODE, NOT A DENY-LIST (commit security reviews, 26 Nov 2026). The page
 * policies admit `'self'`, so whatever this path serves AS SCRIPT runs as the site's own code.
 * Only two shapes may come back as code: PostHog's own files (`/static/<name>.js`, the same for
 * every project) and THIS project's settings (`/array/<our token>/config.js`, or `config` as
 * JSON). PostHog serves ANY project's settings as JavaScript, so passing any token on would let an
 * injected tag run code from a project an attacker controls. (The policy until today named
 * `us-assets.i.posthog.com`, which admitted exactly that; there is no reason to carry it over.)
 * Everything else is DATA (events, recordings, flags) and goes to the API host; its answers are
 * refused if they come back as script or a page (answerPosthog).
 */
const CODE_PATHS = [
  /^\/static\/[A-Za-z0-9._-]+\.js$/,
  new RegExp(`^/array/${POSTHOG_PROJECT_TOKEN}/config(?:\\.js)?$`),
]
/** Any other `/static/` or `/array/` address: neither code we serve nor data. */
const ASSET_FOLDERS = /^\/(?:static|array)(?:\/|$)/
/**
 * Escaped separators and dots, or a doubled or backslash separator: the URL parser has already
 * resolved `..`, but PostHog's servers may decode `%2f` or `%2e` again and land somewhere the
 * allow-list above never saw (a parser differential). No address PostHog's script uses has one.
 */
const SMUGGLED = /%2f|%5c|%2e|\/\/|\\/i
/** Only a project key goes on (`phc_`); a personal key (`phx_`) or anything else never does. */
const POSTHOG_KEY = /^Bearer phc_/
/** A data answer may be JSON, text or nothing; never a page or code. */
const DATA_TYPE = /^(?:application\/json|text\/plain)\b/i
const REFUSED_HEADERS = Object.freeze({
  'content-type': 'text/plain; charset=utf-8',
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
  'x-robots-tag': 'noindex',
})
/** On every data answer: even opened on its own, it can run nothing and load nothing. */
const DATA_POLICY = "default-src 'none'; sandbox"

/** Is this address under the proxy path on the site? */
export function isPosthogPath(url) {
  if (url.hostname !== SITE_HOST) return false
  const { pathname } = url
  return pathname === POSTHOG_PROXY_PATH || pathname.startsWith(`${POSTHOG_PROXY_PATH}/`)
}

/**
 * Where a request under the proxy path goes at PostHog, and whether its answer may be code; null
 * when it is not one, or is one this site refuses.
 *
 * @param {URL} url
 * @returns {{ url: URL, code: boolean } | null}
 */
export function posthogRoute(url) {
  if (!isPosthogPath(url)) return null
  const rest = url.pathname.slice(POSTHOG_PROXY_PATH.length) || '/'
  if (SMUGGLED.test(rest)) return null
  const code = CODE_PATHS.some((shape) => shape.test(rest))
  if (!code && ASSET_FOLDERS.test(rest)) return null
  const host = code ? POSTHOG_ASSET_HOST : POSTHOG_API_HOST
  return { url: new URL(`https://${host}${rest}${url.search}`), code }
}

/**
 * Where a request under the proxy path goes at PostHog, or null.
 *
 * @param {URL} url
 * @returns {URL | null}
 */
export function posthogTarget(url) {
  return posthogRoute(url)?.url ?? null
}

/**
 * The headers PostHog is sent: the visitor's, less what is not PostHog's to see.
 *
 * @param {Headers} incoming
 */
export function posthogHeaders(incoming) {
  const headers = new Headers(incoming)
  headers.delete('cookie')
  headers.delete('host')
  const authorization = headers.get('authorization')
  if (authorization && !POSTHOG_KEY.test(authorization)) headers.delete('authorization')
  const ip = incoming.get('cf-connecting-ip')
  if (ip) headers.set('x-forwarded-for', ip)
  return headers
}

const refused = () => new Response('Not found\n', { status: 404, headers: REFUSED_HEADERS })

/**
 * Answer a PostHog request, or null when the request is not one (the caller carries on).
 *
 * @param {Request} request
 * @param {typeof fetch} [send] PostHog is reached with this (tests pass a stand-in).
 * @returns {Promise<Response | null>}
 */
export async function answerPosthog(request, send = fetch) {
  const url = new URL(request.url)
  if (!isPosthogPath(url)) return null
  const route = posthogRoute(url)
  // Refused: answered here, so it never reaches the site's Worker and PostHog is never asked.
  if (!route) return refused()
  const hasBody = request.method !== 'GET' && request.method !== 'HEAD'
  const response = await send(route.url.toString(), {
    method: request.method,
    headers: posthogHeaders(request.headers),
    body: hasBody ? await request.arrayBuffer() : undefined,
    redirect: 'manual',
  })
  const type = response.headers.get('content-type')
  // A data address answered with a page or with code is refused, whatever PostHog meant by it.
  if (!route.code && type && !DATA_TYPE.test(type)) return refused()
  const headers = new Headers(response.headers)
  // Never a page to index: Search Console reports a proxy's addresses as 404s otherwise
  // (PostHog/posthog issue 55248, open, April 2026).
  headers.set('x-robots-tag', 'noindex')
  headers.set('x-content-type-options', 'nosniff')
  if (!route.code) headers.set('content-security-policy', DATA_POLICY)
  headers.delete('set-cookie')
  // Same-origin requests need no cross-site permission, and a redirect must not leave the site.
  headers.delete('location')
  for (const name of [...headers.keys()]) {
    if (name.startsWith('access-control-')) headers.delete(name)
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}
