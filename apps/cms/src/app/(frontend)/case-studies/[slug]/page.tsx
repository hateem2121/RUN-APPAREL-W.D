import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { CaseStudyPage } from '../../../../components/site/CaseStudyPage'
import { getCaseStudy, getSiteSettings } from '../../../../lib/content'
import { buildArticleMetadata } from '../../../../lib/seo'

/** Rendered per request, like every page here (the layout reads the site settings). */
export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ slug: string }> }

/**
 * One published case study. As `journal/[slug]/page.tsx`: a draft's or an unknown address is a
 * 404 through `notFound()` (T18: the status is right, its page appears with JavaScript), and a
 * database failure is a 500, never a 404.
 */
async function load(slug: string) {
  const lookup = await getCaseStudy(slug)
  if (lookup.status === 'missing') notFound()
  if (lookup.status === 'failed') throw new Error('The case study could not be read.')
  return lookup.value
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const study = await load((await params).slug)
  const settings = await getSiteSettings()
  const picture = study.share ?? study.images[0] ?? null
  return buildArticleMetadata({
    title: study.title,
    description: study.description,
    path: study.path,
    image: picture ? { ...picture, alt: picture.alt || study.title } : null,
    publishedTime: study.publishedAt,
    modifiedTime: study.updatedAt,
    authors: [settings.companyName],
  })
}

export default async function CaseStudyRoute({ params }: Props) {
  const study = await load((await params).slug)
  return <CaseStudyPage study={study} />
}
