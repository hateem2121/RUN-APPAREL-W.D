import { GARMENT_PATH_PREFIX } from '@run-apparel/shared'
import type { Metadata } from 'next'
import { SHARE_IMAGE, shareCardFor, shareImageUrl } from './shareImages'

/**
 * Canonical origin for the public site — `wear-run.com` since the domain move of
 * 2026-09-28 (it was `wear-run.help`, which now forwards every path here).
 *
 * Overridable so a preview deploy does not advertise production URLs to crawlers — a
 * wrong canonical is worse than none, because it points Google at a page this deployment
 * is not serving.
 */
export const SITE_ORIGIN = (process.env.NEXT_PUBLIC_SITE_ORIGIN ?? 'https://wear-run.com').replace(
  /\/$/,
  '',
)

/**
 * Where the garment pages live: `<SITE_ORIGIN>/products/<product>/<colour>`, the address
 * printed on the QR tags since 2026-09-28. Cards and CTAs link here.
 *
 * ⚠️ IT WAS `viewer.wear-run.help` (a separate host, and `VIEWER_ORIGIN`) until the domain
 * move. The pages are still drawn by the viewer Worker — worker.mjs forwards them to it —
 * but they are pages of THIS site now, one folder below the /products listing.
 */
export const GARMENT_PAGES = `${SITE_ORIGIN}${GARMENT_PATH_PREFIX}`

const SITE_NAME = 'RUN APPAREL'

/**
 * The social preview card each page shares (polish X14): its page type's own, from
 * `shareImages.ts`.
 *
 * ⚠️ THE PAGES ONCE PROMISED A PICTURE AND DID NOT SUPPLY IT. `twitter.card` was set to
 * `summary_large_image` — an explicit undertaking to provide a large picture — with no
 * image anywhere in the metadata. Measured 2026-09-05: `og:image` and `twitter:image`
 * both absent from all three pages, so every link shared to WhatsApp, LinkedIn or
 * Slack rendered as a bare grey box. Promising a picture and omitting it is worse than
 * declaring `summary`.
 *
 * 1200x630 is the ratio every major platform crops to. The 1200x1500 garment posters in
 * `apps/viewer/public/og/` are portrait link-preview cards for individual colourways and
 * are NOT interchangeable with this. Until polish X14 every page named `og-default.png`,
 * which still showed the address of before the domain move; it stays in `public/`, unchanged,
 * for the links already shared. Regenerate the cards with
 * `apps/cms/scripts/gen-share-images.mjs` after a page's label or headline changes.
 */
function shareImage(path: string) {
  const card = shareCardFor(path)
  return {
    url: shareImageUrl(card, SITE_ORIGIN),
    width: SHARE_IMAGE.width,
    height: SHARE_IMAGE.height,
    alt: card.alt,
    type: SHARE_IMAGE.type,
  }
}

/**
 * Build page metadata with a canonical URL and matching social tags.
 *
 * WHY A HELPER RATHER THAN PER-PAGE OBJECTS. The viewer learned this the hard way: OG
 * tags that exist in one place and not another produce link previews that are right on
 * some pages and generic on others, and nothing fails. One builder means a new page
 * cannot forget the canonical, and `path` is the only thing a page has to get right.
 */
export function buildMetadata({
  title,
  description,
  path,
}: {
  title: string
  description: string
  /** Root-relative, leading slash, e.g. `/products`. */
  path: string
}): Metadata {
  const url = `${SITE_ORIGIN}${path === '/' ? '' : path}`
  const image = shareImage(path)
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: 'website',
      siteName: SITE_NAME,
      title,
      description,
      url,
      /*
       * ⚠️ `en_US`, AND `en_GB` WAS ACTIVELY WRONG RATHER THAN MERELY VAGUE (audit FA-Q-06).
       * The owner decided on AMERICAN spelling on 2026-09-04 — "colorway", "color",
       * "customization", "inquiry" — because colorway is the higher-volume search term in
       * the US and Canada, the largest target market. This tag told a crawler the opposite
       * of what the page says. `docs/CUSTOMISATION-COPY-2026-09-04.md` logged it as open;
       * the marketing site was built after and inherited the value rather than resolving it.
       */
      locale: 'en_US',
      images: [image],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [{ url: image.url, alt: image.alt }],
    },
  }
}
