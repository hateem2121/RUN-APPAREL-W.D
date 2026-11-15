// The Russian twin of app/(frontend)/faq/orders-and-samples/page.tsx (Russian section, 2026-11-15): the same page,
// the Russian words (lib/faqs.ru.ts) and locale="ru". Made from it by script.
import type { Metadata } from 'next'
import { FaqTopicPage } from '../../../../../components/site/FaqPages'
import { faqTopicAtRu as faqTopicAt } from '../../../../../lib/i18n/ruNames'
import { buildMetadata } from '../../../../../lib/seo'

/** Rendered per request, like every page here (the layout reads the site settings). */
export const dynamic = 'force-dynamic'

/** See `faq/page.tsx` for the folder-name rule. */
const PATH = '/faq/orders-and-samples'

export const metadata: Metadata = buildMetadata({
  title: faqTopicAt(PATH).title,
  description: faqTopicAt(PATH).description,
  path: PATH,
  locale: 'ru',
})

export default function RussianFaqOrdersSamplesPage() {
  return <FaqTopicPage topic={faqTopicAt(PATH)} locale="ru" />
}
