import { describe, expect, it } from 'vitest'
import { CONSENT_COPY } from './consent'
import {
  capacityLines,
  EMPTY_FOOTER,
  type FooterSettings,
  opensAt,
  SITE_FOOTER_LINKS,
  SITE_FOOTER_WORDS,
  siteFooterAriaSnapshot,
} from './siteFooter'

const content = (footer: Partial<FooterSettings> = {}) => ({
  footer: { ...EMPTY_FOOTER, ...footer },
  email: 'partner@wear-run.com',
  whatsappNumber: '+923361777313',
  legalLine: '© RUN APPAREL (PVT) LTD',
  footerLine: 'RUN THE EXTRA MILE.',
})

const HOURS = { firstDay: 1, lastDay: 6, open: '09:00', close: '18:00' }

describe('the shared footer (VA-31)', () => {
  it('has copy by default and no claim by default', () => {
    expect(EMPTY_FOOTER.ctaLabel).toBe('Start an inquiry')
    expect(EMPTY_FOOTER.capacity).toEqual({ moq: '', leadTime: '', hours: null })
    expect(EMPTY_FOOTER.worksCoordinates).toBe('')
    expect(EMPTY_FOOTER.certifications).toEqual([])
    expect(EMPTY_FOOTER.socialLinks).toEqual([])
  })

  it('lists the bottom row in the order both footers draw it, the cookie link second to last', () => {
    expect(SITE_FOOTER_LINKS.map((link) => link.label)).toEqual([
      'Products',
      'Contact',
      'Guides',
      'Privacy',
      CONSENT_COPY.change,
      'Terms',
    ])
    expect(SITE_FOOTER_LINKS.filter((link) => link.consent)).toHaveLength(1)
    for (const link of SITE_FOOTER_LINKS) expect(link.href).toMatch(/^\/[a-z]/)
  })

  it('writes a Capacity line only for a claim that is set', () => {
    expect(capacityLines(EMPTY_FOOTER.capacity)).toEqual([])
    expect(capacityLines({ moq: '300 pieces', leadTime: '', hours: null })).toEqual([
      'MOQ 300 pieces',
    ])
    expect(capacityLines({ moq: '300 pieces', leadTime: '6 weeks', hours: HOURS })).toEqual([
      'MOQ 300 pieces',
      'Lead time 6 weeks',
      'Mon–Sat 09:00–18:00 PKT',
    ])
  })

  it('words the closed light from the opening time', () => {
    expect(opensAt('09:00')).toBe('Opens 09:00 PKT')
  })
})

describe('siteFooterAriaSnapshot', () => {
  it('holds the default footer to its blocks, in order, and nothing else', () => {
    const snapshot = siteFooterAriaSnapshot(content())
    const lines = snapshot.split('\n')
    expect(lines.slice(0, 3)).toEqual([
      '- contentinfo:',
      '  - /children: equal',
      '  - link "Start an inquiry"',
    ])
    expect(snapshot).toContain(`  - heading "${SITE_FOOTER_WORDS.contact}" [level=3]`)
    expect(snapshot).toContain('      - link "WhatsApp +92 336 1777313"')
    expect(snapshot).not.toContain(SITE_FOOTER_WORDS.capacity)
    expect(snapshot).not.toContain(SITE_FOOTER_WORDS.standards)
    expect(snapshot).not.toContain(SITE_FOOTER_WORDS.elsewhere)
    expect(snapshot).not.toContain('group')
    expect(lines.slice(-6)).toEqual(SITE_FOOTER_LINKS.map((link) => `  - link "${link.label}"`))
  })

  it('adds each claim block only when its claim is set, between Contact and the bottom row', () => {
    const snapshot = siteFooterAriaSnapshot(
      content({
        capacity: { moq: '300 pieces', leadTime: '', hours: null },
        worksCoordinates: '32.4945° N, 74.5229° E',
        certifications: ['Suppliers: OEKO-TEX, GOTS'],
        socialLinks: [{ label: 'LinkedIn', url: 'https://www.linkedin.com/company/x' }],
      }),
    )
    const at = (text: string) => snapshot.indexOf(text)
    expect(at('listitem: "32.4945° N, 74.5229° E"')).toBeGreaterThan(at('"Contact"'))
    expect(at('"Capacity"')).toBeGreaterThan(at('"Contact"'))
    expect(at('"Standards"')).toBeGreaterThan(at('"Capacity"'))
    expect(at('"Elsewhere"')).toBeGreaterThan(at('"Standards"'))
    // The marks follow from the entry's words: OEKO-TEX, then GOTS, in the order named.
    expect(snapshot).toContain(
      `  - group "${SITE_FOOTER_WORDS.marks}":\n    - img "OEKO-TEX"\n    - img "GOTS"`,
    )
    expect(at('link "Products"')).toBeGreaterThan(at('group'))
  })

  it("matches the clock's live time and, with hours, its light", () => {
    const pattern = (snapshot: string) => {
      const line = snapshot.split('\n').find((l) => l.includes('text: /^'))
      const source = line?.replace(/^\s*- text: \/(.*)\/$/, '$1') ?? ''
      return new RegExp(source)
    }
    const plain = pattern(siteFooterAriaSnapshot(content()))
    expect(plain.test('Sialkot · HQ & works --:--PKT')).toBe(true)
    expect(plain.test('Sialkot · HQ & works 11:34PKT')).toBe(true)
    expect(plain.test('Sialkot · HQ & works 11:34PKT Open now')).toBe(false)

    const withHours = pattern(
      siteFooterAriaSnapshot(content({ capacity: { moq: '', leadTime: '', hours: HOURS } })),
    )
    expect(withHours.test('Sialkot · HQ & works 11:34PKT Open now')).toBe(true)
    expect(withHours.test('Sialkot · HQ & works 19:02PKT Opens 09:00 PKT')).toBe(true)
  })
})
