import { describe, expect, it } from 'vitest'
import { GARMENT_PAGES, SITE_ORIGIN, buildMetadata } from './seo'

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
})
