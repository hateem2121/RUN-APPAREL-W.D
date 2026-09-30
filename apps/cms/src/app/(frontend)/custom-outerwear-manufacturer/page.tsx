import type { Metadata } from 'next'
import { FamilyLanding } from '../../../components/site/FamilyLanding'
import { getProductCards, getSiteSettings } from '../../../lib/content'
import { FAMILY_PAGES } from '../../../lib/familyPages'
import { buildMetadata } from '../../../lib/seo'

/** Read at request time: the garments come from the database (see `(frontend)/page.tsx`). */
export const dynamic = 'force-dynamic'

/**
 * The Outerwear buyer page, the same shape as the Teamwear one. The words are in
 * `lib/familyPages.ts` (approved by the owner 2026-09-30) and the layout in `components/site/FamilyLanding.tsx`; this file is only the
 * address.
 *
 * ⚠️ THE FOLDER NAME IS THE ADDRESS, and it is public: it must equal this page's `path` in
 * `familyPages.ts` and its entry in `FAMILY_PAGE_SOURCES`. `familyPages.test.ts` checks all
 * three against each other.
 */
const PATH = '/custom-outerwear-manufacturer'

function thisPage() {
  const page = FAMILY_PAGES.find((entry) => entry.path === PATH)
  if (!page) throw new Error(`familyPages.ts has no page at ${PATH}`)
  return page
}

export const metadata: Metadata = buildMetadata({
  title: thisPage().title,
  description: thisPage().description,
  path: PATH,
})

export default async function OuterwearPage() {
  const [settings, products] = await Promise.all([getSiteSettings(), getProductCards()])
  return <FamilyLanding page={thisPage()} products={products} settings={settings} />
}
