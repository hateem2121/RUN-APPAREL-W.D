import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  FAMILIES,
  FAMILY_OPEN_COLOUR,
  FAMILY_PHOTOS,
  familyBySlug,
  familyGarments,
  familyPictures,
} from './families'
import type { ProductCard } from './projectPublic'

/**
 * ⚠️ THE FAILURE THIS GUARDS IS SILENT, WHICH IS WHY IT READS THE COLLECTION AS TEXT.
 *
 * The gallery filter matches `product.category` against `FAMILIES[].name` by string
 * equality. Rename an option in `Products.ts` — "Casual Wear" to "Casualwear", say — and
 * nothing throws, nothing fails a typecheck, and nothing looks wrong: the chip is still
 * there, it is still clickable, and it returns an empty gallery for ever. That is the
 * same shape as the `aria-current` rule this project shipped, which was correct CSS that
 * had never once applied.
 *
 * Reading the source rather than importing it is deliberate. `Products.ts` pulls in
 * Payload's collection config and its hooks, which need a database and an environment;
 * `claudeMd.test.ts` and `workflowHardening.test.ts` take the same approach for the same
 * reason. The parse is narrow and would fail loudly if the file's shape changed.
 */
const PRODUCTS_TS = join(import.meta.dirname, '..', 'collections', 'Products.ts')

function categoryOptionsFromSource(): string[] {
  const source = readFileSync(PRODUCTS_TS, 'utf8')
  const start = source.indexOf("name: 'category'")
  expect(start, "Products.ts no longer declares a field named 'category'").toBeGreaterThan(-1)
  const optionsAt = source.indexOf('options: [', start)
  expect(optionsAt, "the 'category' field no longer declares options").toBeGreaterThan(-1)
  // to the closing bracket of `options: [ … ]`, not to the first `},` inside it
  const block = source.slice(optionsAt, source.indexOf(']', optionsAt))
  return [...block.matchAll(/\{\s*label:\s*'([^']+)',\s*value:\s*'([^']+)'\s*\}/g)].map((m) => {
    const [, label, value] = m
    expect(label, 'a category label and value have diverged').toBe(value)
    return value ?? ''
  })
}

describe('the five families are the collection’s five categories', () => {
  it('names match the Products collection exactly, in order', () => {
    expect(FAMILIES.map((f) => f.name)).toEqual(categoryOptionsFromSource())
  })

  it('the negative control: a renamed category would be caught', () => {
    // Proves the parse above reads real content rather than returning a constant — if it
    // silently returned [] or the same array it was compared against, this would pass
    // with any input, and the guard would be the kind that has never caught anything.
    const options = categoryOptionsFromSource()
    expect(options.length).toBe(5)
    expect(options).toContain('Teamwear & Uniforms')
    expect(FAMILIES.map((f) => f.name)).not.toEqual(options.map((o) => `${o} `))
  })
})

