import { describe, expect, it } from 'vitest'
import { garmentWarmPath } from './garmentWarm'

/**
 * Which address a touched garment card warms (faster-taps spec, Part 3): the site's own
 * `/__warm/garment/<product>/<colour>`, so the garment page's own data request finds the store
 * already drawing. Never on Save-Data.
 */
const here = new URL('https://wear-run.com/products')
const site = 'https://wear-run.com'

describe('garmentWarmPath', () => {
  it('warms a garment card’s data', () => {
    expect(garmentWarmPath('/products/r-asb/petrol', here, false, site)).toBe(
      '/__warm/garment/r-asb/petrol',
    )
    expect(
      garmentWarmPath('https://wear-run.com/products/r-asb/petrol?ref=x', here, false, site),
    ).toBe('/__warm/garment/r-asb/petrol')
  })

  // A card links to the address printed on the QR tags (seo.ts GARMENT_PAGES), always the
  // site's own origin, while the page itself may be served elsewhere: `next start` in the
  // browser tests, a local preview. Found 27 Oct when the browser test saw no warm request.
  it('warms a card written with the site’s address on a page served from another origin', () => {
    const preview = new URL('http://localhost:4174/products')
    expect(
      garmentWarmPath('https://wear-run.com/products/r-asb/petrol', preview, false, site),
    ).toBe('/__warm/garment/r-asb/petrol')
  })

  it.each([
    ['the products page', '/products', false],
    ['a family page', '/products/r-asb', false],
    ['another origin', 'https://example.com/products/r-asb/petrol', false],
    ['Save-Data', '/products/r-asb/petrol', true],
  ])('never for %s', (_name, href, saveData) => {
    expect(garmentWarmPath(href as string, here, saveData as boolean, site)).toBeNull()
  })
})
