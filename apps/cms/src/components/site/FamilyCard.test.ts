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

/** A family's card as the home page draws it, with `familyIsSoon` worked out from a garment count. */
const cardOf = (slug: string, garments: number) => {
  const family = FAMILIES.find((entry) => entry.slug === slug)
  if (!family) throw new Error(`no family ${slug}`)
  const soon = familyIsSoon(family, garments)
  return renderToStaticMarkup(createElement(FamilyCard, { family, picture: null, soon }))
}

const hrefOf = (html: string) => html.match(/<a [^>]*href="([^"]*)"/)?.[1]

/** The card's last line, with the words a screen reader is given (an `aria-hidden` part is not). */
const cueOf = (html: string) => html.match(/<span class="family-card__cue"[^>]*>.*?<\/span>/)?.[0]

/*
 * Polish F8, the owner's answer Q21 (2026-10-04): Sports Accessories has no garments and no page,
 * and its card opened an empty list. It keeps its card, says "[ soon ]" and goes to Contact as
 * "Ask what we make →".
 */
describe('a family with nothing to show: its card says "[ soon ]" and goes to Contact (polish F8)', () => {
  it('Sports Accessories opens Contact, shows the label, and its link names where it goes', () => {
    const html = cardOf('sports-accessories', 0)
    expect(hrefOf(html)).toBe('/contact')
    expect(html).toContain('>[ soon ]<')
    // The whole card is the link, so its words are the link's name. A hidden cue would leave a
    // screen reader hearing "Sports Accessories" and landing on Contact (WCAG 2.4.4).
    const cue = cueOf(html) ?? ''
    expect(cue).toContain('Ask what we make')
    expect(cue).not.toMatch(/^<span class="family-card__cue" aria-hidden/)
  })

  // NEGATIVE CONTROL: a family with a page opens it, says nothing of "soon", and keeps its quiet cue,
  // even with no garment (CI's database holds one).
  it('a family with a page opens that page, with no label', () => {
    const withPage = FAMILIES.filter((family) => familyPageFor(family))
    expect(withPage).toHaveLength(4)
    for (const family of withPage) {
      const html = cardOf(family.slug, 0)
      expect(hrefOf(html), family.slug).toBe(familyPageFor(family)?.path)
      expect(html, family.slug).not.toContain('[ soon ]')
      expect(cueOf(html), family.slug).toMatch(/aria-hidden="true">View the range/)
    }
  })

  // Once a garment of it is published, "soon" would sit over a garment on show.
  it('Sports Accessories with a garment opens its group, with no label', () => {
    const html = cardOf('sports-accessories', 1)
    expect(hrefOf(html)).toBe('/products#sports-accessories')
    expect(html).not.toContain('[ soon ]')
    expect(cueOf(html)).toMatch(/aria-hidden="true">View the range/)
  })
})
