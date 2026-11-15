// The Russian twin of app/(frontend)/products/page.tsx (Russian section, 2026-11-15): the same gallery
// (`ProductsPageView`), in Russian. The 3D garment pages it opens stay English.
import type { Metadata } from 'next'
import { ProductsPageView } from '../../../../components/site/ProductsPage'
import { PRODUCTS_DESCRIPTION_RU } from '../../../../lib/pageDescriptions.ru'
import { buildMetadata } from '../../../../lib/seo'

export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  return buildMetadata({
    title: 'Спортивная и повседневная одежда под вашим брендом в 3D',
    description: PRODUCTS_DESCRIPTION_RU,
    path: '/products',
    locale: 'ru',
  })
}

export default async function RussianProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ family?: string | string[] }>
}) {
  return <ProductsPageView searchParams={searchParams} locale="ru" />
}
