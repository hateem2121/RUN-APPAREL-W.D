import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * VA-13 (visual audit, owner's choice 2026-10-02): the cookie card's sentence is 12px, one step
 * under the 13px it had, on every screen and on both hosts (the card's rules are shared, in
 * packages/ui/src/base.css). Measured before choosing: 4-5px shorter everywhere, the same number of
 * lines. 12px is also the floor VA-11 keeps for text that is read, so the card may not go lower.
 */
const UI = join(import.meta.dirname, '..', '..', '..', 'packages', 'ui', 'src')
// Comments out first: the sentence's own comment quotes `p { max-width: 60ch }`, whose brace
// would end the block early.
const base = readFileSync(join(UI, 'base.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
const tokens = readFileSync(join(UI, 'tokens.css'), 'utf8')

/** The font-size the FIRST top-level `.consent__text { … }` block declares. */
const sentenceSize = (css: string) =>
  /(?:^|\n)\.consent__text\s*\{([^}]*)\}/
    .exec(css)?.[1]
    ?.match(/font-size:\s*([^;]+);/)?.[1]
    ?.trim()

/** A size token's value in px at the 16px default, or NaN. */
const tokenPx = (name: string) => {
  const rem = new RegExp(`${name}:\\s*([\\d.]+)rem`).exec(tokens)?.[1]
  return rem ? Number(rem) * 16 : Number.NaN
}

const problemsWith = (size: string | undefined): string[] => {
  const token = /^var\((--[\w-]+)\)$/.exec(size ?? '')?.[1]
  if (!token) return [`the sentence's font-size is ${size ?? 'missing'}, not one size token`]
  const px = tokenPx(token)
  if (px !== 12) return [`${token} is ${px}px, not the 12px the owner chose`]
  return []
}

describe('VA-13 — the cookie card speaks in 12px', () => {
  it('sets the sentence in --text-fine, which is 12px', () => {
    expect(sentenceSize(base)).toBe('var(--text-fine)')
    expect(problemsWith(sentenceSize(base))).toEqual([])
  })

  it('would catch the old 13px and anything under the floor (negative control)', () => {
    expect(problemsWith('var(--text-xs)')).toEqual([
      '--text-xs is 13px, not the 12px the owner chose',
    ])
    expect(problemsWith('var(--text-mono-sm)')).toEqual([
      '--text-mono-sm is 10px, not the 12px the owner chose',
    ])
    expect(problemsWith('11px')).toEqual(["the sentence's font-size is 11px, not one size token"])
  })
})
