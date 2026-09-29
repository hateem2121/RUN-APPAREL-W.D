import { describe, expect, it } from 'vitest'
import {
  arcsVisibleAt,
  directionsUrl,
  focusPhi,
  parseCoordinates,
  parseCssColour,
  ROUTES,
} from './globe'

describe('parseCoordinates', () => {
  it('reads the CMS field the way the footer prints it', () => {
    expect(parseCoordinates('32.41° N · 74.46° E')).toEqual([32.41, 74.46])
  })
  it('turns south and west negative', () => {
    expect(parseCoordinates('32.41 S · 74.46 W')).toEqual([-32.41, -74.46])
  })
  it('tolerates a comma, a bare space and no degree sign', () => {
    expect(parseCoordinates('32.41 N, 74.46 E')).toEqual([32.41, 74.46])
    expect(parseCoordinates('32.41°N 74.46°E')).toEqual([32.41, 74.46])
  })
  it('returns null for a blank or unreadable field', () => {
    expect(parseCoordinates('')).toBeNull()
    expect(parseCoordinates('   ')).toBeNull()
    expect(parseCoordinates('nonsense')).toBeNull()
    expect(parseCoordinates('32.41° N')).toBeNull()
  })
  it('returns null for a value the planet cannot have', () => {
    expect(parseCoordinates('91.00° N · 74.46° E')).toBeNull()
    expect(parseCoordinates('32.41° N · 180.5° E')).toBeNull()
  })
  it('does not accept the letters in the wrong order', () => {
    // A longitude with a N/S letter would be a typo; refuse rather than guess.
    expect(parseCoordinates('32.41° E · 74.46° N')).toBeNull()
  })
})

describe('ROUTES', () => {
  const continents: Record<string, string[]> = {
    Europe: ['London', 'Berlin', 'Stockholm'],
    'North America': ['New York', 'Toronto', 'Los Angeles', 'Mexico City'],
    'South America': ['São Paulo'],
    Oceania: ['Sydney', 'Auckland'],
    Africa: ['Johannesburg'],
    Asia: ['Dubai', 'Tokyo', 'Singapore'],
  }
  it('reaches many places, not four regions', () => {
    expect(ROUTES.length).toBeGreaterThanOrEqual(10)
    expect(ROUTES.length).toBeLessThanOrEqual(14)
  })
  it('has at least one destination on every inhabited continent', () => {
    const names = new Set(ROUTES.map((route) => route.name))
    for (const [continent, cities] of Object.entries(continents)) {
      expect(
        cities.some((city) => names.has(city)),
        continent,
      ).toBe(true)
    }
  })
  it('has valid, distinct coordinates and unique names', () => {
    expect(new Set(ROUTES.map((r) => r.name)).size).toBe(ROUTES.length)
    expect(new Set(ROUTES.map((r) => r.location.join())).size).toBe(ROUTES.length)
    for (const { location } of ROUTES) {
      expect(Math.abs(location[0])).toBeLessThanOrEqual(90)
      expect(Math.abs(location[1])).toBeLessThanOrEqual(180)
    }
  })
  it('spreads over both hemispheres', () => {
    expect(ROUTES.some((r) => r.location[0] < 0)).toBe(true)
    expect(ROUTES.some((r) => r.location[1] < 0)).toBe(true)
    expect(ROUTES.some((r) => r.location[1] > 100)).toBe(true)
  })
})

describe('arcsVisibleAt', () => {
  it('draws none at the start and all at the end', () => {
    expect(arcsVisibleAt(12, 0, 1400)).toBe(0)
    expect(arcsVisibleAt(12, 1400, 1400)).toBe(12)
    expect(arcsVisibleAt(12, 99999, 1400)).toBe(12)
  })
  it('draws them one after another in between', () => {
    expect(arcsVisibleAt(10, 700, 1400)).toBe(5)
  })
  it('shows everything when there is no duration (reduced motion)', () => {
    expect(arcsVisibleAt(12, 0, 0)).toBe(12)
  })
  it('never goes negative or past the total', () => {
    expect(arcsVisibleAt(12, -50, 1400)).toBe(0)
    expect(arcsVisibleAt(0, 500, 1400)).toBe(0)
  })
})

describe('directionsUrl', () => {
  it('uses the coordinates when they parse', () => {
    expect(directionsUrl([32.41, 74.46], '13 Km Daska Road')).toBe(
      'https://www.google.com/maps/search/?api=1&query=32.41,74.46',
    )
  })
  it('falls back to the address, encoded', () => {
    expect(directionsUrl(null, '13 Km Daska Road, Sialkot, 51040, Pakistan')).toBe(
      'https://www.google.com/maps/search/?api=1&query=13%20Km%20Daska%20Road%2C%20Sialkot%2C%2051040%2C%20Pakistan',
    )
  })
})

describe('parseCssColour', () => {
  it('reads rgb() and rgba()', () => {
    expect(parseCssColour('rgb(255, 0, 51)')).toEqual([1, 0, 0.2])
    expect(parseCssColour('rgba(29, 31, 26, 0.5)')).toEqual([29 / 255, 31 / 255, 26 / 255])
    expect(parseCssColour('rgb(0 255 0 / 50%)')).toEqual([0, 1, 0])
  })
  it('reads color(srgb …)', () => {
    expect(parseCssColour('color(srgb 0.5 0.25 1)')).toEqual([0.5, 0.25, 1])
  })
  it('returns null for what it cannot read', () => {
    expect(parseCssColour('')).toBeNull()
    expect(parseCssColour('var(--nope)')).toBeNull()
    expect(parseCssColour('oklch(0.7 0.1 120)')).toBeNull()
  })
})

describe('focusPhi', () => {
  it('matches what cobe 2.0.1 was measured to draw', () => {
    // Measured on a render: phi π/2 centres 180° (Pacific); phi π centres 90° E.
    expect(focusPhi(180)).toBeCloseTo(Math.PI / 2)
    expect(focusPhi(90)).toBeCloseTo(Math.PI)
    expect(focusPhi(0)).toBeCloseTo((3 * Math.PI) / 2)
  })
})
