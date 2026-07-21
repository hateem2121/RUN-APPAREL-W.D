import { describe, expect, it } from 'vitest'
import {
  buildEnquiryBody,
  buildEnquirySubject,
  buildMailtoUrl,
  buildWhatsAppUrl,
  normalizeWhatsAppNumber,
} from './contact'

const ctx = {
  productName: 'Velocity Performance Tee',
  productCode: 'N001',
  colourName: 'Navy',
}

describe('buildEnquirySubject', () => {
  it('matches the locked template', () => {
    expect(buildEnquirySubject(ctx)).toBe('Product Enquiry — Velocity Performance Tee / Navy')
  })
})

describe('buildEnquiryBody', () => {
  it('contains the locked template lines in order', () => {
    const body = buildEnquiryBody(ctx)
    expect(body.startsWith('Hello RUN Team,')).toBe(true)
    expect(body).toContain('I am interested in Velocity Performance Tee (N001) in Navy.')
    for (const line of [
      'Company:',
      'Brand / website:',
      'My role:',
      'Country / target market:',
      'Estimated quantity:',
      'Target delivery date:',
      'Requirements / customisation needed:',
      'Do you have a tech pack, artwork or reference image? Yes / No',
      'Please contact me to discuss this product.',
    ]) {
      expect(body).toContain(line)
    }
    expect(body.endsWith('Regards,\n[Name]')).toBe(true)
  })
})

describe('buildMailtoUrl', () => {
  it('encodes subject and body', () => {
    const url = buildMailtoUrl('partner@wear-run.com', ctx)
    expect(url.startsWith('mailto:partner@wear-run.com?subject=')).toBe(true)
    expect(url).toContain(encodeURIComponent('Product Enquiry — Velocity Performance Tee / Navy'))
    expect(url).toContain('&body=')
    expect(url).not.toContain('\n')
  })
})

describe('WhatsApp', () => {
  it('normalises numbers to wa.me digits', () => {
    expect(normalizeWhatsAppNumber('+92-336-1777313')).toBe('923361777313')
    expect(normalizeWhatsAppNumber('+92 336 1777313')).toBe('923361777313')
  })
  it('builds a wa.me url with encoded text', () => {
    const url = buildWhatsAppUrl('+923361777313', ctx)
    expect(url.startsWith('https://wa.me/923361777313?text=')).toBe(true)
    expect(url).toContain(encodeURIComponent('Hello RUN Team,'))
  })
})
