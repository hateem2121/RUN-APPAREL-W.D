import { describe, expect, it, vi } from 'vitest'
import {
  type FindArgs,
  journalPostQuery,
  journalPostsQuery,
  publicImage,
  readPublishedPost,
  readPublishedPosts,
  richTextHref,
  toJournalPost,
} from './journalPublic'

/**
 * What the public Journal pages read (PLAN.md E6, Task 4.4). The local API skips access control
 * (Payload docs, "Local API: access control", read 2026-10-07), so the site's own reader is the
 * only thing between a draft and a visitor. Each test plants a DRAFT beside a published post.
 */

const picture = (id: number, width = 1600, height = 900) => ({
  id,
  url: `https://media.wear-run.help/journal-${id}.jpg`,
  alt: `Picture ${id}`,
  width,
  height,
})

const body = {
  root: { type: 'root', children: [], direction: null, format: '', indent: 0, version: 1 },
}

const published = {
  id: 1,
  _status: 'published',
  title: 'What “made properly” means to us',
  slug: 'made-properly',
  description: 'How a garment is checked before it is packed.',
  cluster: 'craft-and-making',
  publishedAt: '2026-10-08T09:00:00.000Z',
  updatedAt: '2026-10-09T10:00:00.000Z',
  heroImage: picture(11),
  shareImage: picture(12, 1200, 630),
  body,
  relatedPages: ['/guides/minimum-order-and-samples', '/custom-teamwear-manufacturer'],
  aiAssisted: false,
  checkedBy: 'Someone',
  author: null,
}

const plantedDraft = {
  ...published,
  id: 2,
  _status: 'draft',
  slug: 'planted-draft',
  title: 'A draft nobody should see',
}

/** A stand-in for `payload.find` that honours the two conditions the readers send. */
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

/** One that ignores the query entirely: the projection must still refuse the draft. */
const carelessFind = (rows: ReadonlyArray<Record<string, unknown>>) =>
  vi.fn(async (_args: FindArgs) => ({ docs: [...rows] }))

describe('the queries ask for published posts themselves', () => {
  it('list: published only, never a draft version, newest first', () => {
    const query = journalPostsQuery()
    expect(query).toMatchObject({
      collection: 'journal-posts',
      where: { _status: { equals: 'published' } },
      draft: false,
      sort: '-publishedAt',
      depth: 1,
    })
  })

  it('one post: its slug AND published, never a draft version', () => {
    expect(journalPostQuery('made-properly')).toMatchObject({
      collection: 'journal-posts',
      where: { and: [{ slug: { equals: 'made-properly' } }, { _status: { equals: 'published' } }] },
      draft: false,
      limit: 1,
    })
  })
})

describe('the readers', () => {
  it('list the published post and not the planted draft', async () => {
    const find = honestFind([published, plantedDraft])
    const posts = await readPublishedPosts(find)
    expect(posts.map((post) => post.slug)).toEqual(['made-properly'])
    expect(find.mock.calls[0]![0].draft).toBe(false)
  })

  it('refuse the draft even when the database hands it over', async () => {
    const posts = await readPublishedPosts(carelessFind([plantedDraft, published]))
    expect(posts.map((post) => post.slug)).toEqual(['made-properly'])
  })

  it('find one published post by its address; a draft’s address finds nothing', async () => {
    const find = honestFind([published, plantedDraft])
    expect((await readPublishedPost(find, 'made-properly'))?.title).toBe(published.title)
    expect(await readPublishedPost(find, 'planted-draft')).toBeNull()
    expect(await readPublishedPost(carelessFind([plantedDraft]), 'planted-draft')).toBeNull()
  })

  it('never ask the database about an address that cannot be a slug', async () => {
    const find = honestFind([published])
    expect(await readPublishedPost(find, '../admin')).toBeNull()
    expect(await readPublishedPost(find, 'Made-Properly')).toBeNull()
    expect(find).not.toHaveBeenCalled()
  })
})

