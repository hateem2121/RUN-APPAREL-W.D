import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { JournalPost } from '../../../../components/site/JournalPost'
import { getJournalPost, getSiteSettings } from '../../../../lib/content'
import { JOURNAL_RSS_PATH } from '../../../../lib/journal'
import { buildArticleMetadata } from '../../../../lib/seo'

/** Rendered per request, like every page here (the layout reads the site settings). */
export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ slug: string }> }

/**
 * One published Journal post. Only a published post is found (`lib/journalPublic.ts`): a
 * draft's address, an unknown one, or anything that cannot be a slug is a 404.
 *
 * ⚠️ A WRONG ADDRESS IS A REAL 404 WHOSE PAGE NEXT DRAWS ONLY WITH JAVASCRIPT (T18,
 * vercel/next.js#62228, recorded at the top of `app/not-found.tsx`): `notFound()` sets the
 * status and `noindex` correctly, and the branded page appears after hydration. Accepted for
 * wrong addresses only; every real post is server-rendered in full.
 *
 * ⚠️ A DATABASE FAILURE IS NOT A 404: telling a crawler a live post is gone would drop it from
 * search. It throws to the site's error page (a 500) instead, and the reader has reported it.
 */
async function load(slug: string) {
  const lookup = await getJournalPost(slug)
  if (lookup.status === 'missing') notFound()
  if (lookup.status === 'failed') throw new Error('The Journal post could not be read.')
  return lookup.value
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const post = await load((await params).slug)
  const settings = await getSiteSettings()
  const picture = post.share ?? post.hero
  return buildArticleMetadata({
    title: post.title,
    description: post.description,
    path: post.path,
    image: picture ? { ...picture, alt: picture.alt || post.title } : null,
    publishedTime: post.publishedAt,
    modifiedTime: post.updatedAt,
    authors: [post.author?.name ?? settings.companyName],
    feed: { title: 'RUN APPAREL Journal', path: JOURNAL_RSS_PATH },
  })
}

export default async function JournalPostPage({ params }: Props) {
  const post = await load((await params).slug)
  const settings = await getSiteSettings()
  return <JournalPost post={post} companyName={settings.companyName} />
}
