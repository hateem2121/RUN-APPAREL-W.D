import { describe, expect, it } from 'vitest'
import { GARMENT_PAGES, SITE_ORIGIN, buildArticleMetadata, buildMetadata } from './seo'
import { shareCardFor } from './shareImages'

describe('origins', () => {
  /**
   * ONE SITE ON ONE DOMAIN SINCE 2026-09-28 (owner decision). The garment pages moved
   * from viewer.wear-run.help into the site's own /products folder, so the listing at
   * /products and each garment page below it are parts of one address structure.
   */
  it('the garment pages live on the site itself, in its /products folder', () => {
    expect(SITE_ORIGIN).toBe('https://wear-run.com')
    expect(GARMENT_PAGES).toBe(`${SITE_ORIGIN}/products`)
    expect(GARMENT_PAGES).not.toContain('viewer.')
  })

  it('neither carries a trailing slash, so joins never double up', () => {
    expect(SITE_ORIGIN.endsWith('/')).toBe(false)
    expect(GARMENT_PAGES.endsWith('/')).toBe(false)
  })
})

describe('buildMetadata', () => {
  const meta = buildMetadata({
    title: 'Products',
    description: 'Every garment.',
    path: '/products',
  })

  it('sets a canonical URL on the public origin', () => {
    expect(meta.alternates?.canonical).toBe(`${SITE_ORIGIN}/products`)
  })

  it('keeps the canonical clean for the homepage rather than emitting a bare slash', () => {
    // `${ORIGIN}${'/'}` would produce "https://host/" while every other page has no
    // trailing slash — two spellings of one site, which is what canonical exists to
    // prevent.
    const home = buildMetadata({ title: 'Home', description: 'x', path: '/' })
    expect(home.alternates?.canonical).toBe(SITE_ORIGIN)
  })

  it('gives OpenGraph and Twitter the SAME title, description and URL as the page', () => {
    // The viewer learned this one: tags that exist on some pages and not others
    // produce link previews that are right sometimes and generic otherwise, and
    // nothing fails. One builder means a new page cannot forget them.
    expect(meta.openGraph?.title).toBe('Products')
    expect(meta.openGraph?.description).toBe('Every garment.')
    expect(meta.openGraph).toMatchObject({
      url: `${SITE_ORIGIN}/products`,
      siteName: 'RUN APPAREL',
    })
    expect(meta.twitter).toMatchObject({
      card: 'summary_large_image',
      title: 'Products',
      description: 'Every garment.',
    })
  })

  /*
   * Polish X14 (the owner's answer Q11): each page type shares its own picture, with its size, its
   * type and words that say what is in it, the same for Open Graph and for X. Until then every page
   * named `og-default.png`, which showed the old address.
   */
  it('names the page type’s own picture, sized and described, for Open Graph and X alike', () => {
    const path = '/guides/garment-printing-methods'
    const card = shareCardFor(path)
    const image = {
      url: `${SITE_ORIGIN}/share/guides-garment-printing-methods.jpg`,
      width: 1200,
      height: 630,
      alt: card.alt,
      type: 'image/jpeg',
    }
    const guide = buildMetadata({ title: 'x', description: 'y', path })
    expect(guide.openGraph?.images).toEqual([image])
    expect(guide.twitter?.images).toEqual([{ url: image.url, alt: card.alt }])
  })

  it('gives privacy the home page’s picture, and no page the old one', () => {
    const privacy = buildMetadata({ title: 'x', description: 'y', path: '/privacy' })
    expect(privacy.openGraph?.images).toEqual([
      expect.objectContaining({ url: `${SITE_ORIGIN}/share/home.jpg` }),
    ])
    expect(JSON.stringify(meta)).not.toContain('og-default')
  })
})

/**
 * T8 (PLAN.md): a Journal post shares as an article: og:type article with its published and
 * modified times and author (Next's generateMetadata docs, 16.4.0, updated 2026-08-19), its own
 * share picture of at least 1200 × 630, and X's large card. Pinterest, LinkedIn and X read these.
 */
describe('buildArticleMetadata', () => {
  const image = {
    url: 'https://media.wear-run.com/share.jpg',
    width: 1200,
    height: 630,
    alt: 'Stitching a collar',
  }
  const article = buildArticleMetadata({
    title: 'What made properly means',
    description: 'How a garment is checked.',
    path: '/journal/made-properly',
    image,
    publishedTime: '2026-10-08T09:00:00.000Z',
    modifiedTime: '2026-10-09T10:00:00.000Z',
    authors: ['RUN APPAREL'],
  })

  it('is an article with its times and author, on its canonical address', () => {
    expect(article.alternates?.canonical).toBe(`${SITE_ORIGIN}/journal/made-properly`)
    expect(article.openGraph).toMatchObject({
      type: 'article',
      url: `${SITE_ORIGIN}/journal/made-properly`,
      publishedTime: '2026-10-08T09:00:00.000Z',
      modifiedTime: '2026-10-09T10:00:00.000Z',
      authors: ['RUN APPAREL'],
      locale: 'en_US',
    })
  })

  it('shares the post’s own picture, with its size and words, on a large card', () => {
    expect(article.openGraph?.images).toEqual([image])
    expect(article.twitter).toMatchObject({
      card: 'summary_large_image',
      images: [{ url: image.url, alt: image.alt }],
    })
  })

  it('falls back to the page type’s card when the post has no usable picture', () => {
    const bare = buildArticleMetadata({
      title: 'x',
      description: 'y',
      path: '/journal/x',
      image: null,
      publishedTime: '2026-10-08T09:00:00.000Z',
      modifiedTime: '2026-10-08T09:00:00.000Z',
      authors: [],
    })
    expect(bare.openGraph?.images).toEqual([expect.objectContaining({ width: 1200, height: 630 })])
  })

  it('carries the feed link when asked, for the Journal pages (T9)', () => {
    const withFeed = buildArticleMetadata({
      title: 'x',
      description: 'y',
      path: '/journal/x',
      image,
      publishedTime: '2026-10-08T09:00:00.000Z',
      modifiedTime: '2026-10-08T09:00:00.000Z',
      authors: [],
      feed: { title: 'RUN APPAREL Journal', path: '/journal/rss.xml' },
    })
    expect(withFeed.alternates?.types).toEqual({
      'application/rss+xml': [
        { url: `${SITE_ORIGIN}/journal/rss.xml`, title: 'RUN APPAREL Journal' },
      ],
    })
  })
})
