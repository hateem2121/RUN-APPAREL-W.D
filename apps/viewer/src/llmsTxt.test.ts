import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { findBritishSpellings, llmsTxtProblems } from '../../../scripts/copy-rules.mjs'
import { LIVE_PRODUCTS } from '../../../scripts/live-products.mjs'

/**
 * `public/llms.txt` is served verbatim to AI readers, and it states counts.
 *
 * ⚠️ IT SAID 55 PAGES AND 11 GARMENTS ON 2026-09-10, while 80 pages and 16 garments were
 * live. Nothing compared the file with the product list, so it went stale on the day five
 * garments were published. `sitemap.test.ts` closes the same loop for the sitemap; this
 * closes it for this file, from the same list, on disk and without fetching.
 */
const LLMS_TXT = join(import.meta.dirname, '..', 'public', 'llms.txt')
const text = () => readFileSync(LLMS_TXT, 'utf8')

const NUMBER_WORDS = [
  'zero',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
]

/** "(80 pages, 16 garments x 5 colorways)" → the three numbers; null if the sentence is gone. */
function statedCounts(source: string) {
  const m = source.match(/\((\d+)\s+pages,\s+(\d+)\s+garments\s+x\s+(\d+)\s+colorways\)/)
  return m ? { pages: Number(m[1]), garments: Number(m[2]), colorways: Number(m[3]) } : null
}

describe('llms.txt states the live counts', () => {
  const pages = LIVE_PRODUCTS.reduce((sum, product) => sum + product.colourways.length, 0)
  const perGarment = [...new Set(LIVE_PRODUCTS.map((product) => product.colourways.length))]

  it('every live garment has the same number of colorways, so one number describes them', () => {
    expect(
      perGarment,
      'garments differ in colorway count — reword llms.txt, then this test',
    ).toHaveLength(1)
  })

  it('the Structure section’s numbers match scripts/live-products.mjs', () => {
    expect(statedCounts(text())).toEqual({
      pages,
      garments: LIVE_PRODUCTS.length,
      colorways: perGarment[0],
    })
  })

  it('the "colorways per garment" line says the same number in words', () => {
    const word = NUMBER_WORDS[perGarment[0] ?? -1]
    expect(word, 'more colorways than NUMBER_WORDS covers').toBeDefined()
    expect(text()).toMatch(new RegExp(`\\b${word} colorways per garment`, 'i'))
  })

  it('the count reader can fail — negative control', () => {
    // The sentence as it stood on 2026-09-10, in the new spelling: it must read as 55/11/5.
    const stale = '(55 pages, 11 garments x 5 colorways)'
    expect(statedCounts(stale)).toEqual({ pages: 55, garments: 11, colorways: 5 })
    expect(statedCounts(stale)).not.toEqual({ pages, garments: LIVE_PRODUCTS.length, colorways: 5 })
    expect(statedCounts('no counts here')).toBeNull()
  })
})

describe('llms.txt passes Lighthouse 13.4.1’s llms-txt audit', () => {
  it('has an H1, a Markdown link and enough text', () => {
    expect(llmsTxtProblems(text())).toEqual([])
  })
})

describe('llms.txt spells the American way — owner decision 2026-09-04', () => {
  it('has no British spellings', () => {
    expect(findBritishSpellings(text())).toEqual([])
  })
})
