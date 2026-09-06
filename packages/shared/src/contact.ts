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

export function buildWhatsAppUrl(number: string, ctx: EnquiryContext): string {
  const digits = normalizeWhatsAppNumber(number)
  const text = encodeURIComponent(buildEnquiryBody(ctx))
  return `https://wa.me/${digits}?text=${text}`
}
