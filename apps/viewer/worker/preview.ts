import type { ViewerApiSuccess } from '@run-apparel/shared'
import type { OgCard } from './og-cards'

/**
 * What a shared link should say, for one garment in one colourway.
 *
 * PURE ON PURPOSE. index.ts is the Cloudflare half — a service-binding fetch and
 * an HTMLRewriter — and neither of those exists under vitest. Everything that
 * makes a *decision* lives here so it can be tested with plain objects, the same
 * split as scripts/csp.mjs (pure, tested) vs scripts/gen-headers.mjs (I/O only),
 * which was made for exactly this reason after the CSP builder caused two
 * incidents while being untestable.
 *
 * Every value here is derived from the CMS payload, so garment #2 needs no code
 * change to get its own preview — the one thing it needs is a set of preview
 * cards, and even without those it falls back to its own poster (see pickImage).
 */

/**
 * The meta tags index.ts overwrites, by their `property=`/`name=` key.
 *
 * Exported because HTMLRewriter treats a selector that matches NOTHING as a
 * no-op, not an error. Delete `<meta property="og:image">` from index.html and
 * the Worker keeps running, keeps returning 200, and silently stops setting the
 * image on every shared link. preview.test.ts asserts each of these still exists
 * in index.html, which turns that silent regression into a failed build.
 */
export const REWRITTEN_META = [
  'og:title',
  'og:description',
  'og:image',
  'og:image:type',
  'og:image:width',
  'og:image:height',
  'og:image:alt',
  'twitter:title',
  'twitter:description',
  'twitter:image',
] as const

export interface PreviewImage {
  url: string
  /** MIME type, so `og:image:type` describes the bytes rather than index.html's guess. */
  type: string
  width: number | null
  height: number | null
  alt: string
}

export interface Preview {
  /** Also used for <title> — a crawler that ignores og:* falls back to it. */
  title: string
  description: string
  /** Absolute; used for og:url AND <link rel="canonical">. */
  url: string
  image: PreviewImage | null
  /**
   * schema.org Product as a ready-to-embed JSON string. Built here, not in
   * index.ts, so the decision stays in the pure half that vitest can reach —
   * `applyPreview` receives only a Preview and never sees the payload.
   */
  jsonLd: string
}

/**
 * 160 characters, the most a search result shows. It was 200 until 2026-09-16,
 * when 15 of the 80 live pages measured 161-176 and lost their last words in
 * every result (audit FI-01). Cutting at a word boundary means the visible text
 * always ends in a whole word rather than mid-"polyeste".
 */
export const MAX_DESCRIPTION = 160

function truncate(text: string, limit = MAX_DESCRIPTION): string {
  if (text.length <= limit) return text
  const cut = text.slice(0, limit - 1)
  const lastSpace = cut.lastIndexOf(' ')
  return `${(lastSpace > limit * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[\s,.·]+$/, '')}…`
}

/**
 * "N001 Velocity Performance Skinsuit — Wine".
 *
 * The product CODE leads because it is what is printed on the physical tag and
 * what a buyer quotes back in an email; the colour is last because that is the
 * part that differs between two links someone has been sent side by side.
 */
function buildTitle(payload: ViewerApiSuccess): string {
  const { productCode, productName } = payload.product
  const name = [productCode, productName].filter(Boolean).join(' ').trim()
  const colour = payload.selectedColourway.displayName.trim()
  return colour ? `${name} — ${colour}` : name
}

/**
 * Specs first, then what the link actually does.
 *
 * Built from whatever the CMS has rather than a fixed sentence, because the
 * generic line ("Interactive 3D garment reference for B2B partners…") was
 * identical on every link and told a lead nothing they could not see from the
 * title. A garment with none of these fields filled in still gets the tail, so
 * this can never return an empty description.
 */
/**
 * ⚠️ THE COLOURWAY IS IN HERE SINCE 2026-09-05, AND ITS ABSENCE WAS AN SEO DEFECT.
 *
 * Measured across all 55 live pages: 55 unique `<title>` tags and only **11 unique
 * descriptions** — every one of a garment's five colourway pages carried a
 * byte-identical description, while each page declares itself canonical. So Google
 * saw five near-duplicate indexable pages per garment, splitting whatever ranking
 * strength the garment has five ways.
 *
 * The colour was already in the title and in `og:image:alt`; it was the description
 * — the line a person actually reads under a search result — that never named it.
 *
 * Done here rather than in the CMS on purpose: this fixes all 55 at once, cannot
 * drift, and does not ask anyone to write 55 descriptions by hand. The colour comes
 * from `selectedColourway`, which is the page that will actually load — a QR tag
 * pointing at a retired colour resolves to the default one, and describing the
 * requested colour would name something the visitor never sees.
 */
