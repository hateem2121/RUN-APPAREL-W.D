import { describe, expect, it } from 'vitest'
import type { ProductCard } from '../lib/projectPublic'
import { pickRelated, RELATED_COUNT } from './relatedGarments'

/**
 * Which garments "More from <category>" shows (polish S6): the ones after this garment in its
 * category, in the website's order, wrapping round, so every garment is linked from its
 * neighbours rather than the first four being linked from everywhere.
 */

const card = (slug: string, category: string, picture: string | null = null): ProductCard => ({
  slug,
  productName: `Garment ${slug}`,
  productCode: slug.toUpperCase(),
  category,
  garmentType: '',
  shortDescription: '',
  posterUrl: `https://media.wear-run.com/${slug}-poster.webp`,
  posterAlt: '',
  defaultColourSlug: `${slug}-default`,
  colourNames: [],
  colours: [
    {
      slug: `${slug}-default`,
      name: 'Default',
      swatch: null,
      image: picture ? { url: picture, alt: '', kind: 'render' } : null,
    },
  ],
  updatedAt: null,
  model: null,
})

const slugs = (cards: { slug: string }[]) => cards.map((entry) => entry.slug)

describe('pickRelated', () => {
  const TEAMWEAR = ['t1', 't2', 't3', 't4', 't5', 't6'].map((slug) =>
    card(slug, 'Teamwear & Uniforms'),
  )

  it('takes the four after this garment, wrapping round to the start', () => {
    expect(slugs(pickRelated(TEAMWEAR, 't4', 'Teamwear & Uniforms'))).toEqual([
      't5',
      't6',
      't1',
      't2',
    ])
  })

  it('never shows the garment itself, nor another category', () => {
    const mixed = [card('o1', 'Outerwear'), ...TEAMWEAR, card('o2', 'Outerwear')]
    const picked = slugs(pickRelated(mixed, 't1', 'Teamwear & Uniforms'))
    expect(picked).toEqual(['t2', 't3', 't4', 't5'])
    expect(picked).not.toContain('t1')
  })

  it('shows fewer when the category has fewer, and none when it has only this garment', () => {
    const small = [card('s1', 'Casual Wear'), card('s2', 'Casual Wear')]
    expect(slugs(pickRelated(small, 's1', 'Casual Wear'))).toEqual(['s2'])
    expect(pickRelated([card('s1', 'Casual Wear')], 's1', 'Casual Wear')).toEqual([])
  })

  it('counts four by default, the owner’s number', () => {
    expect(RELATED_COUNT).toBe(4)
    expect(pickRelated(TEAMWEAR, 't1', 'Teamwear & Uniforms')).toHaveLength(4)
  })

  it('uses the studio render where the default colour has one, else the poster', () => {
    const withRender = card('r1', 'Outerwear', 'https://media.wear-run.com/r1-render.webp')
    const withoutRender = card('r2', 'Outerwear')
    const picked = pickRelated(
      [card('x', 'Outerwear'), withRender, withoutRender],
      'x',
      'Outerwear',
    )
    expect(picked.map((entry) => entry.imageUrl)).toEqual([
      'https://media.wear-run.com/r1-render.webp',
      'https://media.wear-run.com/r2-poster.webp',
    ])
    expect(picked[0]).toMatchObject({ colourSlug: 'r1-default', productCode: 'R1' })
  })
})
