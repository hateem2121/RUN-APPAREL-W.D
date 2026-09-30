import type { Metadata } from 'next'
import { GuidePage } from '../../../../components/site/GuidePage'
import { guideAt } from '../../../../lib/guides'
import { buildMetadata } from '../../../../lib/seo'

/** Rendered per request, like every page here (the layout reads the site settings). */
export const dynamic = 'force-dynamic'

/**
 * A buyer guide. The words are in `lib/guides.ts` (approved by the owner 2026-09-30) and the
 * layout in `components/site/GuidePage.tsx`; this file is only the address.
 *
 * ⚠️ THE FOLDER NAME IS THE ADDRESS, and it is public: it must equal this guide's `path` in
 * `guides.ts` and its entry in `GUIDE_PAGE_SOURCES`. `guides.test.ts` checks all three.
 */
const PATH = '/guides/sportswear-fabrics-and-weights'

export const metadata: Metadata = buildMetadata({
  title: guideAt(PATH).title,
  description: guideAt(PATH).description,
  path: PATH,
})

export default function FabricsGuidePage() {
  return <GuidePage guide={guideAt(PATH)} />
}
