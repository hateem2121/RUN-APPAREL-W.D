import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  compositeOver,
  contrastRatio,
  parseCssColour,
  relativeLuminance,
} from '../../../../scripts/contrast-rules.mjs'
import { BAR_AUTOHIDE_QUERY } from '../lib/barAutoHide'

/**
 * VA-40 (visual audit, 2026-10-02) in the stylesheet: the bar's HAIRLINE, and the rule by which a
 * page's bar LEAVES. Read as text because the two things that must not break are numbers and
 * contracts, and neither shows in a unit render: the hairline must be visible over a dark photograph
 * and must not look heavier on a light page, and the leaving rule must name the same phone as the
 * script that sets it, keep the status strip where it is, and take nothing but `transform` and
 * `visibility`. The motion itself is measured in a browser: e2e/barAutoHide.spec.ts.
 */

const REPO = join(import.meta.dirname, '..', '..', '..', '..')
const read = (path: string) => readFileSync(join(REPO, path), 'utf8')
const stripComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, ' '))

const NOTCH = stripComments(read('packages/ui/src/notch.css'))
const TOKENS = stripComments(read('packages/ui/src/tokens.css'))
const BASE = stripComments(read('packages/ui/src/base.css'))

/** The declaration block of the first rule whose selector is exactly `selector`. */
function ruleBody(css: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const found = css.match(new RegExp(`(?:^|[}\\s,])${escaped}\\s*\\{([^}]*)\\}`))
  expect(found, `no rule for ${selector}`).not.toBeNull()
  return found?.[1] ?? ''
}

/** A declaration's value out of a block, whitespace collapsed. */
function declaration(body: string, property: string): string | undefined {
  const found = body.match(new RegExp(`(?:^|[;\\s])${property}:\\s*([^;]+);`))
  return found?.[1]?.replace(/\s+/g, ' ').trim()
}

/** A `transition` list as its entries. */
const entries = (list: string | undefined) =>
  (list ?? '').split(/,(?![^(]*\))/).map((e) => e.trim())

const rgb = (hex: string) => parseCssColour(hex).rgb
const token = (name: string) => TOKENS.match(new RegExp(`${name}:\\s*([^;]+);`))?.[1]?.trim() ?? ''

