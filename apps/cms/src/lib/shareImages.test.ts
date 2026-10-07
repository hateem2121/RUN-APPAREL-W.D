import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { GARMENT_TYPES } from '../../../../scripts/apply-garment-types.mjs'
import { FAMILY_PAGE_SOURCES, PUBLIC_PAGE_SOURCES } from '../../publicViewerHeaders.mjs'
import { CONTACT_HERO_PHOTO } from './factoryPhotos'
import { FAMILIES } from './families'
import { FAMILY_PAGES } from './familyPages'
import { GUIDES, GUIDES_INDEX } from './guides'
import { SITE_ORIGIN } from './seo'
import { SHARE_IMAGE, type ShareCard, shareCardFor } from './shareImages'

/**
 * Polish X14 (audit of 3 October 2026; the owner's answer Q11: "fix the address, and one picture
 * per page type"). Every website page shared one picture, made on 8 September before the move to
 * wear-run.com, which still showed `wear-run.help`. Now each page type has its own, made by
 * `scripts/gen-share-images.mjs` from files already in the repository.
 *
 * What would have to break for these to fail: a page with no picture or the wrong one, a file
 * missing or not 1200x630, a card that names the old address, words that are not the page's own,
 * a garment shown on another family's card, or the old picture changed under the links that
 * already point at it.
 */

const CMS = join(import.meta.dirname, '..', '..')
const REPO = join(CMS, '..', '..')
const PUBLIC = join(CMS, 'public')
const POSTERS = join(REPO, 'apps', 'viewer', 'public', 'og')
const FRONTEND = join(CMS, 'src', 'app', '(frontend)')

/** The committed catalogue: each product's `category`, as imported into the CMS. */
const CATALOGUE: { slug: string; category: string }[] = JSON.parse(
  readFileSync(join(REPO, 'scripts', 'catalogue-products.json'), 'utf8'),
).products

/**
 * A JPEG's width and height, read from its frame header (SOF0-SOF15, less the three markers in
 * that range that are not frames), or null when the bytes are not a JPEG.
 */
function jpegSize(bytes: Uint8Array): { width: number; height: number } | null {
  const u16 = (at: number) => ((bytes[at] ?? 0) << 8) | (bytes[at + 1] ?? 0)
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return null
  let at = 2
  while (at + 9 < bytes.length) {
    if (bytes[at] !== 0xff) return null
    const marker = bytes[at + 1] ?? 0
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return { height: u16(at + 5), width: u16(at + 7) }
    }
    at += 2 + u16(at + 2)
  }
  return null
}

/** The page types the owner named (Q11), each with a picture of its own. */
// A `:slug` source is many pages, each a Journal post or case study sharing its own CMS picture
// (`buildArticleMetadata`); only its hub has a card here.
const OWN_PICTURE = PUBLIC_PAGE_SOURCES.filter(
  (path) => !['/privacy', '/terms'].includes(path) && !path.includes(':'),
)

const cardWords = (card: ShareCard) => [card.label, card.heading, card.accent].join(' ')

describe('every website page shares a picture of its own type (X14, Q11)', () => {
  it('the home page, products, contact, each category page, the guides index, each guide, the policies hub, each policy, careers and community: one each', () => {
    const files = OWN_PICTURE.map((path) => shareCardFor(path).file)
    // 1 home + products + contact + 4 category + guides index + 7 guides + policies hub
    // + 7 policies + careers + community + the FAQ hub + 4 FAQ topics + the glossary + the
    // Journal's and the case studies' hubs.
    expect(OWN_PICTURE).toHaveLength(33)
    expect(new Set(files).size, 'two page types share a picture').toBe(OWN_PICTURE.length)
  })

  it('privacy and terms, which the owner did not name, share the home page’s', () => {
    expect(shareCardFor('/privacy')).toBe(shareCardFor('/'))
    expect(shareCardFor('/terms')).toBe(shareCardFor('/'))
  })

  for (const path of PUBLIC_PAGE_SOURCES) {
    it(`${path}: a 1200x630 JPEG under 300 KB, in public/share`, () => {
      const card = shareCardFor(path)
      const file = join(PUBLIC, SHARE_IMAGE.folder, card.file)
      expect(existsSync(file), `${card.file} was never made`).toBe(true)
      const bytes = readFileSync(file)
      expect(jpegSize(bytes)).toEqual({ width: SHARE_IMAGE.width, height: SHARE_IMAGE.height })
      // WhatsApp shows no picture for a larger one (reported in vercel/next.js discussion 60366).
      expect(bytes.length).toBeLessThan(300 * 1024)
    })
  }

  // NEGATIVE CONTROL for the reader: the old PNG, and a JPEG header planted at another size.
  it('reads a frame header, and refuses what is not a JPEG', () => {
    expect(jpegSize(readFileSync(join(PUBLIC, 'og-default.png')))).toBeNull()
    const planted = Uint8Array.from([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xc2, 0x00, 0x11, 0x08, 0x02, 0x74,
      0x04, 0xb0, 0x03, 0x01,
    ])
    expect(jpegSize(planted)).toEqual({ width: 1200, height: 628 })
  })
})

