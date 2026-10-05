import { type ComponentProps, createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { FAMILIES } from '../../lib/families'
import { familyIsSoon, familyPageFor } from '../../lib/familyPages'
import { FamilyCard, FAMILY_SIZES } from './FamilyCard'

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: unknown }) =>
    createElement('a', { ...rest, href }, children as never),
}))

const imgOf = (url: string) => {
  const props: ComponentProps<typeof FamilyCard> = {
    family: { slug: 'sportswear', name: 'Sportswear', body: 'Training and match wear.' } as never,
    picture: { url, alt: 'Studio render: ARISAN in Petrol', width: 1200, height: 1500 } as never,
  }
  return renderToStaticMarkup(createElement(FamilyCard, props)).match(/<img [^>]*>/)?.[0] ?? ''
}

/*
 * The home page's family cards showed full studio renders — 643 KB and 792 KB for the first two
 * — all starting to download as the page opened on a phone (Lighthouse, 2026-09-29). They now
 * take the same Cloudflare-resized card sizes as /products (lib/cardImage.ts), which the
 * wear-run.com firewall rule allows and nothing else.
 */
describe('FamilyCard draws a card-sized picture', () => {
  it('resizes a media.wear-run.com render with the three allowed sizes and the family grid sizes', () => {
    const img = imgOf('https://media.wear-run.com/r-asb-petrol-render.webp')
    expect(img).toContain(
      'src="/cdn-cgi/image/fit=scale-down,width=720,height=900,quality=90,format=auto,onerror=redirect/https://media.wear-run.com/r-asb-petrol-render.webp"',
    )
    expect(img).toMatch(
      /srcSet="[^"]*width=400[^"]* 400w, [^"]*width=720[^"]* 720w, [^"]*width=1080[^"]* 1080w"/,
    )
    expect(img).toContain(`sizes="${FAMILY_SIZES}"`)
    expect(img).toContain('loading="lazy"')
  })

  // NEGATIVE CONTROL: the owner's own photo on this site (Sports Accessories) is left as it is.
  it('leaves a picture from any other address as it is', () => {
    const img = imgOf('/factory/accessories-800.webp')
    expect(img).toContain('src="/factory/accessories-800.webp"')
    expect(img).not.toMatch(/srcset|sizes=/i)
  })
})

/** A family's card as the home page draws it: `familyIsSoon` and the count from a garment count. */
const cardOf = (slug: string, garments: number) => {
  const family = FAMILIES.find((entry) => entry.slug === slug)
  if (!family) throw new Error(`no family ${slug}`)
  const soon = familyIsSoon(family, garments)
  return renderToStaticMarkup(
    createElement(FamilyCard, { family, picture: null, soon, count: garments }),
  )
}

/**
 * Markup's text: tags out, the one entity these cards write, `&` (Teamwear & Uniforms), and every
 * space as one plain space (`\s` takes in the no-break spaces that hold a "/" to its kind).
 */
const words = (markup: string) =>
  markup
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()

