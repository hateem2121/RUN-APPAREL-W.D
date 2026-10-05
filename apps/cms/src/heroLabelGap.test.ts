import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Polish X30 (2026-10-04): on a paper hero the headline's capitals must not run into the label's
 * chip, in the stand-in face too. A no-swap headline ("Archivo Optional") keeps the stand-in for
 * the whole visit when the font misses the first paint, and the stand-in's capitals overhang their
 * line box. The gap rule in site.css must outgrow that overhang at every headline size.
 *
 * Arithmetic, not pixels: CI's image has no Arial, so a browser there cannot draw the face this
 * guards. e2e/composition.spec.ts measures the ink in Archivo itself.
 */
const SITE_CSS = readFileSync(join(import.meta.dirname, 'app', '(frontend)', 'site.css'), 'utf8')
const BASE_CSS = readFileSync(
  join(import.meta.dirname, '..', '..', '..', 'packages', 'ui', 'src', 'base.css'),
  'utf8',
)

/** Arial Bold's capital height: 1467 of its 2048 units per em (the stand-in's first local face). */
const ARIAL_BOLD_CAP = 1467 / 2048

/** One descriptor of the stand-in face, as a fraction. */
function standIn(descriptor: string): number {
  const face = /font-family: "Archivo Display Fallback";([^}]*)\}/.exec(SITE_CSS)?.[1] ?? ''
  const value = new RegExp(`${descriptor}:\\s*([\\d.]+)%`).exec(face)?.[1]
  expect(value, `"Archivo Display Fallback" has no ${descriptor}`).toBeDefined()
  return Number(value) / 100
}

const rule =
  /\.site-hero:not\(\.site-hero--photo\) \.label \+ \.display \{\s*margin-block-start: calc\(([\d.]+)px \+ ([\d.]+)em\);/.exec(
    SITE_CSS,
  )
const lineHeight = Number(/\.display \{[^}]*?line-height: ([\d.]+);/.exec(BASE_CSS)?.[1])

/** How far the stand-in's capitals rise above their line box, in px, at one headline size. */
function overhang(size: number): number {
  const ascent = standIn('ascent-override')
  const content = ascent + standIn('descent-override') + standIn('line-gap-override')
  const halfLeading = (lineHeight - content) / 2
  return (ARIAL_BOLD_CAP * standIn('size-adjust') - ascent - halfLeading) * size
}

describe('the label and the headline on a paper hero (polish X30)', () => {
  it('has the rule, and reads the face and the leading it depends on', () => {
    expect(rule, 'the paper-hero gap rule is gone from site.css').not.toBeNull()
    expect(lineHeight).toBe(0.92)
    // The overhang this rule exists for: about 0.2em, 14px at the 72px desktop size.
    expect(overhang(72)).toBeGreaterThan(13)
    expect(overhang(72)).toBeLessThan(15)
  })

  // 34px is the phone floor, 41.5px a 768px tablet, 72px the desktop ceiling, 96px and 144px the
  // sizes from 1920px wide (base.css, VA-12).
  it.each([34, 41.5, 72, 96, 144])(
    'at %ipx the stand-in keeps at least 9px between the chip and the capitals',
    (size) => {
      const px = Number(rule?.[1])
      const em = Number(rule?.[2])
      expect(px + em * size - overhang(size)).toBeGreaterThanOrEqual(9)
    },
  )

  it('NEGATIVE CONTROL: the old 10px alone let the capitals run into the chip at 72px', () => {
    expect(10 - overhang(72)).toBeLessThan(0)
  })
})
