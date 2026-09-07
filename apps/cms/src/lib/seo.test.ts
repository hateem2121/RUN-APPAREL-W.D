import { describe, expect, it } from 'vitest'
import { SITE_ORIGIN, VIEWER_ORIGIN, buildMetadata } from './seo'

describe('origins', () => {
  it('the public site and the 3D viewer are DIFFERENT hosts', () => {
    // The viewer is reached from printed QR tags and is a separate Worker. If the
    // marketing pages ever claimed canonical URLs on that host, Google would be told
    // the garment page and the marketing page are the same document.
    expect(SITE_ORIGIN).not.toBe(VIEWER_ORIGIN)
    expect(VIEWER_ORIGIN).toContain('viewer.')
    expect(SITE_ORIGIN).not.toContain('viewer.')
  })

  it('neither origin carries a trailing slash, so joins never double up', () => {
    expect(SITE_ORIGIN.endsWith('/')).toBe(false)
    expect(VIEWER_ORIGIN.endsWith('/')).toBe(false)
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
