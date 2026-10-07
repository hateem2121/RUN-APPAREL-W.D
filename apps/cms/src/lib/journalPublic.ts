import { journalClusterLabel, journalPostPath, relatedPagesFor } from './journal'
import { validSlug } from './journalHooks'
import { onSiteMedia } from './siteMedia'

/**
 * What the public Journal pages read, and the shape they read it in (PLAN.md E6). Pure, so it is
 * tested without Payload; `content.ts` wraps it with the cache and the failure policy.
 *
 * ⚠️ PUBLISHED ONLY, TWICE OVER. The local API overrides access control by default (Payload
 * docs, "Local API: access control", read 2026-10-07), so the collection's own read rule does
 * NOT protect these reads. Every query asks for `_status: published` with `draft: false` (the
 * main rows, never the newest draft version), and `toJournalPost` refuses any row that is not
 * published anyway, so a query changed carelessly later still cannot show a draft.
 */

type Doc = Record<string, unknown>

/** The arguments the readers pass to `payload.find` (a subset of its options). */
export type FindArgs = {
  collection: string
  where: Record<string, unknown>
  draft: false
  sort?: string
  limit: number
  depth: number
  pagination?: boolean
}
export type Find = (args: FindArgs) => Promise<{ docs: unknown[] }>

const PUBLISHED = { _status: { equals: 'published' } } as const

/** The newest 100 published posts. The Journal will not reach that for years; it is a ceiling. */
export const journalPostsQuery = (): FindArgs => ({
  collection: 'journal-posts',
  where: PUBLISHED,
  draft: false,
  sort: '-publishedAt',
  limit: 100,
  // Populates the pictures and the author; the body's pictures and links come with it.
  depth: 1,
  pagination: false,
})

export const journalPostQuery = (slug: string): FindArgs => ({
  collection: 'journal-posts',
  where: { and: [{ slug: { equals: slug } }, PUBLISHED] },
  draft: false,
  limit: 1,
  depth: 1,
  pagination: false,
})

export type PublicImage = { url: string; alt: string; width: number; height: number }

const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '')
const isoDate = (value: unknown): string | null => {
  const raw = text(value)
  if (!raw) return null
  const time = Date.parse(raw)
  return Number.isNaN(time) ? null : new Date(time).toISOString()
}

/**
 * A populated Media document as a picture a visitor may load: an absolute address on the
 * site's media host and its measured size (every `<img>` carries width and height). Payload's
 * own `/api/media/file/…` route is refused: `Media.read` is signed-in only, so it is a 403 to a
 * visitor (`projectPublic.ts`, audit FA-O-10).
 */
export function publicImage(value: unknown): PublicImage | null {
  if (!value || typeof value !== 'object') return null
  const media = value as Doc
  const url = onSiteMedia(text(media.url))
  const width = typeof media.width === 'number' && media.width > 0 ? media.width : 0
  const height = typeof media.height === 'number' && media.height > 0 ? media.height : 0
  if (!/^https?:\/\//.test(url) || !width || !height) return null
  return { url, alt: text(media.alt), width, height }
}

/**
 * A link's address inside a post body, or null to draw its words without a link. Only web,
 * mail and phone addresses and paths on this site: a `javascript:` or `data:` address typed into
 * the editor never reaches the page, and `//host` (which leaves the site) is refused as well. A
 * link to another post becomes that post's address; at depth 0 its slug is unknown, so none.
 */
export function richTextHref(fields: unknown): string | null {
  if (!fields || typeof fields !== 'object') return null
  const link = fields as { linkType?: unknown; url?: unknown; doc?: unknown }
  if (link.linkType === 'internal') {
    const doc = link.doc as { relationTo?: unknown; value?: unknown } | undefined
    const slug =
      doc?.relationTo === 'journal-posts' && doc.value && typeof doc.value === 'object'
        ? text((doc.value as Doc).slug)
        : ''
    return validSlug(slug) === true ? journalPostPath(slug) : null
  }
  const url = text(link.url)
  if (/^(https?:\/\/|mailto:|tel:)/i.test(url)) return url
  if (url.startsWith('/') && !url.startsWith('//')) return url
  return null
}

export type JournalAuthor = {
  name: string
  role: string
  bio: string
  url: string | null
  photo: PublicImage | null
}

export type JournalPostView = {
  slug: string
  path: string
  title: string
  description: string
  cluster: { value: string; label: string } | null
  publishedAt: string
  updatedAt: string
  author: JournalAuthor | null
  hero: PublicImage | null
  share: PublicImage | null
  /** The Lexical document, for `RichText`. Null when absent. */
  body: unknown
  related: Array<{ href: string; name: string }>
  /** The person who checked an AI-assisted draft (T14); null when the post was not one. */
  checkedBy: string | null
}

function toAuthor(value: unknown): JournalAuthor | null {
  if (!value || typeof value !== 'object') return null
  const author = value as Doc
  const name = text(author.name)
  if (!name) return null
  const url = text(author.linkedinUrl)
  return {
    name,
    role: text(author.role),
    bio: text(author.bio),
    url: url.startsWith('https://www.linkedin.com/') ? url : null,
    photo: publicImage(author.photo),
  }
}

/** A published post row as the pages draw it; null for anything else. */
export function toJournalPost(doc: unknown): JournalPostView | null {
  if (!doc || typeof doc !== 'object') return null
  const row = doc as Doc
  if (row._status !== 'published') return null
  const slug = text(row.slug)
  const title = text(row.title)
  const publishedAt = isoDate(row.publishedAt)
  if (validSlug(slug) !== true || !title || !publishedAt) return null
  const label = journalClusterLabel(row.cluster)
  // The checker is an author row (2026-10-07): only its name is drawn, never a typed string.
  const checker =
    row.aiAssisted === true && row.checkedBy && typeof row.checkedBy === 'object'
      ? (row.checkedBy as Doc)
      : null
  const checkedBy = checker ? text(checker.name) : ''
  return {
    slug,
    path: journalPostPath(slug),
    title,
    description: text(row.description),
    cluster: label ? { value: String(row.cluster), label } : null,
    publishedAt,
    updatedAt: isoDate(row.updatedAt) ?? publishedAt,
    author: toAuthor(row.author),
    hero: publicImage(row.heroImage),
    share: publicImage(row.shareImage),
    body: row.body && typeof row.body === 'object' ? row.body : null,
    related: relatedPagesFor(row.relatedPages),
    checkedBy: checkedBy || null,
  }
}

const posts = (docs: readonly unknown[]) =>
  docs.map(toJournalPost).filter((post): post is JournalPostView => post !== null)

/** Every published post, newest first. Throws only what `find` throws. */
export async function readPublishedPosts(find: Find): Promise<JournalPostView[]> {
  const { docs } = await find(journalPostsQuery())
  return posts(docs)
}

/** One published post by its address; null when there is none (or the address is not a slug). */
export async function readPublishedPost(find: Find, slug: string): Promise<JournalPostView | null> {
  if (validSlug(slug) !== true) return null
  const { docs } = await find(journalPostQuery(slug))
  return posts(docs).find((post) => post.slug === slug) ?? null
}
