import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DEFAULT_SITE_SETTINGS } from '@run-apparel/shared'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { FamilyHeroPicture, HERO_PICTURE_SIZES } from './components/site/FamilyHeroPicture'
import { FamilyLanding } from './components/site/FamilyLanding'
import { CARD_WIDTHS } from './lib/cardImage'
import { FAMILIES, FAMILY_PHOTOS, familyPictures } from './lib/families'
import { FAMILY_PAGES } from './lib/familyPages'
import { EMPTY_FOOTER, type ProductCard, type PublicSiteSettings } from './lib/projectPublic'

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: unknown }) =>
    createElement('a', { ...rest, href }, children as never),
}))

/**
 * VA-48 (visual audit, owner's choice 2026-10-02): home and contact open on a factory photo and
 * the four buyer pages opened on plain paper. Each now opens on its family's picture — the one its
 * home-page card shows — loaded first, sized before it arrives, with its own alt text, and with the
 * headline still the page's first heading and still on paper.
 *
 * What would have to break for these to fail: the hero picks a different picture from the card, the
 * picture loses its eager / high-priority loading or its reserved size (the page's largest paint
 * then arrives late or moves the page), a `<link rel=preload>` appears for it (`perfBudgets.spec.ts`
 * allows one per page), the headline stops being first, text moves onto the picture, or a family
 * with no picture gets an empty frame. `e2e/familyHero.spec.ts` checks the same in a browser.
 */

const FRONTEND = join(import.meta.dirname, 'app', '(frontend)')
const SITE_CSS = readFileSync(join(FRONTEND, 'site.css'), 'utf8')

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
  shortDescription: '',
  posterUrl: 'https://media.wear-run.com/poster.webp',
  posterAlt: 'poster alt',
  defaultColourSlug: 'c',
  colourNames: ['C'],
  colours: [colour('https://media.wear-run.com/render.webp', 'render')],
  model: null,
  updatedAt: null,
  ...over,
})

const settings: PublicSiteSettings = {
  ...DEFAULT_SITE_SETTINGS,
  logoUrl: null,
  logoMimeType: null,
  footer: EMPTY_FOOTER,
}

const landing = (page: (typeof FAMILY_PAGES)[number], products: ProductCard[]) =>
  renderToStaticMarkup(createElement(FamilyLanding, { page, products, settings }))

/** The first `<img …>` inside the hero section, or ''. */
const heroImg = (html: string) => {
  const hero = html.match(/<section class="site-hero">[\s\S]*?<\/section>/)?.[0] ?? ''
  return hero.match(/<img [^>]*>/)?.[0] ?? ''
}

describe('the hero shows the picture the family’s card shows (VA-48)', () => {
  for (const page of FAMILY_PAGES) {
    const family = FAMILIES.find((entry) => entry.slug === page.familySlug)
    if (!family) throw new Error(`no family ${page.familySlug}`)

    it(`${page.path}: its first garment's studio render, before its poster`, () => {
      const products = [
        card({
          slug: 'first',
          category: family.name,
          colours: [colour('https://media.wear-run.com/first-render.webp', 'render')],
        }),
        card({
          slug: 'second',
          category: family.name,
          colours: [colour('https://media.wear-run.com/second-render.webp', 'render')],
        }),
      ]
      const html = landing(page, products)
      expect(heroImg(html)).toContain('first-render.webp')
      expect(heroImg(html)).not.toContain('second-render')
      // And it is exactly the picture the home card is given.
      expect(familyPictures(products)[family.slug]?.url).toBe(
        'https://media.wear-run.com/first-render.webp',
      )
    })

    it(`${page.path}: the poster when the garment has no render`, () => {
      const html = landing(page, [
        card({
          category: family.name,
          colours: [{ slug: 'c', name: 'C', swatch: null, image: null }],
          posterUrl: 'https://media.wear-run.com/the-poster.webp',
        }),
      ])
      expect(heroImg(html)).toContain('the-poster.webp')
    })

    it(`${page.path}: nothing at all when the family has no picture, and the hero is the words alone`, () => {
      // Another family's garment is no picture for this one.
      const other = FAMILIES.find(
        (entry) => entry.slug !== family.slug && entry.slug !== 'sports-accessories',
      )
      const html = landing(page, [card({ category: other?.name ?? 'Outerwear' })])
      expect(
        familyPictures([card({ category: other?.name ?? 'Outerwear' })])[family.slug],
      ).toBeNull()
      expect(html).not.toContain('family-hero')
      expect(heroImg(html)).toBe('')
      // Today's hero, in today's order: label, headline, lede, buttons.
      const hero = html.match(/<section class="site-hero">[\s\S]*?<\/section>/)?.[0] ?? ''
      const at = (needle: string) => hero.indexOf(needle)
      expect(at('class="label"')).toBeGreaterThan(-1)
      expect(at('<h1')).toBeGreaterThan(at('class="label"'))
      expect(at('class="site-lede"')).toBeGreaterThan(at('<h1'))
      expect(at('class="site-actions"')).toBeGreaterThan(at('class="site-lede"'))
    })
  }

  it('the family’s own photo is the last resort, and only Sports Accessories has one', () => {
    expect(Object.keys(FAMILY_PHOTOS)).toEqual(['sports-accessories'])
  })
})

