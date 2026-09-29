import { describe, expect, it } from 'vitest'
import {
  evaluateCardImage,
  evaluatePreconnect,
  extractPreconnectHosts,
  firstCardImage,
  MEDIA_HOST,
  UNEXPECTED_HOST,
} from '../../../scripts/preconnect-probe.mjs'

/**
 * SO-05, rewritten 2026-09-29 when the /products cards moved to Cloudflare-resized pictures on
 * the page's own address (`apps/cms/src/lib/cardImage.ts`). See the script's header for why this
 * is a LIVE check: no local runtime serves `/cdn-cgi/image/`, and the resizing depends on a
 * dashboard setting and a monthly free quota that no code can see.
 */
describe('extractPreconnectHosts', () => {
  it('reads every preconnect host from a page', () => {
    const html =
      `<link rel="preconnect" href="https://media.wear-run.help">` +
      '<link rel="icon" href="/icon.svg">'
    expect(extractPreconnectHosts(html)).toEqual(['media.wear-run.help'])
  })

  it('is empty when the page declares none', () => {
    expect(extractPreconnectHosts('<link rel="icon" href="/icon.svg">')).toEqual([])
  })

  it('ignores an unparseable href rather than throwing', () => {
    expect(extractPreconnectHosts('<link rel="preconnect" href="not a url">')).toEqual([])
  })
})

describe('evaluatePreconnect', () => {
  it('accepts a page with no media preconnect', () => {
    expect(evaluatePreconnect([]).ok).toBe(true)
  })

  // The cards no longer fetch from media.wear-run.com, so a hint to it is a wasted connection.
  it('flags a preconnect to the media host the cards no longer fetch from', () => {
    const r = evaluatePreconnect([MEDIA_HOST])
    expect(r.ok).toBe(false)
    expect(r.problems.join(' ')).toContain(MEDIA_HOST)
  })

  it('flags a wasted preconnect to the viewer host, which is only ever linked to', () => {
    const r = evaluatePreconnect([UNEXPECTED_HOST])
    expect(r.ok).toBe(false)
    expect(r.problems.join(' ')).toContain(UNEXPECTED_HOST)
  })
})

describe('the first card picture is a resized one', () => {
  const card = (src: string) =>
    `<ul><li><img class="product-card__img" src="${src}" alt="x" width="1200" height="1500"/></li></ul>`
  const RESIZED =
    '/cdn-cgi/image/fit=scale-down,width=720,height=900,quality=90,format=auto,onerror=redirect/https://media.wear-run.com/r-xmp-wine-render.webp'

  it('finds the first card picture', () => {
    expect(firstCardImage(card(RESIZED) + card('/second.webp'))).toBe(RESIZED)
    expect(firstCardImage('<p>no cards</p>')).toBeNull()
  })

  it('accepts a resized picture', () => {
    expect(evaluateCardImage(RESIZED).ok).toBe(true)
  })

  // NEGATIVE CONTROL: the full render straight from the media host is the 0.67 page again.
  it('flags a card that draws the full-size picture', () => {
    const r = evaluateCardImage('https://media.wear-run.com/r-xmp-wine-render.webp')
    expect(r.ok).toBe(false)
    expect(r.problems.join(' ')).toMatch(/not resized/)
  })

  it('flags a page with no card picture at all', () => {
    expect(evaluateCardImage(null).ok).toBe(false)
  })
})
