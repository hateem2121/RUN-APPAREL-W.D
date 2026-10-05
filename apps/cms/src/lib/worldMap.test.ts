import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { type LatLon, parseCoordinates } from './globe'
import { mapPoint, WORLD_MAP } from './worldMap'

/** The works, as the CMS holds them (read from production 2026-10-05). */
const WORKS = parseCoordinates('32.41° N · 74.46° E') as LatLon

/**
 * The committed strip (`public/world-map.svg`, written by scripts/gen-world-map.mjs) and the
 * projection that places the works on it (`worldMap.ts`) describe the same box. If either moves
 * alone, the pin lands in the sea: these read the picture itself, dot by dot.
 */
const svg = readFileSync(new URL('../../public/world-map.svg', import.meta.url), 'utf8')

/** Every dot's centre, from the path: `M x y h0` starts a row, `m dx 0 h0` steps along it. */
function dots(): Set<string> {
  const d = /<path d="([^"]+)"/.exec(svg)?.[1] ?? ''
  const found = new Set<string>()
  let x = 0
  let y = 0
  for (const [, command, a, b] of d.matchAll(/([Mm])(-?\d+) (-?\d+)h0/g)) {
    if (command === 'M') {
      x = Number(a)
      y = Number(b)
    } else {
      x += Number(a)
      y += Number(b)
    }
    found.add(`${x},${y}`)
  }
  return found
}

/** Whether the dot that `place` falls in is drawn: the dots sit at the odd centres of 2 x 2 cells. */
function onLand(place: LatLon, land = dots()): boolean {
  const { x, y } = mapPoint(place)
  const column = Math.floor((x * WORLD_MAP.width) / 2)
  const row = Math.floor((y * WORLD_MAP.height) / 2)
  return land.has(`${column * 2 + 1},${row * 2 + 1}`)
}

describe('the "Where we ship" world strip (polish X7)', () => {
  it('is drawn in the box the projection uses, with the land of a whole world', () => {
    expect(svg).toContain(`viewBox="0 0 ${WORLD_MAP.width} ${WORLD_MAP.height}"`)
    const land = dots()
    // 2,140 when written; a broken generator writes none, or a few.
    expect(land.size).toBeGreaterThan(1500)
    for (const dot of land) {
      const [x, y] = dot.split(',').map(Number) as [number, number]
      expect(x % 2 === 1 && y % 2 === 1, `${dot} is off the grid`).toBe(true)
      expect(x < WORLD_MAP.width && y < WORLD_MAP.height, `${dot} is outside the box`).toBe(true)
    }
  })

  it('names where its land comes from, as the licence asks', () => {
    expect(svg).toMatch(/cobe 2\.0\.1 \(MIT License, Copyright \(c\) 2021 Shu Ding\)/)
  })

  it('puts the works on land, and the open sea in the sea', () => {
    const land = dots()
    // The works, where the pin stands, and the middle of five continents.
    for (const place of [
      WORKS,
      [23, 10],
      [-10, -55],
      [60, 100],
      [-25, 135],
      [40, -100],
    ] as LatLon[]) {
      expect(onLand(place, land), `${place} is not on land`).toBe(true)
    }
    // CONTROL: the middle of the Atlantic and of the South Pacific.
    for (const place of [
      [0, -25],
      [-30, -130],
    ] as LatLon[]) {
      expect(onLand(place, land), `${place} is drawn as land`).toBe(false)
    }
  })

  it('projects the corners of its crop onto the corners of the box', () => {
    expect(mapPoint([WORLD_MAP.north, -180])).toEqual({ x: 0, y: 0 })
    expect(mapPoint([WORLD_MAP.south, 180])).toEqual({ x: 1, y: 1 })
  })
})
