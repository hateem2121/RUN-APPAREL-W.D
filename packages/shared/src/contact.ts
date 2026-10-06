import { normalizeSlug } from './slugs.ts'

/**
 * Contact-link builders. The enquiry template is a locked piece of brief
 * copy — B2B/OEM language only, no retail wording.
 */

export interface EnquiryContext {
  productName: string
  productCode: string
  colourName: string
}

export function buildEnquirySubject({ productName, colourName }: EnquiryContext): string {
  return `Product Inquiry — ${productName} / ${colourName}`
}

export function buildEnquiryBody({ productName, productCode, colourName }: EnquiryContext): string {
  return [
    'Hello RUN Team,',
    '',
    `I am interested in ${productName} (${productCode}) in ${colourName}.`,
    '',
    'Company:',
    'Brand / website:',
    'My role:',
    'Country / target market:',
    'Estimated quantity:',
    'Target delivery date:',
    'Requirements / customization needed:',
    'Do you have a tech pack, artwork or reference image? Yes / No',
    '',
    'Please contact me to discuss this product.',
    '',
    'Regards,',
    '[Name]',
  ].join('\n')
}

/**
 * "Ask about this garment" (polish S10, the owner's one prompt at the end of a garment page,
 * Q42, 2026-10-04): the website's contact form, opened with the garment and its colour already in
 * it. Xictron's request-for-quote guide (23 Jul 2026): keep the buyer's context with the request.
 *
 * ⚠️ SLUGS IN THE ADDRESS, NEVER WORDS. The contact page looks both up among the published
 * garments and writes their real names itself (`askedGarment` below), so a link someone edits can
 * never put words of its choosing into the form. Slugs are also not personal: an address lands in
 * browser history and server logs (the contact page's `?sent=1` note says the same). A stored
 * copy of the page is never served for it either: the website's page cache keeps no address with
 * a query string (apps/cms/pageCache.mjs).
 */
export const ASK_GARMENT_PARAM = 'garment'
export const ASK_COLOUR_PARAM = 'colour'

/**
 * The contact page's address for one garment in one colour, root-relative, landing on the form
 * itself (`#inquiry`, where every "Start a conversation" link on the site lands).
 */
export function askAboutGarmentPath(productSlug: string, colourSlug: string): string {
  // Not URLSearchParams: this package compiles for Workers and browsers alike, with no DOM types.
  const garment = encodeURIComponent(productSlug)
  const colour = encodeURIComponent(colourSlug)
  return `/contact?${ASK_GARMENT_PARAM}=${garment}&${ASK_COLOUR_PARAM}=${colour}#inquiry`
}

/**
 * The garment and colour a contact-page address asks about, as slugs; `null` when either is
 * missing, repeated or not a slug, and the form then opens empty, as it always has.
 */
export function askedGarment(
  params: Record<string, string | string[] | undefined>,
): { productSlug: string; colourSlug: string } | null {
  const one = (value: string | string[] | undefined) =>
    typeof value === 'string' ? normalizeSlug(value) : null
  const productSlug = one(params[ASK_GARMENT_PARAM])
  const colourSlug = one(params[ASK_COLOUR_PARAM])
  return productSlug && colourSlug ? { productSlug, colourSlug } : null
}

/**
 * The message the form opens with: the enquiry's own first sentence (the locked template above),
 * then an empty line for the buyer's words.
 */
export function askAboutGarmentMessage({
  productName,
  productCode,
  colourName,
}: EnquiryContext): string {
  return `I am interested in ${productName} (${productCode}) in ${colourName}.\n\n`
}

/**
 * The form's hidden subject for an asked garment. The notification email puts it after the
 * sender ("Inquiry — <who> — <subject>", apps/cms/src/lib/inquiry.ts), so it names the garment and
 * nothing else; the website's form has no subject box of its own since 2026-10-01 (VA-02).
 */
export function askAboutGarmentSubject({
  productName,
  productCode,
  colourName,
}: EnquiryContext): string {
  return `${productName} (${productCode}) / ${colourName}`
}

export function buildMailtoUrl(email: string, ctx: EnquiryContext): string {
  const subject = encodeURIComponent(buildEnquirySubject(ctx))
  const body = encodeURIComponent(buildEnquiryBody(ctx))
  return `mailto:${email}?subject=${subject}&body=${body}`
}

/** Strip a phone number down to the digits wa.me expects (no "+", spaces or dashes). */
export function normalizeWhatsAppNumber(number: string): string {
  return number.replace(/[^0-9]/g, '')
}

/**
 * The number as people read it: `+923361777313` → `+92 336 1777313` (visual audit VA-57,
 * owner-approved 2026-10-01). ITU-T E.123 asks for spaces between the country code, the area
 * or operator code and the local number; a run of twelve digits is hard to read and to check.
 *
 * ⚠️ DISPLAY ONLY. Links keep using `normalizeWhatsAppNumber`, and the stored value is never
 * changed. A value the owner already spaced in the CMS is shown exactly as typed, and only a
 * Pakistani mobile number (+92 3xx, the shape the business uses) is grouped by rule; anything
 * else is shown unchanged rather than grouped by a guess.
 */
export function formatPhoneForDisplay(number: string): string {
  const typed = number.trim()
  if (/\s/.test(typed)) return typed
  const digits = normalizeWhatsAppNumber(typed)
  if (/^923\d{9}$/.test(digits)) return `+92 ${digits.slice(2, 5)} ${digits.slice(5)}`
  return typed
}

export function buildWhatsAppUrl(number: string, ctx: EnquiryContext): string {
  const digits = normalizeWhatsAppNumber(number)
  const text = encodeURIComponent(buildEnquiryBody(ctx))
  return `https://wa.me/${digits}?text=${text}`
}
