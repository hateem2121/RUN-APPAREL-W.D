import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { contrastOf } from '../../../scripts/contrast-rules.mjs'
import {
  extractLeafRules,
  findLayoutPropertyTransitions,
  LAYOUT_TRANSITION_ALLOW_LIST,
} from '../../../scripts/served-css-motion-probe.mjs'

/**
 * Source guards for the polish fixes of the 2026-10-02 visual audit (VA-08, VA-16, VA-18, VA-19,
 * VA-43, VA-46, VA-47). Each `describe` carries its audit ID, so a future reader can find the
 * measurement it came from.
 *
 * ⚠️ THESE READ STYLESHEETS, AND A STYLESHEET CANNOT SAY HOW A BROWSER DRAWS IT. What each one
 * holds is the decision the fix made (a property, a token, a unit), with a negative control that
 * shows the reader can SEE the fault it guards; the drawn half is measured in a real browser in
 * `apps/cms/e2e/` (consent.spec.ts, navbar.spec.ts, composition.spec.ts, pages.spec.ts).
 */

const REPO_ROOT = join(import.meta.dirname, '..', '..', '..')

/** A stylesheet with its comments removed, so prose about a property is never mistaken for one. */
const css = (...parts: string[]) =>
  readFileSync(join(REPO_ROOT, ...parts), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')

const BASE = css('packages', 'ui', 'src', 'base.css')
const TOKENS = css('packages', 'ui', 'src', 'tokens.css')
const NOTCH = css('packages', 'ui', 'src', 'notch.css')
const SITE = css('apps', 'cms', 'src', 'app', '(frontend)', 'site.css')

interface Rule {
  /** The headers of the at-rules this rule sits inside, outermost first. */
  at: string[]
  selector: string
  declarations: Map<string, string>
}

/** Every leaf rule of a stylesheet, with the at-rules around it. Brace-balanced, so `@media` nests. */
function rulesOf(source: string, at: string[] = []): Rule[] {
  const out: Rule[] = []
  let pos = 0
  while (pos < source.length) {
    const open = source.indexOf('{', pos)
    if (open === -1) break
    const header = source.slice(pos, open).trim()
    let depth = 1
    let close = open + 1
    for (; close < source.length && depth > 0; close++) {
      if (source[close] === '{') depth++
      else if (source[close] === '}') depth--
    }
    const body = source.slice(open + 1, close - 1)
    if (body.includes('{')) {
      out.push(...rulesOf(body, [...at, header]))
    } else {
      const declarations = new Map<string, string>()
      for (const part of body.split(';')) {
        const colon = part.indexOf(':')
        if (colon === -1) continue
        declarations.set(part.slice(0, colon).trim(), part.slice(colon + 1).trim())
      }
      out.push({ at, selector: header.replace(/\s+/g, ' '), declarations })
    }
    pos = close
  }
  return out
}

/** The declarations of every rule with exactly this selector and no at-rule around it, merged. */
function topLevel(source: string, selector: string): Map<string, string> {
  const merged = new Map<string, string>()
  for (const rule of rulesOf(source)) {
    if (rule.at.length === 0 && rule.selector === selector) {
      for (const [property, value] of rule.declarations) merged.set(property, value)
    }
  }
  return merged
}

type Mode = 'light' | 'dark'

/** A token's colour in one theme: nested `var()` followed, `light-dark()` taken apart. */
function resolveToken(tokens: string, name: string, mode: Mode): string {
  const raw = new RegExp(`${name}\\s*:\\s*([^;]+);`).exec(tokens)?.[1]?.trim()
  if (!raw) throw new Error(`${name} is not defined in tokens.css`)
  let value = raw
  for (let round = 0; round < 6 && value.includes('var('); round++) {
    value = value.replace(/var\(\s*(--[\w-]+)\s*\)/g, (_whole, nested: string) => {
      const inner = new RegExp(`${nested}\\s*:\\s*([^;]+);`).exec(tokens)?.[1]?.trim()
      if (!inner) throw new Error(`${nested} is not defined in tokens.css`)
      return inner
    })
  }
  const pair = /^light-dark\(\s*([^,()]+?)\s*,\s*([^,()]+?)\s*\)$/.exec(value)
  const colour = pair ? pair[mode === 'light' ? 1 : 2] : value
  if (!colour || !/^#[0-9a-f]{6}$/i.test(colour)) {
    throw new Error(`${name} did not resolve to a hex colour in ${mode} mode: ${value}`)
  }
  return colour
}

/** `var(--token)` and nothing else (a raw fallback is a raw value in a token's clothes). */
const bareToken = (value: string | undefined) => /^var\(\s*(--[\w-]+)\s*\)$/.exec(value ?? '')?.[1]

/** The four surfaces anything on the site sits on, in both themes. */
const GROUNDS = ['--bg', '--surface', '--wash', '--raised'] as const

describe('VA-16 — native controls draw in the brand, not the system blue', () => {
  /** What a control's state needs against the ground it sits on (WCAG 1.4.11). */
  const FLOOR = 3

  /** Everything wrong with the two declarations on <html>, as sentences. */
  function failuresOf(html: Map<string, string>, tokens = TOKENS): string[] {
    const failures: string[] = []
    for (const property of ['accent-color', 'caret-color']) {
      const token = bareToken(html.get(property))
      if (!token) {
        failures.push(`${property} is not set to a bare var(--token) on <html>`)
        continue
      }
      for (const mode of ['light', 'dark'] as const) {
        for (const ground of GROUNDS) {
          const ratio = contrastOf(
            resolveToken(tokens, token, mode),
            resolveToken(tokens, ground, mode),
          )
          if (ratio < FLOOR) {
            failures.push(
              `${property}: ${token} on ${ground} in ${mode} mode is ${ratio.toFixed(2)}:1, under ${FLOOR}:1`,
            )
          }
        }
      }
    }
    return failures
  }

  it('sets accent-color and caret-color once on <html>, from tokens that clear 3:1 on every ground in both themes', () => {
    const html = topLevel(BASE, 'html')
    expect(failuresOf(html)).toEqual([])
  })

  it('names the two tokens the audit measured: the text colour for the cursor, the primary fill for the tick', () => {
    const html = topLevel(BASE, 'html')
    expect(bareToken(html.get('caret-color'))).toBe('--text')
    expect(bareToken(html.get('accent-color'))).toBe('--btn-primary-bg')
  })

  // NEGATIVE CONTROLS: the reader must be able to see each fault it guards, or a pass means
  // nothing. The brand's volt as the accent is the tempting mistake: 1.03-1.27:1 on the light grounds.
  it('sees the fault: volt as the accent is invisible on the light grounds', () => {
    const planted = new Map([
      ['accent-color', 'var(--volt)'],
      ['caret-color', 'var(--text)'],
    ])
    const failures = failuresOf(planted)
    expect(failures.length).toBeGreaterThan(0)
    expect(
      failures.every((line) => line.startsWith('accent-color: --volt') && line.includes('light')),
    ).toBe(true)
  })

  it('sees the fault: a missing property, and a raw value, are both reported', () => {
    expect(failuresOf(new Map([['caret-color', 'var(--text)']]))).toEqual([
      'accent-color is not set to a bare var(--token) on <html>',
    ])
    expect(
      failuresOf(
        new Map([
          ['accent-color', 'var(--btn-primary-bg)'],
          ['caret-color', '#1d1f1a'],
        ]),
      ),
    ).toEqual(['caret-color is not set to a bare var(--token) on <html>'])
  })
})

describe("VA-18 — the cookie card's sentence has a line length of its own", () => {
  /**
   * `ch` is the width of a zero: 7.475px in Archivo at 13px, computed from the font's advance
   * widths on 2026-10-02. The sentence sets about 1.25 characters per `ch` on its full lines, so:
   * 60ch (the page-wide `p` cap it inherited) holds 75-79 characters, past the 45-75 that reads
   * comfortably; 59ch is the 75 that `legibility.spec.ts` holds the site's prose to; and under 48ch
   * the sentence is four lines tall instead of three. The cap sits between the two, with room
   * either side for kerning and the engines' small differences.
   *
   * ⚠️ THE BAND MOVED ON 2026-10-04, WITH THE SENTENCE: naming PostHog took it from 155 to 199
   * characters. MEASURED then in the viewer suite's four engines (base.css has the figures): 54ch
   * now sets "notice" alone on a fourth line, 56-58ch keep three lines of 68-73 characters, and
   * 60ch runs 76-77. A band computed for one sentence is wrong for the next; re-measure when the
   * words change.
   */
  const CEILING_CH = 58
  const FLOOR_CH = 56

  function problemsWith(cap: string | undefined): string[] {
    const match = /^(\d+(?:\.\d+)?)ch$/.exec(cap ?? '')
    if (!match) return [`max-inline-size is ${cap ?? 'missing'}, not a number of ch`]
    const ch = Number(match[1])
    const problems: string[] = []
    if (ch > CEILING_CH) {
      problems.push(`${ch}ch is over ${CEILING_CH}ch: lines past the 75-character ceiling`)
    }
    if (ch < FLOOR_CH) {
      problems.push(`${ch}ch is under ${FLOOR_CH}ch: the sentence tips to four lines`)
    }
    return problems
  }

  it('caps .consent__text in characters, between 56ch and 58ch', () => {
    expect(problemsWith(topLevel(BASE, '.consent__text').get('max-inline-size'))).toEqual([])
  })

  it('puts that cap on the class both apps give the sentence', () => {
    for (const file of [
      ['apps', 'cms', 'src', 'components', 'site', 'ConsentBanner.tsx'],
      ['apps', 'viewer', 'src', 'components', 'ConsentBanner.tsx'],
    ]) {
      expect(
        readFileSync(join(REPO_ROOT, ...file), 'utf8'),
        `${file.join('/')} does not use the shared class`,
      ).toContain('className="consent__text"')
    }
  })

  // NEGATIVE CONTROLS: the page's own 60ch, a cap too tight (the old 54ch among them), and no cap at all.
  it('sees each fault: the inherited 60ch, 40ch, and a missing cap', () => {
    expect(problemsWith('60ch')).toEqual(['60ch is over 58ch: lines past the 75-character ceiling'])
    expect(problemsWith('40ch')).toEqual(['40ch is under 56ch: the sentence tips to four lines'])
    // The old cap, which the longer sentence measured four lines at.
    expect(problemsWith('54ch')).toEqual(['54ch is under 56ch: the sentence tips to four lines'])
    expect(problemsWith(undefined)).toEqual(['max-inline-size is missing, not a number of ch'])
    expect(problemsWith('403px')).toEqual(['max-inline-size is 403px, not a number of ch'])
    expect(problemsWith('57ch')).toEqual([])
  })
})

describe('VA-19 — the menu icon folds by transform and opacity, never by width', () => {
  /** The property each comma-separated part of a `transition` value names, in order. */
  const transitionedProperties = (value: string | undefined) =>
    (value ?? '').split(',').map((part) => part.trim().split(/\s+/)[0])

  const iconRules = (source: string) =>
    rulesOf(source).filter((rule) => rule.selector.includes('.notch__icon-line'))

  /** Everything wrong with the icon lines' rules, as sentences. */
  function problemsWith(source: string): string[] {
    const problems: string[] = []
    const rules = iconRules(source)
    const base = rules.find((rule) => rule.selector === '.notch__icon-line')
    if (!base) return ['no .notch__icon-line rule']
    const names = transitionedProperties(base.declarations.get('transition'))
    if (names.join() !== 'transform,opacity') {
      problems.push(
        `the lines transition ${names.join(', ') || 'nothing'}, not transform and opacity`,
      )
    }
    for (const rule of rules) {
      if (rule !== base && rule.declarations.has('width')) {
        problems.push(`${rule.selector} sets a width: the lines are scaled, never resized`)
      }
    }
    // The two short lines: scaled, and shifted back to the left edge by half of what the scale
    // took off a 20px line, or they would sit centred instead of hanging from the edge.
    for (const [child, scale] of [
      [1, 0.6],
      [3, 0.8],
    ] as const) {
      const rule = rules.find((entry) => entry.selector === `.notch__icon-line:nth-child(${child})`)
      const match = /^translateX\((-?[\d.]+)px\) scaleX\(([\d.]+)\)$/.exec(
        rule?.declarations.get('transform') ?? '',
      )
      if (!match) {
        problems.push(`line ${child} is not translateX(Npx) scaleX(S)`)
        continue
      }
      const [shift, factor] = [Number(match[1]), Number(match[2])]
      if (factor !== scale) problems.push(`line ${child} is scaled ${factor}, not ${scale}`)
      if (Math.abs(shift + ((1 - factor) * 20) / 2) > 0.001) {
        problems.push(
          `line ${child}: shift ${shift}px does not anchor a ${factor} scale at the edge`,
        )
      }
    }
    return problems
  }

  it('transitions transform and opacity only, with no width on any line', () => {
    expect(problemsWith(NOTCH)).toEqual([])
  })

  it('keeps the open state to the same two properties, so the fold cannot bring a width back', () => {
    const open = iconRules(NOTCH).filter((rule) => rule.selector.includes(':popover-open'))
    expect(open.length, 'no open-state rules were found, so nothing was measured').toBe(3)
    for (const rule of open) {
      expect(
        [...rule.declarations.keys()].filter((name) => name !== 'transform' && name !== 'opacity'),
      ).toEqual([])
    }
  })

  it('leaves the motion probe no exception for these lines, and the shared stylesheet passes without one', () => {
    expect(LAYOUT_TRANSITION_ALLOW_LIST).toEqual([])
    expect(findLayoutPropertyTransitions(extractLeafRules(NOTCH))).toEqual([])
  })

  // NEGATIVE CONTROLS, run both ways: the old rules are caught, by the guard and by the probe.
  it('sees the fault: the old width transition and the old widths', () => {
    const old = `
      .notch__icon-line { width: 100%; transition: width 220ms, transform 220ms, opacity 220ms; }
      .notch__icon-line:nth-child(1) { width: 12px; }
      .notch__icon-line:nth-child(3) { transform: translateX(-2px) scaleX(0.8); }
    `
    const problems = problemsWith(old)
    expect(problems).toContain(
      'the lines transition width, transform, opacity, not transform and opacity',
    )
    expect(problems).toContain(
      '.notch__icon-line:nth-child(1) sets a width: the lines are scaled, never resized',
    )
    expect(problems).toContain('line 1 is not translateX(Npx) scaleX(S)')
    // a shift that does not match its scale is caught too (line 3 here is right, line 1 absent)
    expect(
      problemsWith(`
        .notch__icon-line { transition: transform 220ms, opacity 220ms; }
        .notch__icon-line:nth-child(1) { transform: translateX(-2px) scaleX(0.6); }
        .notch__icon-line:nth-child(3) { transform: translateX(-2px) scaleX(0.8); }
      `),
    ).toEqual(['line 1: shift -2px does not anchor a 0.6 scale at the edge'])
    const planted = extractLeafRules('.notch__icon-line { transition: width 220ms; }')
    expect(findLayoutPropertyTransitions(planted).map((violation) => violation.selector)).toEqual([
      '.notch__icon-line',
    ])
  })
})

describe('VA-43 — hero labels balance their lines, and the home label breaks in two on a phone', () => {
  /** `rem`, not px: it follows the reader's text size, which the label's width follows too. */
  const PHONE = '@media (max-width: 40rem)'

  /** Everything wrong with the website's label rules, as sentences. */
  function problemsWith(source: string): string[] {
    const problems: string[] = []
    const rules = rulesOf(source)
    const balanced = rules.find(
      (rule) => rule.at.length === 0 && rule.selector === '.site-hero .label',
    )
    if (balanced?.declarations.get('text-wrap') !== 'balance') {
      problems.push('.site-hero .label does not balance its lines')
    }
    const phone = rules.filter((rule) => rule.at.join() === PHONE)
    if (
      phone.find((rule) => rule.selector === '.label__dot')?.declarations.get('display') !== 'none'
    ) {
      problems.push(`the dot is not hidden inside ${PHONE}`)
    }
    if (
      phone.find((rule) => rule.selector === '.label__tail')?.declarations.get('display') !==
      'block'
    ) {
      problems.push(`the second half does not take its own line inside ${PHONE}`)
    }
    return problems
  }

  it("balances every hero label on the site, and splits the home hero's on a phone", () => {
    expect(problemsWith(SITE)).toEqual([])
  })

  it("leaves the shared .label alone: the garment pages' colour-name labels were not measured for it", () => {
    expect(topLevel(BASE, '.label').has('text-wrap')).toBe(false)
  })

  // NEGATIVE CONTROLS: nothing balanced, a px query that ignores the reader's text size, and a
  // dot that stays.
  it('sees each fault: no balance, a px query, a dot that is never hidden', () => {
    expect(problemsWith('')).toEqual([
      '.site-hero .label does not balance its lines',
      `the dot is not hidden inside ${PHONE}`,
      `the second half does not take its own line inside ${PHONE}`,
    ])
    const inPixels = `
      .site-hero .label { text-wrap: balance; }
      @media (max-width: 640px) {
        .label__dot { display: none; }
        .label__tail { display: block; }
      }
    `
    expect(problemsWith(inPixels)).toEqual([
      `the dot is not hidden inside ${PHONE}`,
      `the second half does not take its own line inside ${PHONE}`,
    ])
    const dotStays = `
      .site-hero .label { text-wrap: balance; }
      @media (max-width: 40rem) {
        .label__tail { display: block; }
      }
    `
    expect(problemsWith(dotStays)).toEqual([`the dot is not hidden inside ${PHONE}`])
  })
})

describe('VA-46 — both buttons answer a pointer the same way', () => {
  const FINE = '@media (hover: hover) and (pointer: fine)'
  const LIFT = 'translateY(-2px)'
  /** What 12px text needs (WCAG 1.4.3), and what a control's edge needs (1.4.11). */
  const TEXT_FLOOR = 4.5
  const EDGE_FLOOR = 3

  const ratio = (foreground: string, background: string, mode: Mode, tokens: string) =>
    contrastOf(resolveToken(tokens, foreground, mode), resolveToken(tokens, background, mode))

  /** The property each comma-separated part of a `transition` value names, in order. */
  const transitioned = (value: string | undefined) =>
    (value ?? '').split(',').map((part) => part.trim().split(/\s+/)[0])

  /** Everything wrong with the buttons' hover rules, as sentences. */
  function problemsWith(source: string, tokens = TOKENS): string[] {
    const problems: string[] = []
    const rules = rulesOf(source)
    const find = (selector: string, at: string[] = []) =>
      rules.find((rule) => rule.selector === selector && rule.at.join() === at.join())
    const hover = (selector: string) => find(selector, [FINE])

    // A hover on a button outside the fine-pointer block would stick after a tap.
    for (const rule of rules) {
      if (/\.btn[\w-]*:hover/.test(rule.selector) && rule.at.join() !== FINE) {
        problems.push(`${rule.selector} is outside ${FINE}`)
      }
    }
    // ONE lift for both, and neither variant sets one of its own.
    if (hover('.btn:hover')?.declarations.get('transform') !== LIFT) {
      problems.push(`.btn:hover does not lift both buttons by ${LIFT}`)
    }
    for (const variant of ['.btn--primary', '.btn--ghost']) {
      const rest = find(variant)
      const over = hover(`${variant}:hover`)
      if (over?.declarations.has('transform')) {
        problems.push(`${variant}:hover sets its own transform: the lift is one rule`)
      }
      const hoverFill = over?.declarations.get('background')
      const fill = bareToken(hoverFill)
      const text = bareToken(over?.declarations.get('color'))
      if (!fill || !text) {
        problems.push(`${variant}:hover does not change colour from two tokens`)
        continue
      }
      if (hoverFill === rest?.declarations.get('background')) {
        problems.push(`${variant}:hover keeps its resting fill`)
      }
      for (const mode of ['light', 'dark'] as const) {
        const value = ratio(text, fill, mode, tokens)
        if (value < TEXT_FLOOR) {
          problems.push(`${variant}:hover text is ${value.toFixed(2)}:1 in ${mode} mode`)
        }
      }
    }
    // The primary's swapped fill is the page's own colour, so its EDGE is what keeps it a button:
    // the border is the old fill, hover must leave it alone, and it must clear 3:1 on every ground.
    const edge = /var\(\s*(--[\w-]+)\s*\)/.exec(
      find('.btn--primary')?.declarations.get('border') ?? '',
    )?.[1]
    if (!edge) problems.push('.btn--primary has no token for its border')
    if (
      hover('.btn--primary:hover')?.declarations.has('border-color') ||
      hover('.btn--primary:hover')?.declarations.has('border')
    ) {
      problems.push('.btn--primary:hover sets its own border: its edge keeps the old fill')
    }
    if (edge) {
      for (const mode of ['light', 'dark'] as const) {
        for (const ground of GROUNDS) {
          const value = ratio(edge, ground, mode, tokens)
          if (value < EDGE_FLOOR) {
            problems.push(
              `the primary's edge on ${ground} in ${mode} mode is ${value.toFixed(2)}:1`,
            )
          }
        }
      }
    }
    // The colours and the lift ease on the transitions `.btn` already lists.
    const eased = transitioned(find('.btn')?.declarations.get('transition'))
    for (const property of ['transform', 'background-color', 'color', 'border-color']) {
      if (!eased.includes(property)) problems.push(`.btn does not transition ${property}`)
    }
    return problems
  }

  it('lifts both buttons 2px with one rule, and inverts both, on a fine pointer only', () => {
    expect(problemsWith(BASE)).toEqual([])
  })

  it('names the pairs the audit measured: the primary swaps its own two tokens, the outline button the page’s', () => {
    const rules = rulesOf(BASE)
    const declared = (selector: string) =>
      rules.find((rule) => rule.selector === selector && rule.at.join() === FINE)?.declarations
    expect(declared('.btn--primary:hover')?.get('background')).toBe('var(--btn-primary-text)')
    expect(declared('.btn--primary:hover')?.get('color')).toBe('var(--btn-primary-bg)')
    expect(declared('.btn--ghost:hover')?.get('background')).toBe('var(--text)')
    expect(declared('.btn--ghost:hover')?.get('color')).toBe('var(--bg)')
  })

  // NEGATIVE CONTROLS, run both ways: the OLD rules (a lift with no colour, a fill with no lift),
  // an edge that disappears, a hover that is not gated, and text that cannot be read.
  const OLD = `
    .btn { transition: transform var(--ui) var(--ease), background-color var(--ui) var(--ease), color var(--ui) var(--ease), border-color var(--ui) var(--ease); }
    .btn--primary { background: var(--btn-primary-bg); color: var(--btn-primary-text); border: 1.4px solid var(--btn-primary-bg); }
    .btn--ghost { background: transparent; color: var(--text); border: 1.4px solid var(--line-control); }
    @media (hover: hover) and (pointer: fine) { .btn--primary:hover { transform: translateY(-2px); } }
    @media (hover: hover) and (pointer: fine) { .btn--ghost:hover { background: var(--text); color: var(--bg); border-color: var(--text); } }
  `
  it('sees the fault: the old rules, one language per button', () => {
    expect(problemsWith(OLD)).toEqual([
      `.btn:hover does not lift both buttons by ${LIFT}`,
      '.btn--primary:hover sets its own transform: the lift is one rule',
      '.btn--primary:hover does not change colour from two tokens',
    ])
  })

  it('sees the fault: an edge that goes, a hover that is not gated, text that cannot be read', () => {
    const good = BASE
    const edgeGone = good.replace(
      '.btn--primary:hover {',
      '.btn--primary:hover {\n    border-color: var(--btn-primary-text);',
    )
    expect(problemsWith(edgeGone)).toEqual([
      '.btn--primary:hover sets its own border: its edge keeps the old fill',
    ])
    const ungated = `${good}\n.btn--ghost:hover { background: var(--text); color: var(--bg); }`
    expect(problemsWith(ungated)).toEqual([
      '.btn--ghost:hover is outside @media (hover: hover) and (pointer: fine)',
    ])
    const unreadable = good.replace(
      'color: var(--bg);\n    border-color: var(--text);',
      'color: var(--text);\n    border-color: var(--text);',
    )
    expect(problemsWith(unreadable)).toEqual([
      '.btn--ghost:hover text is 1.00:1 in light mode',
      '.btn--ghost:hover text is 1.00:1 in dark mode',
    ])
  })
})

describe('VA-47 — a guide card is the link target, and the stretch stays inside the card', () => {
  /**
   * The link's `::after` is stretched over the card (`inset: 0`), which only means "the card" if the
   * card is the nearest positioned ancestor. Lose `position: relative` on the card, or give it to the
   * link, and the stretch covers the page or only the title: with the first, a click ANYWHERE on the
   * page opens the first guide. Nothing a unit test of the markup could see.
   */
  function problemsWith(source: string): string[] {
    const problems: string[] = []
    if (topLevel(source, '.guide-card').get('position') !== 'relative') {
      problems.push(
        '.guide-card is not position: relative, so the stretched link would not stop at the card',
      )
    }
    if (topLevel(source, '.guide-card__link').has('position')) {
      problems.push('.guide-card__link is positioned, so the stretch would cover only the title')
    }
    const stretch = topLevel(source, '.guide-card__link::after')
    if (stretch.get('content') !== '""') problems.push('the link has no ::after to stretch')
    if (stretch.get('position') !== 'absolute') problems.push('the ::after is not absolute')
    if (stretch.get('inset') !== '0') problems.push('the ::after does not fill the card (inset: 0)')
    return problems
  }

  it('positions the card, and stretches the link’s ::after over exactly it', () => {
    expect(problemsWith(SITE)).toEqual([])
  })

  // NEGATIVE CONTROLS: the three ways the stretch goes wrong.
  it('sees each fault: an unpositioned card, a positioned link, no stretch', () => {
    expect(problemsWith('.guide-card { padding: 20px; }')).toEqual([
      '.guide-card is not position: relative, so the stretched link would not stop at the card',
      'the link has no ::after to stretch',
      'the ::after is not absolute',
      'the ::after does not fill the card (inset: 0)',
    ])
    const positionedLink = `
      .guide-card { position: relative; }
      .guide-card__link { position: relative; }
      .guide-card__link::after { content: ""; position: absolute; inset: 0; }
    `
    expect(problemsWith(positionedLink)).toEqual([
      '.guide-card__link is positioned, so the stretch would cover only the title',
    ])
  })
})

describe('VA-08 — in high contrast only the chosen product-card dot wears a ring', () => {
  /**
   * Forced colours repaints the COLOUR of every outline and keeps a transparency only for a
   * background (CSS Color Adjustment 1 §3.1, read 2026-10-02), so the `outline: 2px solid
   * transparent` every dot carries would show on all of them. What survives is shape: an unchosen
   * dot has no outline, the chosen one a 2px solid ring in `Highlight`. `forced-color-adjust:
   * none` is not the way out: `tokens.test.ts` allows it on one selector, and this is not it.
   */
  const FORCED = '@media (forced-colors: active)'

  function problemsWith(source: string): string[] {
    const problems: string[] = []
    const inBlock = rulesOf(source).filter((rule) => rule.at.join() === FORCED)
    const unchosen = inBlock.find(
      (rule) => rule.selector === '.card-gallery__dot:not([aria-pressed="true"])::before',
    )
    const chosen = inBlock.find(
      (rule) => rule.selector === '.card-gallery__dot[aria-pressed="true"]::before',
    )
    if (unchosen?.declarations.get('outline-style') !== 'none') {
      problems.push(`an unchosen dot keeps its outline inside ${FORCED}`)
    }
    if (chosen?.declarations.get('outline') !== '2px solid Highlight') {
      problems.push(`the chosen dot has no 2px solid Highlight ring inside ${FORCED}`)
    }
    for (const rule of [unchosen, chosen]) {
      if (rule?.declarations.has('forced-color-adjust')) {
        problems.push(`${rule.selector} opts out of the palette`)
      }
    }
    return problems
  }

  it('takes the ring off the unchosen dots and gives the chosen one a Highlight ring', () => {
    expect(problemsWith(SITE)).toEqual([])
  })

  it('leaves the ordinary rules as they were: a transparent ring on every dot, the headline colour on the chosen one', () => {
    // The block exists BECAUSE of these two rules; if they change, re-read the block.
    const base = rulesOf(SITE).filter((rule) => rule.at.length === 0)
    const ring = base.find((rule) => rule.selector === '.card-gallery__dot::before')
    expect(ring?.declarations.get('outline')).toBe('2px solid transparent')
    const chosen = base.find(
      (rule) => rule.selector === '.card-gallery__dot[aria-pressed="true"]::before',
    )
    expect(chosen?.declarations.get('outline-color')).toBe('var(--headline)')
  })

  // NEGATIVE CONTROLS: no block at all, a ring left on the unchosen dots, a ring that is not
  // Highlight, and the opt-out.
  it('sees each fault: no block, a ring left on, the wrong ring, an opt-out', () => {
    expect(problemsWith('')).toEqual([
      `an unchosen dot keeps its outline inside ${FORCED}`,
      `the chosen dot has no 2px solid Highlight ring inside ${FORCED}`,
    ])
    const ringLeftOn = `
      @media (forced-colors: active) {
        .card-gallery__dot[aria-pressed="true"]::before { outline: 2px solid Highlight; }
      }
    `
    expect(problemsWith(ringLeftOn)).toEqual([`an unchosen dot keeps its outline inside ${FORCED}`])
    const wrongRing = `
      @media (forced-colors: active) {
        .card-gallery__dot:not([aria-pressed="true"])::before { outline-style: none; }
        .card-gallery__dot[aria-pressed="true"]::before { outline: 1px solid CanvasText; }
      }
    `
    expect(problemsWith(wrongRing)).toEqual([
      `the chosen dot has no 2px solid Highlight ring inside ${FORCED}`,
    ])
    const optOut = `
      @media (forced-colors: active) {
        .card-gallery__dot:not([aria-pressed="true"])::before { outline-style: none; forced-color-adjust: none; }
        .card-gallery__dot[aria-pressed="true"]::before { outline: 2px solid Highlight; }
      }
    `
    expect(problemsWith(optOut)).toEqual([
      '.card-gallery__dot:not([aria-pressed="true"])::before opts out of the palette',
    ])
  })
})
