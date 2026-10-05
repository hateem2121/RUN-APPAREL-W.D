import type { SpecGroup, ViewerProduct } from '@run-apparel/shared'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { SPEC_NOTES_NAME, SpecGroups } from './SpecGroups'
;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

/**
 * The garment's facts as four matching groups (polish D10). Built from the CMS's `specs`, with
 * the glossary's notes, or from the plain fields when an answer cached before that field has
 * none. The features are one to a line, as a list (visual audit VA-59).
 */

const FIELDS = {
  fabricComposition: '88% Nylon / 12% Spandex',
  gsm: '160–220 GSM',
  garmentFit: 'Race fit',
  performanceFeatures: [
    'Eco poly stretch',
    'Engineered seam placement',
    'Digital sublimation print',
  ],
}

const SPECS: SpecGroup[] = [
  {
    key: 'fabric',
    heading: 'Fabric',
    items: [
      { text: '88% Nylon', note: 'Smooth, tough and light.' },
      { text: '12% Spandex', note: 'The stretch in the fabric.' },
    ],
  },
  { key: 'weight', heading: 'Weight', items: [{ text: '160–220 GSM', note: 'Mid-weight.' }] },
  { key: 'fit', heading: 'Fit', items: [{ text: 'Race fit', note: null }] },
  {
    key: 'performance',
    heading: 'Performance',
    items: [
      { text: 'Eco poly stretch', note: 'A stretchy polyester knit.' },
      { text: 'Engineered seam placement', note: null },
      { text: 'Digital sublimation print', note: 'Dyed in, so it will not peel.' },
    ],
  },
]

const product = (o: Partial<ViewerProduct> = {}) =>
  ({ ...FIELDS, ...o }) as unknown as ViewerProduct

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

const mount = (p: ViewerProduct, placement: 'corners' | 'list' = 'list') =>
  act(() => root.render(<SpecGroups product={p} placement={placement} />))

const groupWords = () =>
  [...host.querySelectorAll('.spec-group')].map((group) => [
    group.querySelector('dt')?.textContent,
    [...group.querySelectorAll('li')].map(
      (li) => li.querySelector('.spec-item__text')?.textContent,
    ),
  ])

describe('the four groups', () => {
  it('are drawn in corner order, each heading over its own list of bullets', () => {
    mount(product({ specs: SPECS }))
    expect(groupWords()).toEqual([
      ['Fabric', ['88% Nylon', '12% Spandex']],
      ['Weight', ['160–220 GSM']],
      ['Fit', ['Race fit']],
      [
        'Performance',
        ['Eco poly stretch', 'Engineered seam placement', 'Digital sublimation print'],
      ],
    ])
    for (const list of host.querySelectorAll('ul')) expect(list.getAttribute('role')).toBe('list')
  })

  it('carry the placement the page asked for, the list in the frame that sizes its columns', () => {
    mount(product({ specs: SPECS }), 'corners')
    expect(host.querySelector('dl')?.className).toBe('spec-groups spec-groups--corners')
    expect(host.querySelector('.spec-groups-frame')).toBeNull()
    mount(product({ specs: SPECS }), 'list')
    expect(host.querySelector('dl')?.className).toBe('spec-groups spec-groups--list')
    expect(host.querySelector('.spec-groups-frame > dl')).not.toBeNull()
  })

  it('leave out a group with nothing in it, and keep the others in their own corners', () => {
    mount(product({ specs: SPECS.filter((group) => group.key !== 'fit') }))
    expect(host.querySelector('.spec-group--fit')).toBeNull()
    expect(host.querySelector('.spec-group--performance')).not.toBeNull()
  })

  it('draw nothing at all for a garment with no facts', () => {
    mount(product({ fabricComposition: '', gsm: '', garmentFit: '', performanceFeatures: [] }))
    expect(host.innerHTML).toBe('')
  })
})

describe('a bullet with a note', () => {
  it('opens to its note: a closed <details> in the shared set, the words as its summary', () => {
    mount(product({ specs: SPECS }))
    const details = [...host.querySelectorAll('details')]
    expect(details).toHaveLength(5)
    for (const d of details) {
      expect(d.getAttribute('name')).toBe(SPEC_NOTES_NAME)
      expect(d.open).toBe(false)
    }
    const first = details[0]!
    expect(first.querySelector('summary')?.textContent).toBe('88% Nylon')
    expect(first.querySelector('.spec-item__note')?.textContent).toBe('Smooth, tough and light.')
  })

  it('keeps the note in the page while closed, where Find in page and a screen reader reach it', () => {
    mount(product({ specs: SPECS }))
    expect(host.textContent).toContain('Dyed in, so it will not peel.')
  })

  it('a bullet without a note is a plain line, with nothing to open', () => {
    mount(product({ specs: SPECS }))
    const fit = host.querySelector('.spec-group--fit li')!
    expect(fit.querySelector('details')).toBeNull()
    expect(fit.querySelector('.spec-item__row')?.textContent).toBe('Race fit')
  })
})

describe('an answer cached before the notes existed', () => {
  it('builds the same groups from the plain fields, with nothing to open', () => {
    mount(product())
    expect(groupWords()).toEqual([
      ['Fabric', ['88% Nylon', '12% Spandex']],
      ['Weight', ['160–220 GSM']],
      ['Fit', ['Race fit']],
      [
        'Performance',
        ['Eco poly stretch', 'Engineered seam placement', 'Digital sublimation print'],
      ],
    ])
    expect(host.querySelector('details')).toBeNull()
  })
})

describe('the features, one to a line (VA-59)', () => {
  it('are never joined with a slash', () => {
    mount(product())
    const performance = host.querySelector('.spec-group--performance dd')!
    expect(performance.textContent).not.toContain(' / ')
  })

  it('keep every row when two are worded alike', () => {
    mount(product({ performanceFeatures: ['Stretch', 'Stretch', 'Flex jersey panels'] }))
    const rows = [...host.querySelectorAll('.spec-group--performance li')].map(
      (li) => li.textContent,
    )
    expect(rows).toEqual(['Stretch', 'Stretch', 'Flex jersey panels'])
  })
})
