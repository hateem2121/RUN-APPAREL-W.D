// The Russian twin of app/(frontend)/inside-the-factory/page.tsx (Russian section, 2026-11-15): the same page,
// the Russian words (lib/aboutPages.ru.ts) and locale="ru".
import type { Metadata } from 'next'
import { FactoryPage as FactoryLayout } from '../../../../components/site/FactoryPage'
import { FACTORY_PAGE_RU as FACTORY_PAGE } from '../../../../lib/aboutPages.ru'
import { buildMetadata } from '../../../../lib/seo'
import '../../../(frontend)/about-factory.css'

export const dynamic = 'force-dynamic'

const PATH = '/inside-the-factory'

export const metadata: Metadata = buildMetadata({
  title: FACTORY_PAGE.title,
  description: FACTORY_PAGE.description,
  path: PATH,
  locale: 'ru',
})

export default function RussianFactoryPage() {
  return <FactoryLayout locale="ru" />
}
