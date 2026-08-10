import { describe, expect, it } from 'vitest'
import { deriveSlug } from './deriveSlug'

describe('deriveSlug', () => {
  it('lowercases and hyphenates', () => {
    expect(deriveSlug('Velocity Performance Tee')).toBe('velocity-performance-tee')
  })
  it('drops punctuation and collapses runs', () => {
    expect(deriveSlug('N001 — “Velocity” Tee!!')).toBe('n001-velocity-tee')
  })
  it('trims leading and trailing hyphens', () => {
    expect(deriveSlug('  --Tee--  ')).toBe('tee')
  })
  it('returns empty rather than an invalid slug', () => {
    expect(deriveSlug('—— ——')).toBe('')
    expect(deriveSlug(undefined)).toBe('')
    expect(deriveSlug(42)).toBe('')
  })
})
