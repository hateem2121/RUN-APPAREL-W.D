/**
 * One automatic reload when a code chunk this page needs has been deleted by a deploy.
 *
 * ⚠️ WHAT A DEPLOY DOES TO A PAGE THAT IS ALREADY OPEN. Every chunk name carries its
 * content hash (`model-viewer-CV8RhnCr.js`), and Workers Static Assets keeps only the
 * CURRENT deploy's files. A page from the previous deploy asks for the old name, and the
 * SPA fallback answers with index.html — `200 text/html`, not a 404 (measured live
 * 2026-10-21) — which the browser refuses to run as a module, so `import()` rejects.
 * Vite's guide says the same ("Load Error Handling": "the hosting service may delete the
 * assets from previous deployments") and suggests a reload.
 *
 * Measured, not supposed:
 *   - 2026-10-21 10:10:30Z: `module-load-failed` / `model-viewer` 65 s after the viewer
 *     deploy finished, and the owner saw "The 3D view is not available" on rxps/wine. A
 *     reload drew the garment.
 *   - 2026-10-03 09:48:20Z: Sentry VIEWER-D, HdImageDialog's chunk, 5.5 min after a deploy
 *     that changed only agent tools. EVERY deploy of `main` replaces the viewer's files.
 *   - Planted locally (chunk hidden on the fixture server): the exact notice; restored, 3D.
 *
 * A retry of `import()` alone cannot cure it: this page only knows the OLD chunk name, which
 * no longer exists anywhere — and until 2026-10-21 the service worker stored the HTML answer
 * under that name too (scripts/sw.mjs). Only the reloaded page asks for the NEW names.
 * Navigations are network-first in the service worker, so the reload gets the current page.
 *
 * ⚠️ ONCE, NOT "UNTIL IT WORKS". A chunk that is missing for any other reason would turn a
 * retry loop into a page that never stops reloading. The time of the reload is kept in
 * sessionStorage (it survives the reload, and only in this tab); a second failure inside
 * RELOAD_GUARD_MS shows the ordinary fallback. Where storage throws (some private
 * windows) nothing is reloaded at all: no record, no proof there is no loop.
 */
import { diagnostic } from './diagnostic'

export const RELOAD_GUARD_MS = 5 * 60_000
const KEY = 'run:stale-chunk-reload'

/**
 * Set once a reload has started in THIS document. One page can report the failure twice —
 * Stage.tsx's import effect re-runs whenever `glbUrl` changes, and each run imports again —
 * and without this the second call would read the first one's fresh timestamp as "already
 * reloaded" and paint the fallback while the page unloads.
 *
 * ⚠️ WHICH PIECES RELOAD BY THEMSELVES (owner, 2026-10-22): the 3D library, and the BACKGROUND
 * pieces nobody tapped for — the footer's tab and question (`Footer.tsx`), the related garments'
 * cards (`RelatedGarments.tsx`) and the polish layer (`App.tsx`, `polish/index.ts`). They share
 * this ONE guard through `reloadOnChunkFailure`, so two pieces failing in one page-load cost one
 * reload, not two. The FULL-SCREEN VIEW DOES NOT: its failure shows a note with "Reload Page" and
 * leaves the garment in place (owner-approved 2026-10-14, e2e/hd-image.spec.ts), and a reload
 * under a visitor's tap would undo that. Hence no page-wide `vite:preloadError` listener.
 *
 * Why the footer and the rest were added: until then a missing FooterPrompt chunk threw out of
 * `lazy()` into the page-wide ErrorBoundary and replaced the whole garment page with "This page
 * ran into a problem" (the footer sits on every garment page), while a missing polish chunk left
 * the page quietly without its motion until the visitor reloaded by hand.
 */
let reloading = false

/**
 * ⚠️ A PAGE ON ITS WAY OUT CANCELS ITS OWN DOWNLOADS, AND THAT LOOKS EXACTLY LIKE A STALE
 * CHUNK. Leave a garment page while the library is still arriving and the browser aborts the
 * import; the first version of this file read that as a deleted chunk and reloaded — taking
 * the visitor back to the page they had just left. The e2e suite caught it on 2026-10-21
 * ("Navigation … is interrupted by another navigation", WebKit and Firefox, 7 tests).
 * `beforeunload` fires when a navigation starts, before the old document's loads are
 * cancelled; `pagehide` is the backstop for a document that skips it.
 */
let leaving = false
if (typeof window !== 'undefined') {
  const markLeaving = () => {
    leaving = true
  }
  window.addEventListener('beforeunload', markLeaving)
  window.addEventListener('pagehide', markLeaving)
  // Back from the back/forward cache, the page is live again (web.dev "bfcache", updated
  // 2026-10-16: `persisted` is true only for that restore; a `beforeunload` listener no
  // longer makes a page ineligible for it).
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) leaving = false
  })
}

/** Tests only: a fresh document. */
export function resetStaleChunkReload(): void {
  reloading = false
  leaving = false
}

/**
 * `reloaded` and `leaving`: the page is going away, so the caller does nothing more. Otherwise
 * the caller shows its fallback, and says which.
 */
export type StaleChunkOutcome =
  | 'reloaded'
  | 'leaving'
  | 'already-reloaded'
  | 'offline'
  | 'no-storage'

export interface StaleChunkDeps {
  storage?: Pick<Storage, 'getItem' | 'setItem'>
  now?: () => number
  online?: () => boolean
  reload?: () => void
}

export function reloadForStaleChunk(
  chunk: string,
  detail: Record<string, string> = {},
  deps: StaleChunkDeps = {},
): StaleChunkOutcome {
  if (reloading) return 'reloaded'
  if (leaving) return 'leaving'
  const now = deps.now ?? Date.now
  // Offline, a reload would trade this page — its picture, specs and contact buttons —
  // for the service worker's offline document. The chunk is not the problem then.
  const online = deps.online ?? (() => navigator.onLine !== false)
  if (!online()) return 'offline'
  try {
    const storage = deps.storage ?? window.sessionStorage
    const last = Number(storage.getItem(KEY))
    if (Number.isFinite(last) && last > 0 && now() - last < RELOAD_GUARD_MS) {
      return 'already-reloaded'
    }
    storage.setItem(KEY, String(now()))
  } catch {
    return 'no-storage'
  }
  // Queued now, sent by telemetry.ts's `pagehide` flush as the page unloads.
  diagnostic('stale-chunk-reload', { ...detail, reason: chunk })
  reloading = true
  ;(deps.reload ?? (() => window.location.reload()))()
  return 'reloaded'
}

/**
 * Waits for a chunk's `import()` and, if it FAILS, asks for the one automatic reload before
 * passing the failure on unchanged. The caller still decides what its own page shows meanwhile
 * (nothing, for a background piece), so a refused reload — guard hit, offline, no storage — fails
 * quietly exactly as before: never a loop.
 *
 * Wrap only the `import()` promise, never a `.then` that runs the loaded module: an error thrown
 * by the piece's own code is not a missing chunk and must not cost a reload.
 */
export function reloadOnChunkFailure<T>(
  chunk: string,
  loading: Promise<T>,
  deps: StaleChunkDeps = {},
): Promise<T> {
  return loading.catch((error: unknown) => {
    reloadForStaleChunk(chunk, {}, deps)
    throw error
  })
}
