import { FEATURE_NOTES, FIBRE_NOTES, FIT_NOTES } from '@run-apparel/shared'
import { CERTIFICATION_LINES, FACTS, LEAD_TIME } from './companyFacts'
import { faqEntryById, faqVisibleAnswer } from './faqs'
import { GUIDES } from './guides'

/**
 * The glossary (PLAN.md D6), approved by the owner on 2026-10-07 (drafts reviewed in chat).
 *
 * ⚠️ A DEFINITION IS THE SITE'S OWN WORDS, READ FROM WHERE THEY LIVE. The fabrics and printing
 * methods come from the guides' points, the fibers and finishes from the garment pages' spec
 * notes (`packages/shared/src/specNotes.ts`), the standards from the FAQ's answers: each is
 * looked up, never copied, so a guide edited later changes its term too. Four sentences are new
 * and were approved as such (a tech pack, MOQ, Incoterms, the raglan sleeve). `glossary.test.ts`
 * fails a term whose words drift from its source.
 *
 * Not here until the owner answers F26: placement print, overlock, bar-tack and cut and sew.
 * "LYCRA®" is a brand, so spandex is named as "spandex (elastane)".
 */

export type GlossaryCategory =
  | 'Fabrics'
  | 'Fibers'
  | 'Printing and decoration'
  | 'Construction and performance'
  | 'Ordering and production'
  | 'Shipping terms'
  | 'Standards and audits'
  | 'Company and legal'

export type GlossaryTerm = {
  /** Anchor id on /glossary, lowercase and hyphens. */
  readonly id: string
  readonly name: string
  readonly category: GlossaryCategory
  readonly definition: string
  /** Pages on this site that say more, as root-relative paths. */
  readonly seeAlso: readonly string[]
}

export const GLOSSARY_INDEX = {
  path: '/glossary',
  title: 'Glossary',
  description:
    'Garment and export terms in plain words: fabrics and GSM, printing methods, seams and finishes, Incoterms, and the standards and audits buyers ask about.',
  heading: 'Every term,',
  headingAccent: 'in plain words.',
} as const

export const GLOSSARY_CATEGORIES: readonly GlossaryCategory[] = [
  'Fabrics',
  'Fibers',
  'Printing and decoration',
  'Construction and performance',
  'Ordering and production',
  'Shipping terms',
  'Standards and audits',
  'Company and legal',
]

const FABRICS_GUIDE = '/guides/sportswear-fabrics-and-weights'
const PRINTING_GUIDE = '/guides/garment-printing-methods'
const SHIPPING_GUIDE = '/guides/shipping-and-import-duties'
const ORDER_GUIDE = '/guides/how-a-private-label-order-works'
const MINIMUM_GUIDE = '/guides/minimum-order-and-samples'
const REFERENCE_GUIDE = '/guides/3d-garment-reference'
const PACKAGING_GUIDE = '/guides/private-label-packaging'
const QUALITY_FAQ = '/faq/quality-and-certifications'

/** A guide's point, found by the start of its title. Throws on a missing one: caught at build. */
function guidePoint(path: string, titleStart: string): { title: string; text: string } {
  const guide = GUIDES.find((entry) => entry.path === path)
  for (const section of guide?.sections ?? []) {
    for (const block of section.blocks) {
      if (block.kind === 'point' && block.title.startsWith(titleStart)) return block
    }
  }
  throw new Error(`glossary.ts: no point "${titleStart}" in ${path}`)
}

/** "Single jersey, 120 to 200 GSM" + its text → "Usually 120 to 200 GSM. <text>". */
function fabric(id: string, name: string, titleStart: string): GlossaryTerm {
  const point = guidePoint(FABRICS_GUIDE, titleStart)
  const weight = point.title.slice(point.title.indexOf(',') + 1).trim()
  return {
    id,
    name,
    category: 'Fabrics',
    definition: `Usually ${weight}. ${point.text}`,
    seeAlso: [FABRICS_GUIDE],
  }
}

