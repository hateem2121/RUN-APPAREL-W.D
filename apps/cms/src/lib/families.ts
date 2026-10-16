import type { ProductCard } from './projectPublic'

/**
 * The five product families, in one place.
 *
 * ⚠️ THESE NAMES ARE THE `category` VALUES ON THE PRODUCTS COLLECTION, EXACTLY. The
 * products page's groups and the buyer pages match on them by string equality, so a rename in
 * `Products.ts` that is not made here does not throw, does not fail a typecheck, and does not
 * look wrong — it silently empties that family's group and page. `families.test.ts` asserts the
 * two lists are identical and is the only thing standing between a one-word edit and a family
 * that quietly matches nothing.
 *
 * The homepage already carried a comment claiming the two "cannot describe different
 * catalogues". That was an intention, not a mechanism, until this file existed.
 *
 * ⚠️ THE SLUGS ARE PUBLIC URLS and are the owner's to change, not a refactor's: each names its
 * family's group on the products page (`/products#outerwear`), and the old filter addresses
 * (`/products?family=outerwear`), which forward to the family's page since polish S3
 * (`familyFilterForward`), read them. A link shared in an email keeps working only if they do
 * not move. They are deliberately NOT derived from the name at runtime: deriving them would
 * make a copy edit silently break every existing link.
 */
export type Family = {
  /** The URL value. Public — see the warning above. */
  readonly slug: string
  /** The `category` value on Products, verbatim. */
  readonly name: string
  /** The homepage card's one-line description. */
  readonly body: string
  /** Its list's field in the Site Settings group `familyLists` (D44, `globals/SiteSettings.ts`). */
  readonly listField:
    | 'sportswear'
    | 'teamwearUniforms'
    | 'casualWear'
    | 'outerwear'
    | 'sportsAccessories'
  /**
   * The words over the card's list (D44, owner, 2026-10-15): the two families listed by USE or sport
   * say what they are made for; the three listed by kind say what is in the range.
   */
  readonly listLabel: 'Made for' | 'In the range'
}

export const FAMILIES: readonly Family[] = [
  {
    slug: 'sportswear',
    name: 'Sportswear',
    body: 'Performance kit built for training loads and race days.',
    listField: 'sportswear',
    listLabel: 'Made for',
  },
  {
    slug: 'teamwear-uniforms',
    name: 'Teamwear & Uniforms',
    body: 'Squad kit, staff uniforms and matching sets at scale.',
    listField: 'teamwearUniforms',
    listLabel: 'Made for',
  },
  {
    slug: 'casual-wear',
    name: 'Casual Wear',
    body: 'Everyday pieces in the same construction standard.',
    listField: 'casualWear',
    listLabel: 'In the range',
  },
  {
    slug: 'outerwear',
    name: 'Outerwear',
    body: 'Weather layers engineered for movement, not just cover.',
    listField: 'outerwear',
    listLabel: 'In the range',
  },
  {
    slug: 'sports-accessories',
    name: 'Sports Accessories',
    body: 'The supporting pieces that finish a program.',
    listField: 'sportsAccessories',
    listLabel: 'In the range',
  },
]

/** The family a `?family=` value names, or null for "everything". */
export function familyBySlug(slug: string | undefined): Family | null {
  if (!slug) return null
  return FAMILIES.find((family) => family.slug === slug) ?? null
}

export type FamilyPicture = {
  url: string
  alt: string
  /** Set only for the site's own photos, which come in pre-built widths (`FAMILY_PHOTOS`). */
  srcSet?: string
}

/**
 * A family's own photo, used only while the family has no product to show.
 *
 * Sports Accessories has no 3D garment yet. On 2026-09-30 the owner supplied a photo of
 * three RUN backpacks for its card (it had drawn "[ Photo to come ]" until then). Cropped to
 * the card's 4:5 box around the middle bag and saved at 400 and 800 px wide
 * (`public/families/`, 26 KB and 97 KB). A real product, once published, takes over.
 */
