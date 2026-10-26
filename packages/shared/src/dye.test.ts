import { describe, expect, it } from 'vitest'
import { deltaE2000, hexToLab } from './deltaE'
import {
  arrivalField,
  containedBox,
  coverAt,
  dyeDuration,
  dyeOrigin,
  wetShade,
  wetStrength,
} from './dye'

const TIMING = { min: 320, max: 640, short: 240 }

describe('dyeOrigin', () => {
  it('starts at the point, and reaches the farthest corner', () => {
    const origin = dyeOrigin({ width: 800, height: 1000 }, { x: 0, y: 500 })
    expect(origin.x).toBe(0)
    expect(origin.y).toBe(500)
    expect(origin.reach).toBeCloseTo(Math.hypot(800, 500), 6)
  })

  it('pulls a point outside the box onto its nearest edge (a dot beside or under the garment)', () => {
    const left = dyeOrigin({ width: 800, height: 1000 }, { x: -120, y: 300 })
    expect([left.x, left.y]).toEqual([0, 300])
    const below = dyeOrigin({ width: 800, height: 1000 }, { x: 400, y: 1180 })
    expect([below.x, below.y]).toEqual([400, 1000])
    expect(below.reach).toBeCloseTo(Math.hypot(400, 1000), 6)
  })

  it('with no point, opens from the middle of the foot', () => {
    const origin = dyeOrigin({ width: 800, height: 1000 }, null)
    expect([origin.x, origin.y]).toEqual([400, 1000])
  })
})

describe('dyeDuration', () => {
  it('a short trip is quicker than a long one, held between the tokens', () => {
    expect(dyeDuration(0, 'full', TIMING)).toBe(320)
    expect(dyeDuration(600, 'full', TIMING)).toBe(480)
    expect(dyeDuration(1200, 'full', TIMING)).toBe(640)
    expect(dyeDuration(5000, 'full', TIMING)).toBe(640)
  })

  it('a hover plays the short dye whatever the distance', () => {
    expect(dyeDuration(0, 'short', TIMING)).toBe(240)
    expect(dyeDuration(5000, 'short', TIMING)).toBe(240)
  })
})

describe('wetShade', () => {
  const channels = (hex: string) => [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16))

  it('darkens a colour the way wet cloth is darker, keeping a grey grey', () => {
    const [r, g, b] = channels(wetShade('#ffffff'))
    expect(r).toBeLessThan(255)
    expect(r).toBe(g)
    expect(g).toBe(b)
  })

  it('keeps the hue: a red stays red', () => {
    const [r, g, b] = channels(wetShade('#905260'))
    const [r0] = channels('#905260')
    expect(r).toBeLessThan(r0 as number)
    expect(r).toBeGreaterThan(g as number)
    expect(r).toBeGreaterThan(b as number)
  })

  it('names nothing for a value that is not a colour', () => {
    expect(wetShade('nope')).toBe('transparent')
    expect(wetShade('#12')).toBe('transparent')
  })
})

