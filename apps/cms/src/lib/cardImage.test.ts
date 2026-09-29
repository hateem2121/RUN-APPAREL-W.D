import { describe, expect, it } from 'vitest'
import { CARD_SIZES, CARD_WIDTHS, cardImage } from './cardImage'

const RENDER = 'https://media.wear-run.com/r-xmp-wine-render.webp'

describe('cardImage: a card-sized copy of a gallery picture (owner, 2026-09-29)', () => {
  it('resizes a media.wear-run.com picture through Cloudflare, fitting the 4:5 card box', () => {
    const image = cardImage(RENDER)
    expect(image.src).toBe(
      'https://media.wear-run.com/cdn-cgi/image/fit=scale-down,width=720,height=900,format=auto,onerror=redirect/r-xmp-wine-render.webp',
    )
    expect(image.sizes).toBe(CARD_SIZES)
  })

  it('offers every card width, each box 4:5, so a 3x phone and a 1x desktop both get enough pixels', () => {
    const { srcSet } = cardImage(RENDER)
    const candidates = srcSet?.split(', ') ?? []
    expect(candidates).toHaveLength(CARD_WIDTHS.length)
    CARD_WIDTHS.forEach((width, i) => {
      expect(candidates[i]).toBe(
        `https://media.wear-run.com/cdn-cgi/image/fit=scale-down,width=${width},height=${width * 1.25},format=auto,onerror=redirect/r-xmp-wine-render.webp ${width}w`,
      )
    })
  })

  // A failed or over-quota resize must never become a broken card: `onerror=redirect` sends the
  // browser to the original file instead (Cloudflare Images, free plan, 2026-09-29).
  it('falls back to the original file when a resize fails', () => {
    expect(cardImage(RENDER).src).toContain('onerror=redirect')
  })

  // NEGATIVE CONTROLS: only the zone where resizing is switched on may be rewritten. The admin's
  // media.wear-run.help is another zone, and a local build serves Payload's own relative path.
  it('leaves any other address exactly as it is', () => {
    for (const url of [
      'https://media.wear-run.help/r-xmp-wine-render.webp',
      '/api/media/file/r-xmp-wine-render.webp',
      'https://evil.example/media.wear-run.com/x.webp',
      '',
    ]) {
      expect(cardImage(url)).toEqual({ src: url })
    }
  })

  it('never resizes a picture twice', () => {
    const once = cardImage(RENDER).src
    expect(cardImage(once)).toEqual({ src: once })
  })
})