describe('a post as the page sees it', () => {
  it('carries its address, cluster label, dates, pictures and Read more links', () => {
    const post = toJournalPost(published)
    expect(post).toMatchObject({
      slug: 'made-properly',
      path: '/journal/made-properly',
      cluster: { value: 'craft-and-making', label: 'Craft and making' },
      publishedAt: '2026-10-08T09:00:00.000Z',
      updatedAt: '2026-10-09T10:00:00.000Z',
      author: null,
      checkedBy: null,
      related: [
        { href: '/guides/minimum-order-and-samples', name: expect.any(String) },
        { href: '/custom-teamwear-manufacturer', name: expect.any(String) },
      ],
    })
    // The admin's media host is rewritten to the site's, as every other picture is.
    expect(post?.hero?.url).toBe('https://media.wear-run.com/journal-11.jpg')
    expect(post?.share).toMatchObject({ width: 1200, height: 630 })
  })

  it('names the checker only when the post was drafted with AI help (T14)', () => {
    expect(toJournalPost({ ...published, aiAssisted: true })?.checkedBy).toBe('Someone')
    expect(toJournalPost({ ...published, aiAssisted: true, checkedBy: ' ' })?.checkedBy).toBeNull()
  })

  it('shows a named author only when the author row is there', () => {
    const author = {
      id: 3,
      name: 'A. Writer',
      role: 'Merchandiser',
      bio: 'Writes about samples.',
      linkedinUrl: 'https://www.linkedin.com/in/a-writer',
      photo: picture(13, 400, 400),
    }
    expect(toJournalPost({ ...published, author })?.author).toMatchObject({
      name: 'A. Writer',
      role: 'Merchandiser',
      url: 'https://www.linkedin.com/in/a-writer',
    })
    // At depth 0 the author is a bare id: no name to show, so the company is named.
    expect(toJournalPost({ ...published, author: 3 })?.author).toBeNull()
  })

  it('is refused without a slug, a title or a real publish date', () => {
    expect(toJournalPost({ ...published, slug: '' })).toBeNull()
    expect(toJournalPost({ ...published, title: '' })).toBeNull()
    expect(toJournalPost({ ...published, publishedAt: 'not a date' })).toBeNull()
    expect(toJournalPost(null)).toBeNull()
  })

  it('an unknown cluster reads as no cluster rather than a broken label', () => {
    expect(toJournalPost({ ...published, cluster: 'retired' })?.cluster).toBeNull()
  })
})

describe('a link written inside a post body', () => {
  it('keeps web, mail, phone and on-site addresses', () => {
    expect(richTextHref({ url: 'https://example.com/a' })).toBe('https://example.com/a')
    expect(richTextHref({ url: 'mailto:partner@example.com' })).toBe('mailto:partner@example.com')
    expect(richTextHref({ url: 'tel:+923361777313' })).toBe('tel:+923361777313')
    expect(richTextHref({ url: '/guides/minimum-order-and-samples' })).toBe(
      '/guides/minimum-order-and-samples',
    )
  })

  it('refuses a script address and a protocol-relative one', () => {
    expect(richTextHref({ url: 'javascript:alert(1)' })).toBeNull()
    expect(richTextHref({ url: ' JavaScript:alert(1)' })).toBeNull()
    expect(richTextHref({ url: '//evil.example/x' })).toBeNull()
    expect(richTextHref({ url: 'data:text/html,x' })).toBeNull()
  })

  it('turns a link to another post into that post’s address, or nothing at depth 0', () => {
    expect(
      richTextHref({
        linkType: 'internal',
        doc: { relationTo: 'journal-posts', value: { slug: 'made-properly' } },
      }),
    ).toBe('/journal/made-properly')
    expect(
      richTextHref({ linkType: 'internal', doc: { relationTo: 'journal-posts', value: 4 } }),
    ).toBeNull()
  })
})

describe('a picture the page may show', () => {
  it('needs an absolute address and its measured size', () => {
    expect(publicImage(picture(1))).toMatchObject({ width: 1600, height: 900, alt: 'Picture 1' })
    // Payload's own `/api/media/file/…` is a 403 to a visitor (projectPublic.ts, FA-O-10).
    expect(publicImage({ ...picture(1), url: '/api/media/file/x.jpg' })).toBeNull()
    expect(publicImage({ ...picture(1), width: undefined })).toBeNull()
    expect(publicImage(7)).toBeNull()
  })
})
