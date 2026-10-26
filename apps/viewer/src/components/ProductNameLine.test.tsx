import type { ViewerProduct } from '@run-apparel/shared'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ProductNameLine } from './ProductNameLine'
;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

/**
 * The garment's name and code over the 3D window on a phone (owner, 2026-10-26, site check).
 * The words are the markup's; whether they show is page.css's (`phoneNameLine.test.ts`).
 */

const PRODUCT = {
  slug: 'rxps',
  productCode: 'R-XPS',
  productName: 'X-MILO PRO SKIN-SUIT',
} as unknown as ViewerProduct

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

describe('the name line over a phone’s garment', () => {
  it('reads "NAME · CODE" in that order, as one line of text', () => {
    act(() => root.render(<ProductNameLine product={PRODUCT} />))
    expect(host.textContent).toBe('X-MILO PRO SKIN-SUIT · R-XPS')
  })

  it('is hidden from a screen reader, because the heading further down is the accessible name', () => {
    act(() => root.render(<ProductNameLine product={PRODUCT} />))
    const line = host.querySelector('.stage-block__title')
    expect(line, 'no .stage-block__title rendered').not.toBeNull()
    expect(line?.getAttribute('aria-hidden')).toBe('true')
    // It must not be a heading or a landmark: that would announce the name a second time.
    expect(host.querySelector('h1, h2, h3, [role]')).toBeNull()
  })

  it('is never machine-translated, like the heading and the code beside it (polish X27)', () => {
    act(() => root.render(<ProductNameLine product={PRODUCT} />))
    expect(host.querySelector('.stage-block__title')?.getAttribute('translate')).toBe('no')
  })

  it('keeps the code in an element of its own, so a long name can shorten and the code cannot', () => {
    act(() => root.render(<ProductNameLine product={PRODUCT} />))
    expect(host.querySelector('.stage-block__title-code')?.textContent).toContain('R-XPS')
    expect(host.querySelector('.stage-block__title-name')?.textContent).toBe('X-MILO PRO SKIN-SUIT')
  })
})
