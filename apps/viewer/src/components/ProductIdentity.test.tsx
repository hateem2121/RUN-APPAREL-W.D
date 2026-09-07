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

/**
 * FA-H-17 — rapid colourway switching settles correctly, and one `key` is why.
 *
 * Audited 2026-09-06: tab 2 clicked, tab 4 clicked ~60 ms later; the colour note
 * read `opacity 0.906 → 0.830` — DOWN, i.e. the fade RESTARTED rather than
 * continuing — and settled at `opacity 1 / transform none` carrying the right
 * label. Scored 9, with nothing holding it there.
 *
 * The whole mechanism is `key={selected.slug}` on `.product-info__colour`. React
 * reuses a DOM node across renders when the key does not change, and a CSS
 * entrance animation runs on ELEMENT INSERTION — so without the key the node
 * survives the colourway change, `colour-swap` never re-fires, and the label text
 * simply mutates in place. The text is still correct, which is exactly why this
 * cannot be caught by reading the page: the defect is that a visitor tapping
 * through five colourways gets no acknowledgement that the label changed, on the
 * control that chooses what they are looking at.
 *
 * ⚠️ ASSERTED AS NODE IDENTITY, NOT AS AN ANIMATION. jsdom runs no animations and
 * the e2e suite forces `prefers-reduced-motion: reduce`, under which the fade is
 * collapsed to 0.01ms by `base.css` — so any assertion phrased in terms of
 * opacity would pass vacuously in both places. Insertion is the thing the key
 * controls and the thing an animation needs; it is observable here and nowhere
 * else in the suite.
 */
describe('the colour note re-announces itself on every switch', () => {
  const OTHER: ViewerColourway = {
    variantId: 'N001-BUTTER',
    displayName: 'Butter',
    slug: 'butter',
  } as unknown as ViewerColourway

  it('replaces the colour-note element rather than mutating it in place', () => {
    act(() =>
      root.render(<ProductIdentity product={PRODUCT} selected={SELECTED} selectedIndex={0} />),
    )
    const first = host.querySelector('.product-info__colour')
    expect(first, 'no .product-info__colour rendered').not.toBeNull()
    expect(first?.textContent).toContain('WINE')

    act(() => root.render(<ProductIdentity product={PRODUCT} selected={OTHER} selectedIndex={2} />))
    const second = host.querySelector('.product-info__colour')

    expect(second?.textContent).toContain('BUTTER')
    expect(
      second === first,
      'the colour note kept its DOM node across a colourway change, so its ' +
        'entrance animation cannot re-fire — the label changes with no ' +
        'acknowledgement. Restore key={selected.slug} in ProductIdentity.tsx. ' +
        'See audit FA-H-17.',
    ).toBe(false)
    expect(first?.isConnected, 'the old colour note is still in the document').toBe(false)
  })

  it('keeps the node when nothing changed, so the check above is about the key', () => {
    /*
     * The negative control. Without it, a component that recreated its whole
     * subtree on every render — or a test rendering into a fresh root each time —
     * would satisfy the assertion above while proving nothing about the key.
     */
    act(() =>
      root.render(<ProductIdentity product={PRODUCT} selected={SELECTED} selectedIndex={0} />),
    )
    const first = host.querySelector('.product-info__colour')

    act(() =>
      root.render(<ProductIdentity product={PRODUCT} selected={SELECTED} selectedIndex={0} />),
    )

    expect(host.querySelector('.product-info__colour')).toBe(first)
  })
})
