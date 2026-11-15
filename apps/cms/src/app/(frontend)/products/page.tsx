import type { Metadata } from 'next'
import { ProductsPageView } from '../../../components/site/ProductsPage'
import { PRODUCTS_DESCRIPTION } from '../../../lib/pageDescriptions'
import { buildMetadata } from '../../../lib/seo'

export const dynamic = 'force-dynamic'

/**
 * The products page's title, in the owner's own words (2026-09-30). It was "Products", which
 * told a search engine nothing; measured that day, all ten pages ranking for "custom
 * sportswear manufacturer" lead their title with what they sell.
 *
 * ⚠️ SHORTENED TO FIT (polish F18, 2026-10-04): the owner's words were 56 characters, 71 with the
 * " — RUN APPAREL" the layout adds, and Google cut them to "…RUN APPA…". These keep the owner's
 * words and say "Sportswear", the word buyers search ("custom sportswear manufacturer", the
 * 2026-09-30 study): 44 characters, 58 in all, inside the ~60 a result shows. On the owner's
 * end-of-build list of new words; e2e/findability.spec.ts holds the length.
 */
const PRODUCTS_TITLE = 'Private Label Sportswear & Casual Wear in 3D'

export async function generateMetadata(): Promise<Metadata> {
  return buildMetadata({
    title: PRODUCTS_TITLE,
    description: PRODUCTS_DESCRIPTION,
    path: '/products',
  })
}

/**
 * The gallery is drawn by `ProductsPageView` in `components/site/ProductsPage.tsx` (since
 * 2026-11-15), which /ru/products draws too; this file is the English address and its metadata.
 */
export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ family?: string | string[] }>
}) {
  return <ProductsPageView searchParams={searchParams} />
}
