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
 * its group on the products page instead, as the website's own `familyHref` does.
 */
export const CATEGORY_PAGE_PATHS: Readonly<Partial<Record<ProductCategory, string>>> = {
  'Teamwear & Uniforms': '/custom-teamwear-manufacturer',
  Sportswear: '/custom-activewear-manufacturer',
  Outerwear: '/custom-outerwear-manufacturer',
  'Casual Wear': '/private-label-casual-wear-manufacturer',
}

/**
 * A category's slug, spelled the way the website spells it: `Teamwear & Uniforms` →
 * `teamwear-uniforms` (apps/cms/src/lib/families.ts, where each family's `name` is the category
 * verbatim). It names the category's group on the products page (`/products#teamwear-uniforms`),
 * and the old filter addresses (`/products?family=teamwear-uniforms`) that now forward.
 * `apps/viewer/src/familySlugs.test.ts` reads that file and fails if the two spellings ever part.
 */
export function familySlug(category: string): string {
  return (
    category
      .toLowerCase()
      .replace(/&/g, ' ')
      // Split on every run of other characters and join with one hyphen: no hyphen at either end,
      // and no `^-+|-+$` trim, which the code scan flags as slow on long runs (PR #128).
      .split(/[^a-z0-9]+/)
      .filter(Boolean)
      .join('-')
  )
}

/**
 * Where a category's garments are listed on the website, root-relative.
 *
 * ⚠️ ONE PAGE PER JOB (polish S1, the owner's answer Q24, 2026-10-04): a category's own page is the
 * ONLY list of its garments. The family filter (`/products?family=…`) showed the same garments under
 * a second address and now forwards to the category's page, so the garment pages' trail, their
 * search-result breadcrumb and "See all … in 3D" all open the page itself. A category with no page
 * (Sports Accessories) goes to its group on the products page.
 */
export function categoryPath(category: string): string {
  const name = category.trim()
  return CATEGORY_PAGE_PATHS[name as ProductCategory] ?? `/products#${familySlug(name)}`
}

/**
 * "See all outerwear in 3D": the words the owner approved on 2026-10-02 for a link to all of a
 * category's garments (visual audit VA-33). Built from the category's own name, lower-cased, so the
 * words cannot drift from the category they name. Since polish S1 the link opens the category's own
 * page (`categoryPath`), which shows every one of them.
 */
export function seeAllInCategoryLabel(category: string): string {
  return `See all ${category.trim().toLowerCase()} in 3D`
}
