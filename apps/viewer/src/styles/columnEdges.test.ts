import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { declared, readRules } from './cssRules'

/**
 * The garment page's lower sections start where its 3D stage starts (owner, 2026-10-26, site
 * check). At 1440px wide the stage began at x=120 and the trail, the sections and the footer's
 * words at x=168: 1,200px was the stage's width but the `.content` box's, gutters included, so
 * its words were 48px in on each side. A tripwire on the arithmetic, not a measurement:
 * `e2e/motion-and-layout.spec.ts` ("the lower sections start where the stage starts") measures
 * the page.
 */

const rules = readRules(readFileSync(join(import.meta.dirname, 'page.css'), 'utf8'))

/** `--site-gutter` as `clamp(16px, 4vw, 48px)` resolves to, at a viewport this wide. */
const gutter = (width: number) => Math.min(48, Math.max(16, 0.04 * width))

describe('the garment page’s column', () => {
  it('is 1200px of WORDS, with the gutters outside it: --site-max adds two gutters to it', () => {
    expect(declared(rules, '.page', '--site-max')).toBe('calc(1200px + 2 * var(--site-gutter))')
  })

  it('puts the content’s left edge where the stage’s is, at every width from 1296px up', () => {
    // The stage band centres 1200px: its padding is `max(--stage-gutter, (100% - 1200px) / 2)`
    // and --stage-gutter never passes 40px. `.content` is the --site-max box, centred, less its
    // padding of one --site-gutter.
    const stageGutter = (width: number) => Math.min(40, Math.max(20, 0.03 * width))
    // Read from the stylesheet, so this follows the CSS and not a copy of it: `1200px` alone, or
    // `calc(1200px + 2 * var(--site-gutter))`.
    const declaredMax = declared(rules, '.page', '--site-max') ?? ''
    const parsed = /^(?:calc\()?(\d+)px(?: \+ 2 \* var\(--site-gutter\)\))?$/.exec(declaredMax)
    expect(parsed, `--site-max "${declaredMax}" is a form this test can read`).not.toBeNull()
    const base = Number(parsed?.[1])
    const addsGutters = declaredMax.includes('--site-gutter')
    for (const width of [1296, 1366, 1440, 1536, 1920, 2560, 3840]) {
      const siteMax = base + (addsGutters ? 2 * gutter(width) : 0)
      const contentLeft = (width - Math.min(width, siteMax)) / 2 + gutter(width)
      const stageLeft = Math.max(stageGutter(width), (width - 1200) / 2)
      expect(contentLeft, `${width}px wide`).toBeCloseTo(stageLeft, 5)
    }
  })

  it('still centres the stage on the same 1200px', () => {
    // If the stage's measure moves, --site-max's 1200px must move with it.
    expect(
      declared(rules, '.stage-block', 'padding-inline', [
        '@media (min-width: 900px) and (orientation: landscape), (min-width: 700px) and (min-aspect-ratio: 3 / 2)',
      ]),
    ).toBe('max(var(--stage-gutter), calc((100% - 1200px) / 2))')
  })
})
