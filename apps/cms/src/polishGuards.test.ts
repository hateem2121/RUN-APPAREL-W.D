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
 * Source guards for the polish fixes of the 2026-10-02 visual audit (VA-16, VA-18, VA-19,
 * VA-43, VA-46). Each `describe` carries its audit ID, so a future reader can find the
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

describe('VA-16 — native controls draw in the brand, not the system blue', () => {
  /** What a control's state needs against the ground it sits on (WCAG 1.4.11). */
  const FLOOR = 3
  const GROUNDS = ['--bg', '--surface', '--wash', '--raised'] as const

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
   */
  const CEILING_CH = 56
  const FLOOR_CH = 48

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

  it('caps .consent__text in characters, between 48ch and 56ch', () => {
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

  // NEGATIVE CONTROLS: the page's own 60ch, a cap too tight, and no cap at all.
  it('sees each fault: the inherited 60ch, 40ch, and a missing cap', () => {
    expect(problemsWith('60ch')).toEqual(['60ch is over 56ch: lines past the 75-character ceiling'])
    expect(problemsWith('40ch')).toEqual(['40ch is under 48ch: the sentence tips to four lines'])
    expect(problemsWith(undefined)).toEqual(['max-inline-size is missing, not a number of ch'])
    expect(problemsWith('403px')).toEqual(['max-inline-size is 403px, not a number of ch'])
    expect(problemsWith('54ch')).toEqual([])
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
