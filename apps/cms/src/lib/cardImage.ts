/**
 * A card-sized copy of a gallery picture, resized by Cloudflare at the edge (owner, 2026-09-29).
 *
 * ⚠️ WHY: THE FULL STUDIO RENDER COST /products ITS PHONE SCORE. Since PR #80 (2026-09-27) each
 * card shows the colour's studio render, 365–791 KB and up to 1,991 x 2,824 px, in a box at most
 * 369 x 460 CSS px. Measured with Lighthouse 13.5.0 (mobile) on the live page, 2026-09-29: the
 * first card's 791 KB render made Largest Contentful Paint 8.3–9.3 s and the score 0.67–0.74;
 * with the renders blocked the same page scored 0.88–0.90. Resized to fit 720 x 900 the first
 * three cards weigh 166 KB instead of 1.86 MB, and still carry more pixels than a phone shows.
 *
 * ⚠️ ONLY media.wear-run.com, WHERE THE OWNER SWITCHED RESIZING ON. Cloudflare Images on the
 * free plan: 5,000 unique resizes a month at no charge, and past that a new resize FAILS rather
 * than bills. `onerror=redirect` then sends the browser to the original file, so the worst case
 * is today's page, never a broken card. This page asks for ~3 sizes x ~200 pictures. The admin's
 * media.wear-run.help is another zone and a local build serves Payload's relative path, so both
 * pass through untouched.
 *
 * `fit=scale-down` never enlarges, and fits the picture INSIDE a 4:5 box, as the card's
 * `object-fit: contain` does — a tall render is bounded by the height, a wide one by the width.
 */

/** The card box widths offered, 4:5 each: 400 for 1x screens, 720 and 1,080 for 2x and 3x phones. */
export const CARD_WIDTHS = [400, 720, 1080] as const

/**
 * How wide a card draws: one column below ~600 px (`.product-grid` is auto-fill minmax(260px, 1fr)
 * inside the page gutters), else ~310–340 px. Measured on the live page 2026-09-29: 348 px at
 * 390, 369 at 412, 332 at 768, 333 at 1280, 308 at 1920.
 */
export const CARD_SIZES = '(max-width: 599px) calc(100vw - 42px), 340px'

const RESIZING_ORIGIN = 'https://media.wear-run.com/'
const DEFAULT_WIDTH = 720

const resized = (key: string, width: number) =>
  `${RESIZING_ORIGIN}cdn-cgi/image/fit=scale-down,width=${width},height=${width * 1.25},format=auto,onerror=redirect/${key}`

export function cardImage(url: string): { src: string; srcSet?: string; sizes?: string } {
  if (!url.startsWith(RESIZING_ORIGIN)) return { src: url }
  const key = url.slice(RESIZING_ORIGIN.length)
  if (key.length === 0 || key.startsWith('cdn-cgi/')) return { src: url }
  return {
    src: resized(key, DEFAULT_WIDTH),
    srcSet: CARD_WIDTHS.map((width) => `${resized(key, width)} ${width}w`).join(', '),
    sizes: CARD_SIZES,
  }
}
