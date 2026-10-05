import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { FAMILIES } from '../../lib/families'
import type { ProductCard } from '../../lib/projectPublic'
import { GarmentGrid } from './GarmentGrid'

/**
 * Polish S7: the Teamwear page's sport buttons, as the server draws them. They work with no script
 * (site.css does the showing), so what the HTML says IS the feature: one radio group named "Sport",
 * "All" chosen first, one chip per sport that has garments, and each card marked with its sport and
 * its place among that sport's cards. `e2e/sportFilter.spec.ts` presses them in a browser.
 *
 * What would have to break for these to fail: the buttons on a family the owner did not divide, a
 * button for a sport with no garment, "All" not chosen at first, a card without its sport, or a
 * script creeping in (a filter that needs one would show nothing to a page that runs none).
 */

const family = (slug: string) => {
  const found = FAMILIES.find((entry) => entry.slug === slug)
  if (!found) throw new Error(`no family ${slug}`)
  return found
}

const card = (slug: string, garmentType: string): ProductCard => ({
  slug,
  productName: slug.toUpperCase(),
  productCode: slug.toUpperCase(),
  category: 'Teamwear & Uniforms',
  garmentType,
  shortDescription: '',
  posterUrl: null,
  posterAlt: '',
  defaultColourSlug: 'black',
  colourNames: ['Black'],
  colours: [{ slug: 'black', name: 'Black', swatch: '#000000', image: null }],
  model: null,
  updatedAt: null,
})

const TEAMWEAR = [
  card('r-srs', 'Raglan Soccer Tee'),
  card('r-aj', "Women's American Football Jersey"),
  card('r-cvn', 'V-Neck Soccer Jersey'),
  card('r-css', 'Polo-Collar Soccer Jersey'),
  card('r-ajm', "Men's American Football Jersey"),
  card('r-pol', 'Polo Shirt'),
]

const draw = (slug: string, garments: ProductCard[]) =>
  renderToStaticMarkup(createElement(GarmentGrid, { family: family(slug), garments }))

const radios = (html: string) =>
  [...html.matchAll(/<input [^>]*type="radio"[^>]*>/g)].map((match) => match[0])

describe('the Teamwear page draws a button per sport (polish S7)', () => {
  const html = draw('teamwear-uniforms', TEAMWEAR)

  it('one radio group named "Sport", with "All" chosen first', () => {
    expect(html).toMatch(
      /<fieldset class="sport-filter"><legend class="visually-hidden">Sport<\/legend>/,
    )
    const inputs = radios(html)
    expect(inputs.map((input) => input.match(/value="([^"]*)"/)?.[1])).toEqual([
      'all',
      'soccer',
      'american-football',
    ])
    expect(inputs.every((input) => /name="sport"/.test(input))).toBe(true)
    expect(inputs.filter((input) => /checked=""/.test(input))).toHaveLength(1)
    expect(inputs[0]).toContain('checked=""')
  })

  it('each button says its sport and how many, and "All" counts every garment', () => {
    const chips = [
      ...html.matchAll(/<label class="filter-chip sport-filter__chip">(.*?)<\/label>/g),
    ].map((match) =>
      (match[1] ?? '')
        .replace(/<input [^>]*>/, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim(),
    )
    expect(chips).toEqual(['All 6', 'Soccer 3', 'American football 2'])
  })

  it('each card carries its sport and its place; a garment of no sport carries neither', () => {
    const items = [...html.matchAll(/<li class="product-card"([^>]*)>/g)].map((match) =>
      (match[1] ?? '').trim(),
    )
    expect(items).toEqual([
      'data-sport="soccer"',
      'data-sport="american-football"',
      'data-sport="soccer"',
      // The third of three: on a phone it lies across both columns.
      'data-sport="soccer" data-lie=""',
      'data-sport="american-football"',
      '',
    ])
  })

  it('the buttons and the list share the scope site.css reads', () => {
    expect(html).toMatch(
      /^<div class="sport-scope"><fieldset class="sport-filter">.*<ul class="product-grid">/,
    )
  })
})

describe('no buttons where they would divide nothing', () => {
  it('a family the owner did not divide: the list alone', () => {
    const html = draw('sportswear', [
      card('n001', "Men's Training Tee"),
      card('n002', 'Soccer Jersey'),
    ])
    expect(html).toMatch(/^<ul class="product-grid">/)
    expect(radios(html)).toEqual([])
    expect(html).not.toContain('data-sport')
  })

  it('Teamwear with garments of one sport only: the list alone', () => {
    const html = draw('teamwear-uniforms', [
      card('a', 'Soccer Jersey'),
      card('b', 'Raglan Soccer Tee'),
    ])
    expect(radios(html)).toEqual([])
    expect(html).not.toContain('data-sport')
  })
})

describe('the filter is HTML and CSS, never a script', () => {
  // A page that runs no script must still filter: the component may not become a client one.
  it('GarmentGrid.tsx is not a client component', async () => {
    const { readFileSync } = await import('node:fs')
    const source = readFileSync(new URL('./GarmentGrid.tsx', import.meta.url), 'utf8')
    expect(source).not.toMatch(/^['"]use client['"]/m)
    expect(source).not.toMatch(/\buse(State|Effect|Ref)\b|onChange=|onClick=/)
  })
})
