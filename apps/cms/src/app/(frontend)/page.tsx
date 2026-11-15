import type { Metadata } from 'next'
import { HomePageView } from '../../components/site/HomePage'
import { HOME_DESCRIPTION, HOME_TITLE } from '../../lib/pageDescriptions'
import { buildMetadata } from '../../lib/seo'

/**
 * ⚠️ `force-dynamic` IS NOT OPTIONAL. `resolveCloudflareEnv()` returns null during
 * `next build` — no D1 binding exists in the build phase — so any attempt to
 * pre-render this page reads an absent database. The content helpers also swallow the
 * throw, but that only converts a crash into a blank page; this is what stops the
 * attempt happening at all.
 */
export const dynamic = 'force-dynamic'

const TITLE = HOME_TITLE

export const metadata: Metadata = {
  ...buildMetadata({ title: TITLE, description: HOME_DESCRIPTION, path: '/' }),
  // The template in layout.tsx would render "RUN APPAREL — … — RUN APPAREL".
  title: { absolute: TITLE },
}

/**
 * The page is drawn by `HomePageView` in `components/site/HomePage.tsx` (since 2026-11-15), which
 * the Russian home at /ru draws too; this file is the English address and its metadata.
 */
export default async function HomePage() {
  return <HomePageView />
}
