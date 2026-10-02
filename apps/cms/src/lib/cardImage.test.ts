import { describe, expect, it } from 'vitest'
import { CARD_SIZES, CARD_WIDTHS, cardImage } from './cardImage'

const RENDER = 'https://media.wear-run.com/r-xmp-wine-render.webp'

describe('cardImage: a card-sized copy of a gallery picture (owner, 2026-09-29)', () => {
  // Served from the PAGE's own address, so a phone reuses the connection the page came on
  // instead of opening a second one to media.wear-run.com before the first picture can start.
  it("resizes a media.wear-run.com picture through Cloudflare on the page's own address, fitting the 4:5 box", () => {
    const image = cardImage(RENDER)
    expect(image.src).toBe(
      '/cdn-cgi/image/fit=scale-down,width=720,height=900,quality=90,format=auto,onerror=redirect/https://media.wear-run.com/r-xmp-wine-render.webp',
    )
    expect(image.sizes).toBe(CARD_SIZES)
  })

  it('offers every card width, each box 4:5, so a 3x phone and a 1x desktop both get enough pixels', () => {
    const { srcSet } = cardImage(RENDER)
    const candidates = srcSet?.split(', ') ?? []
    expect(candidates).toHaveLength(CARD_WIDTHS.length)
    CARD_WIDTHS.forEach((width, i) => {
      expect(candidates[i]).toBe(
        `/cdn-cgi/image/fit=scale-down,width=${width},height=${width * 1.25},quality=90,format=auto,onerror=redirect/https://media.wear-run.com/r-xmp-wine-render.webp ${width}w`,
      )
    })
  })

  // A failed or over-quota resize must never become a broken card: `onerror=redirect` sends the
  // browser to the original file instead (Cloudflare Images, free plan, 2026-09-29).
  /*
   * ⚠️ PINNED TO A CLOUDFLARE FIREWALL RULE. wear-run.com blocks every /cdn-cgi/image/ request
   * except exactly these three (rule "Only the card picture sizes may be resized", added
   * 2026-09-29 to protect the free monthly quota). A blocked picture is a 403, which `onerror`
   * does NOT catch — every card would lose its picture. Change a width, a height or the quality
   * here and the rule must change with it (docs/RUNBOOK.md, "The product cards' pictures").
   */
  it('asks only for the three sizes the firewall rule allows', () => {
    const allowed = [
      '/cdn-cgi/image/fit=scale-down,width=400,height=500,quality=90,format=auto,onerror=redirect/https:',
      '/cdn-cgi/image/fit=scale-down,width=720,height=900,quality=90,format=auto,onerror=redirect/https:',
      '/cdn-cgi/image/fit=scale-down,width=1080,height=1350,quality=90,format=auto,onerror=redirect/https:',
    ]
    const { src, srcSet } = cardImage(RENDER)
    for (const url of [src, ...(srcSet ?? '').split(', ').map((c) => c.split(' ')[0] ?? '')]) {
      expect(
        allowed.some((prefix) => url.startsWith(prefix)),
        url,
      ).toBe(true)
    }
  })

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
    // The branch that matters: an absolute resize URL ON the media host is left alone too.
    const onHost = 'https://media.wear-run.com/cdn-cgi/image/width=100/r-xmp-wine-render.webp'
    expect(cardImage(onHost)).toEqual({ src: onHost })
  })

  // The grid is two cards wide below 900 px since 2026-10-02 (visual audit VA-42): a phone card is
  // 134-169 px, so a full-width `sizes` would have a phone fetch the 1,080 file for a 169 px card.
  // 45vw - 6px is (100vw - two gutters - a 12 px gap) / 2 once the gutter is 5vw; from 900 px it is
  // the 340 px three columns measured.
  it('treats the page as two columns below 900 px and 340 px above', () => {
    expect(cardImage(RENDER).sizes).toBe('(max-width: 899px) calc(45vw - 6px), 340px')
  })
})
