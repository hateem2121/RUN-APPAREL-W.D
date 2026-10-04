import type { ProductCategory } from './types'

/**
 * Each garment category's page on the website: where a garment page's trail (polish S5) and its
 * search-result breadcrumb send a buyer who wants the rest of the category.
 *
 * The pages themselves, and their words, live in apps/cms/src/lib/familyPages.ts (the owner
 * approves every one). The garment pages cannot import from there (`biome.jsonc` forbids imports
 * between apps), so the addresses are repeated here, and `apps/cms/src/lib/familyPages.test.ts`
 * fails when the two lists differ in either direction.
 *
 * Sports Accessories has no garments and no page, so it has no entry: `categoryPath` sends it to
 * the family filter instead, as the website's own `familyHref` does.
 */
export const CATEGORY_PAGE_PATHS: Readonly<Partial<Record<ProductCategory, string>>> = {
  'Teamwear & Uniforms': '/custom-teamwear-manufacturer',
  Sportswear: '/custom-activewear-manufacturer',
  Outerwear: '/custom-outerwear-manufacturer',
  'Casual Wear': '/private-label-casual-wear-manufacturer',
}

/**
 * The family filter's address for a category, spelled the way the website spells it:
 * `Teamwear & Uniforms` → `teamwear-uniforms` (apps/cms/src/lib/families.ts, where each
 * family's `name` is the category verbatim). `apps/viewer/src/familySlugs.test.ts` reads that
 * file and fails if the two spellings ever part.
 */
export function familySlug(category: string): string {
  return category
    .toLowerCase()
    .replace(/&/g, ' ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/** A category's page on the website, root-relative: its own page, or the family filter. */
export function categoryPath(category: string): string {
  const name = category.trim()
  return CATEGORY_PAGE_PATHS[name as ProductCategory] ?? `/products?family=${familySlug(name)}`
}
