import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * VA-17 (visual audit, 2026-10-02): fluid spacing keeps to the 2px scale. A `clamp()` that grows
 * with the window lands between the scale's steps everywhere but its two ends (the audit counted
 * 152 sizes such as 38.4 or 91.74px), and tokens.test.ts can only check fixed values. So each fluid
 * padding, margin, gap or inset has a twin, `round(<the same clamp>, 2px)`, inside
 * `@supports (width: round(1px, 2px))` and after its rule; the plain `clamp()` stays for a browser
 * without `round()`. The reasoning is the note above `--site-gutter`'s rounding in tokens.css.
 *
 * This fails when a fluid spacing value has no rounded twin, which is how the next one would
 * arrive. Whether each twin actually WINS in the cascade is a browser question, asked by
 * e2e/fluidSpacing.spec.ts here and apps/cms/e2e/fluidSpacing.spec.ts on the website.
 */

const ROOT = join(import.meta.dirname, '..', '..', '..', '..')
const SHEETS = [
  'packages/ui/src/tokens.css',
  'packages/ui/src/base.css',
  'packages/ui/src/notch.css',
  'packages/ui/src/footer.css',
  'packages/ui/src/footer-prompt.css',
  'apps/cms/src/app/(frontend)/site.css',
  // The about and factory pages' own sheet (2026-10-09, D36): site.css by another name.
  'apps/cms/src/app/(frontend)/about-factory.css',
  'apps/viewer/src/styles/page.css',
]

/** Properties that space things out, plus the site gutter token they all read. */
const SPACING =
  /^(padding|margin)(-[a-z-]+)?$|^(row-|column-)?gap$|^inset(-[a-z-]+)?$|^(top|right|bottom|left)$|^--site-gutter$/

const ROUNDING_BLOCK = /^@supports\s*\(\s*width:\s*round\(/

type Declaration = { sheet: string; property: string; value: string; rounded: boolean }

/** Every declaration in a stylesheet, and whether it sits inside a rounding `@supports` block. */
function declarations(sheet: string, css: string): Declaration[] {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, '')
  const found: Declaration[] = []
  const headers: string[] = []
  let buffer = ''
  for (const character of text) {
    if (character === '{') {
      headers.push(buffer.trim())
      buffer = ''
    } else if (character === '}') {
      headers.pop()
      buffer = ''
    } else if (character === ';') {
      const colon = buffer.indexOf(':')
      if (colon > 0 && headers.length > 0) {
        found.push({
          sheet,
          property: buffer.slice(0, colon).trim(),
          value: buffer.slice(colon + 1).trim(),
          rounded: headers.some((header) => ROUNDING_BLOCK.test(header)),
        })
      }
      buffer = ''
    } else {
      buffer += character
    }
  }
  return found
}

/** The `clamp(...)` expressions in a value, brackets balanced. */
function clamps(value: string): string[] {
  const out: string[] = []
  let at = value.indexOf('clamp(')
  while (at !== -1) {
    let depth = 0
    let end = at + 'clamp'.length
    for (; end < value.length; end++) {
      if (value[end] === '(') depth++
      if (value[end] === ')' && --depth === 0) break
    }
    out.push(value.slice(at, end + 1).replace(/\s+/g, ' '))
    at = value.indexOf('clamp(', end)
  }
  return out
}

/** Fluid spacing with no rounded twin: "sheet: property: clamp(...)". */
function unrounded(all: Declaration[]): string[] {
  const twins = new Set(
    all
      .filter((d) => d.rounded && SPACING.test(d.property))
      .flatMap((d) => [...d.value.matchAll(/round\((clamp\([^)]*\)),\s*2px\)/g)])
      .map((match) => (match[1] ?? '').replace(/\s+/g, ' ')),
  )
  return all
    .filter((d) => !d.rounded && SPACING.test(d.property))
    .flatMap((d) => clamps(d.value).map((clamp) => ({ d, clamp })))
    .filter(({ clamp }) => clamp.includes('vw') && !twins.has(clamp))
    .map(({ d, clamp }) => `${d.sheet}: ${d.property}: ${clamp}`)
}

describe('fluid spacing keeps to the 2px scale (VA-17)', () => {
  const all = SHEETS.flatMap((sheet) =>
    declarations(sheet, readFileSync(join(ROOT, sheet), 'utf8')),
  )

  it('finds the fluid spacing it is meant to guard (a scan that finds none passes vacuously)', () => {
    const fluid = all.filter(
      (d) =>
        !d.rounded && SPACING.test(d.property) && clamps(d.value).some((c) => c.includes('vw')),
    )
    expect(fluid.length).toBeGreaterThanOrEqual(12)
  })

  it('every fluid padding, margin, gap and inset has a round(…, 2px) twin behind @supports', () => {
    expect(unrounded(all)).toEqual([])
  })

  it('the control: a fluid padding with no twin is found', () => {
    const planted = declarations(
      'planted.css',
      '.a { padding: clamp(8px, 2vw, 24px) 0; } @supports (width: round(1px, 2px)) { .b { gap: round(clamp(32px, 5vw, 64px), 2px); } }',
    )
    expect(unrounded(planted)).toEqual(['planted.css: padding: clamp(8px, 2vw, 24px)'])
  })
})