describe('wetStrength', () => {
  // The seeded garment's five colours (seed.ts), as the shrink writes them.
  const swatches = ['#825353', '#F7CDCD', '#FDFDC8', '#D6F26B', '#262727']
  const mix = (under: string, over: string, alpha: number) =>
    `#${[1, 3, 5]
      .map((i) => {
        const a = Number.parseInt(under.slice(i, i + 2), 16)
        const b = Number.parseInt(over.slice(i, i + 2), 16)
        return Math.round(a * (1 - alpha) + b * alpha)
          .toString(16)
          .padStart(2, '0')
      })
      .join('')}`
  /** How far the wet edge, painted over the old cloth, moves it (CIEDE2000; `deltaE.ts`). */
  const stain = (old: string, next: string, alpha: number) =>
    deltaE2000(hexToLab(mix(old, wetShade(next), alpha)), hexToLab(old))

  it('keeps the full edge for a dark dye', () => {
    expect(wetStrength('#825353')).toBe(1)
    expect(wetStrength('#262727')).toBe(1)
  })

  it('leaves only a faint edge between two light colours (owner, 2026-10-26: a tan stain on blush → butter)', () => {
    // At 0.55 alone blush → butter measured 18.0 and lime → blush 15.5.
    for (const old of swatches) {
      for (const next of swatches) {
        if (old === next || hexToLab(old).L <= 80 || hexToLab(next).L <= 80) continue
        expect(stain(old, next, 0.55 * wetStrength(next))).toBeLessThanOrEqual(8)
      }
    }
  })

  it('fades as the dye gets lighter, and does not vanish', () => {
    const order = ['#262727', '#825353', '#F7CDCD', '#D6F26B', '#FDFDC8'].map(wetStrength)
    for (let i = 1; i < order.length; i++)
      expect(order[i]).toBeLessThanOrEqual(order[i - 1] as number)
    expect(wetStrength('#ffffff')).toBeGreaterThan(0)
  })
})

describe('arrivalField', () => {
  const origin = dyeOrigin({ width: 800, height: 1000 }, { x: 0, y: 1000 })

  it('is the same field for the same seed, and stays within 0..1', () => {
    const a = arrivalField(100, 125, origin, 8, 7)
    const b = arrivalField(100, 125, origin, 8, 7)
    expect(a).toEqual(b)
    expect(Math.min(...a)).toBeGreaterThanOrEqual(0)
    expect(Math.max(...a)).toBeLessThanOrEqual(1)
  })

  it('arrives first where the dot is and last at the far corner', () => {
    const field = arrivalField(100, 125, origin, 8, 7)
    // The origin is the bottom-left corner; the far corner is the top-right.
    expect(field[124 * 100] as number).toBeLessThan(0.1)
    expect(field[99] as number).toBeGreaterThan(0.9)
  })

  it('is not a perfect circle: cells the same distance away arrive at different times', () => {
    const field = arrivalField(100, 125, origin, 8, 7)
    const ring: number[] = []
    for (let row = 0; row < 125; row++) {
      for (let col = 0; col < 100; col++) {
        const d = Math.hypot((col + 0.5) * 8, 1000 - (row + 0.5) * 8)
        if (Math.abs(d - 500) < 4) ring.push(field[row * 100 + col] as number)
      }
    }
    expect(Math.max(...ring) - Math.min(...ring)).toBeGreaterThan(0.04)
  })
})

describe('coverAt', () => {
  it('covers before the front, uncovers behind it, and only ever opens', () => {
    expect(coverAt(0.5, 0.2)).toBe(1)
    expect(coverAt(0.5, 0.9)).toBe(0)
    let last = 1
    for (let t = 0; t <= 1; t += 0.01) {
      const cover = coverAt(0.5, t)
      expect(cover).toBeLessThanOrEqual(last)
      last = cover
    }
  })
})

describe('containedBox', () => {
  const none = { top: 0, right: 0, bottom: 0, left: 0 }

  it('fits a picture inside its box as `object-fit: contain` does, centred', () => {
    // A 4:5 picture in a wide box: full height, centred across.
    expect(containedBox({ width: 400, height: 200 }, none, { width: 800, height: 1000 })).toEqual({
      x: 120,
      y: 0,
      width: 160,
      height: 200,
    })
  })

  it('fits it inside the padding, as the gallery cards inset their pictures', () => {
    const inset = { top: 25, right: 20, bottom: 25, left: 20 }
    expect(containedBox({ width: 400, height: 500 }, inset, { width: 1200, height: 1500 })).toEqual(
      {
        x: 20,
        y: 25,
        width: 360,
        height: 450,
      },
    )
  })

  it('has no box for a picture with no size yet', () => {
    expect(containedBox({ width: 400, height: 500 }, none, { width: 0, height: 0 })).toBeNull()
  })
})