const linksOf = (html: string) =>
  [...html.matchAll(/<a [^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/g)].map((match) => ({
    href: match[1],
    text: words(match[2] ?? ''),
  }))

/**
 * The text of the element with this class, to its own closing tag (a `<p>` holding `<span>`s ends at
 * `</p>`). An element of the same tag inside it would end it early: these cards nest none that way
 * but the count's, whose two forms are read by their own classes.
 */
const textOf = (html: string, className: string) =>
  words(html.match(new RegExp(`<(\\w+) class="${className}"[^>]*>(.*?)</\\1>`))?.[2] ?? '')

/*
 * Polish D3 (the owner's version 2 of 3 October): each family is a ticket. One link, the title's,
 * stretched over the card; a stub the eye reads closed and a screen reader skips (its words are in
 * the opened half); the opened half's count, minimum, description, kinds and way in.
 */
describe('a family ticket (polish D3)', () => {
  const html = cardOf('teamwear-uniforms', 19)

  it('has one link, named for the family, to the family’s page', () => {
    expect(linksOf(html)).toEqual([
      { href: '/custom-teamwear-manufacturer', text: 'Teamwear & Uniforms' },
    ])
    expect(html).toMatch(/<h3 class="family-card__title"><a class="family-card__link"/)
  })

  it('a stub of name and count that a screen reader skips', () => {
    expect(html).toMatch(/<span class="family-card__stub" aria-hidden="true">/)
    expect(textOf(html, 'family-card__stub-name')).toBe('Teamwear & Uniforms')
    // Two forms, the card's width choosing one (site.css), so a narrow card never wraps its count.
    expect(textOf(html, 'family-card__count-long')).toBe('[ 19 references ]')
    expect(textOf(html, 'family-card__count-short')).toBe('[ 19 refs ]')
  })

  it('the opened half: the count and the minimum, the description, four kinds, the way in', () => {
    expect(html).toMatch(
      /<p class="family-card__meta"><span>\[ 19 refs \]<\/span><span>From 50 pcs<\/span><\/p>/,
    )
    expect(textOf(html, 'family-card__desc')).toBe(
      'Squad kit, staff uniforms and matching sets at scale.',
    )
    // The Teamwear page's own groups, in the owner's words, the first four.
    expect(textOf(html, 'family-card__types')).toBe(
      'Soccer / American football / Tennis and pickleball / Cycling',
    )
    expect(html).toMatch(
      /<span class="family-card__cue" aria-hidden="true">View the range <b>→<\/b><\/span>/,
    )
  })

  it('counts one garment as one, and shows no count for a family with a page and none on show', () => {
    expect(textOf(cardOf('outerwear', 1), 'family-card__count-long')).toBe('[ 1 reference ]')
    expect(textOf(cardOf('outerwear', 1), 'family-card__count-short')).toBe('[ 1 ref ]')
    const empty = cardOf('outerwear', 0)
    expect(empty).not.toContain('family-card__count')
    expect(empty).toMatch(/<p class="family-card__meta"><span>From 50 pcs<\/span><\/p>/)
  })
})

/*
 * Polish F8, the owner's answer Q21 (2026-10-04): Sports Accessories has no garments and no page,
 * and its card opened an empty list. It keeps its card, says "[ soon ]" and goes to Contact as
 * "Ask what we make →".
 */
describe('a family with nothing to show: its card says "[ soon ]" and goes to Contact (polish F8)', () => {
  it('Sports Accessories opens Contact, says "[ soon ]", and its link names where it goes', () => {
    const html = cardOf('sports-accessories', 0)
    // The link's words are its name: "Ask what we make" is in them, hidden from sight, or a screen
    // reader would hear "Sports Accessories" and land on Contact (WCAG 2.4.4).
    expect(linksOf(html)).toEqual([
      { href: '/contact', text: 'Sports Accessories. Ask what we make' },
    ])
    expect(textOf(html, 'family-card__count-long')).toBe('[ soon ]')
    expect(textOf(html, 'family-card__count-short')).toBe('[ soon ]')
    expect(html).toContain('<span>[ soon ]</span>')
    expect(html).toMatch(/aria-hidden="true">Ask what we make <b>→<\/b>/)
    // Nothing claimed that the site has not said: no kinds for a family with no page.
    expect(html).not.toContain('family-card__types')
  })

  // NEGATIVE CONTROL: a family with a page opens it, says nothing of "soon", and keeps its cue,
  // even with no garment (CI's database holds one).
  it('a family with a page opens that page, with no "[ soon ]"', () => {
    const withPage = FAMILIES.filter((family) => familyPageFor(family))
    expect(withPage).toHaveLength(4)
    for (const family of withPage) {
      const html = cardOf(family.slug, 0)
      expect(linksOf(html), family.slug).toEqual([
        { href: familyPageFor(family)?.path, text: family.name },
      ])
      expect(html, family.slug).not.toContain('[ soon ]')
      expect(html, family.slug).toMatch(/aria-hidden="true">View the range <b>→/)
    }
  })

  // Once a garment of it is published, "soon" would sit over a garment on show.
  it('Sports Accessories with a garment opens its group, with no "[ soon ]"', () => {
    const html = cardOf('sports-accessories', 1)
    expect(linksOf(html)).toEqual([
      { href: '/products#sports-accessories', text: 'Sports Accessories' },
    ])
    expect(html).not.toContain('[ soon ]')
    expect(textOf(html, 'family-card__count-long')).toBe('[ 1 reference ]')
  })
})
