/**
 * Tap data in the shared store (faster-taps spec, Part 1; docs/superpowers/specs/
 * 2026-10-27-faster-taps-edge-store-intent-design.md).
 *
 * WHY. A tap between website pages is a Next.js client navigation: a GET with an `rsc: 1` header
 * and a `?_rsc=` code. pageCache.mjs keeps whole pages but never these, so on 26 Oct the first tap
 * after arriving waited 2.85–3.75 s while the destination's data was drawn on the server (3.17 s
 * of it streaming). This keeps that data the way the pages are kept.
 *
 * ⚠️ THE CODE IS CHECKED, BY NEXT AND BY US. `_rsc` is SHA-256 of four router headers, cut to 12
 * bytes (Next 16.4.3, cache-busting-search-param.js). Next answers a mismatch with a 307 (live,
 * 27 Oct), and keepableTapRequest refuses one before it reaches the store, so a crafted request
 * can never file its answer under a real tap's address.
 *
 * ⚠️ ONE COPY PER DESTINATION, NOT PER START PAGE. `next-url` (the start page) is part of the code,
 * but Next deletes it before drawing on every route that cannot be intercepted ("it won't affect
 * the response", base-server.js setVaryHeader). This site has none (src/interceptionRoutes.test.ts
 * fails if one appears), so tapDrawRequest leaves it out and recomputes the code without it.
 *
 * ⚠️ THE SITE'S ANSWERS DO NOT VARY ON THE ROUTER HEADERS. Every tap answer measured on 27 Oct
 * carried `Vary: Sec-CH-Prefers-Color-Scheme` only (publicViewerHeaders.mjs sets the site's Vary),
 * so keptTapHeaders adds TAP_VARY for the store: one variant per router-header combination. The
 * visitor gets the site's own Vary back (servedTapHeaders).
 *
 * Pure apart from Web Crypto, so vitest reaches every decision (src/tapStore.test.ts).
 */
import {
  CONTENT_VERSION_KEY,
  KEPT_RENDER_HEADERS,
  KEPT_TAGS,
  keptHeaders,
  NEVER_KEPT_PATHS,
  SIGNED_IN_OR_DRAFT,
  SITE_HOST,
  STORE_MODE_KEY,
  servedHeaders,
  VERSION_CACHE_SECONDS,
  VERSIONED_MODE,
} from './pageCache.mjs'

/** KV off switch: 'off' sends tap data around the store within VERSION_CACHE_SECONDS. */
export const RSC_STORE_KEY = 'rsc-store'

/** The headers that shape a tap answer, and the only visitor headers a drawing carries. */
export const TAP_HEADERS = Object.freeze([
  'rsc',
  'next-router-state-tree',
  'next-router-prefetch',
  'next-router-segment-prefetch',
])

/** The Vary a kept copy carries for the store. */
export const TAP_VARY =
  'rsc, next-router-state-tree, next-router-prefetch, next-router-segment-prefetch'

/** Where a kept copy holds the site's own Vary while the store sees TAP_VARY. */
export const BROWSER_VARY = 'x-run-browser-vary'

/** Twice the largest tree a settled tap sent on 27 Oct (329 bytes, 41 website pages). */
export const STATE_TREE_MAX_BYTES = 658

/** Website folders holding a `[slug]` route, which stateTreeFor cannot build. */
export const DYNAMIC_SEGMENT_PARENTS = Object.freeze(['case-studies', 'journal'])

