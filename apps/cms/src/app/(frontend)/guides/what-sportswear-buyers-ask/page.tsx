import type { Metadata } from 'next'
import { GuidePage } from '../../../../components/site/GuidePage'
import { JsonLd } from '../../../../components/site/JsonLd'
import { COUNT_DATE_ISO, CSV_PATH, WINDOW_START_ISO } from '../../../../lib/buyerQuestions'
import { getProductCards } from '../../../../lib/content'
import { guideAt } from '../../../../lib/guides'
import { buildMetadata } from '../../../../lib/seo'
import { buyerQuestionsDatasetJsonLd } from '../../../../lib/structuredData'

/** Rendered per request, like every page here (the layout reads the site settings). */
export const dynamic = 'force-dynamic'

/**
 * A buyer guide of the buyer library (owner approved every word, 2026-11-06). The words are in
 * `lib/guideLibrary.ts` and the layout in `components/site/GuidePage.tsx`; this file is only the address.
 *
 * ⚠️ THE FOLDER NAME IS THE ADDRESS, and it is public: it must equal this guide's `path` and its
 * entry in `GUIDE_PAGE_SOURCES`. `guides.test.ts` checks all three.
 */
const PATH = '/guides/what-sportswear-buyers-ask'

export const metadata: Metadata = buildMetadata({
  title: guideAt(PATH).title,
  description: guideAt(PATH).description,
  path: PATH,
})

// The live catalogue, for the reference garments this guide links. It never throws: with no
// catalogue the links are simply not drawn.
export default async function WhatSportswearBuyersAskPage() {
  const guide = guideAt(PATH)
  return (
    <>
      {/* The counts as a Dataset (C7 editorial call 4), beside the guide's own article markup. */}
      <JsonLd
        data={buyerQuestionsDatasetJsonLd(
          guide,
          { start: WINDOW_START_ISO, end: COUNT_DATE_ISO },
          CSV_PATH,
        )}
      />
      <GuidePage guide={guide} cards={await getProductCards()} />
    </>
  )
}
