import { formatPhoneForDisplay, normalizeWhatsAppNumber, POSTAL_ADDRESS } from '@run-apparel/shared'
import { CALL_NUMBER, LEGAL_NAME, PARENT_COMPANY } from './companyFacts'
import type { ProductCard, PublicSiteSettings } from './projectPublic'
import { SITE_NAME, SITE_ORIGIN, GARMENT_PAGES } from './seo'
import { bylineFor } from './bylines'
import { SHARE_IMAGE, shareCardFor, shareImageUrl } from './shareImages'

/**
 * JSON-LD builders for the public marketing site.
 *
 * WHY THIS MATTERS MORE HERE THAN ON A CONSUMER SITE. These pages exist to be found by
 * buyers and, increasingly, by AI search — and an AI reader takes a company's name,
 * location and contact details from structured data far more reliably than from prose.
 * The audit scored findability 5/10 with this missing entirely.
 *
 * PURE ON PURPOSE. Every function here takes plain data and returns a plain object, so
 * the shape can be unit-tested without a browser, a database or a render. The pages do
 * nothing but stringify the result.
 *
 * ⚠️ SCHEMA IS A CLAIM ABOUT A REAL BUSINESS. Everything below has to be true — the
 * address, the founding year, the contact route. Google treats structured data that
 * contradicts the visible page as a spam signal, so nothing is asserted here that the
 * page does not also say. The owner is the authority on whether these facts are
 * correct; see docs/OWNER-CHECKLIST.md.
 */

/**
 * The postal address lives in `@run-apparel/shared` (`company.ts`) since the viewer's
 * footer prints it too. Re-exported here so the pages and tests that import it from this
 * file keep working unchanged.
 */
export { formatAddress, POSTAL_ADDRESS } from '@run-apparel/shared'

/**
 * The company's other names, for both the Organization and the WebSite node: Google's
 * Organization guide asks for "the same name and alternateName that you're using for your site
 * name". The short form the pages print (CMS `companyName`) first, then the registered name;
 * neither is repeated, and neither is the site name itself.
 */
function alternateNames(settings: PublicSiteSettings): { alternateName?: string[] } {
  const names = [settings.companyName.trim(), LEGAL_NAME].filter(
    (name, index, all) => name !== '' && name !== SITE_NAME && all.indexOf(name) === index,
  )
  return names.length > 0 ? { alternateName: names } : {}
}

/**
 * The organisation itself — rendered on every page via the layout.
 *
 * `@id` is a stable identifier so the ItemList and ContactPage below can point at this
 * node rather than repeating it. Without it, each page declares an unrelated company
 * and a crawler has no reason to treat them as one entity.
 */
