// The Russian twin of app/(frontend)/about/page.tsx (Russian section, 2026-11-15): the same page,
// the Russian words (lib/aboutPages.ru.ts) and locale="ru".
import type { Metadata } from 'next'
import { AboutPage as AboutLayout } from '../../../../components/site/AboutPage'
import { ABOUT_PAGE_RU as ABOUT_PAGE } from '../../../../lib/aboutPages.ru'
import { buildMetadata } from '../../../../lib/seo'
import '../../../(frontend)/about-factory.css'

export const dynamic = 'force-dynamic'

const PATH = '/about'

export const metadata: Metadata = buildMetadata({
  title: ABOUT_PAGE.title,
  description: ABOUT_PAGE.description,
  path: PATH,
  locale: 'ru',
})

export default function RussianAboutPage() {
  return <AboutLayout locale="ru" />
}
