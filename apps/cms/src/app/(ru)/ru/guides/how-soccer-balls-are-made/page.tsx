// The Russian twin of app/(frontend)/guides/how-soccer-balls-are-made/page.tsx (Russian section, 2026-11-15):
// the same page, the Russian guide (lib/i18n/ruNames.ts) and locale="ru". Made from it by script.
import type { Metadata } from 'next'
import { GuidePage } from '../../../../../components/site/GuidePage'
import { getProductCards } from '../../../../../lib/content'
import { guideAtRu as guideAt } from '../../../../../lib/i18n/ruNames'
import { buildMetadata } from '../../../../../lib/seo'

/** Rendered per request, like every page here (the layout reads the site settings). */
export const dynamic = 'force-dynamic'

/**
 * A buyer guide. The words are in `lib/guides.ts` (approved by the owner 2026-11-05, wave 1 of the
 * buyer library) and the layout in `components/site/GuidePage.tsx`; this file is only the address.
 *
 * ⚠️ THE FOLDER NAME IS THE ADDRESS, and it is public: it must equal this guide's `path` in
 * `guides.ts` and its entry in `GUIDE_PAGE_SOURCES`. `guides.test.ts` checks all three.
 */
const PATH = '/guides/how-soccer-balls-are-made'

export const metadata: Metadata = buildMetadata({
  title: guideAt(PATH).title,
  description: guideAt(PATH).description,
  path: PATH,
  locale: 'ru',
})

// The live catalogue, for the Kaizen's 3D page this guide links. It never throws: with no
// catalogue the link is simply not drawn.
export default async function SoccerBallGuidePage() {
  return <GuidePage locale="ru" guide={guideAt(PATH)} cards={await getProductCards()} />
}
