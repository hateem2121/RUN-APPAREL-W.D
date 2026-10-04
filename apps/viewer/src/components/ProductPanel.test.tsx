import type { ViewerApiSuccess, ViewerColourway, ViewerProduct } from '@run-apparel/shared'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ProductPanel } from './ProductPanel'
;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

/**
 * What `.content` holds under the stage, in each of the page's layouts (polish D10).
 *
 * The facts are ONE component drawn in one place: the 3D window's corners on a computer
 * (`showSpecs={false}` here) or this panel everywhere else. `ProductIdentity.test.tsx` owns the
 * "one home for the identity" cases; `SpecGroups.test.tsx` owns what the facts are made of.
 */

const DATA = {
  product: {
    slug: 'n001',
    productCode: 'N001',
    productName: 'Velocity Performance Tee',
    category: 'athletic',
    shortDescription: 'A race-fit training tee.',
    fabricComposition: '88% Nylon / 12% Spandex',
    gsm: '160–220 GSM',
    garmentFit: 'Race fit',
    performanceFeatures: ['Moisture management', 'Four-way stretch'],
  } as unknown as ViewerProduct,
} as unknown as ViewerApiSuccess

const SELECTED = {
  variantId: 'N001-WINE',
  displayName: 'Wine',
  slug: 'wine',
} as unknown as ViewerColourway

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

const mount = (showIdentity: boolean, showSpecs: boolean) =>
  act(() =>
    root.render(
      <ProductPanel
        data={DATA}
        selected={SELECTED}
        selectedIndex={0}
        showIdentity={showIdentity}
        showSpecs={showSpecs}
      />,
    ),
  )

describe('the facts under the stage', () => {
  it('one column: the name, the description and the facts in one section', () => {
    mount(true, true)
    expect(host.querySelector('.product-info h1')).not.toBeNull()
    expect(host.querySelectorAll('.product-info .spec-groups--list')).toHaveLength(1)
  })

  it('identity beside the garment, facts not in the corners: the facts alone, no section', () => {
    mount(false, true)
    expect(host.querySelector('.product-info')).toBeNull()
    expect(host.querySelectorAll('.spec-groups--list')).toHaveLength(1)
  })

  it('identity beside the garment and facts in the corners: nothing here at all', () => {
    mount(false, false)
    expect(host.innerHTML).toBe('')
  })
})
