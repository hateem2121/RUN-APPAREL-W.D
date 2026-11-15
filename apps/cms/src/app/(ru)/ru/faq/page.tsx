// The Russian twin of app/(frontend)/faq/page.tsx (Russian section, 2026-11-15): the same page,
// the Russian words (lib/faqs.ru.ts) and locale="ru". Made from it by script.
import type { Metadata } from 'next'
import { FaqHubPage } from '../../../../components/site/FaqPages'
import { FAQ_INDEX_RU as FAQ_INDEX } from '../../../../lib/faqs.ru'
import { buildMetadata, metaTitleOf } from '../../../../lib/seo'

/** Rendered per request, like every page here (the layout reads the site settings). */
export const dynamic = 'force-dynamic'

/**
 * The FAQ hub (PLAN.md D5). The words are in `lib/faqs.ts`, the layout in
 * `components/site/FaqPages.tsx`. ⚠️ THE FOLDER NAME IS THE ADDRESS: `faqs.test.ts` holds it to
 * `FAQ_PATHS`, and `newPagesWiring.test.ts` to every list a public page must be in.
 */
export const metadata: Metadata = buildMetadata({
  title: metaTitleOf(FAQ_INDEX),
  description: FAQ_INDEX.description,
  path: FAQ_INDEX.path,
  locale: 'ru',
})

export default function RussianFaqHub() {
  return <FaqHubPage locale="ru" />
}
