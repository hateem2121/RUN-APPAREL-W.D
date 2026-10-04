import type { ViewerRelatedGarment } from '@run-apparel/shared'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import RelatedCards, { RELATED_CARD_SIZES } from './RelatedCards'
;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

/**
 * The cards of "More from this category" (polish S6): each one link to that garment's page on
 * wear-run.com, its picture the website's resized copy.
 *
 * What would have to break for these to fail: a card that links to the wrong address, a picture
 * asked for at a size the firewall refuses (anything but the shared builder's URLs), a picture
 * whose words repeat the link's name or that names no size, or a hyphenated word split on a phone.
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

const garment = (slug: string, overrides: Partial<ViewerRelatedGarment> = {}) => ({
  slug,
  colourSlug: 'wine',
  productName: `Garment ${slug}`,
  productCode: slug.toUpperCase(),
  imageUrl: `https://media.wear-run.com/${slug}-render.webp`,
  ...overrides,
})

const draw = (related: ViewerRelatedGarment[]) =>
  act(() => root.render(<RelatedCards related={related} />))

const cards = () => [...host.querySelectorAll<HTMLAnchorElement>('.related__card')]

describe('RelatedCards', () => {
  it('makes each card one link to that garment’s page on the website, named by its name and code', () => {
    draw([garment('r-xmp', { colourSlug: 'black' }), garment('r-cch')])
    expect(cards().map((card) => card.href)).toEqual([
      'https://wear-run.com/products/r-xmp/black',
      'https://wear-run.com/products/r-cch/wine',
    ])
    expect(cards()[0]?.textContent).toBe('Garment r-xmpR-XMP')
    expect(host.querySelectorAll('a')).toHaveLength(2)
    expect(host.querySelector('ul')?.getAttribute('role')).toBe('list')
  })

  it('asks for the website’s resized copies, lazily, with no words that repeat the link’s name', () => {
    draw([garment('r1')])
    const img = host.querySelector('img')
    const source = 'https://media.wear-run.com/r1-render.webp'
    expect(img?.getAttribute('src')).toBe(
      `/cdn-cgi/image/fit=scale-down,width=720,height=900,quality=90,format=auto,onerror=redirect/${source}`,
    )
    expect(
      img
        ?.getAttribute('srcset')
        ?.split(', ')
        .map((entry) => entry.split(' ').pop()),
    ).toEqual(['400w', '720w', '1080w'])
    expect(img?.getAttribute('sizes')).toBe(RELATED_CARD_SIZES)
    expect(img?.getAttribute('alt')).toBe('')
    expect(img?.getAttribute('loading')).toBe('lazy')
    // Every picture on the page names its size (SZ-10): the 4:5 box of the default copy.
    expect([img?.getAttribute('width'), img?.getAttribute('height')]).toEqual(['720', '900'])
  })

  it('passes a picture from anywhere else through untouched, and draws none for a garment without one', () => {
    draw([
      garment('r1', { imageUrl: '/api/media/file/r1.webp' }),
      garment('r2', { imageUrl: null }),
    ])
    const [first, second] = cards()
    expect(first?.querySelector('img')?.getAttribute('src')).toBe('/api/media/file/r1.webp')
    expect(first?.querySelector('img')?.hasAttribute('srcset')).toBe(false)
    expect(second?.querySelector('img')).toBeNull()
    // The frame stays, so the card keeps its shape beside the others.
    expect(second?.querySelector('.related__frame')).not.toBeNull()
  })

  it('keeps V-NECK in one piece, and the name and code untranslated, as the website’s cards do', () => {
    draw([garment('r1', { productName: 'Pro V-Neck Training Tee' })])
    const name = host.querySelector('.related__name')
    expect(name?.textContent).toBe('Pro V-Neck Training Tee')
    expect(
      [...(name?.querySelectorAll('.related__word') ?? [])].map((word) => word.textContent),
    ).toEqual(['V-Neck'])
    expect(name?.getAttribute('translate')).toBe('no')
    expect(host.querySelector('.related__code')?.getAttribute('translate')).toBe('no')
  })
})
