import type { Metadata } from 'next'

/**
 * Canonical origin for the public site.
 *
 * ⚠️ NOT `viewer.wear-run.help`. That host serves the 3D reference and is reached from
 * printed QR tags; the marketing pages are a different surface and must not claim its
 * canonical URLs. Overridable so a preview deploy does not advertise production URLs
 * to crawlers — a wrong canonical is worse than none, because it points Google at a
 * page this deployment is not serving.
 */
export const SITE_ORIGIN = (process.env.NEXT_PUBLIC_SITE_ORIGIN ?? 'https://wear-run.help').replace(
  /\/$/,
  '',
)

/** Where a garment's 3D reference lives. Cards and CTAs link out to it. */
export const VIEWER_ORIGIN = (
  process.env.NEXT_PUBLIC_VIEWER_ORIGIN ?? 'https://viewer.wear-run.help'
).replace(/\/$/, '')

const SITE_NAME = 'RUN APPAREL'

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
    },
    twitter: { card: 'summary_large_image', title, description },
  }
}