describe('the hero picture loads first and is sized before it arrives (VA-48)', () => {
  const page = FAMILY_PAGES[0] as (typeof FAMILY_PAGES)[number]
  const family = FAMILIES.find((entry) => entry.slug === page.familySlug)
  const withPicture = landing(page, [card({ category: family?.name ?? '' })])
  const img = heroImg(withPicture)

  it('is eager with high fetch priority, on the image itself', () => {
    expect(img).toContain('loading="eager"')
    expect(img).toMatch(/fetchPriority="high"/i)
  })

  it('reserves its space: width and height on the image, a 4:5 frame in the stylesheet', () => {
    expect(img).toContain('width="1200"')
    expect(img).toContain('height="1500"')
    const frame = /\.family-hero__frame\s*\{([^}]*)\}/.exec(SITE_CSS)?.[1] ?? ''
    expect(frame).toMatch(/aspect-ratio:\s*4\s*\/\s*5/)
  })

  it('keeps the picture’s own alt text', () => {
    expect(img).toContain('alt="render alt"')
  })

  it('offers only the three card sizes the wear-run.com firewall rule allows, with the hero’s sizes', () => {
    expect(img).toContain(`sizes="${HERO_PICTURE_SIZES}"`)
    // The srcSet alone: `src` is the 720 file again and would be a fourth entry.
    const srcSet = img.match(/srcSet="([^"]*)"/)?.[1] ?? ''
    const widths = [...srcSet.matchAll(/width=(\d+),/g)].map((match) => Number(match[1]))
    expect(widths).toEqual([...CARD_WIDTHS])
    expect(img).toMatch(/srcSet="[^"]* 400w, [^"]* 720w, [^"]* 1080w"/)
  })

  it('sits in a <picture>, so React adds no preload link, and the page names none for it', () => {
    expect(withPicture).toContain('<picture class="product-card__picture">')
    expect(withPicture).not.toMatch(/<link[^>]*rel="preload"/)
  })
})

describe('the headline stays first, on paper (VA-48)', () => {
  const page = FAMILY_PAGES[0] as (typeof FAMILY_PAGES)[number]
  const family = FAMILIES.find((entry) => entry.slug === page.familySlug)
  const html = landing(page, [card({ category: family?.name ?? '' })])
  const hero = html.match(/<section class="site-hero">[\s\S]*?<\/section>/)?.[0] ?? ''

  it('the h1 is the first heading on the page, and the picture comes after the words', () => {
    expect(html.match(/<h[1-6]\b/)?.[0]).toBe('<h1')
    expect(hero.indexOf('<h1')).toBeLessThan(hero.indexOf('family-hero__body'))
    expect(hero.indexOf('class="site-lede"')).toBeLessThan(hero.indexOf('family-hero__picture'))
    expect(hero.indexOf('class="site-actions"')).toBeLessThan(hero.indexOf('family-hero__picture'))
  })

  it('has one h1 and no heading inside the picture', () => {
    expect(html.match(/<h1\b/g)).toHaveLength(1)
    const picture = hero.slice(hero.indexOf('family-hero__picture'))
    expect(picture).not.toMatch(/<h[1-6]\b/)
  })

  // The wash-free promise: nothing is positioned over the picture's frame.
  it('draws no text over the picture', () => {
    const frame =
      hero.match(/<span class="family-hero__frame">([\s\S]*?)<\/span><\/div>/)?.[1] ?? ''
    expect(frame).not.toMatch(/<(p|h[1-6]|a|button)\b/)
  })

  it('sets the picture beside the words from 900px and under them below', () => {
    const body = /\.family-hero__body\s*\{([^}]*)\}/.exec(SITE_CSS)?.[1] ?? ''
    expect(body).toMatch(/display:\s*grid/)
    expect(body).not.toMatch(/grid-template-columns/)
    const wide = [...SITE_CSS.matchAll(/@media \(min-width: 900px\) \{([\s\S]*?)\n\}/g)]
      .map((match) => match[1] ?? '')
      .find((block) => block.includes('.family-hero__body'))
    expect(wide).toMatch(/grid-template-columns:\s*minmax\(0, 1fr\) minmax\(0, 420px\)/)
  })
})

describe('the component alone', () => {
  const html = (url: string, srcSet?: string) =>
    renderToStaticMarkup(
      createElement(FamilyHeroPicture, { picture: { url, alt: 'a garment', srcSet } }),
    )

  it('leaves a picture from any other address as it is, still eager and high priority', () => {
    const out = html('/api/media/file/r-xmp-wine-render.webp')
    expect(out).toContain('src="/api/media/file/r-xmp-wine-render.webp"')
    expect(out).not.toMatch(/srcset|sizes=/i)
    expect(out).toContain('loading="eager"')
    expect(out).toMatch(/fetchPriority="high"/i)
  })

  it('takes the site’s own photo with the widths it brings', () => {
    const out = html(
      '/families/sports-accessories-800.webp',
      FAMILY_PHOTOS['sports-accessories']?.srcSet,
    )
    expect(out).toContain('sports-accessories-400.webp 400w')
    expect(out).toContain('sports-accessories-800.webp 800w')
    expect(out).toContain(`sizes="${HERO_PICTURE_SIZES}"`)
  })
})