function note(notes: Record<string, string>, key: string): string {
  const text = notes[key]
  if (!text) throw new Error(`glossary.ts: no spec note "${key}"`)
  return text
}

function printing(id: string, name: string, titleStart: string): GlossaryTerm {
  return {
    id,
    name,
    category: 'Printing and decoration',
    definition: guidePoint(PRINTING_GUIDE, titleStart).text,
    seeAlso: [PRINTING_GUIDE],
  }
}

function shipping(id: string, name: string, titleStart: string): GlossaryTerm {
  return {
    id,
    name,
    category: 'Shipping terms',
    definition: guidePoint(SHIPPING_GUIDE, titleStart).text,
    seeAlso: [SHIPPING_GUIDE, '/faq/shipping-and-importing'],
  }
}

/** A standard: the FAQ's answer, whole, so the two pages say the same thing. */
function standard(id: string, name: string, faqId: string): GlossaryTerm {
  return {
    id,
    name,
    category: 'Standards and audits',
    definition: faqVisibleAnswer(faqEntryById(faqId).entry),
    seeAlso: [`${QUALITY_FAQ}#${faqId}`],
  }
}

const MINIMUM = FACTS.find((entry) => entry.label.startsWith('Minimum'))?.value ?? ''
const SAMPLE_DAYS = FACTS.find((entry) => entry.label.startsWith('Working days'))?.value ?? ''

