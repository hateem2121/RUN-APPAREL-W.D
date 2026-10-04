/**
 * The contact page's globe, minus the browser: the parts that can be proved without a GPU.
 *
 * ⚠️ THE WORKS' COORDINATES COME FROM THE CMS AND ARE NEVER DEFAULTED. `worksCoordinates` is
 * one of the seven claim fields that carry no default on purpose (`projectFooter()`), so a
 * blank or unreadable value means NO globe and the plain address — never a hard-coded
 * Sialkot that could drift from what the owner typed.
 */

export type LatLon = [number, number]

/**
 * `"32.41° N · 74.46° E"` → `[32.41, 74.46]`; south and west come out negative. The letters
 * are required and must be in latitude-then-longitude order: a bare pair of numbers could be
 * either way round, and a globe pinned to the wrong ocean is worse than no globe.
 */
export function parseCoordinates(value: string): LatLon | null {
  const match =
    /^\s*(\d{1,2}(?:\.\d+)?)\s*°?\s*([NS])\s*[·,;]?\s*(\d{1,3}(?:\.\d+)?)\s*°?\s*([EW])\s*$/i.exec(
      value,
    )
  if (!match) return null
  const lat =
    Number.parseFloat(match[1] as string) * ((match[2] as string).toUpperCase() === 'S' ? -1 : 1)
  const lon =
    Number.parseFloat(match[3] as string) * ((match[4] as string).toUpperCase() === 'W' ? -1 : 1)
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null
  return [lat, lon]
}

export interface Route {
  name: string
  location: LatLon
}

/**
 * Where the arcs land: fourteen big cities on every inhabited continent.
 *
 * ⚠️ THIS IS "WHEREVER YOUR TEAM IS", NOT A CUSTOMER LIST (owner, 2026-09-29: "customers can be
 * new and from anywhere"; `SHIPS_TO` reads "Worldwide — wherever your team is."). The names are
 * never printed on the page, so the picture cannot be read as "we ship to Toronto" or as a
 * claim about existing customers — they exist only so a test can prove the spread.
 */
export const ROUTES: readonly Route[] = [
  { name: 'London', location: [51.51, -0.13] },
  { name: 'Berlin', location: [52.52, 13.41] },
  { name: 'Stockholm', location: [59.33, 18.07] },
  { name: 'New York', location: [40.71, -74.01] },
  { name: 'Toronto', location: [43.65, -79.38] },
  { name: 'Los Angeles', location: [34.05, -118.24] },
  { name: 'Mexico City', location: [19.43, -99.13] },
  { name: 'São Paulo', location: [-23.55, -46.63] },
  { name: 'Johannesburg', location: [-26.2, 28.05] },
  { name: 'Dubai', location: [25.2, 55.27] },
  { name: 'Singapore', location: [1.35, 103.82] },
  { name: 'Tokyo', location: [35.68, 139.69] },
  { name: 'Sydney', location: [-33.87, 151.21] },
  { name: 'Auckland', location: [-36.85, 174.76] },
]

/** How many arcs have started drawing `elapsedMs` in, one after another across `durationMs`. */
export function arcsVisibleAt(total: number, elapsedMs: number, durationMs: number): number {
  if (total <= 0) return 0
  if (durationMs <= 0) return total
  const done = Math.floor((Math.max(0, elapsedMs) / durationMs) * total)
  return Math.min(total, done)
}

/**
 * "Get directions": to the company's own Google listing, by name and address.
 *
 * ⚠️ NOT TO THE COORDINATES (polish X24, the owner's answer Q49, 2026-10-03). The link went to the
 * CMS's `worksCoordinates`, "32.41° N · 74.46° E", rounded to two places: about half a kilometre
 * from the pin of the company's Google listing, "RUN APPAREL (PVT) LTD" at 32.4140092, 74.4567305
 * (read 2026-10-05). Google's directions link (Maps URLs: `dir`, `api=1`, a `destination` that is
 * a place's name or address; documentation of 28 September 2026) resolves the listing's name and
 * address to the listing itself, checked on 2026-10-05 with exactly this text: "Your location to
 * RUN APPAREL (PVT) LTD". With no name, the address alone.
 */
export function directionsUrl(name: string, address: string): string {
  const destination = name ? `${name}, ${address}` : address
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`
}

/**
 * A computed CSS colour as the 0–1 triple the globe wants. Chromium and Firefox report
 * `rgb(…)`; WebKit can report `color(srgb …)`. Anything else (a wide-gamut `oklch`) is refused,
 * and the caller keeps its fallback rather than painting a wrong colour.
 */
export function parseCssColour(value: string): [number, number, number] | null {
  const rgb = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(value.trim())
  if (rgb) {
    return [
      Number.parseFloat(rgb[1] as string) / 255,
      Number.parseFloat(rgb[2] as string) / 255,
      Number.parseFloat(rgb[3] as string) / 255,
    ]
  }
  const srgb = /^color\(\s*srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/i.exec(value.trim())
  if (srgb) {
    return [
      Number.parseFloat(srgb[1] as string),
      Number.parseFloat(srgb[2] as string),
      Number.parseFloat(srgb[3] as string),
    ]
  }
  return null
}

/**
 * The `phi` that turns a longitude to face the viewer: `3π/2 − lon`. Measured on a real render
 * (cobe 2.0.1, 2026-09-29): with phi at π/2 the middle of the ball is the 180° meridian (open
 * Pacific), and at π it is 90° E (India). A first guess of `π/2 − lon` from another project's
 * snippet put Sialkot's pin on the far side of the planet, and every unit test still passed —
 * which is why `e2e/globe.spec.ts` reads the pin's own pixels.
 */
export function focusPhi(longitude: number): number {
  return (3 * Math.PI) / 2 - (longitude * Math.PI) / 180
}
