import { describe, expect, it, vi } from 'vitest'
import {
  caseStudiesQuery,
  caseStudyQuery,
  readPublishedCaseStudies,
  readPublishedCaseStudy,
  toCaseStudy,
} from './caseStudyPublic'
import type { FindArgs } from './journalPublic'

/**
 * What the public case-study pages read (PLAN.md D9, E7, Task 5.3). A planted DRAFT sits beside
 * a published case study in every reader test; the client's name and words appear only with the
 * client's permission.
 */

const picture = (id: number) => ({
  id,
  url: `https://media.wear-run.help/case-${id}.jpg`,
  alt: `Picture ${id}`,
  width: 1600,
  height: 1000,
})

const garment = {
  id: 5,
  status: 'published',
  slug: 'rxps',
  productName: 'Velocity Performance Tee',
  colourways: [{ slug: 'wine', displayName: 'Wine', sourceVariantName: 'Wine' }],
}

const published = {
  id: 1,
  _status: 'published',
  title: 'Team kit for a cycling club',
  slug: 'cycling-club-kit',
  description: 'Jerseys for a club, from sample to delivery.',
  firstPublishedAt: '2026-10-08T09:00:00.000Z',
  updatedAt: '2026-10-09T10:00:00.000Z',
  clientDescription: 'a cycling club in the UK',
  clientNamed: true,
  clientName: 'A Club',
  whatWasMade: 'Jerseys',
  quantity: '120 pieces',
  timeline: '4 weeks',
  challenge: 'First line.\n\nSecond line.',
  whatWeDid: 'We did it.',
  result: 'It worked.',
  clientQuote: 'Great kit.',
  quoteAttribution: 'Club secretary',
  clientPermission: false,
  images: [picture(1), picture(2)],
  shareImage: { ...picture(3), width: 1200, height: 630 },
  relatedProducts: [garment, { ...garment, id: 6, slug: 'draft-garment', status: 'draft' }],
}

const plantedDraft = { ...published, id: 2, _status: 'draft', slug: 'planted-draft' }

function honestFind(rows: ReadonlyArray<Record<string, unknown>>) {
  return vi.fn(async (args: FindArgs) => {
    const where = JSON.stringify(args.where)
    const wantsPublished = where.includes('"_status":{"equals":"published"}')
    const slug = /"slug":\{"equals":"([^"]+)"\}/.exec(where)?.[1]
    return {
      docs: rows.filter(
        (row) => (!wantsPublished || row._status === 'published') && (!slug || row.slug === slug),
      ),
    }
  })
}

describe('the case-study queries and readers', () => {
  it('ask for published rows only, never a draft version', () => {
    expect(caseStudiesQuery()).toMatchObject({
      collection: 'case-studies',
      where: { _status: { equals: 'published' } },
      draft: false,
    })
    expect(caseStudyQuery('x')).toMatchObject({
      where: { and: [{ slug: { equals: 'x' } }, { _status: { equals: 'published' } }] },
      draft: false,
    })
  })

  it('list the published case study and not the planted draft, whatever the database does', async () => {
    expect(
      (await readPublishedCaseStudies(honestFind([published, plantedDraft]))).map((c) => c.slug),
    ).toEqual(['cycling-club-kit'])
    const careless = vi.fn(async () => ({ docs: [plantedDraft, published] }))
    expect((await readPublishedCaseStudies(careless)).map((c) => c.slug)).toEqual([
      'cycling-club-kit',
    ])
    expect(await readPublishedCaseStudy(careless, 'planted-draft')).toBeNull()
    expect(await readPublishedCaseStudy(honestFind([published]), '../x')).toBeNull()
  })
})

describe('a case study as the page sees it', () => {
  it('keeps the facts and the story in the template’s order, paragraphs split on blank lines', () => {
    const study = toCaseStudy(published)
    expect(study?.facts).toEqual([
      { label: 'What was made', value: 'Jerseys' },
      { label: 'For whom', value: 'a cycling club in the UK' },
      { label: 'How many', value: '120 pieces' },
      { label: 'How long', value: '4 weeks' },
    ])
    expect(study?.story[0]).toEqual({
      label: 'The challenge',
      paragraphs: ['First line.', 'Second line.'],
    })
    expect(study?.path).toBe('/case-studies/cycling-club-kit')
    expect(study?.publishedAt).toBe('2026-10-08T09:00:00.000Z')
  })

  it('shows neither the client’s name nor their words without permission', () => {
    const study = toCaseStudy(published)
    expect(study?.clientName).toBeNull()
    expect(study?.quote).toBeNull()
  })

  it('shows them once permission is recorded, and the name only when switched on', () => {
    const study = toCaseStudy({ ...published, clientPermission: true })
    expect(study?.clientName).toBe('A Club')
    expect(study?.quote).toEqual({ text: 'Great kit.', attribution: 'Club secretary' })
    expect(
      toCaseStudy({ ...published, clientPermission: true, clientNamed: false })?.clientName,
    ).toBeNull()
  })

  it('links only published garments, at their default colour’s page', () => {
    expect(toCaseStudy(published)?.garments).toEqual([
      { name: 'Velocity Performance Tee', href: '/products/rxps/wine' },
    ])
  })

  it('is refused without a slug, a title or a first publish date', () => {
    expect(toCaseStudy({ ...published, slug: '' })).toBeNull()
    expect(toCaseStudy({ ...published, title: ' ' })).toBeNull()
    expect(toCaseStudy({ ...published, firstPublishedAt: null })).toBeNull()
  })
})