describe('the address on every card is the site’s own (X14)', () => {
  it('wear-run.com, the host the pages are served from', () => {
    expect(SHARE_IMAGE.host).toBe('wear-run.com')
    expect(new URL(SITE_ORIGIN).host).toBe(SHARE_IMAGE.host)
  })

  it('no card says wear-run.help, the address the old picture showed', () => {
    for (const path of PUBLIC_PAGE_SOURCES) {
      const card = shareCardFor(path)
      expect(`${cardWords(card)} ${card.alt}`).not.toMatch(/wear-run\.help/)
      expect(card.alt).toContain(SHARE_IMAGE.host)
    }
  })

  // Live pages and the platforms' caches point at it, so it stays exactly as it was.
  it('keeps og-default.png, byte for byte', () => {
    const bytes = readFileSync(join(PUBLIC, 'og-default.png'))
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(
      'cc108fb7deb3fa5ffc40bbc954ebb677e669a35172b52e60f8667b0f7dacfd1b',
    )
  })
})

describe('each card carries its page’s own words', () => {
  it('a category page: its eyebrow, heading and accent', () => {
    for (const page of FAMILY_PAGES) {
      expect(shareCardFor(page.path)).toMatchObject({
        label: page.eyebrow,
        heading: page.heading,
        accent: page.headingAccent,
      })
    }
  })

  it('a guide: "[ Buyer guide ]" and its heading; the index its own', () => {
    for (const guide of GUIDES) {
      expect(shareCardFor(guide.path)).toMatchObject({
        label: '[ Buyer guide ]',
        heading: guide.heading,
        accent: guide.headingAccent,
      })
    }
    expect(shareCardFor(GUIDES_INDEX.path)).toMatchObject({
      label: '[ Buyer guides ]',
      heading: GUIDES_INDEX.heading,
      accent: GUIDES_INDEX.headingAccent,
    })
  })

  // These words are written in the pages' markup, so the page's source is where to look.
  const SOURCES: [string, string][] = [
    ['/products', join(FRONTEND, 'products', 'page.tsx')],
    ['/contact', join(FRONTEND, 'contact', 'page.tsx')],
    ['/guides', join(FRONTEND, 'guides', 'page.tsx')],
    ['/guides/garment-printing-methods', join(CMS, 'src', 'components', 'site', 'GuidePage.tsx')],
  ]
  for (const [path, source] of SOURCES) {
    it(`${path}: its label and headline are in the page’s own markup`, () => {
      const card = shareCardFor(path)
      const markup = readFileSync(source, 'utf8')
        .replace(/&rsquo;/g, '’')
        .replace(/&nbsp;/g, ' ')
      expect(markup).toContain(card.label)
      if (path === '/products' || path === '/contact') {
        expect(markup).toContain(card.heading)
        expect(markup).toContain(card.accent)
      }
    })
  }

  it('the home card keeps the words of the picture it replaces, and only its address changes', () => {
    const home = shareCardFor('/')
    expect(home).toMatchObject({
      label: '[ B2B apparel manufacturer · Sialkot, PK ]',
      heading: 'Made to order.',
      accent: 'Made properly.',
    })
  })
})

describe('the pictures on a card come from the repository, and say what they show', () => {
  const garmentsOf = (path: string) => {
    const picture = shareCardFor(path).picture
    return picture.kind === 'garments' ? picture.garments : []
  }
  const categoryOf = (poster: string) =>
    CATALOGUE.find((product) => product.slug === poster.split('/')[0])?.category

  it('every garment is a committed poster, named by its approved garment type', () => {
    const all = OWN_PICTURE.flatMap(garmentsOf)
    expect(all.length, 'no card shows a garment').toBeGreaterThan(0)
    for (const garment of all) {
      expect(existsSync(join(POSTERS, `${garment.poster}.jpg`)), garment.poster).toBe(true)
      const slug = garment.poster.split('/')[0] ?? ''
      expect(garment.type, garment.poster).toBe(GARMENT_TYPES[slug as keyof typeof GARMENT_TYPES])
    }
  })

  it('a category page shows four of its own family’s garments', () => {
    for (const page of FAMILY_PAGES) {
      const family = FAMILIES.find((entry) => entry.slug === page.familySlug)
      const garments = garmentsOf(page.path)
      expect(garments, page.path).toHaveLength(4)
      for (const garment of garments) {
        expect(categoryOf(garment.poster), `${page.path}: ${garment.poster}`).toBe(family?.name)
      }
    }
    expect(FAMILY_PAGES.map((page) => page.path)).toEqual(FAMILY_PAGE_SOURCES)
  })

  it('products shows one garment from each family that has a page', () => {
    const shown = garmentsOf('/products').map((garment) => categoryOf(garment.poster))
    const families = FAMILY_PAGES.map(
      (page) => FAMILIES.find((family) => family.slug === page.familySlug)?.name,
    )
    expect([...shown].sort()).toEqual([...families].sort())
  })

  // NEGATIVE CONTROL: the category check names a garment planted on the wrong family's card.
  it('sees a garment of another family', () => {
    expect(categoryOf('r-kmj/lime')).toBe('Outerwear')
    expect(categoryOf('r-kmj/lime')).not.toBe('Casual Wear')
  })

  it('the contact card is the contact page’s own photo', () => {
    expect(shareCardFor('/contact').picture).toEqual({ kind: 'photo', photo: 'contact-hero' })
    expect(shareCardFor('/contact').alt).toContain(CONTACT_HERO_PHOTO.alt.slice(1, 40))
  })

  it('each alt text says the card’s words and what else is in the picture', () => {
    for (const path of OWN_PICTURE) {
      const card = shareCardFor(path)
      expect(card.alt, path).toContain(card.heading)
      expect(card.alt, path).toContain(card.accent)
      for (const garment of garmentsOf(path)) {
        expect(card.alt, path).toContain(garment.type.toLowerCase())
      }
    }
  })
})
