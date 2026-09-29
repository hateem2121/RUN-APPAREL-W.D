import { type ComponentProps, createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
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
