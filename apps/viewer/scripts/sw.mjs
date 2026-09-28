/**
 * Build the offline shell service worker.
 *
 * Scope and the four reasons the garments are NOT in it: `docs/DECISION-OFFLINE-SCOPE.md`.
 * The short version is that a service worker only helps a SECOND visit, and every
 * visit here begins with a QR tag scanned off a physical garment.
 *
 * ⚠️ THE ONE THING THAT MUST NOT CHANGE: navigations are NETWORK-FIRST.
 *
 * Reason 4 of that decision record is the trap. `shouldReturnNotFound()` in
 * `apps/viewer/worker/notFound.ts` and the `no-transform` handling both live in the
 * Cloudflare Worker. A service worker that answered a navigation from cache would
 * return 200 without ever reaching the edge — silently undoing the 404 semantics
 * fixed on 2026-09-04, for humans only, since crawlers run no service worker. So the
 * cache is a FALLBACK for when the network fails, never a first choice. A
 * cache-first navigation would be faster, would pass every test that measures speed,
 * and would be wrong.
 *
 * ⚠️ THE GENERATED SOURCE CONTAINS NO BACKTICKS, DELIBERATELY.
 * It is emitted from a template literal here, so one backtick inside it ends the
 * literal early and the failure names something else entirely — the exact defect
 * recorded against `tools/asset-pipeline/src/review-server.ts` in that package's
 * CLAUDE.md, which cost two cycles. `swSourceHasNoBacktick()` below is asserted by
 * the test rather than left to review.
 */
import { createHash } from 'node:crypto'

/** Cache name prefix. Every other cache is deleted on activate, so this is the key. */
export const CACHE_PREFIX = 'run-shell-'

/**
 * Same-origin paths served immutably that are NOT content-hashed.
 *
 * They are pinned by VERSION rather than by filename — `dist/_headers` says the same
 * thing about their `immutable` — so a bump changes the bytes at an unchanged URL.
 * That is why `serviceWorkerVersion()` hashes their CONTENT and not just their names.
 */
export const UNHASHED_SHELL = ['/meshopt_decoder.js', '/env/studio-soft.hdr']

/**
 * Walk the entry chunk's STATIC import closure.
 *
 * Static only — `dynamicImports` is deliberately not followed. model-viewer is 1.0 MB
 * and reaches the browser through `await import()` in `Stage.tsx` precisely so a
 * visitor who never renders 3D never pays for it; precaching it here would defeat
 * that from a different direction, the same way a static import of one 700-byte
 * helper once dragged 287 KB of three.js onto the critical path (apps/viewer/CLAUDE.md).
 *
 * An offline visitor cannot fetch the payload from `cms.wear-run.help` anyway, so
 * they reach the branded unavailable state — which needs React and the stylesheet,
 * and nothing else.
 *
 * @param {Record<string, {type: string, isEntry?: boolean, fileName: string, imports?: string[], viteMetadata?: {importedCss?: Set<string>}}>} bundle
 * @returns {string[]} absolute paths, sorted, deduplicated
 */
export function shellFromBundle(bundle) {
  const entry = Object.values(bundle).find((item) => item.type === 'chunk' && item.isEntry)
  if (!entry) throw new Error('sw: no entry chunk in the bundle')

  const seen = new Set()
  const queue = [entry.fileName]
  while (queue.length > 0) {
    const fileName = queue.shift()
    if (!fileName || seen.has(fileName)) continue
    seen.add(fileName)
    const chunk = bundle[fileName]
    if (chunk?.type !== 'chunk') continue
    for (const imported of chunk.imports ?? []) queue.push(imported)
    // The stylesheet is not an "import" in rollup's graph; Vite records it here.
    for (const css of chunk.viteMetadata?.importedCss ?? []) seen.add(css)
  }

  // NO DOCUMENT. `/` was here until 2026-09-28, and on wear-run.com `/` is the WEBSITE's
  // home page — the offline fallback would have shown the wrong site. The offline page is
  // now the garment page the visitor opened, fetched at install (serviceWorkerSource).
  return [...UNHASHED_SHELL, ...[...seen].map((name) => `/${name}`)].sort()
}

/**
 * A version that changes when — and only when — the shell's BYTES change.
 *
 * Hashing the URL list alone would be wrong: two of the entries are not
 * content-hashed (see `UNHASHED_SHELL`), so a decoder bump would leave the version
 * identical, the service worker byte-identical, and therefore never re-installed.
 * The stale decoder would then be served from cache indefinitely — a cache that
 * cannot be invalidated is worse than no cache.
 *
 * @param {string[]} shell
 * @param {Record<string, string | Uint8Array>} contents keyed by shell path
 */
