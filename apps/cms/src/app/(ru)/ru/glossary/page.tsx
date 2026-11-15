// The Russian twin of app/(frontend)/glossary/page.tsx (Russian section, 2026-11-15): the same page,
// the Russian words (lib/glossary.ru.ts) and locale="ru". Made from it by script.
import type { Metadata } from 'next'
import { GlossaryPage } from '../../../../components/site/GlossaryPage'
import { GLOSSARY_INDEX_RU as GLOSSARY_INDEX } from '../../../../lib/glossary.ru'
import { buildMetadata, metaTitleOf } from '../../../../lib/seo'

/** Rendered per request, like every page here (the layout reads the site settings). */
export const dynamic = 'force-dynamic'

/**
 * The glossary (PLAN.md D6). Words in `lib/glossary.ts`, layout in
 * `components/site/GlossaryPage.tsx`. ⚠️ THE FOLDER NAME IS THE ADDRESS (`glossary.test.ts`).
 */
export const metadata: Metadata = buildMetadata({
  title: metaTitleOf(GLOSSARY_INDEX),
  description: GLOSSARY_INDEX.description,
  path: GLOSSARY_INDEX.path,
  locale: 'ru',
})

export default function RussianGlossary() {
  return <GlossaryPage locale="ru" />
}
