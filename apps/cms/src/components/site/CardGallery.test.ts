import { type ComponentProps, createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { CardColour } from '../../lib/projectPublic'
import { CardGallery } from './CardGallery'

const colour = (url: string): CardColour => ({
  slug: 'wine',
  name: 'Wine',
  swatch: '#825353',
  image: { url, alt: 'Studio render: X-MILO PRO BIB in Wine', kind: 'render' },
})

const firstImg = (url: string, index = 0) => {
  const props: ComponentProps<typeof CardGallery> = {
    productSlug: 'r-xmp',
    productName: 'X-MILO PRO BIB',
    garmentPages: '/products',
    colours: [colour(url)],
    index,
    children: 'X-MILO PRO BIB',
  }
  const html = renderToStaticMarkup(createElement(CardGallery, props))
  return html.match(/<img [^>]*>/)?.[0] ?? ''
}

describe('CardGallery: the card draws a card-sized picture (owner, 2026-09-29)', () => {
  // The production URL shape: `onSiteMedia` rewrites every public picture to media.wear-run.com.
  // The browser suite cannot show this — its fixture serves pictures from localhost by design
  // (e2e/serve.mjs) — so the production shape is proven here.
  it('asks Cloudflare for the card size of a media.wear-run.com render, with every width', () => {
    const img = firstImg('https://media.wear-run.com/r-xmp-wine-render.webp')
    expect(img).toContain(
      'src="/cdn-cgi/image/fit=scale-down,width=720,height=900,quality=90,format=auto,onerror=redirect/https://media.wear-run.com/r-xmp-wine-render.webp"',
    )
    expect(img).toMatch(
      /srcSet="[^"]*width=400[^"]* 400w, [^"]*width=720[^"]* 720w, [^"]*width=1080[^"]* 1080w"/,
    )
    expect(img).toMatch(/sizes="\(max-width: 899px\) calc\(45vw - 6px\), 340px"/)
  })

  it('keeps the first card eager and high priority, and the size it reserves', () => {
    const img = firstImg('https://media.wear-run.com/r-xmp-wine-render.webp')
    expect(img).toContain('loading="eager"')
    expect(img).toMatch(/fetchPriority="high"/i)
    expect(img).toContain('width="1200"')
    expect(img).toContain('height="1500"')
  })

  // NEGATIVE CONTROL: a picture outside the resizing zone keeps its one file and no srcset.
  it('draws any other address as it is, with no srcset', () => {
    const img = firstImg('/api/media/file/r-xmp-wine-render.webp')
    expect(img).toContain('src="/api/media/file/r-xmp-wine-render.webp"')
    expect(img).not.toMatch(/srcset|sizes=/i)
  })
})

describe('CardGallery: the dots are the colours, and arrows step through them (VA-30)', () => {
  const render = (colours: CardColour[]) => {
    const props: ComponentProps<typeof CardGallery> = {
      productSlug: 'r-xmp',
      productName: 'X-MILO PRO BIB',
      garmentPages: '/products',
      colours,
      index: 3,
      children: 'X-MILO PRO BIB',
    }
    return renderToStaticMarkup(createElement(CardGallery, props))
  }
  const wine = colour('https://media.example/wine.webp')
  const blush: CardColour = { ...wine, slug: 'blush', name: 'Blush', swatch: null }

  it('paints each dot with its swatch, and leaves a colour without one an empty ring', () => {
    const dots = render([wine, blush]).match(/<button[^>]*class="card-gallery__dot"[^>]*>/g) ?? []
    expect(dots).toHaveLength(2)
    expect(dots[0]).toContain('style="--swatch:#825353"')
    expect(dots[1]).not.toContain('style=')
  })

  it('draws a previous and a next button, named for the garment, only when there is a colour to move to', () => {
    const html = render([wine, blush])
    expect(html).toContain('aria-label="Previous colour of X-MILO PRO BIB"')
    expect(html).toContain('aria-label="Next colour of X-MILO PRO BIB"')
    expect(render([wine])).not.toContain('card-gallery__arrow')
  })
})