const NEVER_KEPT_TAP_HEADERS = ['next-action', 'range', 'next-hmr-refresh', 'x-middleware-prefetch']
const CODE_LENGTH = 16
const ERROR_ROW = /(?:^|\n)[0-9a-f]+:E\{/

/** Next's own reading of the prefetch header: only '1', '2' or '3' count. */
const prefetchValue = (value) =>
  value === '1' || value === '2' || value === '3' ? value : undefined
const present = (value) => (value === null || value === undefined ? undefined : value)

/** Next.js 16.4.3's `_rsc` code for these header values ('' when none is sent). */
export async function rscCode({ prefetch, segmentPrefetch, stateTree, nextUrl } = {}) {
  if (
    (prefetch === undefined || prefetch === '0') &&
    [segmentPrefetch, stateTree, nextUrl].every((v) => v === undefined)
  ) {
    return ''
  }
  const input = [prefetch ?? '0', segmentPrefetch ?? '0', stateTree ?? '0', nextUrl ?? '0'].join(
    ',',
  )
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  let binary = ''
  for (const byte of new Uint8Array(digest).subarray(0, 12)) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function codeInputs(headers, { withNextUrl }) {
  return {
    prefetch: prefetchValue(present(headers.get('next-router-prefetch'))),
    segmentPrefetch: present(headers.get('next-router-segment-prefetch')),
    stateTree: present(headers.get('next-router-state-tree')),
    nextUrl: withNextUrl ? present(headers.get('next-url')) : undefined,
  }
}

/** Is this a tap whose answer may come from, and go into, the store? */
export async function keepableTapRequest(request) {
  if (request.method !== 'GET') return false
  const url = new URL(request.url)
  if (url.hostname !== SITE_HOST || NEVER_KEPT_PATHS.test(url.pathname)) return false
  if ([...url.searchParams.keys()].join(',') !== '_rsc') return false
  const { headers } = request
  if (headers.get('rsc') !== '1') return false
  if (NEVER_KEPT_TAP_HEADERS.some((name) => headers.has(name))) return false
  if (SIGNED_IN_OR_DRAFT.test(headers.get('cookie') ?? '')) return false
  if ((headers.get('next-router-state-tree') ?? '').length > STATE_TREE_MAX_BYTES) return false
  const code = url.searchParams.get('_rsc') ?? ''
  if (code.length !== CODE_LENGTH) return false
  return code === (await rscCode(codeInputs(headers, { withNextUrl: true })))
}

/**
 * The request a kept tap is drawn from: the address with a code recomputed for the headers it
 * carries, KEPT_RENDER_HEADERS, and the router headers that shape the answer. Never `next-url`,
 * a cookie or anything else the visitor sent.
 */
export async function tapDrawRequest(request, cf) {
  const headers = { ...KEPT_RENDER_HEADERS }
  for (const name of TAP_HEADERS) {
    const value = request.headers.get(name)
    if (value !== null) headers[name] = value
  }
  const url = new URL(request.url)
  url.search = ''
  url.searchParams.set('_rsc', await rscCode(codeInputs(request.headers, { withNextUrl: false })))
  const init = { method: 'GET', headers }
  return new Request(url, cf ? { ...init, cf } : init)
}

/** The shared store's key for a drawing: like pageCache.mjs keptStoreKey, with the code. */
export async function keptTapStoreKey(drawUrl, deployVersion, kv) {
  const [mode, content] = await Promise.all([
    kv.get(STORE_MODE_KEY, { cacheTtl: VERSION_CACHE_SECONDS }).catch(() => null),
    kv.get(CONTENT_VERSION_KEY, { cacheTtl: VERSION_CACHE_SECONDS }),
  ])
  const { hostname, pathname, searchParams } = new URL(drawUrl)
  const deploy = encodeURIComponent(deployVersion)
  const version = encodeURIComponent(mode === VERSIONED_MODE ? (content ?? 'none') : 'live')
  return `/__kept-rsc/${hostname}/${deploy}/${version}${pathname}?_rsc=${searchParams.get('_rsc') ?? ''}`
}

/** May this tap answer be kept? Only whole tap data, with no error row in it. */
export function keepableTapAnswer(response, text) {
  if (response.status !== 200) return false
  if (!(response.headers.get('content-type') ?? '').startsWith('text/x-component')) return false
  if (response.headers.has('set-cookie')) return false
  if ((response.headers.get('vary') ?? '').includes('*')) return false
  if ((response.headers.get('content-encoding') ?? 'identity').toLowerCase() !== 'identity')
    return false
  return !ERROR_ROW.test(text)
}

/** A kept tap copy's headers: the pages' lifetime and tag, and the router Vary for the store. */
export function keptTapHeaders(headers) {
  const own = new Headers(headers).get('vary')
  const out = keptHeaders(headers, Date.now(), KEPT_TAGS.pages)
  if (own) out.set(BROWSER_VARY, own)
  out.set('vary', TAP_VARY)
  return out
}

/** A kept tap copy's headers, made the site's answer again. */
export function servedTapHeaders(headers) {
  const out = servedHeaders(headers)
  out.delete('vary')
  const own = out.get(BROWSER_VARY)
  if (own) out.set('vary', own)
  out.delete(BROWSER_VARY)
  return out
}

/** Is the tap store switched on? Only the KV value 'off' turns it off; a failed read leaves it on. */
export async function tapStoreOn(kv) {
  const value = await kv.get(RSC_STORE_KEY, { cacheTtl: VERSION_CACHE_SECONDS }).catch(() => null)
  return value !== 'off'
}

/**
 * The `next-router-state-tree` a settled tap from `fromPathname` to `pathname` sends (URL-encoded,
 * as the browser sends it), or null for a dynamic route. Captured shape, 27 Oct: the route under
 * `(frontend)`, with `refetch` on the first segment the two pages do not share (on `__PAGE__`
 * when the destination is the start page's ancestor). src/tapStore.test.ts pins four real taps;
 * e2e/tapTree.spec.ts holds it to Chromium's own headers.
 */
export function stateTreeFor(pathname, fromPathname = '/') {
  return routerTree(pathname, fromPathname, (segment) => segment)
}

/**
 * The `next-router-state-tree` a link sends when IntentLink fetches its whole page on a hover, focus
 * or touch, or null for a dynamic route. Review of 27 Oct asked whether it matches a tap's, so that
 * a hover meets the copy the warm-ups keep: checked live that day, it does NOT. It is the tap's tree
 * with each of the page's segments ending at its last non-empty value (no trailing `null` or `0`),
 * the same from /faq, /products or a sibling page, so it too is one key per destination and start,
 * and the warm-ups keep both (scripts/warm-shared-store.mjs warmTapTargets). Before that, every
 * hover in a fresh region was drawn: 3 of 3 in that check, while the taps were kept.
 */
export function intentTreeFor(pathname, fromPathname = '/') {
  return routerTree(pathname, fromPathname, (segment) => {
    const trimmed = [...segment]
    while (trimmed.length > 2 && (trimmed.at(-1) === null || trimmed.at(-1) === 0)) trimmed.pop()
    return trimmed
  })
}

/** The route under `(frontend)`, each page segment passed through `shape`, URL-encoded. */
function routerTree(pathname, fromPathname, shape) {
  const segments = pathname.split('/').filter(Boolean)
  if (segments.some((_, i) => i > 0 && DYNAMIC_SEGMENT_PARENTS.includes(segments[i - 1])))
    return null
  const from = fromPathname.split('/').filter(Boolean)
  let common = 0
  while (common < segments.length && segments[common] === from[common]) common++
  let child = shape(['__PAGE__', {}, null, common === segments.length ? 'refetch' : null, 0])
  for (let i = segments.length - 1; i >= 0; i--) {
    child = shape([segments[i], { children: child }, null, i === common ? 'refetch' : null, 0])
  }
  const root = [
    '',
    { children: ['(frontend)', { children: child }, null, null, 16] },
    null,
    null,
    16,
  ]
  return encodeURIComponent(JSON.stringify(root))
}
