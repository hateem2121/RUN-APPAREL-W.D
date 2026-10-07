import { buildViewerPath, GARMENT_PATH_PREFIX } from '@run-apparel/shared'
import { CASE_STUDY_FACTS, CASE_STUDY_STORY, caseStudyPath } from './caseStudies'
import { validSlug } from './journalHooks'
import { type Find, type FindArgs, type PublicImage, publicImage } from './journalPublic'
import { toProductCard } from './projectPublic'

/**
 * What the public case-study pages read (PLAN.md D9, E7). The same two layers as
 * `journalPublic.ts`: every query asks for published rows with `draft: false`, and
 * `toCaseStudy` refuses anything else, because the local API skips access control.
 *
 * ⚠️ THE CLIENT'S NAME AND WORDS ARE SHOWN ONLY WITH THEIR PERMISSION (E7). The collection
 * refuses to save a shown name or a quote without `clientPermission`; this projection refuses to
 * SHOW them without it too, so a row saved before that rule, or written around it, still cannot
 * put a client's name on the site.
 */

type Doc = Record<string, unknown>
const PUBLISHED = { _status: { equals: 'published' } } as const

export const caseStudiesQuery = (): FindArgs => ({
  collection: 'case-studies',
  where: PUBLISHED,
  draft: false,
  sort: '-firstPublishedAt',
  limit: 100,
  depth: 1,
  pagination: false,
})

export const caseStudyQuery = (slug: string): FindArgs => ({
  collection: 'case-studies',
  where: { and: [{ slug: { equals: slug } }, PUBLISHED] },
  draft: false,
  limit: 1,
  depth: 1,
  pagination: false,
})

export type CaseStudyView = {
  slug: string
  path: string
  title: string
  description: string
  publishedAt: string
  updatedAt: string
  facts: Array<{ label: string; value: string }>
  story: Array<{ label: string; paragraphs: string[] }>
  clientName: string | null
  quote: { text: string; attribution: string } | null
  images: PublicImage[]
  share: PublicImage | null
  garments: Array<{ name: string; href: string }>
}

const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '')
const isoDate = (value: unknown): string | null => {
  const time = Date.parse(text(value))
  return Number.isNaN(time) ? null : new Date(time).toISOString()
}
const paragraphs = (value: unknown) =>
  text(value)
    .split(/\n\s*\n/)
    .map((part) => part.trim())
    .filter(Boolean)

/** A related garment as a link to its default colour's page; only a published garment. */
function garmentLink(value: unknown): { name: string; href: string } | null {
  if (!value || typeof value !== 'object' || (value as Doc).status !== 'published') return null
  const card = toProductCard(value as Doc)
  if (!card?.defaultColourSlug) return null
  return {
    name: card.productName,
    href: buildViewerPath(card.slug, card.defaultColourSlug, GARMENT_PATH_PREFIX),
  }
}

/** A published case-study row as the pages draw it; null for anything else. */
export function toCaseStudy(doc: unknown): CaseStudyView | null {
  if (!doc || typeof doc !== 'object') return null
  const row = doc as Doc
  if (row._status !== 'published') return null
  const slug = text(row.slug)
  const title = text(row.title)
  const publishedAt = isoDate(row.firstPublishedAt)
  if (validSlug(slug) !== true || !title || !publishedAt) return null
  const permission = row.clientPermission === true
  const quote = text(row.clientQuote)
  return {
    slug,
    path: caseStudyPath(slug),
    title,
    description: text(row.description),
    publishedAt,
    updatedAt: isoDate(row.updatedAt) ?? publishedAt,
    facts: CASE_STUDY_FACTS.flatMap((fact) => {
      const value = text(row[fact.field])
      return value ? [{ label: fact.label, value }] : []
    }),
    story: CASE_STUDY_STORY.flatMap((part) => {
      const parts = paragraphs(row[part.field])
      return parts.length ? [{ label: part.label, paragraphs: parts }] : []
    }),
    clientName: permission && row.clientNamed === true ? text(row.clientName) || null : null,
    quote: permission && quote ? { text: quote, attribution: text(row.quoteAttribution) } : null,
    images: (Array.isArray(row.images) ? row.images : [])
      .map(publicImage)
      .filter((image): image is PublicImage => image !== null),
    share: publicImage(row.shareImage),
    garments: (Array.isArray(row.relatedProducts) ? row.relatedProducts : [])
      .map(garmentLink)
      .filter((link): link is { name: string; href: string } => link !== null),
  }
}

const studies = (docs: readonly unknown[]) =>
  docs.map(toCaseStudy).filter((study): study is CaseStudyView => study !== null)

export async function readPublishedCaseStudies(find: Find): Promise<CaseStudyView[]> {
  const { docs } = await find(caseStudiesQuery())
  return studies(docs)
}

export async function readPublishedCaseStudy(
  find: Find,
  slug: string,
): Promise<CaseStudyView | null> {
  if (validSlug(slug) !== true) return null
  const { docs } = await find(caseStudyQuery(slug))
  return studies(docs).find((study) => study.slug === slug) ?? null
}
