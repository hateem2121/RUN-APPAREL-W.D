import { getCloudflareContext } from '@opennextjs/cloudflare'
import type {
  CollectionAfterChangeHook,
  CollectionAfterDeleteHook,
  GlobalAfterChangeHook,
} from 'payload'
import { CONTENT_VERSION_KEY } from '../../pageCache.mjs'

/**
 * A save to anything the website shows (a product, a picture, the site settings) leaves every
 * kept page out of date. This writes a new content version, so the next visitor in each data
 * centre gets the page drawn again (pageCache.mjs, polish X15, 2026-10-04). Other data centres
 * see the new value through KV's 30-second read cache. Cloudflare allows up to 60 seconds,
 * the same delay the 60-second memory cache in content.ts already allowed.
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
export async function recordContentChange(): Promise<void> {
  try {
    const context = await getCloudflareContext({ async: true }).catch(() => null)
    const kv = (context?.env as { SITE_CACHE?: KVNamespace } | undefined)?.SITE_CACHE
    if (!kv) return
    const write = kv
      .put(CONTENT_VERSION_KEY, crypto.randomUUID())
      .catch((err: unknown) => console.error('[page-cache] could not record a save', err))
    if (context?.ctx) context.ctx.waitUntil(write)
    else await write
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
