import type { Metadata } from 'next'
import { AboutPage as AboutLayout } from '../../../components/site/AboutPage'
import { ABOUT_PAGE } from '../../../lib/aboutPages'
import { buildMetadata } from '../../../lib/seo'

/** Rendered per request, like every page here (the layout reads the site settings). */
export const dynamic = 'force-dynamic'

/** See `careers/page.tsx` for the folder-name rule. */
const PATH = '/about'

export const metadata: Metadata = buildMetadata({
  title: ABOUT_PAGE.title,
  description: ABOUT_PAGE.description,
  path: PATH,
})

export default function AboutPage() {
  return <AboutLayout />
}
