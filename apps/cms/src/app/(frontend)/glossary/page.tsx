import type { Metadata } from 'next'
import { GlossaryPage } from '../../../components/site/GlossaryPage'
import { GLOSSARY_INDEX } from '../../../lib/glossary'
import { buildMetadata } from '../../../lib/seo'

/** Rendered per request, like every page here (the layout reads the site settings). */
export const dynamic = 'force-dynamic'

/**
 * The glossary (PLAN.md D6). Words in `lib/glossary.ts`, layout in
 * `components/site/GlossaryPage.tsx`. ⚠️ THE FOLDER NAME IS THE ADDRESS (`glossary.test.ts`).
 */
export const metadata: Metadata = buildMetadata({
  title: GLOSSARY_INDEX.title,
  description: GLOSSARY_INDEX.description,
  path: GLOSSARY_INDEX.path,
})

export default function Glossary() {
  return <GlossaryPage />
}