function buildDescription(payload: ViewerApiSuccess): string {
  const p = payload.product
  const colour = payload.selectedColourway.displayName.trim()
  const fabric = [p.fabricComposition.trim(), p.gsm.trim()].filter(Boolean).join(', ')
  // No category since 2026-09-16 (owner decision, FI-01). It cost 22 characters on the
  // longest pages, and the page's structured data still carries it.
  const specs = [p.garmentFit.trim(), fabric].filter(Boolean).join(' · ')
  const count = payload.colourways.length
  const tail =
    count > 1 ? `See all ${count} colorways in 3D.` : 'Rotate and zoom this reference in 3D.'
  // "Shown in Wine." rather than prefixing the specs: the specs are what a trade
  // buyer scans for, and pushing them behind the colour buries the useful half.
  const shown = colour ? `Shown in ${colour}.` : ''
  return truncate([specs ? `${specs}.` : '', shown, tail].filter(Boolean).join(' '))
}

/**
 * Preview card, else the colourway's own poster, else nothing.
 *
 * THE ORDER IS THE WHOLE POINT and it is a coverage ladder, not a preference:
 *
 *   1. A JPEG card shipped in public/og/ — renders on every platform, including
 *      LinkedIn and iMessage, which do not take WebP.
 *   2. The CMS poster, whatever format it is — the RIGHT garment in the RIGHT
 *      colour on the platforms that accept it, which beats a correct-looking
 *      card of a different garment. This is what a new garment gets before
 *      anyone runs `pnpm og:cards`.
 *   3. null — index.ts then REMOVES the image tags rather than leaving
 *      index.html's N001-wine default in place. A missing picture is a worse
 *      card; the wrong garment's picture is a lie, and a lie in front of a lead
 *      is the failure this whole feature exists to avoid.
 *
 * Dimensions come from the manifest (read back out of the real JPEG) or from the
 * CMS (read off the real upload). Neither is a constant in this file, because a
 * declared size drifting from the actual image is precisely the silent failure
 * og.test.ts was written for.
 */
function pickImage(
  payload: ViewerApiSuccess,
  origin: string,
  cards: Record<string, OgCard>,
): PreviewImage | null {
  const selected = payload.selectedColourway
  const alt =
    selected.altText.trim() ||
    `${payload.product.productName} in ${selected.displayName}`.trim() ||
    payload.product.productName

  // '/' rather than '-' as the separator: a slug can contain hyphens but never a
  // slash, so 'n001-pro/navy' and 'n001/pro-navy' cannot collide on one key.
  const key = `${payload.product.slug}/${selected.slug}`
  const card = cards[key]
  if (card) {
    return {
      url: `${origin}/og/${key}.jpg`,
      type: 'image/jpeg',
      width: card.width,
      height: card.height,
      alt,
    }
  }

  const poster = selected.poster
  if (poster?.url) {
    return {
      url: poster.url,
      type: poster.mimeType ?? 'image/webp',
      width: poster.width,
      height: poster.height,
      alt: poster.alt.trim() || alt,
    }
  }

  return null
}

export interface PreviewOptions {
  /** The origin the visitor used, so a preview URL is never hard-coded to one host. */
  origin: string
  cards: Record<string, OgCard>
}

export function buildPreview(payload: ViewerApiSuccess, options: PreviewOptions): Preview {
  const { origin, cards } = options
  // selectedColourway, NOT the slug the visitor asked for. A QR tag pointing at
  // a retired colour resolves to the default one, and the preview has to
  // describe the page that will actually load — otherwise the canonical URL
  // advertises a colourway that 404s at the API and the card names a colour the
  // visitor will never see. The JSON-LD reuses both values for the same reason:
  // structured data must describe the page that loads, not the one requested.
  const url = `${origin}/${payload.product.slug}/${payload.selectedColourway.slug}`
  const image = pickImage(payload, origin, cards)
  return {
    title: buildTitle(payload),
    description: buildDescription(payload),
    url,
    image,
    jsonLd: buildProductJsonLd(payload, { url, image }),
  }
}

