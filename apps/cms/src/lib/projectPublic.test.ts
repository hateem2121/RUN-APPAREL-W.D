import { DEFAULT_SITE_SETTINGS } from '@run-apparel/shared'
import { describe, expect, it } from 'vitest'
import { EMPTY_FOOTER, mergeSiteSettings, projectFooter, toProductCard } from './projectPublic'

describe('mergeSiteSettings', () => {
  it('uses the shared defaults when the global has never been saved', () => {
    // toMatchObject, not toEqual: the return type EXTENDS ViewerSiteSettings with the
    // tab-icon fields, which the shared defaults deliberately do not carry.
    for (const doc of [null, undefined, {}]) {
      expect(mergeSiteSettings(doc)).toMatchObject(DEFAULT_SITE_SETTINGS)
      expect(mergeSiteSettings(doc).logoUrl).toBeNull()
      expect(mergeSiteSettings(doc).logoMimeType).toBeNull()
    }
  })

  describe('the owner-uploaded tab icon', () => {
    it('projects a populated logo upload', () => {
      const merged = mergeSiteSettings({
        logo: { url: 'https://media.wear-run.help/logo.png', mimeType: 'image/png' },
      })
      expect(merged.logoUrl).toBe('https://media.wear-run.help/logo.png')
      expect(merged.logoMimeType).toBe('image/png')
    })

    it('IGNORES a bare row id, which is what a depth-0 read returns', () => {
      // getSiteSettings reads at depth 1 for exactly this reason. If that ever drops
      // back to 0 the upload arrives as a number, and rendering it would emit
      // <link rel="icon" href="7"> — a broken icon on every page, with nothing failing.
      expect(mergeSiteSettings({ logo: 7 }).logoUrl).toBeNull()
      expect(mergeSiteSettings({ logo: null }).logoUrl).toBeNull()
    })

    it('falls back when the media row exists but carries no URL', () => {
      expect(mergeSiteSettings({ logo: { mimeType: 'image/png' } }).logoUrl).toBeNull()
    })
  })

  it('prefers saved values over defaults', () => {
    const merged = mergeSiteSettings({ companyName: 'RUN APPAREL LTD', email: 'hi@example.com' })
    expect(merged.companyName).toBe('RUN APPAREL LTD')
    expect(merged.email).toBe('hi@example.com')
  })

  it('falls back PER FIELD, not per document', () => {
    // A global saved once with one field blanked must not discard the others. The
    // naive `doc ?? DEFAULT` would return every default the moment any field is empty.
    const merged = mergeSiteSettings({ companyName: 'RUN APPAREL LTD', email: '' })
    expect(merged.companyName).toBe('RUN APPAREL LTD')
    expect(merged.email).toBe(DEFAULT_SITE_SETTINGS.email)
  })

  it('treats whitespace-only and non-string values as absent', () => {
    const merged = mergeSiteSettings({ email: '   ', companyName: 42, footerLine: null })
    expect(merged.email).toBe(DEFAULT_SITE_SETTINGS.email)
    expect(merged.companyName).toBe(DEFAULT_SITE_SETTINGS.companyName)
    expect(merged.footerLine).toBe(DEFAULT_SITE_SETTINGS.footerLine)
  })

  it('trims a value the owner pasted with a trailing space', () => {
    expect(mergeSiteSettings({ email: ' partner@example.com ' }).email).toBe('partner@example.com')
  })
})

/** A product the viewer can serve, as Payload returns it at depth 1. */
const product = (over: Record<string, unknown> = {}) => ({
  slug: 'rxps',
  productName: 'Velocity Performance Cycling Suit',
  productCode: 'R-XPS',
  category: 'Sportswear',
  shortDescription: 'A race-fit skinsuit.',
  colourways: [
    { slug: 'wine', displayName: 'Wine', hexSwatch: '#5b1f2e' },
    { slug: 'blush', displayName: 'Blush', hexSwatch: '#e8c4c4' },
  ],
  ...over,
})

