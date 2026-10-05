import { createRoot } from 'react-dom/client'
import { GarmentGrid } from '../../src/components/site/GarmentGrid'
import { FAMILIES } from '../../src/lib/families'
import type { ProductCard } from '../../src/lib/projectPublic'
import { LIVE_TEAMWEAR } from './teamwear'

// The 19 live Teamwear garments, as cards. No pictures: a card then draws its placeholder in the
// same 4:5 box, which is all the grid's layout reads.
const garments: ProductCard[] = LIVE_TEAMWEAR.map(([name, garmentType], at) => ({
  slug: `t${at + 1}`,
  productName: name,
  productCode: `R-T${at + 1}`,
  category: 'Teamwear & Uniforms',
  garmentType,
  shortDescription: '',
  posterUrl: null,
  posterAlt: '',
  defaultColourSlug: 'black',
  colourNames: ['Black'],
  colours: [{ slug: 'black', name: 'Black', swatch: '#1d1f1a', image: null }],
  model: null,
  updatedAt: null,
}))

const teamwear = FAMILIES.find((family) => family.slug === 'teamwear-uniforms')
const root = document.getElementById('root')
if (root && teamwear) createRoot(root).render(<GarmentGrid family={teamwear} garments={garments} />)