describe('the hairline', () => {
  // `--notch-edge: light-dark(color-mix(… var(--paper) 22%, transparent), color-mix(… 12% …))`
  const percents = [
    ...(declaration(ruleBody(NOTCH, '.notch-shell'), '--notch-edge') ?? '').matchAll(
      /color-mix\(in srgb, var\(--paper\) (\d+)%, transparent\)/g,
    ),
  ].map((match) => Number(match[1]))
  const [lightTheme, darkTheme] = percents
  const paper = rgb(token('--paper'))
  const [lightPage, darkPage] = (token('--bg').match(/#[0-9a-f]{6}/gi) ?? []).map(rgb)
  const [, darkBar] = (token('--raised').match(/#[0-9a-f]{6}/gi) ?? []).map(rgb)
  /** A dark photograph under the bar: the website's hero, near black with a green cast. */
  const DARK_PHOTO = rgb('#202420')
  const ringOver = (percent: number | undefined, under: number[]) =>
    compositeOver(paper, (percent ?? 0) / 100, under)

  it('is a paper-coloured ring in two strengths, the light theme the stronger', () => {
    expect(
      percents,
      '--notch-edge is not light-dark(color-mix(paper N%), color-mix(paper N%))',
    ).toHaveLength(2)
    expect(lightTheme).toBeGreaterThan(darkTheme ?? 100)
  })

  it('shows over a dark photograph in the light theme, where the bar vanished', () => {
    expect(contrastRatio(ringOver(lightTheme, DARK_PHOTO), DARK_PHOTO)).toBeGreaterThanOrEqual(1.5)
  })

  it('still shows over a dark photograph in the dark theme', () => {
    expect(contrastRatio(ringOver(darkTheme, DARK_PHOTO), DARK_PHOTO)).toBeGreaterThanOrEqual(1.2)
  })

  it('is paper on paper over a light page, so it cannot look heavier there', () => {
    expect(
      contrastRatio(ringOver(lightTheme, lightPage as number[]), lightPage as number[]),
    ).toBeLessThanOrEqual(1.02)
  })

  it('is no lighter than the bar itself over the dark page: an outline, not a glow', () => {
    const ring = ringOver(darkTheme, darkPage as number[])
    expect(relativeLuminance(ring)).toBeLessThanOrEqual(relativeLuminance(darkBar as number[]))
  })

  it('is the FIRST shadow, over the soft one, and the soft one stays', () => {
    const shadows = entries(declaration(ruleBody(NOTCH, '.notch'), 'box-shadow'))
    expect(shadows).toEqual(['0 0 0 1px var(--notch-edge)', 'var(--shadow-raised)'])
  })

  it('is gone on paper, with the pill it outlines', () => {
    const print = NOTCH.slice(NOTCH.lastIndexOf('@media print'))
    expect(declaration(ruleBody(print, '.notch-shell'), '--notch-edge')).toBe('transparent')
  })
})

describe('the bar leaves', () => {
  const HIDE = /@media ([^{]+)\{\s*\.notch-shell\[data-bar-hidden\] \.notch\s*\{([^}]*)\}/
  const found = NOTCH.match(HIDE)
  const query = found?.[1]?.trim()
  const body = found?.[2] ?? ''
  const base = entries(declaration(ruleBody(NOTCH, '.notch'), 'transition'))
  const leaving = entries(declaration(body, 'transition'))

  it('is one rule, in the phone query the script holds, for screens only', () => {
    expect(found, 'no `.notch-shell[data-bar-hidden] .notch` rule in a media query').not.toBeNull()
    expect(query).toBe(BAR_AUTOHIDE_QUERY)
    expect(BAR_AUTOHIDE_QUERY.startsWith('screen and ')).toBe(true)
  })

  it('names the phone the status strip names (VA-50): one definition of a phone', () => {
    const strip = NOTCH.match(/@media (\(width < 720px\) and \(hover: none\))\s*\{\s*\.notch-strip/)
    expect(strip?.[1], 'the strip no longer has the query this one is built on').toBeDefined()
    expect(BAR_AUTOHIDE_QUERY.endsWith(strip?.[1] ?? '?')).toBe(true)
  })

  it('moves the bar with a transform clear of its shadow, and takes nothing but that and visibility', () => {
    expect(declaration(body, 'transform')).toBe('translateY(calc(-100% - var(--notch-away)))')
    expect(declaration(body, 'visibility')).toBe('hidden')
    const properties = [...body.matchAll(/(?:^|[;\s])([a-z-]+):/g)].map((match) => match[1])
    expect(properties.sort()).toEqual(['transform', 'transition', 'visibility'])
  })

  it('goes far enough: --notch-away clears the shadow below the bar and the hairline', () => {
    const away = Number.parseFloat(NOTCH.match(/--notch-away:\s*([^;]+);/)?.[1] ?? '')
    // `--shadow-raised: light-dark(0 8px 24px …, 0 8px 24px …)`: x 0, then 8 down and 24 of blur.
    const shadow = token('--shadow-raised').match(/\b0 (\d+)px (\d+)px/)
    expect(shadow, 'could not read --shadow-raised').not.toBeNull()
    const reach = Number(shadow?.[1]) + Number(shadow?.[2]) + 1
    expect(away).toBeGreaterThanOrEqual(reach)
  })

  it('animates on --ui and --ease, and visibility waits going out and not coming back', () => {
    expect(base).toContain('transform var(--ui) var(--ease)')
    expect(base).toContain('visibility var(--ui) step-start')
    expect(leaving).toContain('transform var(--ui) var(--ease)')
    expect(leaving).toContain('visibility var(--ui) step-end')
    // The leaving list is the base list with only `visibility`'s timing changed.
    const without = (list: string[]) => list.filter((entry) => !entry.startsWith('visibility'))
    expect(without(leaving)).toEqual(without(base))
  })

  it('leaves the status strip alone: only the bar moves, the strip is the shell’s other child (VA-50)', () => {
    for (const [file, css] of [
      ['notch.css', NOTCH],
      ['page.css', stripComments(read('apps/viewer/src/styles/page.css'))],
    ] as const) {
      for (const match of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        const selector = (match[1] ?? '').trim()
        const text = match[2] ?? ''
        if (/\.notch-strip/.test(selector)) {
          expect(selector, `${file}: the strip's rule knows about the hidden bar`).not.toContain(
            'data-bar-hidden',
          )
        }
        // A transform on the shell would carry the fixed strip away with the bar.
        if (/^\.notch-shell(\[[^\]]*\])*$/.test(selector.replace(/^.*>\s*/, '').trim())) {
          expect(text, `${file}: ${selector} moves the shell, and the strip with it`).not.toMatch(
            /(?:^|[;\s])(?:transform|translate|scale|rotate|filter|perspective|contain):/,
          )
        }
      }
    }
  })

  it('is opt-in: the website never sets the attribute, so its bar is as it was', () => {
    const offenders: string[] = []
    const walk = (dir: string) => {
      for (const entry of readdirSync(join(REPO, dir), { withFileTypes: true })) {
        const path = join(dir, entry.name)
        if (entry.isDirectory()) {
          if (entry.name !== 'node_modules' && entry.name !== '.next') walk(path)
        } else if (/\.(tsx?|css|mjs)$/.test(entry.name) && read(path).includes('data-bar-hidden')) {
          offenders.push(path)
        }
      }
    }
    walk('apps/cms/src')
    expect(offenders).toEqual([])
  })

  it('is instant under reduced motion, because the shared rule reaches every transition and delay', () => {
    const rule =
      BASE.match(
        /@media \(prefers-reduced-motion: reduce\)\s*\{\s*\*,\s*\*::before,\s*\*::after\s*\{([^}]*)\}/,
      )?.[1] ?? ''
    expect(rule, 'the universal reduced-motion rule is gone').not.toBe('')
    expect(rule).toMatch(/transition-duration:\s*0\.01ms\s*!important/)
    expect(rule).toMatch(/transition-delay:\s*0s\s*!important/)
  })
})
