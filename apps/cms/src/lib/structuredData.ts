import { normalizeWhatsAppNumber, POSTAL_ADDRESS } from '@run-apparel/shared'
import type { ProductCard, PublicSiteSettings } from './projectPublic'
import { SITE_ORIGIN, GARMENT_PAGES } from './seo'

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
 * The organisation itself — rendered on every page via the layout.
 *
 * `@id` is a stable identifier so the ItemList and ContactPage below can point at this
 * node rather than repeating it. Without it, each page declares an unrelated company
 * and a crawler has no reason to treat them as one entity.
 */
export function organizationJsonLd(settings: PublicSiteSettings) {
  const sameAs: string[] = []
  const whatsapp = normalizeWhatsAppNumber(settings.whatsappNumber)
  if (whatsapp) sameAs.push(`https://wa.me/${whatsapp}`)
  /*
   * The company's other profiles, from the ONE list the footer prints ("Elsewhere"), so
   * the page and its structured data cannot name different places. Measured live
   * 2026-09-30: the footer linked LinkedIn and Instagram while `sameAs` held only
   * WhatsApp, and `sameAs` is how a search engine ties this site to those profiles.
   * `projectFooter` has already kept only `https://` addresses.
   */
  for (const link of settings.footer.socialLinks) {
    if (!sameAs.includes(link.url)) sameAs.push(link.url)
  }

  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': `${SITE_ORIGIN}/#organization`,
    name: settings.companyName,
    url: SITE_ORIGIN,
    // The logo field is the owner's upload when set, and the shipped mark otherwise —
    // the same precedence the browser tab icon uses.
    logo: settings.logoUrl ? `${SITE_ORIGIN}${settings.logoUrl}` : `${SITE_ORIGIN}/icon.svg`,
    image: `${SITE_ORIGIN}/og-default.png`,
    email: settings.email,
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
    name: settings.companyName,
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

/** The contact page, tied back to the organisation node rather than redescribing it. */
export function contactPageJsonLd(settings: PublicSiteSettings) {
  return {
    '@context': 'https://schema.org',
    '@type': 'ContactPage',
    url: `${SITE_ORIGIN}/contact`,
    mainEntity: {
      '@id': `${SITE_ORIGIN}/#organization`,
      '@type': 'Organization',
      name: settings.companyName,
      email: settings.email,
    },
  }
}
