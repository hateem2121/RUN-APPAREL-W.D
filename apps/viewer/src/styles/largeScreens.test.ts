import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { TWO_COLUMN_QUERY } from '../lib/useIdentityInAside'

/**
 * VA-12 (visual audit, 2026-10-02): from 1920px the display headlines and the garment pages' stage
 * keep growing, and NOTHING below 1920px changes.
 *
 * What would have to break for these to fail: a size that moves at 1440 or 1919 (the pinned windows),
 * a jump at exactly 1920, growth that shrinks again, a rule that starts below 1920, the stage's two
 * numbers coming apart, or the page columns and the aside moving. The browsers' own answers are in
 * e2e/largeScreens.spec.ts (here and in apps/cms).
 *
 * HOW THE NUMBERS ARE GOT. A size here is a CSS expression (`clamp()`, `min()`, `max()`, `calc()`,
 * `var()`), and the test COMPUTES it from the stylesheet at a window size, rather than comparing a
 * string: the string can stay the same while an edit to something it reads moves the answer. The
 * evaluator below knows only what these rules use, THROWS on anything else, and is checked against
 * hand arithmetic first, so a misreading cannot pass as a pass.
 */

const REPO = join(import.meta.dirname, '..', '..', '..', '..')
const read = (path: string) => readFileSync(join(REPO, path), 'utf8')
const stripComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, ' '))

/** ---------------------------------------------------------------- the CSS, as rules */

type Rule = { at: string[]; selector: string; body: string }

/** Every rule that holds declarations, with the at-rule preludes around it, outermost first. */
function parseRules(css: string): Rule[] {
  const rules: Rule[] = []
  const stack: { prelude: string; hasChild: boolean; start: number }[] = []
  let from = 0
  for (let at = 0; at < css.length; at += 1) {
    const char = css[at]
    if (char === '{') {
      const parent = stack.at(-1)
      if (parent) parent.hasChild = true
      stack.push({ prelude: css.slice(from, at).trim(), hasChild: false, start: at + 1 })
      from = at + 1
    } else if (char === '}') {
      const block = stack.pop()
      if (block && !block.hasChild) {
        rules.push({
          at: stack.map((entry) => entry.prelude),
          selector: block.prelude.replace(/\s+/g, ' '),
          body: css.slice(block.start, at),
        })
      }
      from = at + 1
    } else if (char === ';') {
      from = at + 1
    }
  }
  return rules
}

const STYLESHEETS = {
  base: parseRules(stripComments(read('packages/ui/src/base.css'))),
  site: parseRules(stripComments(read('apps/cms/src/app/(frontend)/site.css'))),
  page: parseRules(stripComments(read('apps/viewer/src/styles/page.css'))),
}

type Window = { width: number; height: number; rem?: number }

/** Whether a media prelude holds in a window. Throws on a feature it does not know. */
function mediaHolds(prelude: string, window: Window): boolean {
  if (!prelude.startsWith('@media')) throw new Error(`not a media rule: ${prelude}`)
  const queries = prelude.slice('@media'.length).split(',')
  return queries.some((query) =>
    query
      .trim()
      .split(/\s+and\s+/)
      .every((part) => {
        const feature = part.trim()
        if (feature === 'screen' || feature === 'all') return true
        // A window on a screen is never paper (the print rules, polish F14).
        if (feature === 'print') return false
        const range = feature.match(/^\(\s*(min|max)-(width|height):\s*(\d+(?:\.\d+)?)px\s*\)$/)
        if (range) {
          const size = range[2] === 'width' ? window.width : window.height
          return range[1] === 'min' ? size >= Number(range[3]) : size <= Number(range[3])
        }
        const below = feature.match(/^\(\s*width\s*<\s*(\d+(?:\.\d+)?)px\s*\)$/)
        if (below) return window.width < Number(below[1])
        const aspect = feature.match(/^\(\s*min-aspect-ratio:\s*(\d+)\s*\/\s*(\d+)\s*\)$/)
        if (aspect) return window.width / window.height >= Number(aspect[1]) / Number(aspect[2])
        // Media Queries 4: landscape is wider than tall; a square window is portrait (polish F11
        // put the feature on the two-column query).
        const orientation = feature.match(/^\(\s*orientation:\s*(landscape|portrait)\s*\)$/)
        if (orientation) {
          const landscape = window.width > window.height
          return orientation[1] === 'landscape' ? landscape : !landscape
        }
        throw new Error(`a media feature this test does not know: ${feature}`)
      }),
  )
}

