import type { ViewerApiSuccess, ViewerColourway, ViewerProduct } from '@run-apparel/shared'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ProductPanel } from './ProductPanel'
;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

/**
 * VA-59 (visual audit, 2026-10-02): the Performance line of the spec list read as one run-on
 * string on a phone — "Eco poly stretch / Engineered seam placement / Digital sublimation print /
 * Flex jersey panels" over five lines — because the page joined the CMS's list with " / ". Each
 * feature is now its own line, in a list. Same words, no CMS change.
 *
 * `ProductIdentity.test.tsx` owns the "one home for the identity" cases of this component; this
 * file owns what the Performance fact is made of.
 */

const FEATURES = [
  'Eco poly stretch',
  'Engineered seam placement',
  'Digital sublimation print',
  'Flex jersey panels',
]

const product = (performanceFeatures: string[]): ViewerApiSuccess =>
  ({
    product: {
      slug: 'n001',
      productCode: 'N001',
      productName: 'Velocity Performance Tee',
      category: 'athletic',
      shortDescription: 'A race-fit training tee.',
      fabricComposition: '88% Nylon / 12% Spandex',
      gsm: '160 - 220 GSM',
      garmentFit: 'Race fit',
      performanceFeatures,
    } as unknown as ViewerProduct,
  }) as unknown as ViewerApiSuccess

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

const mount = (features: string[]) =>
  act(() =>
    root.render(
      <ProductPanel
        data={product(features)}
        selected={SELECTED}
        selectedIndex={0}
        showIdentity={false}
      />,
    ),
  )

/** The `<dd>` that answers "[ Performance ]". */
const performance = () =>
  [...host.querySelectorAll('.spec-list div')]
    .find((row) => row.querySelector('dt')?.textContent === '[ Performance ]')
    ?.querySelector('dd') ?? null

describe('the Performance fact lists each feature on its own line', () => {
  it('is a list with one item per feature, in the CMS order and the same words', () => {
    mount(FEATURES)
    const items = [...(performance()?.querySelectorAll('ul > li') ?? [])]
    expect(items.map((item) => item.textContent)).toEqual(FEATURES)
  })

  it('no longer joins them with a slash', () => {
    mount(FEATURES)
    // The old run-on string was the one text node " / "-joined; the facts' own slash in
    // "88% Nylon / 12% Spandex" is a different row and stays.
    expect(performance()?.textContent).not.toContain(' / ')
    expect(performance()?.textContent).toBe(FEATURES.join(''))
  })

  it('keeps list semantics where a bullet-less list would lose them', () => {
    // `list-style: none` makes Safari drop the list role unless it is written out.
    mount(FEATURES)
    expect(performance()?.querySelector('ul')?.getAttribute('role')).toBe('list')
  })

  it('is absent when there are no features, as before', () => {
    mount([])
    expect(performance()).toBeNull()
  })

  it('renders every row when two features are worded alike', () => {
    mount(['Stretch', 'Stretch', 'Flex jersey panels'])
    expect([...(performance()?.querySelectorAll('li') ?? [])].map((li) => li.textContent)).toEqual([
      'Stretch',
      'Stretch',
      'Flex jersey panels',
    ])
  })
})
