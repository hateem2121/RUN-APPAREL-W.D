import { describe, expect, it } from 'vitest'
import { preconnectHost } from './posterHost'
import { SITE_ORIGIN } from './seo'

/**
 * The /products preconnect, tested as the REAL function the page calls (until 2026-09-29 this
 * file tested a copy of it, which could not see the page change underneath it).
 *
 * The decision that can go wrong silently: preconnecting to an origin the page does not fetch
 * from costs a connection and buys nothing. Since 2026-09-29 the cards draw media.wear-run.com
 * pictures through Cloudflare resizing on the page's own address (`lib/cardImage.ts`), so that
 * host no longer needs a connection of its own — the final review found the page still
 * preconnecting to it.
 */
describe('preconnectHost', () => {
  it('stays silent for media.wear-run.com pictures, which the cards now fetch from this page', () => {
    expect(preconnectHost(['https://media.wear-run.com/r-xmp-wine-render.webp'])).toBeNull()
  })

  // NEGATIVE CONTROL: a picture the cards still fetch from another host keeps its hint.
  it('names another media host the cards still fetch from directly', () => {
    expect(preconnectHost(['https://media.wear-run.help/a.webp'])).toBe(
      'https://media.wear-run.help',
    )
  })

  it('stays silent when pictures are same-origin', () => {
    expect(preconnectHost([`${SITE_ORIGIN}/a.webp`])).toBeNull()
  })

  it('stays silent on relative URLs, which is what local development produces', () => {
    expect(preconnectHost(['/api/media/file/a.webp'])).toBeNull()
    expect(preconnectHost([null, null])).toBeNull()
  })

  it('skips cards with no picture to find the first real one', () => {
    expect(preconnectHost([null, null, 'https://media.wear-run.help/b.webp'])).toBe(
      'https://media.wear-run.help',
    )
  })

  it('never throws on a malformed URL', () => {
    expect(preconnectHost(['http://['])).toBeNull()
  })
})