export function organizationJsonLd(settings: PublicSiteSettings) {
  /*
   * The company's other profiles, from the ONE list the footer prints ("Elsewhere"), so
   * the page and its structured data cannot name different places. Measured live
   * 2026-09-30: the footer linked LinkedIn and Instagram while `sameAs` held only
   * WhatsApp, and `sameAs` is how a search engine ties this site to those profiles.
   * `projectFooter` has already kept only `https://` addresses.
   *
   * ⚠️ NO `wa.me` LINK SINCE 2026-10-08. Google's Organization guide (updated 2026-09-08)
   * defines `sameAs` as "a page on another website with additional information about your
   * organization"; a WhatsApp chat link is a way to send a message, not such a page. The
   * number itself is in `telephone` below.
   */
  const sameAs: string[] = []
  for (const link of settings.footer.socialLinks) {
    if (!sameAs.includes(link.url)) sameAs.push(link.url)
  }

  /*
   * Both numbers the Contact page shows (owner, 2026-10-08): the WhatsApp one from the CMS and
   * the call line from `companyFacts.ts`. Only numbers a visitor can see — Google's policy
   * (updated 2026-07-10) is not to mark up what a visitor cannot.
   */
  const whatsapp = normalizeWhatsAppNumber(settings.whatsappNumber)
  const telephone = [
    ...(whatsapp ? [formatPhoneForDisplay(settings.whatsappNumber)] : []),
    CALL_NUMBER,
  ]

  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': `${SITE_ORIGIN}/#organization`,
    /*
     * The site's name, as Google's Organization guide asks ("use the same name and
     * alternateName that you're using for your site name"), the full registered name as
     * `legalName`, and the short form the pages print as `alternateName` (owner, 2026-10-08).
     */
    name: SITE_NAME,
    legalName: LEGAL_NAME,
    ...alternateNames(settings),
    url: SITE_ORIGIN,
    // The logo field is the owner's upload when set, and the shipped mark otherwise —
    // the same precedence the browser tab icon uses.
    logo: settings.logoUrl ? `${SITE_ORIGIN}${settings.logoUrl}` : `${SITE_ORIGIN}/icon.svg`,
    // The home page's share picture (polish X14): `og-default.png` showed the old address.
    image: shareImageUrl(shareCardFor('/'), SITE_ORIGIN),
    email: settings.email,
    telephone,
    address: {
      '@type': 'PostalAddress',
      streetAddress: POSTAL_ADDRESS.street,
      addressLocality: POSTAL_ADDRESS.locality,
      postalCode: POSTAL_ADDRESS.postalCode,
      addressCountry: POSTAL_ADDRESS.country,
    },
    /*
     * ⚠️ CONFIRMED FACTS ONLY, AND NO `foundingDate`. The owner's 1889 claim is a FAMILY
     * trade — "company names have changed over the years, the roots have not"
     * (2026-09-07) — so stamping 1889 as this legal entity's founding date would be a
     * false statement in machine-readable form, which is the one place a wrong claim
     * travels furthest. It is stated in prose on the home page, where it can be
     * qualified, and asserted nowhere a crawler will read it as a date.
     *
     * The rest are the owner's confirmed numbers of 2026-09-07 and exist here because
     * this is what an AI search answer is assembled from: a description that names the
     * capability, the markets served, and the size of the works.
     *
     * ⚠️ CORRECTED 2026-09-29. This said "Every garment ships with a 3D reference"; the owner
     * confirmed that day a 3D reference is available ON REQUEST, not part of every order. And
     * `areaServed` listed four regions until the owner said buyers "can be new and from
     * anywhere". `structuredData.test.ts` pins both.
     */
    description:
      'Private label apparel manufacturer in Sialkot, Pakistan. Team wear, active wear, ' +
      'casual wear, outerwear and sports accessories, made to order from 50 pieces per ' +
      'style, with capacity for 100,000 pieces a month. A 3D reference a customer can turn ' +
      'and inspect before a sample is cut is available on request.',
    numberOfEmployees: { '@type': 'QuantitativeValue', value: 200 },
    areaServed: 'Worldwide',
    // The parent company, as the site already states in words (CERTIFICATION, ABOUT). Google's
    // Organization guide (updated 2026-09-08) lists parentOrganization as a recommended property.
    parentOrganization: { '@type': 'Organization', name: PARENT_COMPANY },
    ...(sameAs.length > 0 ? { sameAs } : {}),
  }
}

/**
 * The website itself, on the home page only (audit FI-10).
 *
 * Search engines read a `WebSite` node on the home page when choosing the site name to show
 * in results; without one they guess from the title, which here carries a strapline as well
 * as the name. Measured live 2026-09-16: the site emitted Organization only. `publisher`
 * points at the Organization node by `@id` rather than declaring a second company.
 * No `SearchAction`: the site has no search.
 */
export function websiteJsonLd(settings: PublicSiteSettings) {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': `${SITE_ORIGIN}/#website`,
    // "RUN APPAREL", as the home page's <title> and og:site_name say it. Until 2026-10-08 this
    // was the CMS company name, "RUN APPAREL (PVT) LTD", so the three disagreed; Google's
    // site-name guide (updated 2025-12-10) reads them together and prefers the short name.
    name: SITE_NAME,
    ...alternateNames(settings),
    url: `${SITE_ORIGIN}/`,
    publisher: { '@id': `${SITE_ORIGIN}/#organization` },
  }
}

/**
 * The gallery, as an ordered list of garments.
 *
 * ⚠️ EACH ITEM'S URL POINTS AT THE VIEWER HOST, not at this one. That is where the
 * garment actually is; claiming these URLs on wear-run.help would advertise pages this
 * site does not serve. Same reason sitemap.ts lists three pages and no garments.
 *
 * Deliberately NOT `Product` schema. A Product without price or availability is an
 * incomplete claim, and this is a B2B reference catalogue with no prices anywhere — the
 * viewer's e2e suite asserts the absence of retail language. `ItemList` describes what
 * this page IS: a list of references.
 */
