import type { ProductCard } from './projectPublic'

/**
 * The five product families, in one place.
 *
 * ⚠️ THESE NAMES ARE THE `category` VALUES ON THE PRODUCTS COLLECTION, EXACTLY. The
 * gallery filter matches on them by string equality, so a rename in `Products.ts` that is
 * not made here does not throw, does not fail a typecheck, and does not look wrong — it
 * silently returns an empty gallery for that family. `families.test.ts` asserts the two
 * lists are identical and is the only thing standing between a one-word edit and a
 * filter that quietly matches nothing.
 *
 * The homepage already carried a comment claiming the two "cannot describe different
 * catalogues". That was an intention, not a mechanism, until this file existed.
 *
 * ⚠️ THE SLUGS ARE PUBLIC URLS (`/products?family=outerwear`) and are the owner's to
 * change, not a refactor's — a link shared in an email keeps working only if they do not
 * move. They are deliberately NOT derived from the name at runtime: deriving them would
 * make a copy edit silently break every existing link.
 */
export type Family = {
  /** The URL value. Public — see the warning above. */
  readonly slug: string
  /** The `category` value on Products, verbatim. */
  readonly name: string
  /** The homepage card's one-line description. */
  readonly body: string
}

export const FAMILIES: readonly Family[] = [
  {
    slug: 'sportswear',
    name: 'Sportswear',
    body: 'Performance kit built for training loads and race days.',
  },
  {
    slug: 'teamwear-uniforms',
    name: 'Teamwear & Uniforms',
    body: 'Squad kit, staff uniforms and matching sets at scale.',
  },
  {
    slug: 'casual-wear',
    name: 'Casual Wear',
    body: 'Everyday pieces in the same construction standard.',
  },
  {
    slug: 'outerwear',
    name: 'Outerwear',
    body: 'Weather layers engineered for movement, not just cover.',
  },
  {
    slug: 'sports-accessories',
    name: 'Sports Accessories',
    body: 'The supporting pieces that finish a program.',
  },
]

/** The family a `?family=` value names, or null for "everything". */
export function familyBySlug(slug: string | undefined): Family | null {
  if (!slug) return null
  return FAMILIES.find((family) => family.slug === slug) ?? null
}

export type FamilyPicture = { url: string; alt: string }

/**
 * One picture per family for the home page's cards (owner, 2026-09-29: "these cards should
 * display product images so visitors know what type of products are included").
 *
 * The first product of the family in CMS order — the gallery's own order, so the card shows
 * what the filtered gallery opens with — using its default colour's studio render where it
 * has one, else the card's poster. A family with nothing to show gets `null`: the card then
 * draws no picture at all, never a broken one. Sports Accessories has no product yet, and
 * the owner chose to build without a stand-in photo.
 *
 * ⚠️ `category === name`, EXACTLY, for the same reason the gallery filter uses it — see the
 * warning at the top of this file.
 */
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
        : null
  }
  return pictures
}
