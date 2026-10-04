import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { GarmentTrail } from './GarmentTrail'
;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

/**
 * The trail at the top of a garment page (polish S5): Home › Products › the category › the
 * garment, as the W3C breadcrumb pattern asks, and the same steps as the search-result
 * breadcrumb (`worker/preview.ts`).
 */

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

const draw = (category: string, productName = 'Velocity Performance Tee') =>
  act(() => root.render(<GarmentTrail product={{ category: category as never, productName }} />))

const steps = () =>
  [...host.querySelectorAll('li')].map((item) => {
    const link = item.querySelector('a')
    return [item.textContent, link?.getAttribute('href') ?? null]
  })

describe('GarmentTrail', () => {
  it('walks Home › Products › the category’s own page › the garment', () => {
    draw('Sportswear')
    expect(steps()).toEqual([
      ['Home', 'https://wear-run.com/'],
      ['Products', 'https://wear-run.com/products'],
      ['Sportswear', 'https://wear-run.com/custom-activewear-manufacturer'],
      ['Velocity Performance Tee', null],
    ])
  })

  it('is a labelled navigation list, with the garment marked as the page you are on', () => {
    draw('Outerwear')
    const nav = host.querySelector('nav')
    expect(nav?.getAttribute('aria-label')).toBe('Breadcrumb')
    expect(host.querySelector('ol')?.getAttribute('role')).toBe('list')
    const current = host.querySelectorAll('[aria-current="page"]')
    expect(current).toHaveLength(1)
    expect(current[0]?.textContent).toBe('Velocity Performance Tee')
    // The page already open is not a link to itself.
    expect(current[0]?.closest('a')).toBeNull()
  })

  it('hides the drawn separators from screen readers, one between each pair of steps', () => {
    draw('Outerwear')
    const separators = host.querySelectorAll('svg')
    expect(separators).toHaveLength(3)
    for (const separator of separators) expect(separator.getAttribute('aria-hidden')).toBe('true')
  })

  it('sends a category with no page of its own to its family filter', () => {
    draw('Sports Accessories')
    expect(steps()[2]).toEqual([
      'Sports Accessories',
      'https://wear-run.com/products?family=sports-accessories',
    ])
  })

  it('invents no step for a garment with no category', () => {
    draw('  ')
    expect(steps().map(([text]) => text)).toEqual(['Home', 'Products', 'Velocity Performance Tee'])
  })
})
