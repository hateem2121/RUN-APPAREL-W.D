import { describe, expect, it } from 'vitest'
import {
  askAboutGarmentMessage,
  askAboutGarmentPath,
  askAboutGarmentSubject,
  askedGarment,
  buildEnquiryBody,
  buildEnquirySubject,
  buildMailtoUrl,
  buildWhatsAppUrl,
  formatPhoneForDisplay,
  normalizeWhatsAppNumber,
} from './contact'
import { findBritishSpellings } from '../../../scripts/copy-rules.mjs'

const ctx = {
  productName: 'Velocity Performance Tee',
  productCode: 'N001',
  colourName: 'Navy',
}

describe('buildEnquirySubject', () => {
  it('matches the locked template', () => {
    expect(buildEnquirySubject(ctx)).toBe('Product Inquiry — Velocity Performance Tee / Navy')
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
      'Requirements / customization needed:',
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
    expect(url).toContain(encodeURIComponent('Product Inquiry — Velocity Performance Tee / Navy'))
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

describe('formatPhoneForDisplay (VA-57)', () => {
  it('groups a Pakistani mobile number the way E.123 writes it', () => {
    expect(formatPhoneForDisplay('+923361777313')).toBe('+92 336 1777313')
    expect(formatPhoneForDisplay('923361777313')).toBe('+92 336 1777313')
    expect(formatPhoneForDisplay(' +923361777313 ')).toBe('+92 336 1777313')
  })
  it('shows a number the owner already spaced exactly as typed', () => {
    expect(formatPhoneForDisplay('+92 336 177 7313')).toBe('+92 336 177 7313')
  })
  it('never guesses a grouping for any other number', () => {
    // Negative controls: a landline, another country and a malformed value stay as stored.
    expect(formatPhoneForDisplay('+92524000000')).toBe('+92524000000')
    expect(formatPhoneForDisplay('+4930123456')).toBe('+4930123456')
    expect(formatPhoneForDisplay('+92336177731')).toBe('+92336177731')
  })
  it('leaves the link digits untouched', () => {
    expect(normalizeWhatsAppNumber(formatPhoneForDisplay('+923361777313'))).toBe('923361777313')
  })
})

describe('the enquiry template is written in American spelling — owner decision 2026-09-04', () => {
  it('has no British forms in the words it always sends', () => {
    const context = { productName: 'Velocity Tee', productCode: 'N001', colourName: 'Wine' }
    expect(
      findBritishSpellings(`${buildEnquirySubject(context)}\n${buildEnquiryBody(context)}`),
    ).toEqual([])
  })
})

describe('"Ask about this garment" (polish S10)', () => {
  it('opens the contact page’s form with the garment and colour as slugs', () => {
    expect(askAboutGarmentPath('r-xmp', 'wine')).toBe('/contact?garment=r-xmp&colour=wine#inquiry')
  })

  it('names the garment, its code and its colour as the inquiry’s subject', () => {
    expect(askAboutGarmentSubject(ctx)).toBe('Velocity Performance Tee (N001) / Navy')
  })

  it('reads the two slugs back, and nothing else', () => {
    expect(askedGarment({ garment: 'r-xmp', colour: 'wine' })).toEqual({
      productSlug: 'r-xmp',
      colourSlug: 'wine',
    })
    // A typed or pasted address is tidied the way a QR typo is (normalizeSlug).
    expect(askedGarment({ garment: ' R-XMP ', colour: 'Wine' })).toEqual({
      productSlug: 'r-xmp',
      colourSlug: 'wine',
    })
  })

  it('opens an empty form for a missing, repeated or empty value', () => {
    expect(askedGarment({})).toBeNull()
    expect(askedGarment({ garment: 'r-xmp' })).toBeNull()
    expect(askedGarment({ garment: ['r-xmp', 'rxps'], colour: 'wine' })).toBeNull()
    expect(askedGarment({ garment: '---', colour: 'wine' })).toBeNull()
  })

  it('starts the message with the enquiry template’s own sentence, then room to write', () => {
    expect(askAboutGarmentMessage(ctx)).toBe(
      'I am interested in Velocity Performance Tee (N001) in Navy.\n\n',
    )
    expect(buildEnquiryBody(ctx)).toContain(askAboutGarmentMessage(ctx).trim())
    expect(findBritishSpellings(askAboutGarmentMessage(ctx))).toEqual([])
  })
})