describe('familyBySlug', () => {
  it('resolves every declared slug', () => {
    for (const family of FAMILIES) expect(familyBySlug(family.slug)).toBe(family)
  })

  it('treats an unknown or absent value as "everything"', () => {
    expect(familyBySlug(undefined)).toBeNull()
    expect(familyBySlug('')).toBeNull()
    expect(familyBySlug('outerwear-')).toBeNull()
    // A hand-typed URL must not be able to produce an error page.
    expect(familyBySlug('<script>')).toBeNull()
  })

  it('slugs are unique, lowercase and URL-safe', () => {
    const slugs = FAMILIES.map((f) => f.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
    for (const slug of slugs) expect(slug).toMatch(/^[a-z0-9-]+$/)
  })
})

/*
 * The home page's family cards show a real product picture (owner, 2026-09-29) so a visitor
 * sees what each family holds. The picture is the first product in CMS order (the gallery's
 * order) — its studio render where it has one, else its poster.
 */
describe('familyPictures', () => {
  const colour = (url: string, kind: 'render' | 'poster') => ({
    slug: 'c',
    name: 'C',
    swatch: null,
    image: { url, alt: `${kind} alt`, kind },
  })
  const card = (over: Partial<ProductCard>): ProductCard => ({
    slug: 's',
    productName: 'P',
    productCode: 'R-P',
    category: 'Sportswear',
    garmentType: '',
    shortDescription: '',
    posterUrl: 'https://media.example/poster.webp',
    posterAlt: 'poster alt',
    defaultColourSlug: 'c',
    colourNames: ['C'],
    colours: [colour('https://media.example/render.webp', 'render')],
    model: null,
    updatedAt: null,
    ...over,
  })

  it('uses the first product of each family, its render before its poster', () => {
    const pictures = familyPictures([
      card({ slug: 'a', colours: [colour('https://media.example/a-render.webp', 'render')] }),
      card({ slug: 'b', colours: [colour('https://media.example/b-render.webp', 'render')] }),
      card({
        slug: 'o',
        category: 'Outerwear',
        colours: [colour('https://media.example/o-poster.webp', 'poster')],
      }),
    ])
    expect(pictures.sportswear?.url).toBe('https://media.example/a-render.webp')
    expect(pictures.outerwear?.url).toBe('https://media.example/o-poster.webp')
  })

  it('falls back to the card poster when the colour has no picture', () => {
    const pictures = familyPictures([
      card({ colours: [{ slug: 'c', name: 'C', swatch: null, image: null }] }),
    ])
    expect(pictures.sportswear).toEqual({
      url: 'https://media.example/poster.webp',
      alt: 'poster alt',
    })
  })

  it('gives a family with no product, or no picture at all, null — never a broken image', () => {
    const pictures = familyPictures([
      card({ category: 'Casual Wear', posterUrl: null, colours: [] }),
    ])
    expect(pictures['casual-wear']).toBeNull()
    expect(Object.keys(pictures).sort()).toEqual(FAMILIES.map((f) => f.slug).sort())
  })

  // The owner's photo (2026-09-30) stands in only while the family has no product.
  it('shows Sports Accessories its own photo, and a product picture wins once there is one', () => {
    expect(familyPictures([])['sports-accessories']).toEqual(FAMILY_PHOTOS['sports-accessories'])
    const withProduct = familyPictures([card({ category: 'Sports Accessories' })])
    expect(withProduct['sports-accessories']?.url).toBe('https://media.example/render.webp')
  })

  it('every family photo file exists in both widths', () => {
    for (const photo of Object.values(FAMILY_PHOTOS)) {
      for (const entry of (photo.srcSet ?? '').split(', ')) {
        const file = entry.split(' ')[0] ?? ''
        expect(existsSync(join(import.meta.dirname, '..', '..', 'public', file)), file).toBe(true)
      }
    }
  })

  it('matches the category exactly, as the gallery filter does (negative control)', () => {
    expect(familyPictures([card({ category: 'sportswear' })]).sportswear).toBeNull()
  })
})

/*
 * D44: each family's list lives in the Site Settings group `familyLists`, under the field its
 * `listField` names. A misspelt field fails nothing and shows nothing: the card simply has no list,
 * the same silent shape as the category guard above, so this reads the global's source the same way.
 */
describe('each family names its list field in Site Settings (D44)', () => {
  const source = readFileSync(join(import.meta.dirname, '..', 'globals', 'SiteSettings.ts'), 'utf8')
  const group = source.slice(source.indexOf("name: 'familyLists'"))
  const fields = [
    ...group
      .slice(0, group.indexOf("name: 'inquiryTemplate'"))
      .matchAll(/name: '(\w+)',\s*type: 'array'/g),
  ].map((match) => match[1])

  it('one array per family, in the families’ order', () => {
    expect(fields).toEqual(FAMILIES.map((family) => family.listField))
  })

  it('the two families listed by use say "Made for"; the three listed by kind, "In the range"', () => {
    expect(FAMILIES.map((family) => [family.slug, family.listLabel])).toEqual([
      ['sportswear', 'Made for'],
      ['teamwear-uniforms', 'Made for'],
      ['casual-wear', 'In the range'],
      ['outerwear', 'In the range'],
      ['sports-accessories', 'In the range'],
    ])
  })
})

describe('familyGarments: the garment an opened card shows, in another colour (D44)', () => {
  const colour = (slug: string, image = true) => ({
    slug,
    name: `${slug} name`,
    swatch: `#${slug.length.toString().padStart(6, '0')}`,
    image: image
      ? { url: `https://media.example/${slug}.webp`, alt: `${slug} alt`, kind: 'render' as const }
      : null,
  })
  const card = (over: Partial<ProductCard>): ProductCard => ({
    slug: 'r-xmp',
    productName: 'X-Milo Pro Bib',
    productCode: 'R-XMP',
    category: 'Teamwear & Uniforms',
    garmentType: '',
    shortDescription: '',
    posterUrl: null,
    posterAlt: '',
    defaultColourSlug: 'wine',
    colourNames: [],
    colours: [colour('wine'), colour('olive'), colour('lavender'), colour('white'), colour('mint')],
    model: null,
    updatedAt: null,
    ...over,
  })

  it('opens on the owner’s colour for the garment, naming it and marking its dot', () => {
    const bib = familyGarments([card({})])['teamwear-uniforms']
    expect(FAMILY_OPEN_COLOUR['r-xmp']).toBe('mint')
    expect(bib).toEqual({
      name: 'X-Milo Pro Bib',
      open: { url: 'https://media.example/mint.webp', alt: 'mint alt', colourName: 'mint name' },
      swatches: ['#000004', '#000005', '#000008', '#000005', '#000004'],
      shown: 4,
    })
  })

  // The owner's colour gone, or a garment the list does not name: its first other colour with a picture.
  it('falls back to the first other colour with a picture', () => {
    const noMint = familyGarments([
      card({ colours: [colour('wine'), colour('olive', false), colour('white')] }),
    ])
    expect(noMint['teamwear-uniforms']?.open.colourName).toBe('white name')
    expect(noMint['teamwear-uniforms']?.shown).toBe(2)
    const other = familyGarments([card({ slug: 'r-new' })])
    expect(other['teamwear-uniforms']?.shown).toBe(1)
  })

  // NEGATIVE CONTROL: one colour, or none other with a picture, opens on the picture it shows.
  it('is null for a garment with no other colour to show, and for a family with no garment', () => {
    expect(familyGarments([card({ colours: [colour('wine')] })])['teamwear-uniforms']).toBeNull()
    expect(
      familyGarments([card({ colours: [colour('wine'), colour('mint', false)] })])[
        'teamwear-uniforms'
      ],
    ).toBeNull()
    expect(familyGarments([card({})]).outerwear).toBeNull()
  })
})
