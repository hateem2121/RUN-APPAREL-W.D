import { describe, expect, it } from 'vitest'
import { buildVariantId, isValidProductCode, isValidVariantId } from './variants'

describe('isValidProductCode', () => {
  it('accepts uppercase codes', () => {
    expect(isValidProductCode('N001')).toBe(true)
    expect(isValidProductCode('TW12')).toBe(true)
  })
  it('rejects lowercase or empty', () => {
    expect(isValidProductCode('n001')).toBe(false)
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
})

describe('buildVariantId', () => {
  it('derives canonical IDs from colour slugs', () => {
    expect(buildVariantId('N001', 'navy')).toBe('N001-NAVY')
    expect(buildVariantId('N001', 'deep-forest')).toBe('N001-DEEP-FOREST')
  })
})