export function productListJsonLd(
  products: ProductCard[],
  name = 'RUN APPAREL 3D garment references',
) {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name,
    numberOfItems: products.length,
    itemListElement: products.map((product, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: product.productName,
      url: `${GARMENT_PAGES}/${product.slug}/${product.defaultColourSlug}`,
    })),
  }
}

/**
 * Where a buyer page sits in the site: Home, then the page (2026-09-30).
 *
 * Two levels, because that is the truth: the page is reached from the home page's family
 * cards, not from inside `/products`. A search result shows this trail in place of the raw
 * address.
 */
export function breadcrumbJsonLd(page: { title: string; path: string }) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE_ORIGIN}/` },
      { '@type': 'ListItem', position: 2, name: page.title, item: `${SITE_ORIGIN}${page.path}` },
    ],
  }
}

/** Where a guide sits: Home, then Guides, then the guide. */
export function guideBreadcrumbJsonLd(guide: { title: string; path: string }) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE_ORIGIN}/` },
      { '@type': 'ListItem', position: 2, name: 'Guides', item: `${SITE_ORIGIN}/guides` },
      { '@type': 'ListItem', position: 3, name: guide.title, item: `${SITE_ORIGIN}${guide.path}` },
    ],
  }
}

/**
 * A breadcrumb trail of any depth: Home, then each step; the last step is the page itself.
 * Replaces nothing: `breadcrumbJsonLd` and `guideBreadcrumbJsonLd` stay for the pages that use
 * them. The trail must match the visible breadcrumb on the page.
 */
export function breadcrumbTrailJsonLd(trail: ReadonlyArray<{ name: string; path: string }>) {
  const steps = [{ name: 'Home', path: '/' }, ...trail]
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: steps.map((step, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: step.name,
      item: step.path === '/' ? `${SITE_ORIGIN}/` : `${SITE_ORIGIN}${step.path}`,
    })),
  }
}

/**
 * The questions a buyer page answers, as data.
 *
 * ⚠️ ONLY QUESTIONS THE PAGE SHOWS, WORD FOR WORD. Google treats question data that the
 * visible page does not carry as spam, so the page and this block are built from the ONE
 * list (`familyPages.ts`) and cannot differ. It earns no special result box for a site like
 * this one (Google limited those in 2023); it is here because an AI answer is assembled
 * from exactly this shape.
 */
export function faqJsonLd(questions: ReadonlyArray<{ question: string; answer: string }>) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: questions.map((entry) => ({
      '@type': 'Question',
      name: entry.question,
      acceptedAnswer: { '@type': 'Answer', text: entry.answer },
    })),
  }
}

/** The Journal as a blog: its newest posts by address (PLAN.md E2). */
export function blogJsonLd(posts: ReadonlyArray<{ path: string; headline: string }>) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Blog',
    '@id': `${SITE_ORIGIN}/journal#blog`,
    name: 'RUN APPAREL Journal',
    url: `${SITE_ORIGIN}/journal`,
    publisher: { '@id': `${SITE_ORIGIN}/#organization` },
    blogPost: posts.map((post) => ({
      '@type': 'BlogPosting',
      headline: post.headline,
      url: `${SITE_ORIGIN}${post.path}`,
    })),
  }
}

type ArticleInput = {
  path: string
  headline: string
  description: string
  /** The share picture; null when the post has none a visitor can load, and then none is stated. */
  image: { url: string; width: number; height: number } | null
  datePublished: string
  dateModified: string
  author: { name: string; url?: string | null } | null
}

/**
 * One article's data (Google's Article guide, updated 2026-09-08: headline, image,
 * datePublished, dateModified, author with name and url). A piece with no named author is the
 * company's, by its `@id`, so it is not a second, unrelated company.
 */