describe('toProductCard', () => {
  it('projects a serveable product', () => {
    const card = toProductCard(product())
    expect(card).not.toBeNull()
    expect(card?.slug).toBe('rxps')
    expect(card?.productCode).toBe('R-XPS')
    expect(card?.category).toBe('Sportswear')
    expect(card?.defaultColourSlug).toBe('wine')
    expect(card?.colourNames).toEqual(['Wine', 'Blush'])
  })

  it('returns null for anything the viewer would 404', () => {
    // Each of these is a state buildViewerResponse refuses to serve. A card for any of
    // them is a link straight to "[ REFERENCE UNAVAILABLE ]".
    expect(toProductCard(null)).toBeNull()
    expect(toProductCard(undefined)).toBeNull()
    expect(toProductCard(product({ slug: '' }))).toBeNull()
    expect(toProductCard(product({ colourways: [] }))).toBeNull()
    expect(toProductCard(product({ colourways: undefined }))).toBeNull()
    expect(toProductCard(product({ colourways: [{ slug: 'wine', active: false }] }))).toBeNull()
    expect(toProductCard(product({ colourways: [{ slug: '  ' }] }))).toBeNull()
  })

  it('links to the FIRST ADDRESSABLE colourway, skipping retired ones', () => {
    // Row order decides the default colourway (CLAUDE.md), so a retired first row must
    // hand the default to the next usable row rather than produce a dead link.
    const card = toProductCard(
      product({
        colourways: [
          { slug: 'wine', displayName: 'Wine', active: false },
          { slug: 'lime', displayName: 'Lime' },
        ],
      }),
    )
    expect(card?.defaultColourSlug).toBe('lime')
    expect(card?.colourNames).toEqual(['Lime'])
  })

  it('never exposes hexSwatch — the CMS says buyers never see it', () => {
    const card = toProductCard(product())
    expect(JSON.stringify(card)).not.toContain('#5b1f2e')
  })

  it('falls back to the slug when a product or colour has no name', () => {
    const card = toProductCard(product({ productName: '', colourways: [{ slug: 'wine' }] }))
    expect(card?.productName).toBe('rxps')
    expect(card?.colourNames).toEqual(['wine'])
  })

  describe('poster selection', () => {
    it('prefers the default colourway poster', () => {
      const card = toProductCard(
        product({
          colourways: [{ slug: 'wine', posterPreview: { url: '/colour.webp', alt: 'Wine' } }],
          posterFallback: { url: '/fallback.webp', alt: 'Fallback' },
        }),
      )
      expect(card?.posterUrl).toBe('/colour.webp')
      expect(card?.posterAlt).toBe('Wine')
    })

    it('falls back to the product poster', () => {
      const card = toProductCard(product({ posterFallback: { url: '/fallback.webp', alt: 'F' } }))
      expect(card?.posterUrl).toBe('/fallback.webp')
    })

    it('returns null rather than a broken image when there is no poster at all', () => {
      // Publishable with no poster since 2026-08-21 — requiring one 404'd a live
      // garment. The card draws a placeholder instead.
      const card = toProductCard(product())
      expect(card?.posterUrl).toBeNull()
      expect(card?.posterAlt).toBe('Velocity Performance Cycling Suit — 3D product reference')
    })

    it('ignores a numeric ID, which is what a depth-0 read returns', () => {
      // At depth 0 Payload leaves uploads as row IDs. Rendering `src={7}` would emit a
      // broken image on every card, and the read is one number away from that.
      const card = toProductCard(
        product({ posterFallback: 7, colourways: [{ slug: 'wine', posterPreview: 12 }] }),
      )
      expect(card?.posterUrl).toBeNull()
    })

    it('supplies alt text when the media row has none', () => {
      const card = toProductCard(
        product({ colourways: [{ slug: 'wine', posterPreview: { url: '/c.webp' } }] }),
      )
      expect(card?.posterAlt).toBe('Velocity Performance Cycling Suit — 3D product reference')
    })
  })
})

describe('projectFooter', () => {
  it('projects nothing but copy defaults from an empty global', () => {
    expect(projectFooter(null)).toEqual(EMPTY_FOOTER)
    expect(EMPTY_FOOTER.ctaLabel).toBe('Start an enquiry')
    expect(EMPTY_FOOTER.certifications).toEqual([])
    expect(EMPTY_FOOTER.socialLinks).toEqual([])
    expect(EMPTY_FOOTER.capacity).toEqual({ moq: '', leadTime: '', hours: null })
    expect(EMPTY_FOOTER.worksCoordinates).toBe('')
  })

  it('keeps only https social links with a label, trimmed', () => {
    const footer = projectFooter({
      socialLinks: [
        { label: ' LinkedIn ', url: 'https://www.linkedin.com/company/run-apparel ' },
        { label: 'Bad', url: 'http://insecure.example' },
        { label: '', url: 'https://x.example' },
        { label: 'NoUrl' },
        'garbage',
      ],
    })
    expect(footer.socialLinks).toEqual([
      { label: 'LinkedIn', url: 'https://www.linkedin.com/company/run-apparel' },
    ])
  })

  it('drops blank certifications and trims the rest', () => {
    const footer = projectFooter({ certifications: [{ name: ' GOTS ' }, { name: '' }, null] })
    expect(footer.certifications).toEqual(['GOTS'])
  })

  it('projects hours only when all four parts are valid, and never a partial week', () => {
    const full = projectFooter({
      capacity: {
        hoursFirstDay: 'mon',
        hoursLastDay: 'sat',
        hoursOpen: '09:00',
        hoursClose: '18:00',
      },
    })
    expect(full.capacity.hours).toEqual({ firstDay: 1, lastDay: 6, open: '09:00', close: '18:00' })

    const partial = projectFooter({ capacity: { hoursFirstDay: 'mon', hoursOpen: '09:00' } })
    expect(partial.capacity.hours).toBeNull()

    const malformed = projectFooter({
      capacity: {
        hoursFirstDay: 'mon',
        hoursLastDay: 'sat',
        hoursOpen: '9am',
        hoursClose: '18:00',
      },
    })
    expect(malformed.capacity.hours).toBeNull()
  })

  it('a copy field falls back to its default when blank, a claim field to empty', () => {
    const footer = projectFooter({
      ctaQuestion: '   ',
      capacity: { moq: '  ' },
      worksCoordinates: ' ',
    })
    expect(footer.ctaQuestion).toBe('Have a garment that needs making properly?')
    expect(footer.capacity.moq).toBe('')
    expect(footer.worksCoordinates).toBe('')
  })

  it('mergeSiteSettings carries the footer, and the shared type is untouched', () => {
    const merged = mergeSiteSettings({ ctaLabel: 'Talk to us' })
    expect(merged.footer.ctaLabel).toBe('Talk to us')
    // The viewer API returns ViewerSiteSettings; nothing footer-shaped may leak into it.
    expect(Object.keys(merged)).not.toContain('certifications')
  })
})
