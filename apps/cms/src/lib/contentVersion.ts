import { getCloudflareContext } from '@opennextjs/cloudflare'
import type {
  CollectionAfterChangeHook,
  CollectionAfterDeleteHook,
  GlobalAfterChangeHook,
} from 'payload'
import { CONTENT_VERSION_KEY, KEPT_TAGS } from '../../pageCache.mjs'

/**
 * A save to anything the website shows (a product, a picture, the site settings) leaves every
 * kept page and every kept garment answer out of date. Since 2026-10-25 this marks them stale
 * in the shared store (SitePages.invalidateKept in worker.mjs, both tags), so each is served once
 * more while its new copy is drawn, instead of every region's next visitor waiting (pageCache.mjs
 * has the measurements). It still writes a new content version too: that is what the store's off
 * switch keys copies by (STORE_MODE_KEY = 'versioned'), and other data centres see it through
 * KV's 30-second read cache.
 *
 * A random value, never a clock reading: two saves in the same millisecond (the robot writes
 * in quick runs) would otherwise share a version, and a page drawn between them would be kept
 * without the second save.
 *
 * ⚠️ BEST-EFFORT, NEVER IN THE SAVE'S WAY. A save refused because the cache could not be told
 * is worse than a page a day old, which is all PAGE_CACHE_SECONDS lets through. The write
 * runs after the response (`waitUntil`), so a save is not slowed either. Without the binding
 * (tests, `next dev`, a preview with no KV) it does nothing.
 */
/** A page store's own entrypoint (worker.mjs SitePages), reached over RPC. */
type PageStore = { invalidateKept: (tags: string[]) => Promise<boolean> }

/** The part of the Worker's context this needs: this Worker's own SitePages entrypoint. */
type SitePagesContext = { exports?: { SitePages?: PageStore } }

/**
 * ⚠️ TWO WORKERS KEEP PAGES, AND EACH STORE CAN ONLY BE MARKED STALE FROM INSIDE ITSELF (the admin
 * split, 22 Nov 2026). The saves happen in the CMS Worker; the pages of wear-run.com are kept by
 * the site-only Worker (wrangler.site.jsonc). Cloudflare scopes `invalidate()` to the Worker and
 * entrypoint that call it (Workers Cache, "Purge", read 22 Nov 2026), so a save that told only
 * this Worker's store would leave every visitor on the old page for up to a day
 * (PAGE_CACHE_SECONDS). `SITE_ONLY_PAGES` (wrangler.jsonc) is that Worker's SitePages entrypoint:
 * its `invalidateKept` runs there. Absent (tests, a preview, the site-only Worker itself, which
 * saves nothing a page shows) it is skipped. contentVersion.test.ts fails if this call is removed.
 */
type StoreBindings = { SITE_CACHE?: KVNamespace; SITE_ONLY_PAGES?: PageStore }

/** Tell one store, and never let its failure reach the save or the other store. */
function markStale(store: PageStore | undefined, tags: string[], which: string): Promise<unknown> {
  // Inside an async function, so even a stub that throws at once becomes a logged rejection.
  return (async () => store?.invalidateKept(tags))().catch((err: unknown) =>
    console.error(`[page-cache] could not mark ${which} kept copies stale`, err),
  )
}

export async function recordContentChange(): Promise<void> {
  try {
    const context = await getCloudflareContext({ async: true }).catch(() => null)
    const env = context?.env as StoreBindings | undefined
    const kv = env?.SITE_CACHE
    if (!kv) return
    const write = kv
      .put(CONTENT_VERSION_KEY, crypto.randomUUID())
      .catch((err: unknown) => console.error('[page-cache] could not record a save', err))
    // The store's own entrypoint, the one place Workers Cache lets the copies be marked stale.
    const store = (context?.ctx as SitePagesContext | undefined)?.exports?.SitePages
    const stale = markStale(store, [KEPT_TAGS.pages, KEPT_TAGS.garmentData], 'the')
    // The site-only Worker's store keeps pages only; the garment data is kept here.
    const staleSite = markStale(env?.SITE_ONLY_PAGES, [KEPT_TAGS.pages], "the site-only Worker's")
    const both = Promise.all([write, stale, staleSite])
    if (context?.ctx) context.ctx.waitUntil(both)
    else await both
  } catch (err) {
    console.error('[page-cache] could not record a save', err)
  }
}

/** For Products and Media: a change made the kept pages stale. Returns the document as it was. */
export const keptPagesAfterChange: CollectionAfterChangeHook = async ({ doc }) => {
  await recordContentChange()
  return doc
}

/** For Products and Media: a deletion made the kept pages stale. */
export const keptPagesAfterDelete: CollectionAfterDeleteHook = async ({ doc }) => {
  await recordContentChange()
  return doc
}

/** For the site settings global. */
export const keptPagesAfterGlobalChange: GlobalAfterChangeHook = async ({ doc }) => {
  await recordContentChange()
  return doc
}