function articleData(type: 'BlogPosting' | 'Article', article: ArticleInput) {
  const url = `${SITE_ORIGIN}${article.path}`
  return {
    '@context': 'https://schema.org',
    '@type': type,
    '@id': `${url}#article`,
    mainEntityOfPage: url,
    headline: article.headline,
    description: article.description,
    ...(article.image
      ? {
          image: [
            {
              '@type': 'ImageObject',
              url: article.image.url,
              width: article.image.width,
              height: article.image.height,
            },
          ],
        }
      : {}),
    datePublished: article.datePublished,
    dateModified: article.dateModified,
    author: article.author
      ? {
          '@type': 'Person',
          name: article.author.name,
          ...(article.author.url ? { url: article.author.url } : {}),
        }
      : {
          '@type': 'Organization',
          '@id': `${SITE_ORIGIN}/#organization`,
          // The Organization node's own name (2026-10-08): one `@id`, one name.
          name: SITE_NAME,
          url: SITE_ORIGIN,
        },
    publisher: { '@id': `${SITE_ORIGIN}/#organization` },
  }
}

/** One Journal post, part of the Journal's Blog node. */
export function blogPostingJsonLd(post: ArticleInput) {
  return { ...articleData('BlogPosting', post), isPartOf: { '@id': `${SITE_ORIGIN}/journal#blog` } }
}

/** One case study (Task 5.3): the post's shape as an `Article`, part of no blog. */
export function articleJsonLd(article: ArticleInput) {
  return articleData('Article', article)
}

/**
 * A buyer guide as an `Article` (findability audit, 2026-10-08), from the facts its byline prints
 * (`bylines.ts`): first published, last changed, and who wrote it. Google's Article guide (updated
 * 2026-09-08) puts only a name in `author.name` and a job in `jobTitle`; a byline that is a role
 * ("Merchandiser, RUN APPAREL") names no person, so that guide's author is the company itself.
 * The picture is the guide's own share card.
 */
export function guideArticleJsonLd(guide: { path: string; title: string; description: string }) {
  const byline = bylineFor(guide.path)
  return articleJsonLd({
    path: guide.path,
    headline: guide.title,
    description: guide.description,
    image: {
      url: shareImageUrl(shareCardFor(guide.path), SITE_ORIGIN),
      width: SHARE_IMAGE.width,
      height: SHARE_IMAGE.height,
    },
    datePublished: byline?.published ?? '',
    dateModified: byline?.changed.on ?? '',
    author: byline?.author.kind === 'person' ? { name: byline.author.name } : null,
  })
}

/**
 * The case-study hub once at least one is published (Part C): a CollectionPage of its articles.
 * With none, the hub carries `noindex` and no data at all (T5).
 */
export function caseStudiesJsonLd(studies: ReadonlyArray<{ path: string; headline: string }>) {
  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    '@id': `${SITE_ORIGIN}/case-studies#page`,
    url: `${SITE_ORIGIN}/case-studies`,
    name: 'Case studies',
    publisher: { '@id': `${SITE_ORIGIN}/#organization` },
    hasPart: studies.map((study) => ({
      '@type': 'Article',
      headline: study.headline,
      url: `${SITE_ORIGIN}${study.path}`,
    })),
  }
}

/** The contact page, tied back to the organisation node rather than redescribing it. */
export function contactPageJsonLd(settings: PublicSiteSettings) {
  return {
    '@context': 'https://schema.org',
    '@type': 'ContactPage',
    url: `${SITE_ORIGIN}/contact`,
    mainEntity: {
      '@id': `${SITE_ORIGIN}/#organization`,
      '@type': 'Organization',
      name: SITE_NAME,
      email: settings.email,
    },
  }
}

/**
 * The glossary as a defined-term set (schema.org `DefinedTermSet`, read 2026-10-07): each term
 * with its visible definition and its anchor on /glossary, linked back with `inDefinedTermSet`.
 * Built from the list the page draws, so the two cannot differ.
 */
export function definedTermSetJsonLd(
  set: { name: string; path: string },
  terms: ReadonlyArray<{ id: string; name: string; definition: string }>,
) {
  const url = `${SITE_ORIGIN}${set.path}`
  return {
    '@context': 'https://schema.org',
    '@type': 'DefinedTermSet',
    '@id': `${url}#terms`,
    name: set.name,
    url,
    hasDefinedTerm: terms.map((term) => ({
      '@type': 'DefinedTerm',
      '@id': `${url}#${term.id}`,
      name: term.name,
      description: term.definition,
      url: `${url}#${term.id}`,
      inDefinedTermSet: `${url}#terms`,
    })),
  }
}
