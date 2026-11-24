import { GARMENT_PATH_PREFIX, RU_GARMENT_PATH_PREFIX } from '@run-apparel/shared'
import type { Metadata } from 'next'
import { bylineFor } from './bylines'
import { GUIDES_INDEX } from './guides'
import { hasRussianTwin, type Locale, ruPath } from './locale'
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

/**
 * The Russian garment pages' folder, `<SITE_ORIGIN>/ru/products/<product>/<colour>` (owner,
 * 2026-11-16): the same Latin slugs, drawn by the viewer Worker like the English ones. A Russian
 * page's cards and links go here, so a buyer who reads Russian stays in Russian.
 */
export const GARMENT_PAGES_RU = `${SITE_ORIGIN}${RU_GARMENT_PATH_PREFIX}`

/** The garment folder for a page's language (absolute, no trailing slash). */
export function garmentPagesFor(locale: Locale = 'en'): string {
  return locale === 'ru' ? GARMENT_PAGES_RU : GARMENT_PAGES
}

/**
 * The site's name, as `og:site_name`, the home page's `<title>` and (since 2026-10-08) the
 * WebSite and Organization structured data all give it. Google's site-name guide (updated
 * 2025-12-10) reads those together and asks for one short, common name rather than "Ltd".
 */
export const SITE_NAME = 'RUN APPAREL'

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
 * The title a search result shows for a page: its `metaTitle` when it has one, else its `title`.
 *
 * ⚠️ TWO FIELDS, BECAUSE ONE NAME FEEDS FOUR PLACES. A hub's `title` is also its breadcrumb, its
 * footer link and its `llms.txt` line ("FAQ", "Policies"), where a long name crowds the row. The
 * site check of 2026-10-26 found eleven results reading only "FAQ | RUN APPAREL" and the like;
 * the owner approved a descriptive title for each that day, for the `<title>` alone.
 */
export function metaTitleOf(page: { readonly title: string; readonly metaTitle?: string }): string {
  return page.metaTitle ?? page.title
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
  locale = 'en',
}: {
  title: string
  description: string
  /** Root-relative, leading slash, e.g. `/products`. ALWAYS the English path, for both languages. */
  path: string
  /** `ru` for a page of the Russian section: its canonical becomes `/ru…` (lib/locale.ts). */
  locale?: Locale
}): Metadata {
  const at = (pagePath: string) => `${SITE_ORIGIN}${pagePath === '/' ? '' : pagePath}`
  const url = at(locale === 'ru' ? ruPath(path) : path)
  // The share picture is the English page's: one card per page type, whatever the language.
  const image = shareImage(path)
  /*
   * hreflang (Russian section, 2026-11-15). BOTH twins carry the same pair, as Google and Yandex
   * require: a one-way pair is ignored. `x-default` is English, the site's language for everyone
   * who is neither.
   */
  const languages = hasRussianTwin(path)
    ? { en: at(path), ru: at(ruPath(path)), 'x-default': at(path) }
    : undefined
  /*
   * A buyer guide is an Open Graph `article` (guides audit, 2026-11-24: all 60 guide pages said
   * `website`). ogp.me, read 2026-11-24: `article:published_time` is "when the article was first
   * published", `article:modified_time` "when the article was last changed", and
   * `article:author` a profile, so it is sent only for a named person, as that person's page here.
   * The dates are the byline's own (bylines.ts), the same ones the page prints and its JSON-LD
   * carries. Decided here, from the path, so no guide page can forget it.
   */
  const byline = path.startsWith(`${GUIDES_INDEX.path}/`) ? bylineFor(path) : undefined
  const kind = byline
    ? {
        type: 'article' as const,
        publishedTime: byline.published,
        modifiedTime: byline.changed.on,
        ...(byline.author.kind === 'person' ? { authors: [at(byline.author.path)] } : {}),
      }
    : { type: 'website' as const }
  return {
    title,
    description,
    alternates: languages ? { canonical: url, languages } : { canonical: url },
    openGraph: {
      ...kind,
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
      locale: locale === 'ru' ? 'ru_RU' : 'en_US',
      // The other language, where there is one (ogp.me: `og:locale:alternate`, "other locales this
      // page is available in"; the language audit of 2026-11-15 found it on no page).
      ...(languages ? { alternateLocale: locale === 'ru' ? 'en_US' : 'ru_RU' } : {}),
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

/**
 * A Journal post's or a case study's metadata (PLAN.md T8): `buildMetadata`'s canonical and
 * tags, as an Open Graph `article` with its published and modified times and author (Next's
 * generateMetadata docs, 16.4.0, updated 2026-08-19), sharing its OWN picture — at least
 * 1200 × 630, which the collection enforces — on X's large card. Pinterest's article pins and
 * LinkedIn's previews read exactly these. With no usable picture it keeps the page type's card.
 *
 * `feed` adds `<link rel="alternate" type="application/rss+xml">` (T9).
 */
export function buildArticleMetadata({
  title,
  description,
  path,
  image,
  publishedTime,
  modifiedTime,
  authors,
  feed,
}: {
  title: string
  description: string
  path: string
  image: { url: string; width: number; height: number; alt: string } | null
  publishedTime: string
  modifiedTime: string
  authors: string[]
  feed?: { title: string; path: string }
}): Metadata {
  const base = buildMetadata({ title, description, path })
  const picture = image ? { ...image } : base.openGraph?.images
  return {
    ...base,
    alternates: {
      ...base.alternates,
      ...(feed
        ? {
            types: {
              'application/rss+xml': [{ url: `${SITE_ORIGIN}${feed.path}`, title: feed.title }],
            },
          }
        : {}),
    },
    openGraph: {
      ...base.openGraph,
      type: 'article',
      publishedTime,
      modifiedTime,
      authors,
      images: Array.isArray(picture) ? picture : picture ? [picture] : [],
    },
    twitter: {
      ...base.twitter,
      card: 'summary_large_image',
      ...(image ? { images: [{ url: image.url, alt: image.alt }] } : {}),
    },
  }
}

/**
 * The feed link alone, for a page that is not an article (the Journal hub): the same
 * `alternates.types` entry `buildArticleMetadata` adds.
 */
export function withFeed(metadata: Metadata, feed: { title: string; path: string }): Metadata {
  return {
    ...metadata,
    alternates: {
      ...metadata.alternates,
      types: { 'application/rss+xml': [{ url: `${SITE_ORIGIN}${feed.path}`, title: feed.title }] },
    },
  }
}
