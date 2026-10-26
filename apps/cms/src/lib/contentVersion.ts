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
/** The part of the Worker's context this needs: worker.mjs's SitePages entrypoint, over RPC. */
type SitePagesContext = {
  exports?: { SitePages?: { invalidateKept: (tags: string[]) => Promise<boolean> } }
}

export async function recordContentChange(): Promise<void> {
  try {
    const context = await getCloudflareContext({ async: true }).catch(() => null)
    const kv = (context?.env as { SITE_CACHE?: KVNamespace } | undefined)?.SITE_CACHE
    if (!kv) return
    const write = kv
      .put(CONTENT_VERSION_KEY, crypto.randomUUID())
      .catch((err: unknown) => console.error('[page-cache] could not record a save', err))
    // The store's own entrypoint, the one place Workers Cache lets the copies be marked stale.
    const store = (context?.ctx as SitePagesContext | undefined)?.exports?.SitePages
    // Inside an async function, so even a stub that throws at once becomes a logged rejection.
    const stale = (async () =>
      store?.invalidateKept([KEPT_TAGS.pages, KEPT_TAGS.garmentData]))().catch((err: unknown) =>
      console.error('[page-cache] could not mark the kept copies stale', err),
    )
    const both = Promise.all([write, stale])
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
