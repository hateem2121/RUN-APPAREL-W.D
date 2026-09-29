import { type ComponentProps, createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { CardColour } from '../../lib/projectPublic'
import { CardGallery } from './CardGallery'

const colour = (url: string): CardColour => ({
  slug: 'wine',
  name: 'Wine',
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
    expect(img).toMatch(/sizes="\(max-width: 599px\) calc\(100vw - 42px\), 340px"/)
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
