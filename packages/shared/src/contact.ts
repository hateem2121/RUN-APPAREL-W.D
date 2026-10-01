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
