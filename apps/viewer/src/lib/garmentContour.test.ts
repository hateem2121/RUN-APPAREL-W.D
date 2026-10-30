import { describe, expect, it } from 'vitest'
import { threadFor, traceContour } from './garmentContour'

/** Draws a map from rows of '#' and '.'. */
function map(rows: string[]) {
  const width = rows[0]?.length ?? 0
  const alpha = rows.flatMap((r) => [...r].map((c) => (c === '#' ? 255 : 0)))
  return { alpha, width, height: rows.length }
}

describe('traceContour', () => {
  it('follows the gap between sleeve and body instead of bridging it', () => {
    // A row-by-row outline (the first version) would pass through (2,2), the empty gap.
    const m = map(['.......', '.#####.', '.#####.', '.#.#.#.', '.#.#.#.', '.#.#.#.', '.......'])
    const points = traceContour(m.alpha, m.width, m.height)
    expect(points.length).toBeGreaterThan(12)
    expect(points.some(([x, y]) => x === 2 && y === 4)).toBe(false)
    expect(points.some(([x, y]) => x === 3 && y === 5)).toBe(true)
  })

  it('gives nothing for a fully opaque picture or an empty one', () => {
    const solid = map(['###', '###', '###'])
    expect(traceContour(solid.alpha, solid.width, solid.height)).toEqual([])
    const empty = map(['...', '...'])
    expect(traceContour(empty.alpha, empty.width, empty.height)).toEqual([])
  })
})

describe('threadFor', () => {
  it('chooses dark on a pale dye and light on a dark one', () => {
    expect(threadFor([247, 205, 205])).toEqual([29, 31, 26])
    expect(threadFor([38, 39, 39])).toEqual([241, 239, 234])
  })
})