export const FAMILY_PHOTOS: Readonly<Record<string, FamilyPicture>> = {
  'sports-accessories': {
    url: '/families/sports-accessories-800.webp',
    srcSet:
      '/families/sports-accessories-400.webp 400w, /families/sports-accessories-800.webp 800w',
    alt: 'A blue RUN mesh backpack, with black and red ones beside it.',
  },
}

/**
 * One picture per family for the home page's cards (owner, 2026-09-29: "these cards should
 * display product images so visitors know what type of products are included").
 *
 * The first product of the family in CMS order — the gallery's own order, so the card shows
 * what the filtered gallery opens with — using its default colour's studio render where it
 * has one, else the card's poster, else the family's own photo (`FAMILY_PHOTOS`). A family
 * with none of those gets `null`: the card then draws no picture at all, never a broken one.
 *
 * ⚠️ `category === name`, EXACTLY, for the same reason the gallery filter uses it — see the
 * warning at the top of this file.
 */
/**
 * The colour an opened family card shows of its garment (D44, owner, 2026-10-15): ANOTHER COLOUR OF
 * THE SAME GARMENT, so opening the card shows something new rather than the picture it already had.
 * The owner chose each one on the options page; the slugs were read off the public API on 2026-10-16.
 */
export const FAMILY_OPEN_COLOUR: Readonly<Record<string, string>> = {
  'r-asb': 'blush',
  'r-xmp': 'mint',
  'r-taz': 'teal',
  'r-atw': 'fuchsia',
}

/** What an opened family card shows of the garment in its picture (D44). */
export type FamilyGarment = {
  /** "X-Milo Pro Bib": under the picture once the card is open, in place of the family's name. */
  name: string
  /** The other colour's picture, and its name, which sits over the dots. */
  open: { url: string; alt: string; colourName: string }
  /** Every colour of the garment, in row order, for the dots; `shown` is the one in the picture. */
  swatches: readonly (string | null)[]
  shown: number
}

/**
 * The garment each family card shows, as `familyPictures` picks it (the family's first product), with
 * the colour it opens on: the owner's choice (`FAMILY_OPEN_COLOUR`), else its first other colour with
 * a picture of its own. `null` when the family has no garment or no second colour with a picture: the
 * card then opens on the picture it already shows, and draws no dots.
 */
export function familyGarments(
  cards: readonly ProductCard[],
): Record<string, FamilyGarment | null> {
  const garments: Record<string, FamilyGarment | null> = {}
  for (const family of FAMILIES) {
    const card = cards.find((entry) => entry.category === family.name)
    const colours = card?.colours ?? []
    const chosen = colours.findIndex(
      (colour, index) =>
        index > 0 && colour.slug === FAMILY_OPEN_COLOUR[card?.slug ?? ''] && colour.image,
    )
    const shown =
      chosen > 0 ? chosen : colours.findIndex((colour, index) => index > 0 && colour.image)
    const colour = colours[shown]
    garments[family.slug] =
      card && colour?.image
        ? {
            name: card.productName,
            open: { url: colour.image.url, alt: colour.image.alt, colourName: colour.name },
            swatches: colours.map((each) => each.swatch),
            shown,
          }
        : null
  }
  return garments
}

export function familyPictures(
  cards: readonly ProductCard[],
): Record<string, FamilyPicture | null> {
  const pictures: Record<string, FamilyPicture | null> = {}
  for (const family of FAMILIES) {
    const card = cards.find((entry) => entry.category === family.name)
    const image = card?.colours[0]?.image
    pictures[family.slug] = image
      ? { url: image.url, alt: image.alt }
      : card?.posterUrl
        ? { url: card.posterUrl, alt: card.posterAlt }
        : (FAMILY_PHOTOS[family.slug] ?? null)
  }
  return pictures
}
