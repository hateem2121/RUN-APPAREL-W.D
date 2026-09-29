/**
 * A card-sized copy of a gallery picture, resized by Cloudflare at the edge (owner, 2026-09-29).
 *
 * ⚠️ WHY: THE FULL STUDIO RENDER COST /products ITS PHONE SCORE. Since PR #80 (2026-09-27) each
 * card shows the colour's studio render, 365–791 KB and up to 1,991 x 2,824 px, in a box at most
 * 369 x 460 CSS px. Measured with Lighthouse 13.5.0 (mobile) on the live page, 2026-09-29: the
 * first card's 791 KB render made Largest Contentful Paint 8.3–9.3 s and the score 0.67–0.74;
 * with the renders blocked the same page scored 0.88–0.90. Resized to fit 720 x 900 the first
 * three cards weigh about 150 KB instead of 1.86 MB (quality 90, below), and still carry more
 * pixels than a phone shows.
 *
 * ⚠️ ONLY media.wear-run.com, WHERE THE OWNER SWITCHED RESIZING ON. Cloudflare Images on the
 * free plan: 5,000 unique resizes a month at no charge, and past that a new resize FAILS rather
 * than bills. `onerror=redirect` then sends the browser to the original file, so the worst case
 * is today's page, never a broken card. This page asks for ~3 sizes x ~200 pictures. The admin's
 * media.wear-run.help passes through untouched: resizing works there too (measured), but a
 * picture from that host is blocked on a wear-run.com page by its same-site resource policy, so
 * the public pages never carry one. A local build's relative Payload paths pass through as well.
 *
 * `fit=scale-down` never enlarges, and fits the picture INSIDE a 4:5 box, as the card's
 * `object-fit: contain` does — a tall render is bounded by the height, a wide one by the width.
 */

import { SITE_MEDIA_ORIGIN } from './siteMedia'

/**
 * The card box widths offered, 4:5 each: 400 for 1x screens, 720 and 1,080 for 2x and 3x phones.
 *
 * ⚠️ A CLOUDFLARE FIREWALL RULE ALLOWS EXACTLY THESE URLS. wear-run.com blocks every other
 * /cdn-cgi/image/ request (rule "Only the card picture sizes may be resized", 2026-09-29, which
 * stops anyone spending the free quota on odd sizes). A blocked picture is a 403 that `onerror`
 * does not catch, so changing a width, a height or QUALITY here without changing the rule
 * empties every card. `cardImage.test.ts` pins the three; docs/RUNBOOK.md says how to change both.
 */
export const CARD_WIDTHS = [400, 720, 1080] as const

/**
 * How wide a card draws: one column below 586 px (`.product-grid` is auto-fill minmax(260px, 1fr):
 * two 260 px cards, a 24 px gap and 42 px of gutters need 586), else ~310–340 px. Measured on the
 * live page 2026-09-29: 348 px at 390, 369 at 412, 332 at 768, 333 at 1280, 308 at 1920.
 *
 * The `w` numbers describe the 4:5 BOX, not the picture inside it. A render taller than 4:5 comes
 * back narrower than the box, but it is height-bound in the card too (`object-fit: contain`), so
 * the height it needs is what the box gives: a 3x phone's 434 px-tall card needs 1,302 px, and
 * the 1,080 box is 1,350 px tall.
 */
export const CARD_SIZES = '(max-width: 585px) calc(100vw - 42px), 340px'

const RESIZING_ORIGIN = `${SITE_MEDIA_ORIGIN}/`
const DEFAULT_WIDTH = 720

/*
 * ⚠️ QUALITY 90: THE OWNER'S TRADE BETWEEN FABRIC GRAIN AND SPEED (2026-09-29). The print and
 * logos were sharp at every setting; the FABRIC GRAIN was not. At Cloudflare's default (~85) and
 * at 90 the weave on the rxps chest panel was smoothed; at 95 it came back close to the original.
 * Measured at the 720 card size, AVIF: r-xmp-wine 38 / 60 / 115 KB, rxps-wine 31 / 49 / 123 KB at
 * default / 90 / 95. Lighthouse (mobile, 5 runs each, the local build with production data):
 * 95 scored 0.82, below the 0.85 floor; 90 scored 0.86; the default 0.86–0.88. Shown all three,
 * the owner chose 90. Raising it costs the /products floor; lowering it costs the grain.
 */
const QUALITY = 90

/*
 * ⚠️ ASKED OF THE PAGE'S OWN ADDRESS, NOT OF media.wear-run.com. Both answer
 * `/cdn-cgi/image/…` (same zone, same cache: measured 2026-09-29, `cf-resized: internal=ram/h`
 * on both), and "This zone only" lets wear-run.com resize a media.wear-run.com source. The
 * relative path means a phone reuses the connection the page arrived on, instead of opening a
 * second one to media.wear-run.com before the first picture can start. A failed resize still
 * falls back: forced with an invalid option, both forms answered 307 to the original file.
 */
const resized = (url: string, width: number) =>
  `/cdn-cgi/image/fit=scale-down,width=${width},height=${width * 1.25},quality=${QUALITY},format=auto,onerror=redirect/${url}`

export function cardImage(url: string): { src: string; srcSet?: string; sizes?: string } {
  if (!url.startsWith(RESIZING_ORIGIN)) return { src: url }
  const key = url.slice(RESIZING_ORIGIN.length)
  if (key.length === 0 || key.startsWith('cdn-cgi/')) return { src: url }
  return {
    src: resized(url, DEFAULT_WIDTH),
    srcSet: CARD_WIDTHS.map((width) => `${resized(url, width)} ${width}w`).join(', '),
    sizes: CARD_SIZES,
  }
}
