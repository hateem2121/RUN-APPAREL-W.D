import { CASE_STUDIES_HUB, CASE_STUDIES_PATH } from './caseStudies'
import { CONTACT_HERO_PHOTO } from './factoryPhotos'
import { CAREERS_PAGE, COMMUNITY_PAGE } from './companyPages'
import { FAMILY_PAGES } from './familyPages'
import { GUIDES, GUIDES_INDEX } from './guides'
import { JOURNAL_HUB, JOURNAL_PATH } from './journal'
import { POLICIES, POLICIES_INDEX } from './policies'

/**
 * The picture a shared link shows, one per page type (polish X14; the owner's answer Q11 of
 * 2026-10-03: "fix the address, and one picture per page type").
 *
 * ⚠️ EVERY WEBSITE PAGE SHARED ONE PICTURE, AND IT SHOWED THE OLD ADDRESS. `og-default.png` was
 * made on 8 September, before the move to wear-run.com, and nobody remade it: all 17 website pages
 * sent WhatsApp, LinkedIn and email a card reading `wear-run.help` (audit, 3 October 2026). Now the
 * home page, /products, /contact, each category page, the guides index and each guide have their
 * own, and the two legal pages take the home page's. `og-default.png` stays where it is, unchanged:
 * links already shared, and the platforms' caches, point at it.
 *
 * ⚠️ COMMITTED FILES, NOT DRAWN PER REQUEST (ruling of 2026-10-05). Next's `ImageResponse` draws
 * cards on the server, but on this Worker it brings satori and resvg-wasm (734 KiB compressed by
 * opennextjs-cloudflare issue 1376, 1 September 2026), and a route file under `/products/` would
 * be handed to the viewer's Worker before Next sees it (`viewerForward.mjs`). These cards change
 * when a page's words do, so `scripts/gen-share-images.mjs` draws them from this file and they are
 * committed under `public/share/`, served as static files before the Worker runs.
 *
 * Every word on a card is the page's own (its label and headline), and every picture is a file
 * already in the repository: the garment posters in `apps/viewer/public/og/` and the contact
 * page's photo. `shareImages.test.ts` checks both, and the file sizes.
 */

export const SHARE_IMAGE = {
  width: 1200,
  height: 630,
  /** JPEG, not WebP: link previewers are not browsers (`.claude/rules/viewer-headers.md`). */
  type: 'image/jpeg',
  /** Under `public/`, so served at `/share/<file>`. Not `/og/`, which is the viewer's. */
  folder: '/share',
  /** The address printed on every card: the site's own since 2026-09-28. */
  host: 'wear-run.com',
} as const

/** A garment on a card: a poster in `apps/viewer/public/og/`, and its approved garment type. */
type ShareGarment = { poster: string; type: string }

export type ShareCard = {
  /** The file in `public/share/`. */
  file: string
  /** The page's mono label, brackets included. */
  label: string
  /** The page's headline, in two parts: plain, then the serif accent (empty when it has none). */
  heading: string
  accent: string
  /** What is drawn beside or behind the words. */
  picture:
    | { kind: 'words' }
    | { kind: 'garments'; garments: readonly ShareGarment[] }
    | { kind: 'photo'; photo: 'contact-hero' }
  /** `og:image:alt`: what is in the picture, not a caption (ogp.me). */
  alt: string
}

const BRAND = `RUN APPAREL, ${SHARE_IMAGE.host}.`

