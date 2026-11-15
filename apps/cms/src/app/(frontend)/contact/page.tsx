import type { Metadata } from 'next'
import { ContactPageView } from '../../../components/site/ContactPage'
import { CONTACT_DESCRIPTION } from '../../../lib/pageDescriptions'
import { buildMetadata } from '../../../lib/seo'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = buildMetadata({
  title: 'Contact a Sialkot Private Label Manufacturer',
  description: CONTACT_DESCRIPTION,
  path: '/contact',
})

/**
 * The page is drawn by `ContactPageView` in `components/site/ContactPage.tsx` (since 2026-11-15), which the Russian page
 * at /ru/contact draws too; this file is the English address and its metadata.
 */
export default async function ContactPage({
  searchParams,
}: {
  searchParams: Promise<{
    sent?: string
    error?: string
    reason?: string
    garment?: string | string[]
    colour?: string | string[]
  }>
}) {
  return <ContactPageView searchParams={searchParams} />
}
