import type { ViewerRelatedGarment } from '@run-apparel/shared'
import type { Payload } from 'payload'
import { type ProductCard, toProductCard } from '../lib/projectPublic'

/**
 * "More from <category>" at the end of a garment page (polish S6, 2026-10-04; the owner's
 * four, Q27): other garments of the same category, sent with the garment's own answer.
 *
 * ⚠️ IN THE GARMENT'S ANSWER, NOT A SECOND REQUEST, AND READ BESIDE THE SETTINGS. The answer is
 * the slowest thing on a garment page (publicViewer.ts measured ~900 ms of D1 reads), so this
 * list is read at the same time as the site settings, never after them, and from a list kept
 * for a minute per isolate: a warm isolate answers from memory. A second request from the page
 * would have needed its own cross-site headers, caching rules and robots entry.
 *
 * ⚠️ NOT `lib/content.ts`'s list, though it is the same query: that module is `server-only`,
 * which throws outside Next, and this file is loaded with the Payload config by the CLI that
 * runs the deploy's migrations.
 */

/** How many cards: the owner's four (Q27, 2026-10-04). */
export const RELATED_COUNT = 4

/**
 * The garments after this one in its category, in the website's order (`sortOrder`), wrapping
 * round to the start: neighbours rather than always the first four, so every garment is
 * linked from the pages around it, not only the category's first four from everywhere.
 */
export function pickRelated(
  cards: readonly ProductCard[],
  productSlug: string,
  category: string,
  count: number = RELATED_COUNT,
): ViewerRelatedGarment[] {
  const same = cards.filter((card) => card.category === category)
  const at = same.findIndex((card) => card.slug === productSlug)
  const around = at < 0 ? same : [...same.slice(at + 1), ...same.slice(0, at)]
  return around
    .filter((card) => card.slug !== productSlug)
    .slice(0, count)
    .map((card) => ({
      slug: card.slug,
      colourSlug: card.defaultColourSlug,
      productName: card.productName,
      productCode: card.productCode,
      // The website's card picture: the default colour's studio render, else its poster.
      imageUrl: card.colours[0]?.image?.url ?? card.posterUrl,
    }))
}

const TTL_MS = 60_000
let cached: { cards: ProductCard[]; expires: number } | null = null

/**
 * Every published garment as a card, kept for a minute per isolate. A failed read is an empty
 * list and is never kept: the garment's answer goes out without the section, never fails.
 */
export async function publishedCards(payload: Payload): Promise<ProductCard[]> {
  if (cached && cached.expires > Date.now()) return cached.cards
  try {
    const res = await payload.find({
      collection: 'products',
      where: { status: { equals: 'published' } },
      sort: 'sortOrder',
      limit: 200,
      // depth 1 populates each colour's pictures; at depth 0 they are bare row ids.
      depth: 1,
    })
    const cards = res.docs
      .map((doc) => toProductCard(doc as unknown as Record<string, unknown>))
      .filter((card): card is ProductCard => card !== null)
    cached = { cards, expires: Date.now() + TTL_MS }
    return cards
  } catch (err) {
    console.error('[related] published garments unavailable:', err)
    return []
  }
}

/** Tests only: forget the kept list. */
export function __clearRelatedCache(): void {
  cached = null
}