/** The value a property has for a selector in a window: the last declaration that holds. */
function valueAt(sheet: Rule[], selector: string, property: string, window: Window): string {
  let found: string | undefined
  for (const rule of sheet) {
    if (rule.selector !== selector) continue
    const match = rule.body.match(new RegExp(`(?:^|[;\\s])${property}:\\s*([^;]+);`))
    if (!match?.[1]) continue
    if (!rule.at.every((prelude) => mediaHolds(prelude, window))) continue
    found = match[1].replace(/\s+/g, ' ').trim()
  }
  if (found === undefined) throw new Error(`${selector} has no ${property} at ${window.width}px`)
  return found
}

/** ------------------------------------------------------------ the CSS maths, evaluated */

type Context = { window: Window; percentOf: number; vars: Record<string, string> }

/** A length in px. Only what these rules use; anything else throws. */
function evaluate(expression: string, context: Context): number {
  const tokens = expression.match(
    /[a-z-]+\(|--[\w-]+|-?\d*\.?\d+(?:px|rem|vw|vh|svh|lvh|dvh|%)?|[()+\-*/,]/gi,
  )
  if (!tokens || tokens.join('').length < expression.replace(/\s+/g, '').length) {
    throw new Error(`cannot read "${expression}"`)
  }
  let at = 0
  const next = () => tokens[at++] as string
  const peek = () => tokens[at]

  function unit(token: string): number {
    const parsed = token.match(/^(-?\d*\.?\d+)(px|rem|vw|vh|svh|lvh|dvh|%)?$/i)
    if (!parsed) throw new Error(`cannot read "${token}" in "${expression}"`)
    const value = Number(parsed[1])
    const { width, height, rem = 16 } = context.window
    switch (parsed[2]) {
      case undefined:
      case 'px':
        return value
      case 'rem':
        return value * rem
      case 'vw':
        return (value * width) / 100
      case 'vh':
      case 'svh':
      case 'lvh':
      case 'dvh':
        return (value * height) / 100
      default:
        return (value * context.percentOf) / 100
    }
  }

  function list(): number[] {
    const values = [sum()]
    while (peek() === ',') {
      next()
      values.push(sum())
    }
    return values
  }

  function factor(): number {
    const token = next()
    if (token === '(') {
      const value = sum()
      if (next() !== ')') throw new Error(`unbalanced "(" in "${expression}"`)
      return value
    }
    if (token.endsWith('(')) {
      const name = token.slice(0, -1).toLowerCase()
      // `var()` and `env()` were replaced by their text before this ran (see `resolve`).
      if (name === 'env' || name === 'var') throw new Error(`${name}() was not resolved first`)
      const values = list()
      if (next() !== ')') throw new Error(`unbalanced "${name}(" in "${expression}"`)
      switch (name) {
        case 'calc':
          return values[0] as number
        case 'min':
          return Math.min(...values)
        case 'max':
          return Math.max(...values)
        case 'clamp':
          return Math.max(values[0] as number, Math.min(values[1] as number, values[2] as number))
        default:
          throw new Error(`a function this test does not know: ${name}() in "${expression}"`)
      }
    }
    return unit(token)
  }

  function product(): number {
    let value = factor()
    while (peek() === '*' || peek() === '/') {
      const operator = next()
      const other = factor()
      value = operator === '*' ? value * other : value / other
    }
    return value
  }

  function sum(): number {
    let value = product()
    while (peek() === '+' || peek() === '-') {
      const operator = next()
      const other = product()
      value = operator === '+' ? value + other : value - other
    }
    return value
  }

  const value = sum()
  if (at !== tokens.length) throw new Error(`leftover "${tokens.slice(at).join(' ')}"`)
  return value
}

/**
 * `var(--x)` and `env(name, fallback)` are replaced by text BEFORE evaluating, because both read a
 * name the tokenizer would otherwise have to know. A variable is looked up in `vars`; an `env()` is
 * its fallback (a desktop has no safe-area inset).
 */
function resolve(expression: string, vars: Record<string, string>): string {
  let text = expression
  for (let pass = 0; pass < 8 && /var\(|env\(/.test(text); pass += 1) {
    text = text
      .replace(/env\(\s*[a-z-]+\s*,\s*([^)]+)\)/gi, '$1')
      .replace(/var\(\s*(--[\w-]+)\s*\)/gi, (_, name: string) => {
        const value = vars[name]
        if (value === undefined) throw new Error(`${name} is not defined in "${expression}"`)
        return `(${value})`
      })
  }
  return text
}

const px = (
  expression: string,
  window: Window,
  percentOf = window.width,
  vars: Record<string, string> = {},
) => evaluate(resolve(expression, vars), { window, percentOf, vars })

describe('the evaluator reads CSS the way a browser does (checked before anything relies on it)', () => {
  const at = (width: number, height = 900, rem = 16): Window => ({ width, height, rem })
  it('knows the arithmetic these rules use, against hand-worked values', () => {
    expect(px('clamp(2.125rem, 5.4vw, 4.5rem)', at(1440))).toBeCloseTo(72, 6)
    expect(px('clamp(2.125rem, 5.4vw, 4.5rem)', at(390))).toBeCloseTo(34, 6)
    expect(px('clamp(2.125rem, 5.4vw, 4.5rem)', at(600))).toBeCloseTo(34, 6)
    expect(px('clamp(min(2.125rem, 9.6vw), 5.4vw, 4.5rem)', at(320))).toBeCloseTo(30.72, 6)
    expect(px('calc((100% - 1200px) / 2)', at(1440))).toBe(120)
    expect(px('max(4.5rem, min(3.75vw, 9rem))', at(2560))).toBeCloseTo(96, 6)
    expect(px('max(4.5rem, min(3.75vw, 9rem))', at(2560, 1440, 20))).toBeCloseTo(96, 6)
    expect(px('max(4.5rem, min(3.75vw, 9rem))', at(1920, 1080, 20))).toBeCloseTo(90, 6)
    expect(px('max(var(--g), 3px)', at(1000), 1000, { '--g': 'clamp(20px, 3vw, 40px)' })).toBe(30)
    expect(px('max(20px, env(safe-area-inset-left, 0px))', at(1000))).toBe(20)
  })

  it('refuses what it does not know, instead of guessing', () => {
    expect(() => px('round(1.5px, 1px)', at(1000))).toThrow(/does not know/)
    expect(() => px('4em', at(1000))).toThrow()
    expect(() => px('var(--nothing)', at(1000))).toThrow(/not defined/)
    expect(() => mediaHolds('@media (hover: none)', at(1000))).toThrow(/does not know/)
  })

  it('reads media preludes: AND inside a query, OR across commas', () => {
    expect(mediaHolds('@media (min-width: 900px)', at(900))).toBe(true)
    expect(mediaHolds('@media (min-width: 900px)', at(899))).toBe(false)
    expect(mediaHolds('@media (width < 720px)', at(719))).toBe(true)
    expect(
      mediaHolds(
        '@media (min-width: 900px), (min-width: 700px) and (min-aspect-ratio: 3 / 2)',
        at(844, 390),
      ),
    ).toBe(true)
    expect(
      mediaHolds(
        '@media (min-width: 900px), (min-width: 700px) and (min-aspect-ratio: 3 / 2)',
        at(768, 1024),
      ),
    ).toBe(false)
  })
})

/** ----------------------------------------------------------------- what the CSS computes */

const sizes = (window: Window) => {
  const gutterVars = {} as Record<string, string>
  for (const rule of STYLESHEETS.page) {
    if (rule.selector !== '.stage-block') continue
    if (!rule.at.every((prelude) => mediaHolds(prelude, window))) continue
    for (const match of rule.body.matchAll(/(--[\w-]+):\s*([^;]+);/g)) {
      gutterVars[match[1] as string] = (match[2] as string).replace(/\s+/g, ' ').trim()
    }
  }
  const paddingExpression = valueAt(STYLESHEETS.page, '.stage-block', 'padding-inline', window)
  const padding = px(paddingExpression, window, window.width, gutterVars)
  const gutter = px('var(--stage-gutter)', window, window.width, gutterVars)
  const content = window.width - 2 * padding
  const aside = px(
    valueAt(STYLESHEETS.page, '.stage__aside', 'flex', window).replace(/^0 1 /, ''),
    window,
    content,
    gutterVars,
  )
  const cap = px(valueAt(STYLESHEETS.page, '.stage__canvas', 'max-height', window), window)
  return {
    hero: px(valueAt(STYLESHEETS.base, '.display--hero', 'font-size', window), window),
    section: px(valueAt(STYLESHEETS.base, '.display--section', 'font-size', window), window),
    siteHero: px(
      valueAt(STYLESHEETS.site, '.site-hero .display--hero', 'font-size', window),
      window,
    ),
    measure: content,
    canvasWidth: content - aside - gutter,
    canvasCap: cap,
  }
}

const rounded = (value: number) => Math.round(value * 100) / 100

describe('nothing below 1920px changes: the sizes today, pinned at 1440 and 1919', () => {
  for (const window of [
    { width: 1440, height: 900 },
    { width: 1919, height: 1080 },
    { width: 1919, height: 1440 },
    { width: 1600, height: 900 },
  ]) {
    it(`${window.width}x${window.height}: hero 72px, section 46px, a 1200px stage measure, an 800px canvas, a 980px cap`, () => {
      const now = sizes(window)
      expect(rounded(now.hero)).toBe(72)
      expect(rounded(now.section)).toBe(46)
      expect(rounded(now.siteHero)).toBe(72)
      expect(rounded(now.measure)).toBe(1200)
      expect(rounded(now.canvasWidth)).toBe(800)
      expect(rounded(now.canvasCap)).toBe(980)
    })
  }

  it('also at a 20px root, where the rem ceilings are 90px and 57.5px (they bind from 1667px)', () => {
    const now = sizes({ width: 1919, height: 1080, rem: 20 })
    expect(rounded(now.hero)).toBe(90)
    expect(rounded(now.section)).toBe(57.5)
    // At 1440 the hero's vw term is still the smaller, with a 20px root as with a 16px one.
    expect(rounded(sizes({ width: 1440, height: 900, rem: 20 }).hero)).toBe(77.76)
  })
})

describe('from 1920px they grow, continuously, and stop at the 4K size', () => {
  it('is exactly what it was at 1920x1080 (no step at the seam)', () => {
    const edge = sizes({ width: 1920, height: 1080 })
    expect(rounded(edge.hero)).toBe(72)
    expect(rounded(edge.section)).toBeCloseTo(46, 1)
    expect(rounded(edge.siteHero)).toBe(72)
    expect(rounded(edge.measure)).toBe(1200)
    expect(rounded(edge.canvasWidth)).toBe(800)
    expect(rounded(edge.canvasCap)).toBeCloseTo(980, 0)
  })

  it('gives the sizes the audit asked for at 2560x1440 and 3840x2160', () => {
    const qhd = sizes({ width: 2560, height: 1440 })
    expect(rounded(qhd.hero)).toBe(96)
    expect(rounded(qhd.siteHero)).toBe(96)
    expect(rounded(qhd.section)).toBeCloseTo(61.33, 1)
    expect(rounded(qhd.measure)).toBe(1600)
    expect(rounded(qhd.canvasWidth)).toBe(1160)
    expect(qhd.canvasCap).toBeGreaterThan(980)

    const uhd = sizes({ width: 3840, height: 2160 })
    expect(rounded(uhd.hero)).toBe(144)
    expect(rounded(uhd.section)).toBe(92)
    expect(rounded(uhd.measure)).toBe(2400)
    expect(rounded(uhd.canvasWidth)).toBe(1960)
    expect(rounded(uhd.canvasCap)).toBe(1960)
  })

  it('never shrinks as the window grows, and is never below today’s ceiling', () => {
    let before = sizes({ width: 1920, height: 1080 })
    for (let width = 1960; width <= 3840; width += 40) {
      const height = Math.round((width * 9) / 16)
      const now = sizes({ width, height })
      for (const key of [
        'hero',
        'section',
        'siteHero',
        'measure',
        'canvasWidth',
        'canvasCap',
      ] as const) {
        expect(now[key], `${key} shrank at ${width}x${height}`).toBeGreaterThanOrEqual(
          before[key] - 1e-9,
        )
      }
      expect(now.hero).toBeGreaterThanOrEqual(72)
      expect(now.section).toBeGreaterThanOrEqual(46 - 0.01)
      before = now
    }
  })

  it('is no smaller than before at a larger text size: the rem ceiling stays underneath', () => {
    for (const width of [1920, 2560, 3840]) {
      const now = sizes({ width, height: Math.round((width * 9) / 16), rem: 20 })
      expect(now.hero).toBeGreaterThanOrEqual(90)
      expect(now.section).toBeGreaterThanOrEqual(57.5 - 0.01)
    }
  })

  it('stops at 3840px: a window twice as wide as 4K is no bigger than 4K', () => {
    const uhd = sizes({ width: 3840, height: 2160 })
    const huge = sizes({ width: 7680, height: 4320 })
    for (const key of [
      'hero',
      'section',
      'siteHero',
      'measure',
      'canvasWidth',
      'canvasCap',
    ] as const) {
      expect(huge[key], key).toBeCloseTo(uhd[key], 1)
    }
  })

  it('does not grow a wide window that is only 1080px tall: the garment is limited by height', () => {
    const wide = sizes({ width: 2560, height: 1080 })
    expect(rounded(wide.measure)).toBe(1200)
    expect(rounded(wide.canvasWidth)).toBe(800)
    // Its headline still grows: type has no such limit.
    expect(rounded(wide.hero)).toBe(96)
  })

  it('grows a 16:10 and an ultrawide screen by their height, not their width', () => {
    expect(rounded(sizes({ width: 2560, height: 1600 }).measure)).toBe(1600)
    expect(rounded(sizes({ width: 3440, height: 1440 }).measure)).toBeCloseTo(1600, 1)
  })
})

describe('what the change touches and what it leaves', () => {
  const gates = (sheet: Rule[], selector: string, property: string) =>
    sheet
      .filter(
        (rule) =>
          rule.selector === selector && new RegExp(`(?:^|[;\\s])${property}:`).test(rule.body),
      )
      // Whitespace collapsed: Biome wraps a long media query over two lines (polish F11).
      .map((rule) => rule.at.map((at) => at.replace(/\s+/g, ' ')).join(' / ') || 'always')

  it('every new rule is behind min-width 1920px, beside the untouched old one', () => {
    expect(gates(STYLESHEETS.base, '.display--hero', 'font-size')).toEqual([
      'always',
      '@media (min-width: 1920px)',
    ])
    expect(gates(STYLESHEETS.base, '.display--section', 'font-size')).toEqual([
      'always',
      '@media (min-width: 1920px)',
    ])
    expect(gates(STYLESHEETS.site, '.site-hero .display--hero', 'font-size')).toEqual([
      'always',
      '@media (min-width: 1920px)',
    ])
    // The portrait gate is polish F11 (2026-10-04), not this change: an upright tablet's garment
    // window is a fixed share of its screen, so its cap is released there. The print gate is
    // polish F14: on paper the window is a fixed size.
    expect(gates(STYLESHEETS.page, '.stage__canvas', 'max-height')).toEqual([
      '@media (min-width: 900px)',
      '@media (min-width: 700px) and (orientation: portrait)',
      '@media (min-width: 1920px)',
      '@media print',
    ])
    expect(gates(STYLESHEETS.page, '.stage-block', 'padding-inline')).toEqual([
      `@media ${TWO_COLUMN_QUERY}`,
      '@media (min-width: 1920px)',
    ])
  })

  it('leaves the two old clamp() rules and the old stage numbers exactly as they were', () => {
    const window = { width: 1440, height: 900 }
    expect(valueAt(STYLESHEETS.base, '.display--hero', 'font-size', window)).toBe(
      'clamp(2.125rem, 5.4vw, 4.5rem)',
    )
    expect(valueAt(STYLESHEETS.base, '.display--section', 'font-size', window)).toBe(
      'clamp(1.625rem, 4vw, 2.875rem)',
    )
    expect(valueAt(STYLESHEETS.site, '.site-hero .display--hero', 'font-size', window)).toBe(
      'clamp(min(2.125rem, 9.6vw), 5.4vw, 4.5rem)',
    )
    expect(valueAt(STYLESHEETS.page, '.stage__canvas', 'max-height', window)).toBe('980px')
    expect(valueAt(STYLESHEETS.page, '.stage-block', 'padding-inline', window)).toBe(
      'max(var(--stage-gutter), calc((100% - 1200px) / 2))',
    )
  })

  it('leaves the page columns, the aside and its product name alone', () => {
    const above = { width: 2560, height: 1440 }
    expect(valueAt(STYLESHEETS.page, '.stage__aside', 'flex', above)).toBe(
      '0 1 clamp(260px, 30%, 400px)',
    )
    expect(
      valueAt(STYLESHEETS.page, '.product-info--aside .display--hero', 'font-size', above),
    ).toBe('clamp(1.5625rem, 9.5cqi, 2.5rem)')
    expect(
      valueAt(STYLESHEETS.page, '.stage__inner', 'max-width', { width: 800, height: 900 }),
    ).toBe('1200px')
    // No rule at 1920px or wider names the content column or the aside.
    for (const rule of STYLESHEETS.page) {
      if (!rule.at.some((prelude) => prelude.includes('1920px'))) continue
      expect(['.stage-block', '.stage__canvas'], `${rule.selector} moves at 1920px`).toContain(
        rule.selector,
      )
    }
  })

  it('uses the new tracking token, which is the tightness both px tokens give at the 1920 sizes', () => {
    const tokens = stripComments(read('packages/ui/src/tokens.css'))
    expect(tokens).toMatch(/--tracking-display-large:\s*-0\.03em;/)
    const hero = 72 * -0.03
    const section = 46 * -0.03
    // -2.16px and -1.38px: where --tracking-display-lg and -sm bottom out, from about 1350px.
    expect(hero).toBeCloseTo(-2.16, 6)
    expect(section).toBeCloseTo(-1.38, 6)
    for (const selector of ['.display--hero', '.display--section']) {
      expect(
        valueAt(STYLESHEETS.base, selector, 'letter-spacing', { width: 2560, height: 1440 }),
      ).toBe('var(--tracking-display-large)')
      expect(
        valueAt(STYLESHEETS.base, selector, 'letter-spacing', { width: 1919, height: 1080 }),
      ).not.toBe('var(--tracking-display-large)')
    }
  })
})
