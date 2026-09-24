import { describe, expect, it } from 'vitest'
import {
  BUZZWORDS,
  findBritishSpellings,
  findBuzzwords,
  findEmoji,
  findPlaceholders,
  GARMENT_TERMS,
  llmsTxtProblems,
  toAmerican,
} from '../../../scripts/copy-rules.mjs'

/**
 * The copy rules every copy robot shares. Each rule is shown catching its fault AND
 * passing clean copy, because a rule that returns [] for everything passes every robot.
 */

describe('findBritishSpellings — owner decision 2026-09-04, American spelling', () => {
  it('finds each British form, in order, without repeats', () => {
    expect(
      findBritishSpellings(
        'Pick a colourway from our catalogue. Enquire at the centre to customise, and we fulfil it for your organisation. Colourway again. Please summarise.',
      ),
    ).toEqual([
      'colourway',
      'catalogue',
      'enquire',
      'centre',
      'customise',
      'fulfil',
      'organisation',
      'summarise',
    ])
  })

  it('leaves American forms and look-alike words alone — negative control', () => {
    expect(
      findBritishSpellings(
        'Pick a colorway from our catalog. Inquire at the center to customize; we fulfill it, fulfilled for your organization. Please summarize. An organism is not a spelling.',
      ),
    ).toEqual([])
  })
})

describe('toAmerican', () => {
  it('rewrites every British form and keeps capitals', () => {
    expect(
      toAmerican(
        'Colour, COLOURWAY, solid-coloured, catalogues, Enquiries, centred, customised, summarising, organisation, fulfilment, fulfil.',
      ),
    ).toBe(
      'Color, COLORWAY, solid-colored, catalogs, Inquiries, centered, customized, summarizing, organization, fulfillment, fulfill.',
    )
  })

  it('changes nothing that is already American', () => {
    const american =
      'Color, colorway, catalog, inquiry, center, customize, organization, fulfill, fulfilled.'
    expect(toAmerican(american)).toBe(american)
  })

  it('leaves no British form behind in the live retired-color message', () => {
    const british =
      'The colourway linked by this QR is no longer active. You are viewing the current available reference.'
    expect(findBritishSpellings(british)).toEqual(['colourway'])
    expect(findBritishSpellings(toAmerican(british))).toEqual([])
  })
})

describe('findBuzzwords', () => {
  it('finds marketing filler, hyphenated or spaced, with any ending', () => {
    expect(
      findBuzzwords('A seamless, cutting edge and world-class partner that empowers brands.'),
    ).toEqual(['seamless', 'cutting-edge', 'world-class', 'empower'])
  })

  it('lets garment text say "seamless" when told it is a construction term', () => {
    expect(findBuzzwords('Seamless knit body.', { allow: GARMENT_TERMS })).toEqual([])
    expect(findBuzzwords('Seamless knit body.')).toEqual(['seamless'])
  })

  it('passes plain trade copy — negative control', () => {
    expect(
      findBuzzwords('Made to order in Sialkot. Minimum order 50 per style; a streamlined fit.'),
    ).toEqual([])
    expect(BUZZWORDS.length).toBeGreaterThan(10)
  })
})

describe('findEmoji', () => {
  it('finds a pictograph', () => {
    expect(findEmoji('Made to order 🔥')).toEqual(['🔥'])
  })

  it('does not count the numero sign or the legal marks — negative control', () => {
    expect(findEmoji('№01 — © RUN APPAREL™ ®')).toEqual([])
  })
})

describe('findPlaceholders', () => {
  it('finds filler text and leaked code values', () => {
    expect(findPlaceholders('Lorem ipsum TODO [object Object] undefined NaN')).toHaveLength(6)
  })

  it('passes real copy — negative control', () => {
    expect(findPlaceholders('Weight 140–190 GSM; ask us today.')).toEqual([])
  })
})

describe('llmsTxtProblems — Lighthouse 13.5.0 core/audits/agentic/llms-txt.js:101-103', () => {
  it('accepts a heading, a Markdown link and enough text', () => {
    expect(
      llmsTxtProblems(
        '# RUN APPAREL\n\nSee [the products](https://example.test/products) for every garment.',
      ),
    ).toEqual([])
  })

  it('names each rule a file breaks — negative controls', () => {
    expect(
      llmsTxtProblems('RUN APPAREL makes garments to order: https://example.test/products'),
    ).toEqual(['no H1 heading', 'no Markdown link'])
    expect(llmsTxtProblems('# Hi [x](y)')).toEqual(['shorter than 50 characters'])
  })
})
