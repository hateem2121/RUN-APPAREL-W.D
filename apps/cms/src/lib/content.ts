import 'server-only'
import { reportCaught } from './reportCaught'
import config from '@payload-config'
import { getPayload } from 'payload'
import {
  FALLBACK_SITE_SETTINGS,
  type ProductCard,
  type PublicSiteSettings,
  mergeSiteSettings,
  toProductCard,
} from './projectPublic'

/**
 * Server-only content access for the PUBLIC marketing pages.
 *
 * This is a THIN I/O SHELL on purpose — every decision about what a buyer sees lives
 * in projectPublic.ts, which is pure and unit-tested. What is left here is the Payload
 * call and the failure policy, and both are deliberate:
 *
 * WHY EVERY READ IS WRAPPED. `resolveCloudflareEnv()` in payload.config.ts returns null
 * during `next build` — there are no D1/R2 bindings in the build phase — so any read
 * attempted then throws by design. Public pages are rendered dynamically
 * (`export const dynamic = 'force-dynamic'`), and these helpers swallow the throw on
 * top of that so a stray build-time probe can never fail the build.
 *
 * WHY IT FALLS BACK RATHER THAN 500s. A page whose job is to generate leads must still
 * show the company name, the email and the WhatsApp number when D1 is having a bad
 * minute. Measured 2026-09-04: with PAYLOAD_SECRET absent the pages still rendered
 * fully, with the defaults and an empty gallery, and logged the cause once per read.
 */

export type { ProductCard, PublicSiteSettings }

/**
 * A SHORT IN-PROCESS CACHE, and the honest limits of it.
 *
 * ⚠️ MEASURED IN THE REAL WORKERS RUNTIME, 2026-09-05: `/` answered in 9.8 ms, `/contact`
 * in 20.8 ms, and `/products` in **302 ms** — fifteen times slower, because it queries
 * D1 for every published product at depth 1 on every single request. The pages are
 * `force-dynamic` (they must be: no D1 binding exists during `next build`), and
 * `Cache-Control` is `no-store`, so nothing anywhere kept a copy.
 *
 * ⚠️ WHAT THIS IS NOT. It is not shared between Workers isolates and it is not cleared
 * when the CMS is saved, so a change can take up to TTL_MS to appear — the owner chose
 * this trade on 2026-09-05 over the alternative, which needed a new R2 bucket for
 * Next's incremental cache plus a tag table in the production database. That remains the
 * upgrade path if instant invalidation is ever wanted; nothing here blocks it.
 *
 * ⚠️ FAILURES ARE NEVER CACHED. Both readers below fall back to defaults when D1 is
 * unhappy, and caching that fallback would turn a bad second into a bad minute. Only a
 * successful read is stored.
 *
 * Public, non-personalised data only. Nothing user-specific passes through here, so
 * there is no risk of one visitor being served another's response.
 */
const TTL_MS = 60_000

type Cached<T> = { value: T; expires: number }

let settingsCache: Cached<PublicSiteSettings> | null = null
let productsCache: Cached<ProductCard[]> | null = null

/** Exported for the tests, which must not depend on wall-clock timing to prove a miss. */
export function __clearContentCache(): void {
  settingsCache = null
  productsCache = null
}

let cachedPayload: Awaited<ReturnType<typeof getPayload>> | null = null

async function client() {
  if (!cachedPayload) cachedPayload = await getPayload({ config })
  return cachedPayload
}

/** Site-wide settings, falling back to the shared defaults on any failure. */
export async function getSiteSettings(): Promise<PublicSiteSettings> {
  if (settingsCache && settingsCache.expires > Date.now()) return settingsCache.value
  try {
    const payload = await client()
    // depth 1 populates the `logo` upload; at depth 0 it is a bare row id.
    const doc = await payload.findGlobal({ slug: 'site-settings', depth: 1 })
    const value = mergeSiteSettings(doc as unknown as Record<string, unknown>)
    settingsCache = { value, expires: Date.now() + TTL_MS }
    return value
  } catch (err) {
    /*
     * ⚠️ REPORTED, NOT JUST LOGGED. This catch is deliberate — a D1 wobble degrades the
     * page to its defaults rather than showing a visitor an error — so the request
     * SUCCEEDS and Next's `onRequestError` never fires. Until 2026-09-07 the only trace
     * was this line, in a Worker log nobody reads (audit FA-P-04).
     *
     * The degraded state is indistinguishable from the healthy one: the page still
     * renders, with the shipped defaults, so a wrong email address would sit on the live
     * site looking entirely normal. Not awaited — a report must never slow or fail the
     * page it is reporting about.
     */
    void reportCaught('content.site-settings', err)
    console.error('[content] site-settings unavailable, using defaults:', err)
    return FALLBACK_SITE_SETTINGS
  }
}

/** Every product the viewer can actually serve, in the order the CMS orders them. */
export async function getProductCards(): Promise<ProductCard[]> {
  if (productsCache && productsCache.expires > Date.now()) return productsCache.value
  try {
    const payload = await client()
    const res = await payload.find({
      collection: 'products',
      where: { status: { equals: 'published' } },
      sort: 'sortOrder',
      limit: 200,
      // depth 1 populates posterFallback and each colourway's posterPreview. At depth
      // 0 they arrive as numeric IDs and every card would draw the placeholder.
      depth: 1,
    })
    const value = res.docs
      .map((doc) => toProductCard(doc as unknown as Record<string, unknown>))
      .filter((card): card is ProductCard => card !== null)
    productsCache = { value, expires: Date.now() + TTL_MS }
    return value
  } catch (err) {
    // Same reasoning as site-settings above: caught on purpose, so nothing else sees it.
    void reportCaught('content.products', err)
    console.error('[content] products unavailable:', err)
    return []
  }
}
