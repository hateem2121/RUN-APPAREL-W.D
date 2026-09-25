import { describe, expect, it } from 'vitest'
import { PLAIN_DESCRIPTIONS, plannedChange } from '../../../scripts/apply-plain-descriptions.mjs'
import {
  findBritishSpellings,
  findBuzzwords,
  findEmoji,
  toAmerican,
} from '../../../scripts/copy-rules.mjs'
import { LIVE_PRODUCTS } from '../../../scripts/live-products.mjs'
import { readability } from './lib/readingLevel'

/**
 * CT-04 — the owner-approved plain rewrites of twelve garment descriptions (2026-09-25),
 * checked before the owner stores them with their own key.
 */
const entries = Object.entries(PLAIN_DESCRIPTIONS)

describe('the plain descriptions', () => {
  it('cover twelve live garments', () => {
    const live = new Set(LIVE_PRODUCTS.map((p) => p.slug))
    expect(entries).toHaveLength(12)
    expect(entries.map(([slug]) => slug).filter((slug) => !live.has(slug))).toEqual([])
  })

  it('each read at grade 11 or below, and each was above it before', () => {
    for (const [slug, { before, after }] of entries) {
      expect(readability(after)?.grade ?? 99, `${slug} after`).toBeLessThanOrEqual(11)
      expect(readability(before)?.grade ?? 0, `${slug} before`).toBeGreaterThan(11)
    }
  })

  it('pass the copy rules: American spelling, no buzzwords, no emoji', () => {
    for (const [slug, { after }] of entries) {
      expect(findBritishSpellings(after), slug).toEqual([])
      expect(findBuzzwords(after), slug).toEqual([])
      expect(findEmoji(after), slug).toEqual([])
    }
  })

  it('keep every number the original stated', () => {
    // "3D" left the jacket with the wording the owner approved in the sample itself.
    const approvedDrops: Record<string, string[]> = { 'r-atj': ['3'] }
    for (const [slug, { before, after }] of entries) {
      const lost = (before.match(/\d+(?:\.\d+)?/g) ?? []).filter((n) => !after.includes(n))
      expect(lost, slug).toEqual(approvedDrops[slug] ?? [])
    }
  })
})

describe('plannedChange — what the save step may overwrite', () => {
  const entry = { before: 'A colourful jersey.', after: 'A bright jersey.' }
  it('writes over the measured text, in either spelling', () => {
    expect(plannedChange('A colourful jersey.', entry)).toBe('write')
    expect(plannedChange(toAmerican('A colourful jersey.'), entry)).toBe('write')
  })
  it('does nothing when it is already the plain version', () => {
    expect(plannedChange('A bright jersey.', entry)).toBe('already')
  })
  it('leaves alone anything edited since it was measured', () => {
    expect(plannedChange('A jersey the owner rewrote by hand.', entry)).toBe('edited-since')
    expect(plannedChange('', entry)).toBe('edited-since')
  })
})
