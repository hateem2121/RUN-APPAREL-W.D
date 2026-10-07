import { describe, expect, it } from 'vitest'
import { CATEGORY_PAGE_PATHS } from './categoryPages'
import { CONSENT_COPY } from './consent'
import {
  capacityLines,
  EMPTY_FOOTER,
  type FooterSettings,
  opensAt,
  SITE_FOOTER_COMPANY,
  SITE_FOOTER_LINKS,
  SITE_FOOTER_MADE,
  SITE_FOOTER_WORDS,
  siteFooterAriaSnapshot,
  standardsLines,
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
    // The site's one name for this action (polish X20, the owner's answer Q9).
    expect(EMPTY_FOOTER.ctaLabel).toBe('Start a conversation')
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

  // Polish F9 (the owner's Q22): the four category pages, under the categories' own names.
  it('links every category page, in the order the website lists the families', () => {
    expect(SITE_FOOTER_MADE).toEqual([
      { label: 'Teamwear & Uniforms', href: '/custom-teamwear-manufacturer' },
      { label: 'Sportswear', href: '/custom-activewear-manufacturer' },
      { label: 'Outerwear', href: '/custom-outerwear-manufacturer' },
      { label: 'Casual Wear', href: '/private-label-casual-wear-manufacturer' },
    ])
    expect(SITE_FOOTER_MADE).toHaveLength(Object.keys(CATEGORY_PAGE_PATHS).length)
  })
})

// Polish X23: two entries both began "Suppliers:", one under the other.
describe('standardsLines', () => {
  it("joins the owner's two supplier entries into one line and keeps the rest as they are", () => {
    expect(
      standardsLines([
        'Parent: SEDEX-registered, SMETA-audited',
        'Suppliers: ISO 9001, OEKO-TEX, GOTS, GRS',
        'Suppliers: amfori BSCI audits',
        'Group: registered with the SECP',
      ]),
    ).toEqual([
      'Parent: SEDEX-registered, SMETA-audited',
      'Suppliers: ISO 9001, OEKO-TEX, GOTS, GRS; amfori BSCI audits',
      'Group: registered with the SECP',
    ])
  })

  it('joins entries apart in the list, at the first one, whatever their case', () => {
    expect(standardsLines(['Suppliers: GOTS', 'Parent: Sedex', 'suppliers : GRS'])).toEqual([
      'Suppliers: GOTS; GRS',
      'Parent: Sedex',
    ])
  })

  it('leaves an entry with no holder on a line of its own', () => {
    expect(standardsLines(['OEKO-TEX', 'OEKO-TEX', ': GOTS'])).toEqual([
      'OEKO-TEX',
      'OEKO-TEX',
      ': GOTS',
    ])
    expect(standardsLines([])).toEqual([])
  })
})

describe('siteFooterAriaSnapshot', () => {
  it('holds the default footer to its blocks, in order, and nothing else', () => {
    const snapshot = siteFooterAriaSnapshot(content())
    const lines = snapshot.split('\n')
    expect(lines.slice(0, 3)).toEqual([
      '- contentinfo:',
      '  - /children: equal',
      '  - link "Start a conversation"',
    ])
    expect(snapshot).toContain(`  - heading "${SITE_FOOTER_WORDS.contact}" [level=3]`)
    expect(snapshot).toContain('      - link "WhatsApp +92 336 1777313"')
    expect(snapshot).not.toContain(SITE_FOOTER_WORDS.capacity)
    expect(snapshot).not.toContain(SITE_FOOTER_WORDS.standards)
    expect(snapshot).not.toContain(SITE_FOOTER_WORDS.elsewhere)
    expect(snapshot).not.toContain('group')
    // "What we make" is not a claim: it is there with a blank database too, after Contact.
    expect(snapshot.indexOf(`heading "${SITE_FOOTER_WORDS.made}" [level=3]`)).toBeGreaterThan(
      snapshot.indexOf(`heading "${SITE_FOOTER_WORDS.contact}"`),
    )
    // The Company group (2026-10-07) is code-side too: there with a blank database, after
    // "What we make" and before any claim block.
    expect(snapshot.indexOf(`heading "${SITE_FOOTER_WORDS.company}" [level=3]`)).toBeGreaterThan(
      snapshot.indexOf(`heading "${SITE_FOOTER_WORDS.made}"`),
    )
    for (const link of SITE_FOOTER_COMPANY) expect(snapshot).toContain(`link "${link.label}"`)
    for (const link of SITE_FOOTER_MADE) expect(snapshot).toContain(`link "${link.label}"`)
    expect(lines.slice(-6)).toEqual(SITE_FOOTER_LINKS.map((link) => `  - link "${link.label}"`))
  })

  it('adds each claim block only when its claim is set, in the order both footers draw them', () => {
    const snapshot = siteFooterAriaSnapshot(
      content({
        capacity: { moq: '300 pieces', leadTime: '', hours: null },
        worksCoordinates: '32.4945° N, 74.5229° E',
        certifications: ['Suppliers: OEKO-TEX', 'Suppliers: GOTS'],
        socialLinks: [{ label: 'LinkedIn', url: 'https://www.linkedin.com/company/x' }],
      }),
    )
    const at = (text: string) => snapshot.indexOf(text)
    expect(at('listitem: "32.4945° N, 74.5229° E"')).toBeGreaterThan(at('"Contact"'))
    // Contact, the link groups (side by side on a phone, X23), then the two claims.
    expect(at(`"${SITE_FOOTER_WORDS.made}"`)).toBeGreaterThan(at('"Contact"'))
    expect(at(`"${SITE_FOOTER_WORDS.company}"`)).toBeGreaterThan(at(`"${SITE_FOOTER_WORDS.made}"`))
    expect(at('"Elsewhere"')).toBeGreaterThan(at(`"${SITE_FOOTER_WORDS.company}"`))
    expect(at('"Capacity"')).toBeGreaterThan(at('"Elsewhere"'))
    expect(at('"Standards"')).toBeGreaterThan(at('"Capacity"'))
    // One holder, one line.
    expect(snapshot).toContain('listitem: "Suppliers: OEKO-TEX; GOTS"')
    // The marks follow from the entries' words: OEKO-TEX, then GOTS, in the order named.
    expect(snapshot).toContain(
      `  - group "${SITE_FOOTER_WORDS.marks}":\n    - img "OEKO-TEX"\n    - img "GOTS"`,
    )
    expect(at('group')).toBeGreaterThan(at('"Standards"'))
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
