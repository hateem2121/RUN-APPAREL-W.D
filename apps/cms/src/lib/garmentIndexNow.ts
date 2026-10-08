import { buildViewerPath, GARMENT_PATH_PREFIX } from '@run-apparel/shared'
import type { CollectionAfterChangeHook } from 'payload'
import { isAddressableColourway } from './colourwayAccess'
import { pingIndexNowFromLiveAdmin } from './journalHooks'
import { SITE_ORIGIN } from './seo'

/**
 * Tell Bing and the other IndexNow engines when a garment changes (findability audit,
 * 2026-10-08, plan item N). A Journal post already does this on publish (`journalHooks.ts`); a
 * garment's pages changed only on the next deploy's commit-based ping
 * (`scripts/indexnow-paths.mjs`), which never sees a CMS save.
 *
 * WHICH ADDRESSES: every colour page of the garment (each its own canonical page) and /products,
 * whose card shows its name and picture. IndexNow takes added, updated AND removed addresses
 * (indexnow.org/documentation), so a garment taken off the site sends the pages that just went,
 * and a search engine learns of the 404 now instead of at its next visit.
 */
type Doc = Record<string, unknown>

const isLive = (doc: Doc | undefined) => doc?.status === 'published'

/** The addresses a save changed; none for a garment that was never live and is not now. */
export function garmentIndexNowUrls(
  doc: Doc,
  previousDoc: Doc | undefined,
  origin: string,
): string[] {
  // On an unpublish, the pages that just went away: the previous version still names them.
  const source = isLive(doc) ? doc : isLive(previousDoc) ? previousDoc : null
  const slug = typeof source?.slug === 'string' ? source.slug.trim() : ''
  if (!source || !slug) return []
  const colours = (Array.isArray(source.colourways) ? source.colourways : []).filter(
    (colour): colour is Doc =>
      !!colour && typeof colour === 'object' && isAddressableColourway(colour as Doc),
  )
  if (colours.length === 0) return []
  return [
    ...colours.map(
      (colour) => `${origin}${buildViewerPath(slug, String(colour.slug), GARMENT_PATH_PREFIX)}`,
    ),
    `${origin}${GARMENT_PATH_PREFIX}`,
  ]
}

export const pingIndexNowForGarment: CollectionAfterChangeHook = async ({
  doc,
  previousDoc,
  req,
}) => {
  await pingIndexNowFromLiveAdmin(
    garmentIndexNowUrls(doc as Doc, previousDoc as Doc | undefined, SITE_ORIGIN),
    req,
    'garment',
  )
  return doc
}
