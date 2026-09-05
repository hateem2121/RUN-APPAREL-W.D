import type { ViewerApiSuccess, ViewerColourway, ViewerProduct } from '@run-apparel/shared'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ProductIdentity } from './ProductIdentity'
import { ProductPanel } from './ProductPanel'
;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

/**
 * ⚠️ WHY THIS FILE EXISTS. On 2026-08-21 the product's chips, <h1>, description and
 * colour note stopped having ONE home. They render in `.stage__aside` when the
 * stage band is two columns and in `.content` when it is not, chosen by
 * `useTwoColumnLayout()`.
 *
 * That creates one failure mode that did not exist before and that no other gate
 * can see: BOTH renderings at once. Two <h1> elements, two `id="product-heading"`,
 * and `aria-labelledby` resolving to whichever the browser found first. It is
 * invalid HTML that renders fine, so lint, typecheck and axe are all silent — axe
 * has no rule against a duplicated id, and the page looks merely repetitive.
 *
 * The other half is the inverse: NEITHER rendering, which loses the page's only
 * <h1> and its description. `App.tsx` passes `showIdentity={!twoColumn}` beside
 * `{twoColumn && <ProductIdentity/>}`, so the two are one boolean apart, and
 * inverting one of them produces exactly one of these two states.
 *
 * The fallback-description assertion is carried over from the behaviour this
 * component inherited: `shortDescription` was added on 2026-08-17, so every product
 * older than that renders the fallback, and `||` rather than `??` is deliberate —
 * the CMS field is a textarea and the likeliest way it goes missing is a human
 * clearing it to an empty string.
 */

const PRODUCT: ViewerProduct = {
  slug: 'n001',
  productCode: 'N001',
  productName: 'Velocity Performance Tee',
  category: 'athletic',
  shortDescription: 'A race-fit training tee built for long summer mileage.',
  fabricComposition: '88% Nylon / 12% Spandex',
  gsm: '160 - 220 GSM',
  garmentFit: 'Race fit',
  performanceFeatures: ['Moisture management', 'Four-way stretch'],
} as unknown as ViewerProduct

const SELECTED: ViewerColourway = {
  variantId: 'N001-WINE',
  displayName: 'Wine',
  slug: 'wine',
} as unknown as ViewerColourway

const DATA = { product: PRODUCT } as unknown as ViewerApiSuccess

let host: HTMLDivElement
let root: Root

beforeEach(() => {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

describe('the product identity has exactly one home', () => {
  it('renders the chips, heading, description and colour note in the aside', () => {
    act(() =>
      root.render(<ProductIdentity product={PRODUCT} selected={SELECTED} selectedIndex={0} />),
    )
    const section = host.querySelector('[data-testid="product-identity-aside"]')
    expect(section).not.toBeNull()
    expect(section?.getAttribute('aria-labelledby')).toBe('product-heading')

    expect(host.querySelector('h1')?.id).toBe('product-heading')
    expect(host.textContent).toContain('ATHLETIC')
    expect(host.textContent).toContain('COLORWAY 01')
    expect(host.textContent).toContain('long summer mileage')
    expect(host.textContent).toContain('These colorways are examples')
  })

  it('renders the same fields in .content when the layout is one column', () => {
    act(() =>
      root.render(
        <ProductPanel data={DATA} selected={SELECTED} selectedIndex={0} showIdentity={true} />,
      ),
    )
    expect(host.querySelector('h1')?.id).toBe('product-heading')
    expect(host.querySelector('.spec-list')).not.toBeNull()
    // The single-column shape: identity and facts inside ONE section, sharing its
    // 16px gap rather than `.content`'s 32-64px grid gap.
    expect(host.querySelector('.product-info .spec-list')).not.toBeNull()
  })

  /**
   * THE ASSERTION THIS FILE IS FOR. `showIdentity` is the other side of the same
   * boolean that renders <ProductIdentity>; when it is false the panel must be the
   * facts alone, with no heading to collide with the one in the aside.
   */
  it('renders no heading in .content when the identity has moved to the aside', () => {
    act(() =>
      root.render(
        <ProductPanel data={DATA} selected={SELECTED} selectedIndex={0} showIdentity={false} />,
      ),
    )
    expect(host.querySelector('h1')).toBeNull()
    expect(host.querySelector('#product-heading')).toBeNull()
    // No named-but-empty landmark either: above 1000px `.spec-list` is display:none,
    // so a `.product-info` wrapper here would be a region announcing the product
    // name and containing nothing at all.
    expect(host.querySelector('.product-info')).toBeNull()
    expect(host.querySelector('.spec-list')).not.toBeNull()
  })

  it('falls back to the development-reference wording when there is no description', () => {
    const bare = { ...PRODUCT, shortDescription: '' } as unknown as ViewerProduct
    act(() => root.render(<ProductIdentity product={bare} selected={SELECTED} selectedIndex={0} />))
    expect(host.textContent).toContain('development reference, not a finished stock product')
  })
})
