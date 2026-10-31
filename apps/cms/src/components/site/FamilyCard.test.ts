import { type ComponentProps, createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { stripUntilStable } from '../../../../../scripts/strip-until-stable.mjs'
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
const cardOf = (
  slug: string,
  garments: number,
  extra: Partial<ComponentProps<typeof FamilyCard>> = {},
) => {
  const family = FAMILIES.find((entry) => entry.slug === slug)
  if (!family) throw new Error(`no family ${slug}`)
  const soon = familyIsSoon(family, garments)
  return renderToStaticMarkup(
    createElement(FamilyCard, { family, picture: null, soon, count: garments, ...extra }),
  )
}

/**
 * Markup's text: tags out, the one entity these cards write, `&` (Teamwear & Uniforms), and every
 * space as one plain space.
 */
const words = (markup: string) =>
  // Tags out until none is left (one pass can join two halves into a new tag: the code scan, PR #128).
  stripUntilStable(markup, /<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()

const linksOf = (html: string) =>
  [...html.matchAll(/<a [^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/g)].map((match) => ({
    href: match[1],
    text: words(match[2] ?? ''),
  }))

/** The text of the element with this class, to its own closing tag. */
const textOf = (html: string, className: string) =>
  words(html.match(new RegExp(`<(\\w+) class="${className}"[^>]*>(.*?)</\\1>`))?.[2] ?? '')

/** Each list item's words, in order. */
const itemsOf = (html: string) =>
  [
    ...(html.match(/<ul class="family-card__list">(.*?)<\/ul>/)?.[1] ?? '').matchAll(
      /<li[^>]*>(.*?)<\/li>/g,
    ),
  ].map((match) => words(match[1] ?? ''))

const TEAMWEAR_LIST = [
  'Soccer',
  'American football',
  'Tennis and pickleball',
  'Cycling',
  'Training',
  'Water sports',
  'Basketball',
  'Rugby',
  'Cricket',
  'Baseball',
  'Volleyball',
  'Hockey',
]

const BIB = {
  name: 'X-Milo Pro Bib',
  open: {
    url: 'https://media.wear-run.com/r-xmp-mint-render.webp',
    alt: 'The bib in mint',
    colourName: 'Croquet Mint / Deep End',
  },
  swatches: ['#7E0922', '#55543F', null, '#DDE0E3', '#7FCBBD'],
  shown: 4,
}

/*
 * D44, the owner's option C2 (2026-10-15): the card opens beside its picture. One link, the title's,
 * stretched over the card; a line under the picture the eye reads closed and a screen reader skips;
 * the words: the count, the name, the description, the family's list, the colours and the way in.
 */
describe('a family card (D44)', () => {
  const html = cardOf('teamwear-uniforms', 19, {
    list: TEAMWEAR_LIST,
    garment: BIB,
    picture: {
      url: 'https://media.wear-run.com/r-xmp-wine-render.webp',
      alt: 'The bib in claret red',
    },
  })

  it('has one link, named for the family, to the family’s page: "+ 6 more" is not a second one', () => {
    expect(linksOf(html)).toEqual([
      { href: '/custom-teamwear-manufacturer', text: 'Teamwear & Uniforms' },
    ])
    expect(html).toMatch(/<h3 class="family-card__title"><a class="family-card__link"/)
  })

  it('under the picture, the name and count closed and the garment open, all skipped by a screen reader', () => {
    expect(html).toMatch(/<span class="family-card__under" aria-hidden="true">/)
    expect(textOf(html, 'family-card__stub-name')).toBe('Teamwear & Uniforms')
    expect(textOf(html, 'family-card__count')).toBe('[ 19 refs ]')
    expect(textOf(html, 'family-card__garment')).toBe('X-Milo Pro Bib')
  })

  it('the words: the count, the description, the list label, six of the list and "+ 6 more", the way in', () => {
    expect(textOf(html, 'family-card__meta')).toBe('19 references')
    expect(textOf(html, 'family-card__desc')).toBe(
      'Squad kit, staff uniforms and matching sets at scale.',
    )
    expect(html).toContain('<p class="family-card__label">Made for</p>')
    expect(itemsOf(html)).toEqual([...TEAMWEAR_LIST.slice(0, 6), '+ 6 more'])
    expect(html).toMatch(
      /<span class="family-card__cue" aria-hidden="true">View the range <b>→<\/b><\/span>/,
    )
  })

  // The owner's rule, 2026-10-15: nothing said twice. The hero states the minimum; the second
  // picture is the same garment, already named by the first.
  it('says no minimum, and its second picture is silent', () => {
    expect(words(html)).not.toMatch(/From \d+ pcs|pieces per style/)
    expect(html).toMatch(/<img class="family-card__img family-card__img--open"[^>]* alt=""/)
  })

  it('the colours: the shown colour named over its dots, every dot, the shown one marked', () => {
    expect(html).toMatch(/<div class="family-card__colour" aria-hidden="true">/)
    expect(textOf(html, 'family-card__colour')).toBe('Croquet Mint / Deep End')
    const dots = [...html.matchAll(/<i( class="is-shown")?( style="[^"]*")?><\/i>/g)]
    expect(dots).toHaveLength(5)
    expect(dots.map((dot) => !!dot[1])).toEqual([false, false, false, false, true])
    // A colour with no swatch draws an empty dot rather than a wrong colour.
    expect(dots[2]?.[2]).toBeUndefined()
  })

  it('a list of six or fewer has no "+ more"; no list draws no label and no list', () => {
    const six = cardOf('sportswear', 1, { list: TEAMWEAR_LIST.slice(0, 6) })
    expect(itemsOf(six)).toEqual(TEAMWEAR_LIST.slice(0, 6))
    const none = cardOf('sportswear', 1)
    expect(none).not.toContain('family-card__list')
    expect(none).not.toContain('family-card__label')
    expect(none).not.toContain('family-card__colour')
  })

  it('counts one garment as one, and shows no count for a family with a page and none on show', () => {
    expect(textOf(cardOf('outerwear', 1), 'family-card__meta')).toBe('1 reference')
    expect(textOf(cardOf('outerwear', 1), 'family-card__count')).toBe('[ 1 ref ]')
    const empty = cardOf('outerwear', 0)
    expect(empty).not.toContain('family-card__count')
    expect(empty).not.toContain('family-card__meta')
  })

  it('carries its place in the row, which an opened card moves the others by (site.css)', () => {
    expect(cardOf('casual-wear', 5, { index: 2 })).toMatch(
      /<li class="family-card" style="--card:2"/,
    )
  })
})

/*
 * Polish F8, the owner's answer Q21 (2026-10-04): Sports Accessories has no garments and no page,
 * and its card opened an empty list. It keeps its card, says "[ ask us ]" and goes to Contact as
 * "Ask what we make →".
 */
describe('a family with nothing to show: its card says "[ ask us ]" and goes to Contact (polish F8)', () => {
  // NEGATIVE CONTROL: a family with a page opens it, says nothing of "soon", and keeps its cue,
  // even with no garment (CI's database holds one).
  it('a family with a page opens that page, with no "[ ask us ]"', () => {
    const withPage = FAMILIES.filter((family) => familyPageFor(family))
    expect(withPage).toHaveLength(5)
    for (const family of withPage) {
      const html = cardOf(family.slug, 0)
      expect(linksOf(html), family.slug).toEqual([
        { href: familyPageFor(family)?.path, text: family.name },
      ])
      expect(html, family.slug).not.toContain('[ ask us ]')
      expect(html, family.slug).toMatch(/aria-hidden="true">View the range <b>→/)
    }
  })

  // Once a garment of it is published, "soon" would sit over a garment on show.
  it('Sports Accessories with a garment opens its page, with no "[ ask us ]"', () => {
    const html = cardOf('sports-accessories', 1)
    expect(linksOf(html)).toEqual([
      { href: '/custom-sports-accessories-manufacturer', text: 'Sports Accessories' },
    ])
    expect(html).not.toContain('[ ask us ]')
  })
})
