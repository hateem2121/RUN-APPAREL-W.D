import { describe, expect, it } from 'vitest'
import type { InquiryInput } from './inquiry'
import {
  buyerReceipt,
  esc,
  inquiryReference,
  RECEIPT_GIF,
  teamEmailHtml,
  teamSubject,
  whatsappLink,
} from './inquiryEmailHtml'

const value: InquiryInput = {
  name: 'Dana Okafor',
  company: 'Northfield Athletic',
  email: 'dana@northfield.example',
  message: 'We need 400 training tops.\nTwo colourways.\n\nMarch delivery.',
  jobTitle: 'Head of product',
  country: 'United Kingdom',
  phone: '+44 7700 900123',
  subject: 'Request a quote',
}
const at = new Date('2026-11-10T06:04:54Z')

/*
 * ⚠️ THE REASON THIS FILE EXISTS. Every value in the notice is typed by a stranger; until
 * 2026-11-10 the notice was plain text so that no escape could ever be missed (lib/inquiry.ts).
 * A tag, a broken-out attribute and an entity are planted in EVERY typed field, and none may
 * survive as markup. The control: the same plant, unescaped, IS found by the same search.
 */
describe('the team notice escapes everything a stranger types', () => {
  const TAG = '<img src=x onerror=alert(1)>'
  const BREAKOUT = '" onmouseover="alert(2)'
  const planted: InquiryInput = {
    name: `${TAG}${BREAKOUT}`,
    company: `${TAG}${BREAKOUT}`,
    email: `x${BREAKOUT.replace(/ /g, '')}@evil.example`,
    message: `${TAG}\n${BREAKOUT}`,
    jobTitle: `${TAG}${BREAKOUT}`,
    country: `${TAG}${BREAKOUT}`,
    phone: `+44 ${TAG}`,
    subject: `${TAG}${BREAKOUT}`,
  }
  const html = teamEmailHtml({
    value: planted,
    id: 82,
    receivedAt: at,
    extras: {
      files: [{ name: `${TAG}.pdf`, size: '1 MB' }],
      filesError: TAG,
      adminUrl: 'https://cms.wear-run.help/admin/collections/inquiries/82',
    },
  })

  it('leaves no planted tag or attribute live', () => {
    expect(html).not.toContain('<img src=x')
    // "onerror=" survives as escaped TEXT; what may not exist is a live tag carrying it.
    expect(html).not.toMatch(/<[a-z][^>]*onerror=/i)
    expect(html).not.toMatch(/"\s*onmouseover=/)
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;')
  })

  it('control: the search finds the plant when it is NOT escaped', () => {
    expect(`<p>${planted.name}</p>`).toContain('<img src=x')
    expect(`<a title="${planted.name}">`).toMatch(/"\s*onmouseover=/)
  })

  it('esc covers the five characters that open markup or attributes', () => {
    expect(esc(`&<>"'`)).toBe('&amp;&lt;&gt;&quot;&#39;')
  })
})

describe('the team notice', () => {
  const html = teamEmailHtml({
    value,
    id: 82,
    receivedAt: at,
    extras: { adminUrl: 'https://cms.wear-run.help/admin/collections/inquiries/82' },
  })

  it('leads with the reference, the time in Sialkot, the company and the country', () => {
    expect(html).toContain('RA-00082')
    expect(html).toContain('10 Nov 2026, 11:04 PKT') // 06:04 UTC is 11:04 in Pakistan
    expect(html).toContain('Northfield Athletic')
    expect(html).toContain('from United Kingdom')
  })

  it('offers Reply, WhatsApp and the CMS as one-tap buttons', () => {
    expect(html).toContain(
      'href="mailto:dana@northfield.example?subject=Re%3A%20your%20inquiry%20to%20RUN%20APPAREL%20(RA-00082)"',
    )
    expect(html).toContain('href="https://wa.me/447700900123"')
    expect(html).toContain('href="https://cms.wear-run.help/admin/collections/inquiries/82"')
  })

  it('keeps the message’s own lines', () => {
    expect(html).toContain('We need 400 training tops.<br>Two colourways.<br><br>March delivery.')
  })

  it('draws no WhatsApp button for a number without its country code', () => {
    expect(
      teamEmailHtml({ value: { ...value, phone: '07700 900123' }, id: 1, receivedAt: at }),
    ).not.toContain('wa.me/44')
  })

  it('is a whole document, light, and with no script', () => {
    expect(html.startsWith('<!doctype html>')).toBe(true)
    expect(html).not.toMatch(/<script/i)
  })
})

describe('teamSubject', () => {
  it('reference, then who, where and what, bounded', () => {
    expect(teamSubject(value, 82)).toBe(
      'RA-00082 · Northfield Athletic (United Kingdom) — Request a quote',
    )
    expect(teamSubject({ ...value, company: '', country: '', subject: '' }, 7)).toBe(
      'RA-00007 · Dana Okafor',
    )
    expect(teamSubject({ ...value, company: 'z'.repeat(400) }, 1).length).toBe(160)
  })
})

describe('whatsappLink', () => {
  it.each([
    ['+44 7700 900123', 'https://wa.me/447700900123'],
    ['+92 300 1234567', 'https://wa.me/923001234567'],
    ['07700 900123', null], // no country code: cannot be dialled from Pakistan
    ['+12', null],
  ])('%j → %j', (phone, link) => {
    expect(whatsappLink(phone)).toBe(link)
  })
})

describe('inquiryReference', () => {
  it('pads to five digits', () => {
    expect(inquiryReference(82)).toBe('RA-00082')
    expect(inquiryReference('123456')).toBe('RA-123456')
  })
})

/*
 * ⚠️ THE RECEIPT MUST NOT CARRY A STRANGER'S WORDS: a receipt that echoes them lets a robot mail
 * its advert to any address, signed by us. Its input type takes no name and no message at all;
 * the subject is shown only when it is one the form itself offers.
 */
describe('the buyer receipt', () => {
  it('names the reference and a subject from the form’s own list', () => {
    const receipt = buyerReceipt({ id: 82, subject: 'Samples' })
    expect(receipt.subject).toBe('We have your inquiry — RUN APPAREL (RA-00082)')
    expect(receipt.html).toContain('RA-00082')
    expect(receipt.html).toContain('>Samples<')
    expect(receipt.text).toContain('You asked about: Samples')
  })

  it('drops a subject the sender typed themselves', () => {
    const advert = 'Cheap followers at spam.example'
    const receipt = buyerReceipt({ id: 82, subject: advert })
    expect(receipt.html).not.toContain(advert)
    expect(receipt.text).not.toContain(advert)
  })

  it('moves in its header, with words for anyone who cannot see it', () => {
    const { html } = buyerReceipt({ id: 1, subject: '' })
    expect(html).toContain(`src="${RECEIPT_GIF}"`)
    expect(html).toMatch(/alt="Inquiry received\. [^"]+"/)
  })

  it('promises only what the contact page already says', () => {
    const { text } = buyerReceipt({ id: 1, subject: '' })
    expect(text).toContain('within 24 hours') // /contact: "We reply within 24 hours."
    expect(text).toContain('+92 336 1777313') // the one number (owner, 2026-10-26)
    // Never a price and never a certificate claim (brand rules).
    expect(text).not.toMatch(/\$|USD|PKR|certified/i)
  })
})
