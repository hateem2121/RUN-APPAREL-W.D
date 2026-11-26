import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { HALF_COLUMN_SIZES, PARALLAX_SCALE } from './FactoryFigure'

/**
 * The half-column photo must never be drawn wider than the file a 1x screen picks for it (owner,
 * 26 Nov 2026: "Use 1,200 px"). `.photo-parallax` scales the picture inside its frame, so the
 * drawn width is the layout width times that scale, and `sizes` must ask for the drawn width.
 * Measured live on 25 Nov: a 640 px file drawn 697 px wide on 1x screens 1,280 to 1,919 px wide.
 */
const SITE_CSS = readFileSync(
  join(import.meta.dirname, '..', '..', 'app', '(frontend)', 'site.css'),
  'utf8',
)

/** The files a wide (8:5) factory photo comes in (`factoryPhotos.ts`, `wide`). */
const WIDE_FILES = [640, 1200, 1600]

/** The column's real layout width at a screen width, from `.about`'s grid (FactoryFigure.tsx). */
function layoutWidth(vw: number): number {
  if (vw < 400) return vw - 40
  if (vw < 900) return 0.9 * vw + 2
  if (vw < 1280) return 0.45 * vw - 32
  if (vw < 1440) return 0.5 * vw - 96
  if (vw < 1920) return 624
  return 704
}

/** What `HALF_COLUMN_SIZES` asks for at a screen width (the ranges from 1,280 up). */
function askedWidth(sizes: string, vw: number): number {
  const entries = sizes.split(/,\s*(?![^()]*\))/).map((entry) => entry.trim())
  for (const entry of entries) {
    const media = /^\(max-width: (\d+)px\)\s+(.*)$/.exec(entry)
    if (media && vw > Number(media[1])) continue
    const value = media?.[2] ?? entry
    const expression = value
      .replace(/^calc/, '')
      .replace(/(\d+(?:\.\d+)?)vw/g, (_, n) => String((Number(n) * vw) / 100))
      .replace(/px/g, '')
    // Only digits, operators, dots, spaces and brackets reach here.
    if (!/^[\d\s.+\-*/()]+$/.test(expression)) throw new Error(`unexpected sizes value: ${value}`)
    return Function(`return (${expression})`)() as number
  }
  throw new Error(`no sizes entry for ${vw}`)
}

const pick = (slot: number, dpr: number) =>
  WIDE_FILES.find((file) => file >= slot * dpr) ?? (WIDE_FILES.at(-1) as number)

describe('half-column photo sizes and the parallax scale', () => {
  it('uses the same scale as .photo-parallax in site.css', () => {
    const rule = /\.photo-parallax\s*\{[^}]*?scale:\s*([\d.]+)/.exec(SITE_CSS)
    expect(rule, '.photo-parallax has no scale in site.css').not.toBeNull()
    expect(Number(rule?.[1])).toBe(PARALLAX_SCALE)
  })

  it('never draws the photo wider than the file a 1x screen picks, from 1,280 px', () => {
    const stretched: string[] = []
    for (let vw = 1280; vw <= 2560; vw += 8) {
      const file = pick(askedWidth(HALF_COLUMN_SIZES, vw), 1)
      const drawn = layoutWidth(vw) * PARALLAX_SCALE
      if (drawn > file + 0.5) stretched.push(`${vw}px: ${file} file drawn ${drawn.toFixed(0)} px`)
    }
    expect(stretched).toEqual([])
  })

  it('loads nothing more below 1,280 px on a 1x screen (phones, tablets, small laptops)', () => {
    for (let vw = 320; vw < 1280; vw += 8) {
      const before = pick(layoutWidth(vw), 1)
      expect(pick(askedWidth(HALF_COLUMN_SIZES, vw), 1), `at ${vw}px`).toBe(before)
    }
  })
})
