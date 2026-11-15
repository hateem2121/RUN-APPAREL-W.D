// The Russian home, /ru: the twin of app/(frontend)/page.tsx (Russian section, 2026-11-15), the same
// page (`HomePageView`) in Russian.
import type { Metadata } from 'next'
import { HomePageView } from '../../../components/site/HomePage'
import { HOME_DESCRIPTION_RU, HOME_TITLE_RU } from '../../../lib/pageDescriptions.ru'
import { buildMetadata } from '../../../lib/seo'

/** As the English home: drawn per request, so the database is read, never the build's absence. */
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  ...buildMetadata({
    title: HOME_TITLE_RU,
    description: HOME_DESCRIPTION_RU,
    path: '/',
    locale: 'ru',
  }),
  // The template in the Russian layout would add "| RUN APPAREL" to a title that already names it.
  title: { absolute: HOME_TITLE_RU },
}

export default async function RussianHomePage() {
  return <HomePageView locale="ru" />
}
