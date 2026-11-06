import type { Metadata } from 'next'
import { GuidePage } from '../../../../components/site/GuidePage'
import { guideAt } from '../../../../lib/guides'
import { buildMetadata } from '../../../../lib/seo'
import { templateNotice } from '../../../../lib/templateDownload'

/** Rendered per request, like every page here (the layout reads the site settings). */
export const dynamic = 'force-dynamic'

/**
 * The tech pack guide with its free template (C1, owner approved every word on 6 Nov 2026). The words
 * are in `lib/guideLibrary.ts`, the layout in `components/site/GuidePage.tsx`, the form in
 * `TemplateDownload.tsx` and its route in `download/route.ts`; this file is the address, and the one
 * place a refused download's code (`?error=…`) becomes the form's message.
 *
 * ⚠️ THE FOLDER NAME IS THE ADDRESS, and it is public: it must equal this guide's `path` and its
 * entry in `GUIDE_PAGE_SOURCES`. `guides.test.ts` checks all three. A page with a query string is
 * never kept in the page store (`pageCache.mjs`), so a refusal's notice is drawn for its visitor only.
 */
const PATH = '/guides/tech-pack-template'

export const metadata: Metadata = buildMetadata({
  title: guideAt(PATH).title,
  description: guideAt(PATH).description,
  path: PATH,
})

export default async function TechPackTemplatePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  return <GuidePage guide={guideAt(PATH)} notice={templateNotice(await searchParams)} />
}
