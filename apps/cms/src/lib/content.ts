import 'server-only'
import type { ViewerSiteSettings } from '@run-apparel/shared'
import { DEFAULT_SITE_SETTINGS } from '@run-apparel/shared'
import config from '@payload-config'
import { getPayload } from 'payload'
import { type ProductCard, mergeSiteSettings, toProductCard } from './projectPublic'

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

export type { ProductCard }

let cachedPayload: Awaited<ReturnType<typeof getPayload>> | null = null

async function client() {
  if (!cachedPayload) cachedPayload = await getPayload({ config })
  return cachedPayload
}

/** Site-wide settings, falling back to the shared defaults on any failure. */
export async function getSiteSettings(): Promise<ViewerSiteSettings> {
  try {
    const payload = await client()
    const doc = await payload.findGlobal({ slug: 'site-settings', depth: 0 })
    return mergeSiteSettings(doc as unknown as Record<string, unknown>)
  } catch (err) {
    console.error('[content] site-settings unavailable, using defaults:', err)
    return DEFAULT_SITE_SETTINGS
  }
}

/** Every product the viewer can actually serve, in the order the CMS orders them. */
export async function getProductCards(): Promise<ProductCard[]> {
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
    return res.docs
      .map((doc) => toProductCard(doc as unknown as Record<string, unknown>))
      .filter((card): card is ProductCard => card !== null)
  } catch (err) {
    console.error('[content] products unavailable:', err)
    return []
  }
}
