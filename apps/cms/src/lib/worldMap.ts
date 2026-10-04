import type { LatLon } from './globe'

/**
 * The home page's dotted world strip, "Where we ship" (polish X7, 2026-10-05): the box
 * `public/world-map.svg` is drawn in, and where a place falls on it.
 *
 * `scripts/gen-world-map.mjs` writes the picture from the land mask the contact page's globe
 * library carries (cobe 2.0.1, 256 x 128, one pixel per 1.40625°), cropped to mask rows 10-103:
 * from 75.9375°N to 56.25°S, row edges, so the projection below is exact. The map is
 * equirectangular, so a place's share of the width is its longitude's and its share of the height
 * its latitude's. `worldMap.test.ts` reads the committed SVG and holds the two together.
 */
export const WORLD_MAP = {
  /** The SVG's own box: two units a dot, a dot at every odd coordinate. */
  width: 256,
  height: 94,
  north: 75.9375,
  south: -56.25,
} as const

/**
 * Where `[lat, lon]` falls on the strip, as shares of its width and height (0 to 1). The works'
 * own place comes from the CMS (`worksCoordinates`, through `parseCoordinates`) and is never
 * defaulted, as `globe.ts` rules for the contact globe: no coordinates, no pin.
 */
export function mapPoint([lat, lon]: LatLon): { x: number; y: number } {
  return {
    x: (lon + 180) / 360,
    y: (WORLD_MAP.north - lat) / (WORLD_MAP.north - WORLD_MAP.south),
  }
}