export function serviceWorkerVersion(shell, contents = {}) {
  const hash = createHash('sha256')
  for (const path of [...shell].sort()) {
    hash.update(path)
    const body = contents[path]
    if (body !== undefined) hash.update(body)
  }
  return hash.digest('hex').slice(0, 16)
}

/** The generated source must contain no backtick — see the file header. */
export function swSourceHasNoBacktick(source) {
  return !source.includes('`')
}

/**
 * @param {{ shell: string[], version: string }} options
 * @returns {string} the complete service worker source
 */
export function serviceWorkerSource({ shell, version }) {
  const list = shell.map((path) => JSON.stringify(path)).join(',\n  ')
  return `/* GENERATED by apps/viewer/scripts/sw.mjs — do not edit by hand. */
/* Scope, and why no garment is in here: docs/DECISION-OFFLINE-SCOPE.md */
const VERSION = ${JSON.stringify(version)}
const CACHE = ${JSON.stringify(CACHE_PREFIX)} + VERSION
const SHELL = [
  ${list},
]

/* Same-origin prefixes that are safe to serve cache-first: every one is immutable,
   either by content hash (/assets/) or by version (the other two). */
const IMMUTABLE = ['/assets/', '/meshopt_decoder.js', '/env/']

/* The page shown when there is no signal: the garment page the visitor opened. Every
   garment page is the viewer's own index.html under its address, so it is a correct shell
   by construction. A fixed '/' was right while the viewer owned its whole host; on
   wear-run.com the scope is /products/ and '/' is the WEBSITE's home page (2026-09-28).
   Stored under one fixed key inside the scope; the key is never requested by anyone. */
const OFFLINE_DOCUMENT = new URL('__offline-document', self.registration.scope).href

function cacheOfflineDocument(cache) {
  return self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    .then((clients) => {
      const opened = clients.find((client) => client.url.startsWith(self.registration.scope))
      const scopePath = new URL(self.registration.scope).pathname
      /* Only the old viewer host, whose scope is the origin root, may fall back to '/':
         there it IS the viewer. */
      const source = opened ? opened.url : scopePath === '/' ? '/' : null
      if (!source) return undefined
      return fetch(source).then((response) => {
        /* A redirected or foreign response replayed for a navigation is refused by the
           browser, so only a plain same-origin 200 may become the offline page. */
        if (response.ok && response.type === 'basic' && !response.redirected) {
          return cache.put(OFFLINE_DOCUMENT, response)
        }
        return undefined
      })
    })
    /* Offline caching is an enhancement: a failure here must never fail the install. */
    .catch(() => undefined)
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL).then(() => cacheOfflineDocument(cache)))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => key.startsWith(${JSON.stringify(CACHE_PREFIX)}) && key !== CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  /* Cross-origin is never touched. The models on media.wear-run.help and the payload
     on cms.wear-run.help both land here, and neither may be cached — the first by
     decision, the second because a stale payload would show a garment that has since
     been unpublished. */
  if (url.origin !== self.location.origin) return

  /* Belt and braces on top of the origin test above. If a model is ever served
     same-origin, this is what stops 53.69 MB of precache appearing by accident. */
  if (url.pathname.endsWith('.glb')) return

  if (request.mode === 'navigate') {
    /* NETWORK-FIRST, and the comment in scripts/sw.mjs says why in full: answering a
       navigation from cache returns 200 and bypasses the Worker's 404 semantics. */
    event.respondWith(
      fetch(request).catch(() =>
        caches.match(OFFLINE_DOCUMENT, { cacheName: CACHE }).then((cached) => cached || Response.error()),
      ),
    )
    return
  }

  if (!IMMUTABLE.some((prefix) => url.pathname.startsWith(prefix))) return

  event.respondWith(
    caches.match(request, { cacheName: CACHE }).then((cached) => {
      if (cached) return cached
      return fetch(request).then((response) => {
        /* Only a real, complete, same-origin 200 is worth storing. An opaque or
           partial response cached here would be replayed forever as a broken asset. */
        if (response.ok && response.type === 'basic') {
          const copy = response.clone()
          caches.open(CACHE).then((cache) => cache.put(request, copy))
        }
        return response
      })
    }),
  )
})
`
}