/**
 * schema.org Product data for this garment, as a JSON string ready to embed.
 *
 * WHY THIS EXISTS. This viewer is a single-page app: `<div id="root">` is empty
 * in the served HTML and every word a visitor reads is written by JavaScript. A
 * crawler that does not execute JS therefore sees a page with no product on it,
 * which is most of what indexes these URLs. The Open Graph tags above fix how a
 * link LOOKS when shared; they say nothing about what the page IS. This does.
 *
 * It rides the crawler path deliberately, alongside og:url and canonical. The
 * measurement that justifies that path applies unchanged: the static HTML is
 * 0.106-0.155s to first byte and the CMS payload 0.56-0.72s, so building this for
 * every visitor would slow every QR scan to fix something no visitor can see.
 * `CRAWLER` matches on 'bot', which covers Googlebot.
 *
 * ⚠️ AN `offers` WITH NO PRICE, AND THE ABSENCE OF A PRICE IS THE POINT.
 *
 * This said "NO `offers`, DELIBERATELY" until 2026-09-07, on the reasoning that Google's
 * Product documentation wants an offer with a price, this catalogue has none, and
 * inventing a price or a currency to satisfy a validator would put a false claim in
 * machine-readable form on 55 public URLs. **Every word of that still holds** and is why
 * there is no `price`, no `priceCurrency` and no number of any kind below.
 *
 * What it got wrong is treating "no price" as "say nothing". schema.org has two terms
 * for exactly this situation, and both are facts about this business rather than
 * inventions: `availability: MadeToOrder` and `businessFunction: Sell`. Saying nothing
 * leaves a crawler to infer availability from silence; saying made-to-order states the
 * true answer to the question it is asking. Owner decision 2026-09-07 (D10), taken with
 * the price risk put to them explicitly.
 *
 * ⚠️ SO THE TEST FOR THIS IS A NEGATIVE ONE. `preview.test.ts` asserts that the whole
 * serialised block matches neither `"price…": <digit>` nor `"priceCurrency"` — because
 * the failure mode worth guarding is not a missing offer, it is a number appearing beside
 * a garment in search results that nobody chose. Everything else emitted here is a value
 * the CMS actually holds.
 *
 * ⚠️ ESCAPING IS NOT OPTIONAL. All of these strings are CMS-authored, so a product
 * description containing `</script>` would otherwise close the block and inject
 * whatever followed into the document. `<` is escaped to its unicode form, which
 * is valid inside a JSON string and inert inside a script element. The CSP here is
 * hash-based with no `unsafe-inline` for scripts, so a `<script type=
 * "application/ld+json">` block is NOT executable script and needs no hash — but
 * that is a reason to escape properly, not a reason to skip it.
 */
export function buildProductJsonLd(
  payload: ViewerApiSuccess,
  context: { url: string; image: PreviewImage | null },
): string {
  const p = payload.product
  const selected = payload.selectedColourway

  // Only what the CMS actually holds. Every field is dropped when empty rather
  // than emitted as "" — an empty string is a claim that the value is blank,
  // where absence correctly says nothing at all.
  const specs: Array<{ '@type': 'PropertyValue'; name: string; value: string }> = []
  const addSpec = (name: string, value: string) => {
    const trimmed = value.trim()
    if (trimmed) specs.push({ '@type': 'PropertyValue', name, value: trimmed })
  }
  addSpec('Fabric composition', p.fabricComposition)
  addSpec('Weight', p.gsm)
  addSpec('Fit', p.garmentFit)
  if (p.performanceFeatures.length > 0) {
    addSpec('Performance features', p.performanceFeatures.join(', '))
  }
  addSpec('Colorways available', String(payload.colourways.length))

  const data: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: p.productName,
    url: context.url,
    brand: {
      '@type': 'Brand',
      name: payload.siteSettings.temporaryWordmark || payload.siteSettings.companyName,
    },
  }
  if (p.productCode.trim()) data.sku = p.productCode.trim()
  if (p.category.trim()) data.category = p.category.trim()
  if (p.shortDescription.trim()) data.description = p.shortDescription.trim()
  if (p.fabricComposition.trim()) data.material = p.fabricComposition.trim()
  if (selected.displayName.trim()) data.color = selected.displayName.trim()
  if (context.image) data.image = context.image.url
  if (specs.length > 0) data.additionalProperty = specs

  /*
   * Made to order, sold, quoted per enquiry — see the warning above. No `price`, no
   * `priceCurrency`, and deliberately no `priceSpecification`: a `Specification` with an
   * absent price is still an invitation for a validator, or a downstream aggregator, to
   * render "from —".
   */
  data.offers = {
    '@type': 'Offer',
    url: context.url,
    availability: 'https://schema.org/MadeToOrder',
    businessFunction: 'http://purl.org/goodrelations/v1#Sell',
  }

  return JSON.stringify(data).replace(/</g, '\\u003c')
}
