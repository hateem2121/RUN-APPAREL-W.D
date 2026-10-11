import { createRoot } from 'react-dom/client'
import { FamilyGroup } from '../../src/components/site/FamilyGroup'
import { FAMILIES } from '../../src/lib/families'
import { familyIsSoon, familyPageFor } from '../../src/lib/familyPages'
import type { ProductCard } from '../../src/lib/projectPublic'
import { LIVE_GROUPS } from './productsGroups'

/*
 * /products' five groups as they stood live on 11 Oct 2026 (`productsGroups.ts`), drawn by the
 * page's own `FamilyGroup`. Teamwear, second, is the one that spilled: each group after the first
 * stood in at 1,200px, and its 19 cards on a phone take 3,446px.
 *
 * Every garment carries five colours, as most live ones do, so each card draws its row of dots. No
 * pictures: a card then draws its placeholder in the same box.
 */
const COLOURS = [
  { slug: 'black', name: 'Black', swatch: '#1d1f1a', image: null },
  { slug: 'navy', name: 'Navy', swatch: '#1f2a44', image: null },
  { slug: 'red', name: 'Red', swatch: '#b3262e', image: null },
  { slug: 'white', name: 'White', swatch: '#f4f1ea', image: null },
  { slug: 'lime', name: 'Lime', swatch: '#c6e34a', image: null },
]

let start = 0
const groups = LIVE_GROUPS.map(([slug, names]) => {
  const entry = FAMILIES.find((family) => family.slug === slug)
  if (!entry) throw new Error(`[products-groups-harness] no family "${slug}"`)
  const products: ProductCard[] = names.map((name, at) => ({
    slug: `${slug}-${at + 1}`,
    productName: name,
    productCode: `R-H${start + at + 1}`,
    category: entry.name,
    garmentType: '',
    shortDescription: '',
    posterUrl: null,
    posterAlt: '',
    defaultColourSlug: 'black',
    colourNames: COLOURS.map((colour) => colour.name),
    colours: COLOURS,
    model: null,
    updatedAt: null,
  }))
  const group = {
    entry,
    page: familyPageFor(entry),
    products,
    soon: familyIsSoon(entry, products.length),
    start,
  }
  start += products.length
  return group
})

const root = document.getElementById('root')
if (root) {
  createRoot(root).render(groups.map((group) => <FamilyGroup key={group.entry.slug} {...group} />))
}
