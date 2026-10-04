import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ViewerApiSuccess, ViewerRelatedGarment } from '@run-apparel/shared'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { RelatedGarments } from './RelatedGarments'
;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

/**
 * "More from this category" (polish S6): the section, drawn with the page, its cards fetched
 * after (RelatedCards.test.tsx has the cards), and "See all … in 3D" to the category's gallery.
 *
 * What would have to break for these to fail: a section drawn with no cards (a label over
 * nothing), the section waiting for its cards (then the reveal never finds it: the viewer-layout
 * rule's `data-reveal` trap), the website's approved "See all" words drifting, or the cards'
 * rules moving back into the page's stylesheet, where they delayed every first paint.
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

const garment = (slug: string): ViewerRelatedGarment => ({
  slug,
  colourSlug: 'wine',
  productName: `Garment ${slug}`,
  productCode: slug.toUpperCase(),
  imageUrl: null,
})

const draw = (related: ViewerRelatedGarment[] | undefined, category = 'Teamwear & Uniforms') => {
  const data = { product: { category }, related } as unknown as ViewerApiSuccess
  act(() => root.render(<RelatedGarments data={data} />))
}

/** Lets the cards' dynamic import settle and its state land. */
const cardsArrive = () =>
  act(async () => {
    await import('./RelatedCards')
    await new Promise((resolve) => setTimeout(resolve, 0))
  })

describe('RelatedGarments', () => {
  it('draws nothing at all without cards: no answer field, an empty list, or no category', () => {
    draw(undefined)
    expect(host.innerHTML).toBe('')
    draw([])
    expect(host.innerHTML).toBe('')
    draw([garment('r1')], '  ')
    expect(host.innerHTML).toBe('')
  })

  it('is a labelled section: "№03 — More from this category", and the category in its heading', () => {
    draw([garment('r1')])
    const section = host.querySelector('section')
    const heading = host.querySelector('h2')
    expect(host.querySelector('.section-number')?.textContent).toBe('№03 — More from this category')
    expect(heading?.textContent).toBe('More Teamwear & Uniforms in 3D.')
    expect(section?.getAttribute('aria-labelledby')).toBe(heading?.id)
  })

  // A late arrival, held back on purpose, and a lost file: RelatedGarments.loading.test.tsx.
  it('draws the cards inside the section the reveal found, between the heading and "See all"', async () => {
    draw([garment('r1'), garment('r2')])
    const section = host.querySelector('section')
    expect(section?.hasAttribute('data-reveal')).toBe(true)
    await cardsArrive()
    // The SAME element: the reveal found it at the first render and must still be watching it.
    expect(host.querySelector('section')).toBe(section)
    expect(section?.querySelectorAll('.related__card')).toHaveLength(2)
    // The cards sit between the heading and "See all".
    expect(section?.lastElementChild?.classList.contains('related__all')).toBe(true)
  })

  it('ends with "See all … in 3D", the website’s words, to the category’s own page (polish S1)', () => {
    draw([garment('r1')])
    const all = host.querySelector<HTMLAnchorElement>('.related__all')
    expect(all?.textContent).toBe('See all teamwear & uniforms in 3D')
    // The page is the only list of the category's garments; the old filter address forwards.
    expect(all?.href).toBe('https://wear-run.com/custom-teamwear-manufacturer')
  })

  it('keeps the cards’ rules out of the page’s stylesheet, which every first paint waits for', () => {
    const page = readFileSync(join(import.meta.dirname, '..', 'styles', 'page.css'), 'utf8')
    const cards = readFileSync(
      join(import.meta.dirname, '..', 'styles', 'related-cards.css'),
      'utf8',
    )
    const source = readFileSync(join(import.meta.dirname, 'RelatedCards.tsx'), 'utf8')
    const strip = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '')
    expect(strip(page).match(/\.related__[a-z]+/g) ?? []).toEqual(['.related__all'])
    expect(strip(cards)).toContain('.related__card')
    expect(source).toContain("import '../styles/related-cards.css'")
  })
})
