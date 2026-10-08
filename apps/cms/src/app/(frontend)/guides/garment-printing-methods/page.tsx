import type { Metadata } from 'next'
import { GuidePage } from '../../../../components/site/GuidePage'
import { getProductCards } from '../../../../lib/content'
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
const PATH = '/guides/garment-printing-methods'

export const metadata: Metadata = buildMetadata({
  title: guideAt(PATH).title,
  description: guideAt(PATH).description,
  path: PATH,
})

// The live catalogue, for the reference garments this guide links (2026-10-08). It never throws:
// with no catalogue the links are simply not drawn.
export default async function PrintingGuidePage() {
  return <GuidePage guide={guideAt(PATH)} cards={await getProductCards()} />
}
