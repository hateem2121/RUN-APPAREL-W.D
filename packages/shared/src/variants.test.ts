import { describe, expect, it } from 'vitest'
import { buildVariantId, isValidProductCode, isValidVariantId } from './variants'

describe('isValidProductCode', () => {
  it('accepts uppercase codes', () => {
    expect(isValidProductCode('N001')).toBe(true)
    expect(isValidProductCode('TW12')).toBe(true)
  })

  /**
   * Hyphens were rejected until 2026-08-17, and the owner hit it: they wanted a
   * code like "RX-PS" and the field simply refused, with a message that read as
   * though the character were dangerous rather than merely unsupported.
   *
   * It is a SEPARATOR, not a free character — the shapes below are the ones a
   * human means by "a hyphen in the code", and the rejected ones are the shapes
   * that would produce an ambiguous or malformed variant ID.
   */
  it('accepts a hyphen between groups', () => {
    expect(isValidProductCode('RX-PS')).toBe(true)
    expect(isValidProductCode('N-001')).toBe(true)
    expect(isValidProductCode('A1-B2-C3')).toBe(true)
  })
  it('rejects a hyphen that is not between groups', () => {
    expect(isValidProductCode('-RXPS')).toBe(false)
    expect(isValidProductCode('RXPS-')).toBe(false)
    expect(isValidProductCode('RX--PS')).toBe(false)
  })
  it('rejects lowercase, spaces or empty', () => {
    // Lowercase stays invalid HERE on purpose. The CMS field normalises what is
    // typed (Products.ts uppercases in a beforeValidate hook), so `rxps` is
    // accepted from a human and stored as `RXPS`; this predicate is about what
    // may be STORED, and mixed case would make two codes collide on the unique
    // index while looking different.
    expect(isValidProductCode('rxps')).toBe(false)
    expect(isValidProductCode('RX PS')).toBe(false)
    expect(isValidProductCode('')).toBe(false)
    expect(isValidProductCode('1N')).toBe(false)
  })
})

describe('isValidVariantId', () => {
  it('requires the parent product code prefix', () => {
    expect(isValidVariantId('N001-NAVY', 'N001')).toBe(true)
    expect(isValidVariantId('N001-DEEP-FOREST', 'N001')).toBe(true)
    expect(isValidVariantId('N002-NAVY', 'N001')).toBe(false)
    expect(isValidVariantId('N001NAVY', 'N001')).toBe(false)
    expect(isValidVariantId('n001-navy', 'N001')).toBe(false)
  })

  /**
   * The consequence of allowing a hyphen in the product code, stated as a test
   * so nobody has to rediscover it.
   *
   * `RX-PS` + colour `NAVY` and `RX` + colour `PS-NAVY` both spell
   * `RX-PS-NAVY`. That ambiguity is HARMLESS here and this test is what keeps it
   * so: a variant ID is only ever validated against a product code that is
   * already known, and built by composing one — verified by grep that nothing in
   * this repo splits a variant ID on `-` to recover either half. If anything ever
   * needs to, this pair is where it will fail.
   */
  it('works for a hyphenated product code', () => {
    expect(isValidVariantId('RX-PS-NAVY', 'RX-PS')).toBe(true)
    expect(isValidVariantId('RX-PS-DEEP-FOREST', 'RX-PS')).toBe(true)
    expect(buildVariantId('RX-PS', 'navy')).toBe('RX-PS-NAVY')
    expect(isValidVariantId(buildVariantId('RX-PS', 'deep-forest'), 'RX-PS')).toBe(true)

    // A different product code is still rejected — the prefix check does its job.
    expect(isValidVariantId('RY-PS-NAVY', 'RX-PS')).toBe(false)
    expect(isValidVariantId('RXPS-NAVY', 'RX-PS')).toBe(false)
  })

  /**
   * ⚠️ THE AMBIGUITY, ASSERTED RATHER THAN AVOIDED — and this expectation was
   * written the other way round first, which is how it earned a test of its own.
   *
   * `RX-PS-NAVY` is a valid variant of product `RX-PS` in colour `NAVY` AND a
   * valid variant of product `RX` in colour `PS-NAVY`. Both are true at once and
   * neither is a bug: the string genuinely does not carry the boundary.
   *
   * It is harmless because no caller ever asks "which product does this variant
   * belong to?" — `isValidVariantId` is always handed a product code that is
   * already known, and `buildVariantId` only ever composes one. The day
   * something tries to recover the product code from a variant ID, this test is
   * the one that should stop it.
   */
  it('cannot tell where the product code ends, and that is accepted', () => {
    expect(isValidVariantId('RX-PS-NAVY', 'RX-PS')).toBe(true)
    expect(isValidVariantId('RX-PS-NAVY', 'RX')).toBe(true)
  })
})

describe('buildVariantId', () => {
  it('derives canonical IDs from colour slugs', () => {
    expect(buildVariantId('N001', 'navy')).toBe('N001-NAVY')
    expect(buildVariantId('N001', 'deep-forest')).toBe('N001-DEEP-FOREST')
  })
  it('strips leading/trailing hyphens and collapses runs from sloppy slugs', () => {
    expect(buildVariantId('N001', ' navy! ')).toBe('N001-NAVY')
    expect(buildVariantId('N001', '--forest--')).toBe('N001-FOREST')
    expect(buildVariantId('N001', 'sea/foam')).toBe('N001-SEA-FOAM')
  })
  it('always produces a valid variant ID for its own product code', () => {
    for (const slug of ['navy', ' navy! ', '--forest--', 'sea/foam', 'deep-forest']) {
      expect(isValidVariantId(buildVariantId('N001', slug), 'N001')).toBe(true)
    }
  })
})
