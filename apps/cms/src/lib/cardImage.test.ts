import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { hintAt, pickedWidth } from '../sizesAt'
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

  // A phone's sideways ticket draws its picture as its left 44% since polish M1 (2026-10-05): 122-220
  // px, so a full-width `sizes` would have a phone fetch the 1,080 file for a 153 px picture. From
  // 560 px the grid is two cards wide (visual audit VA-42), from 900 px three, four and five (polish
  // D1). Since polish X15 each step asks for the picture's box less VA-55's 7% margin a side (below);
  // `e2e/productsGrid.spec.ts` measures every step against a real card, which this string cannot.
  it('follows the grid: a sideways ticket below 560 px, two columns below 900, then three, four and five', () => {
    expect(cardImage(RENDER).sizes).toBe(
      '(max-width: 399px) calc(37.84vw - 15.6px), (max-width: 559px) 34.1vw, ' +
        '(max-width: 899px) calc(38.7vw - 4px), (max-width: 1279px) 291px, ' +
        '(max-width: 1439px) calc(28.67vw - 50px), (max-width: 1919px) 267px, 237px',
    )
  })

  /*
   * ⚠️ THE HINT IS THE BOX THE PICTURE IS FITTED INTO, NOT THE CARD'S PICTURE BOX (polish X15,
   * 2026-10-05). VA-55's margin pads every slide picture 7% of its width a side (site.css,
   * `.card-gallery__slide .product-card__img`), so `contain` fits the render into 86% of the box's
   * width, and no render, wide or tall, is drawn wider than that. Asking for the whole box handed
   * a 3x phone at 375-393 px the 720 file (38-60 KB measured live, 2026-10-05) where the 400 file
   * (16-26 KB) already has more pixels than the screen draws, and an 834 px tablet or a 1,280 px
   * laptop at 2x the 1,080 file where 720 is enough. What would have to break: the margin changes
   * and the hint does not follow (here), or the hint falls below the box really drawn (the
   * browser suite).
   */
  it('asks for the picture inside VA-55’s margin, so phones and tablets take the smaller file that still covers it', () => {
    const css = readFileSync(
      join(import.meta.dirname, '..', 'app', '(frontend)', 'site.css'),
      'utf8',
    )
    expect(css).toMatch(/--picture-inset:\s*7%;/)
    expect(css).toMatch(
      /\.card-gallery__slide \.product-card__img,[^{]*\{\s*padding: calc\(var\(--picture-inset\) \* 1\.25\) var\(--picture-inset\);/,
    )
    const { srcSet = '', sizes = '' } = cardImage(RENDER)
    const takes = (width: number, density: number) =>
      pickedWidth(srcSet, hintAt(sizes, width), density)
    for (const width of [360, 375, 390, 393]) expect(takes(width, 3), `${width}@3x`).toBe(400)
    expect(takes(412, 2.625), '412@2.625x').toBe(400)
    for (const width of [820, 834]) expect(takes(width, 2), `${width}@2x`).toBe(720)
    for (const width of [1280, 1366]) expect(takes(width, 2), `${width}@2x`).toBe(720)
    // NEGATIVE CONTROL: the whole box's hint, until X15, handed those screens the larger files.
    const box =
      '(max-width: 559px) calc(40vw - 1px), (max-width: 899px) calc(45vw - 6px), ' +
      '(max-width: 1279px) 340px, (max-width: 1439px) calc(33.34vw - 58px), (max-width: 1919px) 310px, 276px'
    expect(pickedWidth(srcSet, hintAt(box, 390), 3)).toBe(720)
    expect(pickedWidth(srcSet, hintAt(box, 834), 2)).toBe(1080)
    expect(pickedWidth(srcSet, hintAt(box, 1280), 2)).toBe(1080)
  })
})
