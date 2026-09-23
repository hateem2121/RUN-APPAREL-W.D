import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  CHANNEL_TOLERANCE,
  compareMarks,
  MAX_DIFFERING_FRACTION,
} from '../../../scripts/icon-parity-probe.mjs'

/**
 * IM-09 — `icon-parity-probe.mjs` is a pure function once the two SVGs are in hand, so
 * this suite never fetches anything live; `smoke-viewer-preview.mjs`'s house style is the
 * same split (pure evaluator, network in a separate `main()`).
 */

const SQUARE = (fill: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="${fill}"/></svg>`

const OLD_VIEWER_PLACEHOLDER =
  "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect width='32' height='32' rx='6' fill='%23CDF345'/><text x='16' y='23' font-family='Archivo,system-ui,sans-serif' font-size='20' font-weight='900' text-anchor='middle' fill='%231D1F1A'>R</text></svg>".replace(
    /%23/g,
    '#',
  )

const SITE_ICON = readFileSync(
  fileURLToPath(new URL('../public/icon.svg', import.meta.url)),
  'utf8',
)

describe('compareMarks', () => {
  it('the same mark compared against itself has zero differing pixels', async () => {
    const result = await compareMarks(SITE_ICON, SITE_ICON)
    expect(result.differingPixels).toBe(0)
    expect(result.ok).toBe(true)
  })

  it('a solid black square and a solid white square are NOT the same mark', async () => {
    const result = await compareMarks(SQUARE('#000000'), SQUARE('#ffffff'))
    expect(result.ok).toBe(false)
    // Negative control on the negative control: every pixel differs, not a
    // coincidental few — a harness that flags only a handful here is measuring
    // something other than the whole raster.
    expect(result.differingFraction).toBeGreaterThan(0.9)
  })

  it('two shades within CHANNEL_TOLERANCE of each other are the same mark', async () => {
    const result = await compareMarks(SQUARE('#101010'), SQUARE('#100000'))
    expect(result.differingPixels).toBe(0)
    expect(result.ok).toBe(true)
  })

  it('a difference just past CHANNEL_TOLERANCE registers as a differing pixel', async () => {
    const base = 0x10
    const overTolerance = base + CHANNEL_TOLERANCE + 1
    const hex = (n: number) => n.toString(16).padStart(2, '0')
    const result = await compareMarks(
      SQUARE(`#${hex(base)}0000`),
      SQUARE(`#${hex(overTolerance)}0000`),
    )
    expect(result.differingPixels).toBe(result.totalPixels)
  })

  /**
   * A `prefers-color-scheme` override must not itself count as a difference — a
   * rasteriser never evaluates it, and both `gen-favicon.mjs` and `gen-icons.mjs`
   * strip it before rendering for the identical reason. Without the strip in
   * `compareMarks` itself, this pair would fail for a reason that says nothing about
   * whether the two marks are actually the same picture.
   */
  it('ignores a prefers-color-scheme override that only one side declares', async () => {
    const withDarkOverride = SITE_ICON // already carries the @media block
    const withoutDarkOverride = SITE_ICON.replace(
      /@media \(prefers-color-scheme: dark\)[\s\S]*?\}\s*\}/,
      '',
    )
    expect(withoutDarkOverride).not.toContain('prefers-color-scheme')
    const result = await compareMarks(withDarkOverride, withoutDarkOverride)
    expect(result.ok).toBe(true)
    expect(result.differingPixels).toBe(0)
  })

  /**
   * THE ACTUAL REGRESSION THIS ROW EXISTS FOR (negative control, both ways). The
   * viewer's favicon was this exact placeholder — a lime square with a plain "R" —
   * for the eight days after the site got its real generated mark (2026-09-16) and
   * before this fix, and nothing was watching the gap. Feeding the probe the real
   * historical pairing proves it would have caught the drift, not just a synthetic
   * black-vs-white case.
   */
  it('would have caught the real IM-09 regression: the old viewer placeholder vs the site mark', async () => {
    const result = await compareMarks(SITE_ICON, OLD_VIEWER_PLACEHOLDER)
    expect(result.ok).toBe(false)
    expect(result.differingFraction).toBeGreaterThan(MAX_DIFFERING_FRACTION)
  })

  it('and passes today, now that the viewer carries the same mark', async () => {
    const viewerFavicon = readFileSync(
      fileURLToPath(new URL('../../viewer/public/favicon.svg', import.meta.url)),
      'utf8',
    )
    const result = await compareMarks(SITE_ICON, viewerFavicon)
    expect(result.ok, `${result.differingPixels}/${result.totalPixels} pixels differ`).toBe(true)
  })
})
