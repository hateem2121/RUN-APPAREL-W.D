import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { BAR_AUTOHIDE_QUERY } from '../lib/barAutoHide'

/**
 * The bar's EDGE and the rule by which a page's bar LEAVES (VA-40, visual audit 2026-10-02), read
 * as text because what must not break is a contract, and no unit render shows it. The edge is the
 * soft shadow alone since polish D12 (2026-10-04, the owner's choice): VA-40's 1px outline is gone.
 * The leaving rule must name the same phone as the script that sets it, keep the status strip where
 * it is, and take nothing but `transform` and `visibility`. The motion itself is measured in a
 * browser: e2e/barAutoHide.spec.ts.
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

const token = (name: string) => TOKENS.match(new RegExp(`${name}:\\s*([^;]+);`))?.[1]?.trim() ?? ''

describe("the bar's edge (the owner's choice, polish D12)", () => {
  it('is the soft shadow alone, with no outline ring', () => {
    const shadows = entries(declaration(ruleBody(NOTCH, '.notch'), 'box-shadow'))
    expect(shadows).toEqual(['var(--shadow-raised)'])
  })

  it('leaves no outline token behind for a later rule to pick up', () => {
    expect(NOTCH).not.toMatch(/--notch-edge/)
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

  it('goes far enough: --notch-away clears the shadow below the bar, with a pixel to spare', () => {
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
