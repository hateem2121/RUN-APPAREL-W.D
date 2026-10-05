import { categoryPath, type ViewerProduct } from '@run-apparel/shared'
import { SITE_ORIGIN, SITE_PRODUCTS_URL } from '../lib/siteLinks'

/**
 * Home › Products › <category> › <garment>: where this garment sits on the website (polish S5,
 * 2026-10-04). The same steps the search-result breadcrumb names (`worker/preview.ts`), so a
 * buyer who came from a search sees the trail it promised.
 *
 * The W3C pattern (WAI-ARIA APG "Breadcrumb"): a navigation landmark labelled "Breadcrumb", and
 * the current page marked `aria-current="page"`; it is text, not a link to the page already open.
 * `role="list"`, because `list-style: none` drops a list's meaning in Safari (VA-59, as
 * SpecGroups.tsx). The separators are drawn, and hidden from screen readers, which announce the
 * list's items one by one instead.
 *
 * The category links to its own page on the website (packages/shared/src/categoryPages.ts); a
 * garment with no category gets no invented step.
 */
export function GarmentTrail({
  product,
}: {
  product: Pick<ViewerProduct, 'category' | 'productName'>
}) {
  const category = product.category.trim()
  return (
    <nav className="trail" aria-label="Breadcrumb">
      {/* biome-ignore lint/a11y/noRedundantRoles: Safari drops list semantics under list-style: none unless the role is written out */}
      <ol className="trail__list" role="list">
        <li>
          <a href={`${SITE_ORIGIN}/`}>Home</a>
        </li>
        <li>
          <Separator />
          <a href={SITE_PRODUCTS_URL}>Products</a>
        </li>
        {category && (
          <li>
            <Separator />
            <a href={`${SITE_ORIGIN}${categoryPath(category)}`}>{category}</a>
          </li>
        )}
        <li>
          <Separator />
          <span className="trail__current" aria-current="page" translate="no">
            {product.productName.trim()}
          </span>
        </li>
      </ol>
    </nav>
  )
}

/** A chevron in the stroke of the page's other drawn marks (`.stage__more`). */
function Separator() {
  return (
    <svg
      className="trail__separator"
      viewBox="0 0 6 10"
      width="6"
      height="10"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M1 1l4 4-4 4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="square"
      />
    </svg>
  )
}
