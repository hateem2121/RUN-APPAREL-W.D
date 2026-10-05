/**
 * The media bucket's two addresses, and which one a PUBLIC page must use.
 *
 * ⚠️ WHY TWO. The media host answers `Cross-Origin-Resource-Policy: same-site`, so a
 * browser shows a picture only to a page on the SAME registrable domain. Since the domain
 * move of 2026-09-28 the website and the garment pages are on wear-run.com, while the
 * admin stays on cms.wear-run.help — and wear-run.com and wear-run.help are different
 * sites. So the one R2 bucket (`run-apparel-viewer-media`) has an address on each domain
 * (owner decision that day), and each audience gets its own:
 *
 *   the admin  → media.wear-run.help  (Payload's own URL, from PUBLIC_MEDIA_BASE_URL)
 *   the public → media.wear-run.com   (this function, at the public projections)
 *
 * Flipping PUBLIC_MEDIA_BASE_URL instead would have blanked every thumbnail in the admin.
 * Payload builds each URL from the file name on every read (`generateFileURL`), so the
 * database holds nothing to rewrite.
 */
import { SITE_MEDIA_ORIGIN } from '@run-apparel/shared'

export const ADMIN_MEDIA_ORIGIN = 'https://media.wear-run.help'
/** Kept in packages/shared since polish S6: the garment pages' cards resize from it too. */
export { SITE_MEDIA_ORIGIN }

/** A media URL as a wear-run.com page must name it. Anything not on the admin host passes through. */
export function onSiteMedia(url: string): string {
  return url.startsWith(`${ADMIN_MEDIA_ORIGIN}/`)
    ? `${SITE_MEDIA_ORIGIN}${url.slice(ADMIN_MEDIA_ORIGIN.length)}`
    : url
}
