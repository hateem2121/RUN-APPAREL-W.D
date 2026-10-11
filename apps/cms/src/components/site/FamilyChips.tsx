import type { Family } from '../../lib/families'
import type { ProductCard } from '../../lib/projectPublic'

type FamilyChipsProps = {
  /** Every family on `/products`, in the page's order, with the garments it lists. */
  groups: ReadonlyArray<{ family: Family; products: ProductCard[] }>
}

/**
 * The chips above `/products`' groups: a <nav> of plain links to the groups below. On a phone it is
 * ONE ROW THAT SCROLLS SIDEWAYS (`filter-bar--scroll`, visual audit VA-42): three wrapped rows had
 * filled 172px of the first screen. Tab still walks every chip and the browser scrolls each one into
 * view, so it needs no script. A family with no garment yet keeps its chip, dashed, with its count
 * of 0 (D17).
 *
 * Its own file so `e2e/productsGroupsHarness.ts` draws the page's real chips above the groups, as it
 * draws the real `FamilyGroup` (review of 11 Oct 2026).
 */
export function FamilyChips({ groups }: FamilyChipsProps) {
  return (
    <nav className="filter-bar filter-bar--scroll" aria-label="Product families on this page">
      {groups.map(({ family: entry, products }) => (
        <a
          key={entry.slug}
          className="filter-chip"
          href={`#${entry.slug}`}
          data-empty={products.length === 0 ? 'true' : undefined}
        >
          {entry.name}
          <span className="filter-chip__count">{products.length}</span>
        </a>
      ))}
    </nav>
  )
}
