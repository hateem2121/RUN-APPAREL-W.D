import { ABOUT_PAGE, FACTORY_PAGE } from './aboutPages'
import { CASE_STUDIES_HUB, CASE_STUDIES_PATH } from './caseStudies'
import { CONTACT_HERO_PHOTO } from './factoryPhotos'
import { CAREERS_PAGE, COMMUNITY_PAGE, PRESS_PAGE } from './companyPages'
import { FAQ_INDEX, FAQ_TOPICS } from './faqs'
import { GLOSSARY_INDEX } from './glossary'
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
 * Every word on a card is the page's own (its label and headline). The garments are the owner's
 * uploaded CLO renders since 2026-10-25 (owner's plan), each read from the colour's public garment
 * answer when the cards are drawn; until then they were crops of the 3D snapshot cards in
 * `apps/viewer/public/og/`, which became wide 1200x630 cards that day. The contact card is the
 * contact page's photo. `shareImages.test.ts` checks the words, the garments and the file sizes.
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

/**
 * A garment on a card: a live colour, `<product>/<colour>`, drawn from its uploaded render, and its
 * approved garment type. Only colours whose garment card is a render (`og-cards.ts`) are used.
 */
type ShareGarment = { colour: string; type: string }

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
    /** The Kaizen ball beside the words: the two pages with no four garments to show (2026-10-31). */
    | { kind: 'ball' }
  /** `og:image:alt`: what is in the picture, not a caption (ogp.me). */
  alt: string
  /**
   * A new address for the same file, `?v=<n>`, when a link previewer kept a bad copy. LinkedIn
   * keys its stored picture to the address and Post Inspector does not replace it: /community was
   * stored at 160 px wide (`articleshare-shrink_160`) on its first fetch (2026-10-07) and still was that evening,
   * while the live file was 1200 x 630. Raise it only for a card a previewer got wrong.
   */
  version?: number
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
 * different garment, and none whose print carries another organisation's mark. Each is shown whole,
 * from its uploaded render, on a paper tile.
 */
const FAMILY_GARMENTS: Record<string, readonly ShareGarment[]> = {
  'teamwear-uniforms': [
    { colour: 'r-vpj/purple', type: 'Soccer Jersey' },
    { colour: 'r-mrp/aqua', type: 'Tennis and Pickleball Shirt' },
    { colour: 'r-xmp/lavender', type: "Men's Cycling Bib Shorts" },
    { colour: 'r-bcd/denim', type: 'Tennis Bra and Skirt Set' },
  ],
  sportswear: [
    { colour: 'r-asb/petrol', type: 'High-Support Sports Bra' },
    { colour: 'r-hfj/aqua', type: "Men's Long-Sleeve Training Jersey" },
    { colour: 'r-prs/olive', type: 'Quarter-Zip Running Shirt' },
    { colour: 'r-ect/lilac', type: "Women's Crop Top and Shorts Set" },
  ],
  outerwear: [
    { colour: 'r-atw/bone', type: 'Sublimated Windbreaker Jacket' },
    { colour: 'r-kmj/orange', type: "Men's Softshell Jacket" },
    { colour: 'r-vcj/burgundy', type: "Men's Softshell Tech Jacket" },
    { colour: 'r-atj/ash', type: "Men's Leather Utility Jacket" },
  ],
  'casual-wear': [
    { colour: 'r-taz/charcoal', type: "Men's Half-Zip Polo Shirt" },
    { colour: 'r-csp/mauve', type: "Men's Half-Zip Fleece Pullover" },
    { colour: 'r-cch/powder-blue', type: "Women's Crop Hoodie" },
    { colour: 'r-et/sage', type: "Men's Tracksuit" },
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
    { colour: 'r-asb/blush', type: 'High-Support Sports Bra' },
    { colour: 'r-vpj/blue', type: 'Soccer Jersey' },
    { colour: 'r-cch/wine', type: "Women's Crop Hoodie" },
    { colour: 'r-kmj/lime', type: "Men's Softshell Jacket" },
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
        page.familySlug === 'sports-accessories'
          ? {
              file: fileFor(page.path),
              label: page.eyebrow,
              heading: page.heading,
              accent: page.headingAccent,
              picture: { kind: 'ball' as const },
              alt: `${headline(page.heading, page.headingAccent)} The orange Kaizen soccer ball. ${BRAND}`,
            }
          : garmentsCard(
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
  [
    PRESS_PAGE.path,
    wordsCard(
      fileFor(PRESS_PAGE.path),
      PRESS_PAGE.eyebrow,
      PRESS_PAGE.heading,
      PRESS_PAGE.headingAccent,
    ),
  ],
  // The about and factory pages (the about-factory build, 2026-10-09), words from their own lists.
  [
    ABOUT_PAGE.path,
    wordsCard(
      fileFor(ABOUT_PAGE.path),
      '[ About ]',
      ABOUT_PAGE.hero.partLeft,
      `${ABOUT_PAGE.hero.partRight} ${ABOUT_PAGE.hero.accent}.`.toLowerCase(),
    ),
  ],
  [
    FACTORY_PAGE.path,
    wordsCard(
      fileFor(FACTORY_PAGE.path),
      '[ Inside the factory ]',
      FACTORY_PAGE.hero.heading,
      FACTORY_PAGE.hero.accent,
    ),
  ],
  // The FAQ and the glossary (2026-10-07), words from their own lists.
  [
    FAQ_INDEX.path,
    wordsCard(fileFor(FAQ_INDEX.path), '[ FAQ ]', FAQ_INDEX.heading, FAQ_INDEX.headingAccent),
  ],
  ...FAQ_TOPICS.map(
    (topic) =>
      [
        topic.path,
        wordsCard(fileFor(topic.path), '[ FAQ ]', topic.heading, topic.headingAccent),
      ] as const,
  ),
  [
    GLOSSARY_INDEX.path,
    wordsCard(
      fileFor(GLOSSARY_INDEX.path),
      '[ Glossary ]',
      GLOSSARY_INDEX.heading,
      GLOSSARY_INDEX.headingAccent,
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
/**
 * ⚠️ A NEW ADDRESS FOR A CARD WHOSE PICTURE CHANGED, OR WHOSE COPY LINKEDIN KEPT SMALL.
 *
 * Changed picture (2026-10-25): /products and the four category cards were redrawn from the
 * renders. Facebook, WhatsApp and LinkedIn keep a picture under its address, so a redrawn card at
 * the old address would go on showing the old one wherever it was shared; each moved up one.
 *
 * Kept small:
 * Post Inspector, 2026-10-07/08: LinkedIn stored some cards from its first fetch at 160 or 480 px
 * wide (`articleshare-shrink_160` / `_480`) and drew them stretched and blurry, although every file
 * is 1200 x 630 (LinkedIn help a521928: at least 1200 x 627, under 5 MB). Neither the file's size
 * nor its encoding predicted it, and inspecting again never replaced the copy. A new address did:
 * /community went from `shrink_160` to `shrink_1280_800` once it was `?v=2`. Raise a page's number
 * only after Post Inspector shows its copy small; never for a card stored at `shrink_1280_800`.
 */
const CARD_VERSION: Readonly<Record<string, number>> = {
  '/community': 2,
  '/press': 2,
  '/faq': 2,
  '/products': 3,
  '/': 2,
  '/custom-teamwear-manufacturer': 3,
  '/custom-activewear-manufacturer': 2,
  '/custom-outerwear-manufacturer': 2,
  '/private-label-casual-wear-manufacturer': 2,
  '/policies/equal-opportunity': 2,
}

export function shareCardFor(path: string): ShareCard {
  const card = CARDS.get(path) ?? HOME
  const version = CARD_VERSION[CARDS.has(path) ? path : '/']
  return version ? { ...card, version } : card
}

/** The absolute address of a card's file on `origin`. */
export const shareImageUrl = (card: ShareCard, origin: string) =>
  `${origin}${SHARE_IMAGE.folder}/${card.file}${card.version ? `?v=${card.version}` : ''}`