/** "A, B, C and D", in lower case, as the garment types read inside a sentence. */
const listOf = (garments: readonly ShareGarment[]) => {
  const names = garments.map((garment) => garment.type.toLowerCase())
  return names.length < 2
    ? names.join('')
    : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

const headline = (heading: string, accent: string) => (accent ? `${heading} ${accent}` : heading)

function wordsCard(file: string, label: string, heading: string, accent: string): ShareCard {
  return {
    file,
    label,
    heading,
    accent,
    picture: { kind: 'words' },
    alt: `${headline(heading, accent)} ${BRAND}`,
  }
}

function garmentsCard(
  file: string,
  label: string,
  heading: string,
  accent: string,
  garments: readonly ShareGarment[],
): ShareCard {
  return {
    file,
    label,
    heading,
    accent,
    picture: { kind: 'garments', garments },
    alt: `${headline(heading, accent)} Four garments from the catalogue: ${listOf(garments)}. ${BRAND}`,
  }
}

/**
 * Four garments per category page, all of that family (`scripts/catalogue-products.json`), each a
 * different garment, and none whose print carries another organisation's mark. The poster is the
 * garment's own card for link previews (`pnpm og:cards`), 1200x1500 on the paper ground.
 */
const FAMILY_GARMENTS: Record<string, readonly ShareGarment[]> = {
  'teamwear-uniforms': [
    { poster: 'r-vpj/purple', type: 'Soccer Jersey' },
    { poster: 'r-mrp/aqua', type: 'Tennis and Pickleball Shirt' },
    { poster: 'r-xmp/lavender', type: "Men's Cycling Bib Shorts" },
    { poster: 'r-bcd/denim', type: 'Tennis Bra and Skirt Set' },
  ],
  sportswear: [
    { poster: 'r-asb/petrol', type: 'High-Support Sports Bra' },
    { poster: 'r-hfj/aqua', type: "Men's Long-Sleeve Training Jersey" },
    { poster: 'r-prs/olive', type: 'Quarter-Zip Running Shirt' },
    { poster: 'r-ect/lilac', type: "Women's Crop Top and Shorts Set" },
  ],
  outerwear: [
    { poster: 'r-atw/bone', type: 'Sublimated Windbreaker Jacket' },
    { poster: 'r-kmj/orange', type: "Men's Softshell Jacket" },
    { poster: 'r-vcj/burgundy', type: "Men's Softshell Tech Jacket" },
    { poster: 'r-atj/ash', type: "Men's Leather Utility Jacket" },
  ],
  'casual-wear': [
    { poster: 'r-taz/charcoal', type: "Men's Half-Zip Polo Shirt" },
    { poster: 'r-csp/mauve', type: "Men's Half-Zip Fleece Pullover" },
    { poster: 'r-cch/powder-blue', type: "Women's Crop Hoodie" },
    { poster: 'r-et/sage', type: "Men's Tracksuit" },
  ],
}

/** The file a page's own card is written to: its address, with `-` for `/`. */
const fileFor = (path: string) => `${path === '/' ? 'home' : path.slice(1).replace(/\//g, '-')}.jpg`

/**
 * The home page keeps the words of the picture it replaces (approved 2026-09-05), so the owner's
 * answer, "fix the address", changes the address and nothing else on it.
 */
const HOME = wordsCard(
  fileFor('/'),
  '[ B2B apparel manufacturer · Sialkot, PK ]',
  'Made to order.',
  'Made properly.',
)

const PRODUCTS = garmentsCard(
  fileFor('/products'),
  '[ 3D product references ]',
  'Every garment,',
  'turnable.',
  // One from each family that has a page of its own, in the order of `FAMILIES`.
  [
    { poster: 'r-asb/blush', type: 'High-Support Sports Bra' },
    { poster: 'r-vpj/blue', type: 'Soccer Jersey' },
    { poster: 'r-cch/wine', type: "Women's Crop Hoodie" },
    { poster: 'r-kmj/lime', type: "Men's Softshell Jacket" },
  ],
)

const CONTACT: ShareCard = {
  file: fileFor('/contact'),
  label: '[ Contact ]',
  heading: 'Let’s talk production.',
  accent: '',
  // The contact page's own hero, the showroom (`CONTACT_HERO_PHOTO`).
  picture: { kind: 'photo', photo: 'contact-hero' },
  alt: `Let’s talk production. Behind the words, ${CONTACT_HERO_PHOTO.alt.charAt(0).toLowerCase()}${CONTACT_HERO_PHOTO.alt.slice(1)} ${SHARE_IMAGE.host}.`,
}

const CARDS: ReadonlyMap<string, ShareCard> = new Map([
  ['/', HOME],
  ['/products', PRODUCTS],
  ['/contact', CONTACT],
  ...FAMILY_PAGES.map(
    (page) =>
      [
        page.path,
        garmentsCard(
          fileFor(page.path),
          page.eyebrow,
          page.heading,
          page.headingAccent,
          FAMILY_GARMENTS[page.familySlug] ?? [],
        ),
      ] as const,
  ),
  [
    GUIDES_INDEX.path,
    wordsCard(
      fileFor(GUIDES_INDEX.path),
      '[ Buyer guides ]',
      GUIDES_INDEX.heading,
      GUIDES_INDEX.headingAccent,
    ),
  ],
  ...GUIDES.map(
    (guide) =>
      [
        guide.path,
        wordsCard(fileFor(guide.path), '[ Buyer guide ]', guide.heading, guide.headingAccent),
      ] as const,
  ),
  // The policies hub and each approved policy (2026-10-07), words from their own lists.
  [
    POLICIES_INDEX.path,
    wordsCard(
      fileFor(POLICIES_INDEX.path),
      '[ Policies ]',
      POLICIES_INDEX.heading,
      POLICIES_INDEX.headingAccent,
    ),
  ],
  ...POLICIES.map(
    (policy) =>
      [
        policy.path,
        wordsCard(fileFor(policy.path), '[ Policy ]', policy.heading, policy.headingAccent),
      ] as const,
  ),
  // The company pages (2026-10-07), words from their own lists.
  [
    CAREERS_PAGE.path,
    wordsCard(
      fileFor(CAREERS_PAGE.path),
      CAREERS_PAGE.eyebrow,
      CAREERS_PAGE.heading,
      CAREERS_PAGE.headingAccent,
    ),
  ],
  [
    COMMUNITY_PAGE.path,
    wordsCard(
      fileFor(COMMUNITY_PAGE.path),
      COMMUNITY_PAGE.eyebrow,
      COMMUNITY_PAGE.heading,
      COMMUNITY_PAGE.headingAccent,
    ),
  ],
  // The Journal's and the case studies' hubs (2026-10-07), from their own words. Each post and
  // case study shares its OWN picture, chosen in the CMS (`buildArticleMetadata`, T8).
  [
    JOURNAL_PATH,
    wordsCard(
      fileFor(JOURNAL_PATH),
      JOURNAL_HUB.eyebrow,
      JOURNAL_HUB.heading,
      JOURNAL_HUB.headingAccent,
    ),
  ],
  [
    CASE_STUDIES_PATH,
    wordsCard(
      fileFor(CASE_STUDIES_PATH),
      CASE_STUDIES_HUB.eyebrow,
      CASE_STUDIES_HUB.heading,
      CASE_STUDIES_HUB.headingAccent,
    ),
  ],
])

/** Every card the generator draws, once each. */
export const SHARE_CARDS: readonly ShareCard[] = [...new Set(CARDS.values())]

/** The card a page shares; a page with none of its own (privacy, terms) shares the home page's. */
export function shareCardFor(path: string): ShareCard {
  return CARDS.get(path) ?? HOME
}

/** The absolute address of a card's file on `origin`. */
export const shareImageUrl = (card: ShareCard, origin: string) =>
  `${origin}${SHARE_IMAGE.folder}/${card.file}`