export const GLOSSARY_TERMS: readonly GlossaryTerm[] = [
  {
    id: 'gsm',
    name: 'GSM',
    category: 'Fabrics',
    definition: 'GSM means grams per square meter: how heavy a fabric is.',
    seeAlso: [FABRICS_GUIDE],
  },
  fabric('single-jersey', 'Single jersey', 'Single jersey'),
  fabric('interlock', 'Interlock', 'Interlock'),
  fabric('pique', 'Pique', 'Pique'),
  fabric('mesh', 'Mesh', 'Mesh'),
  fabric('birdseye-mesh', 'Birdseye mesh', 'Birdseye mesh'),
  fabric('french-terry', 'French terry', 'French terry'),
  fabric('fleece', 'Fleece', 'Fleece'),
  fabric('rib', 'Rib', 'Rib'),
  fabric('waffle', 'Waffle', 'Waffle'),
  fabric('jacquard', 'Jacquard', 'Jacquard'),
  {
    id: 'softshell',
    name: 'Softshell',
    category: 'Fabrics',
    definition: note(FEATURE_NOTES, 'hydro-repellent softshell'),
    seeAlso: [],
  },

  {
    id: 'polyester',
    name: 'Polyester',
    category: 'Fibers',
    definition: note(FIBRE_NOTES, 'polyester'),
    seeAlso: [FABRICS_GUIDE],
  },
  {
    id: 'recycled-polyester',
    name: 'Recycled polyester',
    category: 'Fibers',
    definition: note(FIBRE_NOTES, 'recycled polyester'),
    seeAlso: [FABRICS_GUIDE],
  },
  {
    id: 'nylon',
    name: 'Nylon (polyamide)',
    category: 'Fibers',
    definition: note(FIBRE_NOTES, 'nylon (polyamide)'),
    seeAlso: [FABRICS_GUIDE],
  },
  {
    id: 'spandex',
    name: 'Spandex (elastane)',
    category: 'Fibers',
    definition: note(FIBRE_NOTES, 'spandex'),
    seeAlso: [FABRICS_GUIDE],
  },
  {
    id: 'cotton',
    name: 'Cotton',
    category: 'Fibers',
    definition: note(FIBRE_NOTES, 'cotton'),
    seeAlso: [FABRICS_GUIDE],
  },
  {
    id: 'organic-cotton',
    name: 'Organic cotton',
    category: 'Fibers',
    definition: note(FIBRE_NOTES, 'organic cotton'),
    seeAlso: [],
  },
  {
    id: 'neoprene',
    name: 'Neoprene',
    category: 'Fibers',
    // The note names neoprene by its chemical name; the glossary leads with the word buyers use.
    definition:
      'The chemical name is polychloroprene: a rubbery foam that keeps you warm when wet. Neoprene is sold by thickness: thicker is warmer, thinner bends more easily.',
    seeAlso: [],
  },

  printing('screen-printing', 'Screen printing', 'Screen printing'),
  printing('sublimation', 'Sublimation', 'Sublimation'),
  printing('dtf', 'DTF (direct to film)', 'DTF'),
  printing('dtg', 'DTG (direct to garment)', 'DTG'),
  printing('heat-transfer-vinyl', 'Heat transfer vinyl', 'Heat transfer vinyl'),
  printing('embroidery', 'Embroidery', 'Embroidery'),
  printing('special-inks', 'Special inks', 'Special inks'),
  // F26 (owner, 2026-10-07): "we do these". Plain definitions, approved as written.
  {
    id: 'placement-print',
    name: 'Placement print',
    category: 'Printing and decoration',
    definition:
      'A print in one fixed position on a garment, such as a chest logo or a back number, rather than across the whole fabric.',
    seeAlso: [PRINTING_GUIDE],
  },

  {
    id: 'flatlock-seam',
    name: 'Flatlock seam',
    category: 'Construction and performance',
    definition: note(FEATURE_NOTES, 'flatlock stitching'),
    seeAlso: [],
  },
  // F26 (owner, 2026-10-07), as the placement print above.
  {
    id: 'overlock-seam',
    name: 'Overlock seam',
    category: 'Construction and performance',
    definition:
      'A seam whose stitch wraps the fabric’s cut edge, joining and finishing it in one pass so it does not fray.',
    seeAlso: [],
  },
  {
    id: 'bar-tack',
    name: 'Bar-tack stitching',
    category: 'Construction and performance',
    definition:
      'A short, dense run of zigzag stitches that strengthens a point under strain, such as a pocket corner or a belt loop.',
    seeAlso: [],
  },
  {
    id: 'raglan-sleeve',
    name: 'Raglan sleeve',
    category: 'Construction and performance',
    definition: 'A sleeve sewn on a diagonal from the neck to the underarm, for free arm movement.',
    seeAlso: [],
  },
  {
    id: 'taped-seams',
    name: 'Taped seams',
    category: 'Construction and performance',
    definition: note(FEATURE_NOTES, 'taped waterproof seams'),
    seeAlso: [],
  },
  {
    id: 'bonded-seams',
    name: 'Bonded seams',
    category: 'Construction and performance',
    definition: note(FEATURE_NOTES, 'reinforced bonded seams'),
    seeAlso: [],
  },
  {
    id: 'ripstop',
    name: 'Ripstop',
    category: 'Construction and performance',
    definition: 'A fabric woven with a grid that stops tears spreading.',
    seeAlso: [],
  },
  {
    id: 'dwr',
    name: 'DWR finish',
    category: 'Construction and performance',
    definition: note(FEATURE_NOTES, 'dwr water-repellent finish'),
    seeAlso: [],
  },
  {
    id: 'moisture-wicking',
    name: 'Moisture-wicking',
    category: 'Construction and performance',
    definition: note(FEATURE_NOTES, 'moisture-wicking'),
    seeAlso: [],
  },
  {
    id: 'four-way-stretch',
    name: '4-way stretch',
    category: 'Construction and performance',
    definition: note(FEATURE_NOTES, 'four-way stretch'),
    seeAlso: [],
  },
  {
    id: 'compression-fit',
    name: 'Compression fit',
    category: 'Construction and performance',
    definition: note(FIT_NOTES, 'high-support compression'),
    seeAlso: [],
  },

  {
    id: 'private-label',
    name: 'Private label',
    category: 'Ordering and production',
    definition: 'Private label means the garment leaves under your brand, not ours.',
    seeAlso: [PACKAGING_GUIDE],
  },
  // F26 (owner, 2026-10-07), as the placement print.
  {
    id: 'cut-and-sew',
    name: 'Cut and sew',
    category: 'Ordering and production',
    definition: 'Garments made by cutting fabric into pattern pieces and sewing them together.',
    seeAlso: [ORDER_GUIDE],
  },
  {
    id: 'tech-pack',
    name: 'Tech pack',
    category: 'Ordering and production',
    definition:
      'The document that describes a garment for the factory: its measurements, fabrics, trims, colors and artwork. A sketch is enough to start; a reference garment or a tech pack is better.',
    seeAlso: [ORDER_GUIDE],
  },
  {
    id: 'moq',
    name: 'MOQ (minimum order quantity)',
    category: 'Ordering and production',
    definition: `The fewest pieces a factory makes in one order. At RUN APPAREL it is ${MINIMUM} pieces per style.`,
    seeAlso: [MINIMUM_GUIDE, '/faq/orders-and-samples#minimum-order'],
  },
  {
    id: 'sample',
    name: 'Sample',
    category: 'Ordering and production',
    definition: `One garment made before bulk production, for you to approve. A sample takes ${SAMPLE_DAYS} working days, and its fee is credited back against your bulk order.`,
    seeAlso: [MINIMUM_GUIDE],
  },
  {
    id: 'lead-time',
    name: 'Lead time',
    category: 'Ordering and production',
    definition: `The time from order confirmation to a finished order. ${LEAD_TIME}`,
    seeAlso: ['/faq/orders-and-samples#lead-time'],
  },
  {
    id: '3d-garment-reference',
    name: '3D garment reference',
    category: 'Ordering and production',
    definition:
      'A garment you can turn and zoom on your screen. It lets you and your team check the construction, the fit and where the artwork sits before a sample is cut.',
    seeAlso: [REFERENCE_GUIDE, '/products'],
  },
  {
    id: 'colorway',
    name: 'Colorway',
    category: 'Ordering and production',
    definition: 'One color version of a garment. Every colorway of a garment has its own page.',
    seeAlso: [REFERENCE_GUIDE],
  },

  {
    id: 'incoterms',
    name: 'Incoterms',
    category: 'Shipping terms',
    definition:
      'The International Chamber of Commerce’s rules for who pays for and arranges each part of a shipment.',
    seeAlso: [SHIPPING_GUIDE, '/faq/shipping-and-importing#incoterms'],
  },
  shipping('exw', 'EXW (Ex Works)', 'EXW'),
  shipping('fob', 'FOB (Free On Board)', 'FOB'),
  shipping('cfr-cif', 'CFR and CIF', 'CFR and CIF'),
  shipping('ddp', 'DDP (Delivered Duty Paid)', 'DDP'),

  standard('sedex-smeta', 'Sedex and SMETA', 'sedex-smeta'),
  standard('iso-9001', 'ISO 9001', 'iso-9001'),
  standard('oeko-tex', 'OEKO-TEX STANDARD 100', 'oeko-tex'),
  standard('gots', 'GOTS', 'gots'),
  standard('grs', 'GRS', 'grs'),
  standard('amfori-bsci', 'amfori BSCI', 'amfori-bsci'),

  {
    id: 'secp',
    name: 'SECP',
    category: 'Company and legal',
    definition: `The Securities and Exchange Commission of Pakistan. ${CERTIFICATION_LINES[2].replace('registered with the Securities and Exchange Commission of Pakistan (SECP).', 'registered with it.')}`,
    seeAlso: [],
  },
]

/** The terms in one category, in the order above. */
export function termsIn(category: GlossaryCategory): readonly GlossaryTerm[] {
  return GLOSSARY_TERMS.filter((term) => term.category === category)
}
