import Link from 'next/link'
import type { Family } from '../../lib/families'
import { FAMILY_SOON, type FamilyPage } from '../../lib/familyPages'
import type { ProductCard } from '../../lib/projectPublic'
import { ProductCardItem } from './ProductCardItem'

type FamilyGroupProps = {
  entry: Family
  page: FamilyPage | null
  products: ProductCard[]
  soon: boolean
  /** The first card's place on the whole page: the page's first card loads its picture first. */
  start: number
}

/**
 * One family's group on `/products`: the heading that opens the family's own page (Q25), its count
 * or the owner's "[ ask us ]" words (Q21), and its garments.
 *
 * ⚠️ ITS OWN FILE SO A TEST CAN DRAW IT (11 Oct 2026). CI's database holds no Teamwear garment, so
 * the page there never has a group long enough to show how the groups stack.
 * `e2e/productsGroupsHarness.ts` draws this component with the 19 live Teamwear garments and the
 * real stylesheets, and `e2e/productsGroups.spec.ts` measures it.
 */
export function FamilyGroup({ entry, page, products, soon, start }: FamilyGroupProps) {
  return (
    <section id={entry.slug} className="gallery-group" aria-labelledby={`${entry.slug}-heading`}>
      <div className="gallery-group__head">
        {/* The heading opens the family's own page, its only list (Q25). */}
        <h2 id={`${entry.slug}-heading`} className="display display--section gallery-group__title">
          {page ? (
            <Link className="gallery-group__link" href={page.path}>
              {entry.name}
              {/* The no-break space keeps the arrow beside the last word. */}
              <span aria-hidden="true">&nbsp;&rarr;</span>
            </Link>
          ) : (
            entry.name
          )}
        </h2>
        {soon ? (
          // No page and no garments yet: the owner's words for this family (Q21).
          <p className="gallery-group__soon">
            <span className="label">{FAMILY_SOON.label}</span>
            <Link className="gallery-group__ask" href={FAMILY_SOON.href}>
              {FAMILY_SOON.ask}
              <span aria-hidden="true">&rarr;</span>
            </Link>
          </p>
        ) : (
          <p className="result-count">
            {products.length} reference{products.length === 1 ? '' : 's'}
          </p>
        )}
      </div>
      {products.length > 0 ? (
        <ul className="product-grid">
          {products.map((product, index) => (
            <ProductCardItem
              key={product.slug}
              product={product}
              index={start + index}
              heading="h3"
            />
          ))}
        </ul>
      ) : page ? (
        <p className="site-empty">
          No 3D references in {entry.name} yet — the garments exist, the references are still being
          built. Email us and we will send what we have.
        </p>
      ) : null}
    </section>
  )
}
