import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * VA-42 (visual audit, owner's choice 2026-10-02): "a layout that never leaves one card alone on
 * the last row at any width". At 1440px the 40 cards made 13 rows of three and a card on its own.
 *
 * ⚠️ THE RULE IS CSS, SO THIS READS THE CSS. It takes the exact selectors out of `site.css`,
 * decides which card each one matches for every count from 2 to 60, and places the cards the way a
 * browser's default (sparse) grid placement does, to see what the last row holds. A hand-written
 * copy of the rule in this file would pass while the stylesheet was wrong. It is a model, not a
 * browser: `e2e/productsGrid.spec.ts` does the same with real cards at 390, 1440 and 1920px.
 *
 * What would have to break for these to fail: the rule for a column count goes missing or
 * matches the wrong card (a hole in the middle of the grid, or a card alone again), a column count
 * changes without its rule following, or `auto-fill` returns and leaves the browser to choose the
 * count the rules assume.
 */

const SITE_CSS = readFileSync(join(import.meta.dirname, 'app', '(frontend)', 'site.css'), 'utf8')
  // Comments are left out: they quote the selectors and numbers they replaced.
  .replace(/\/\*[\s\S]*?\*\//g, '')

type Rule = { media: string | null; selector: string; body: string }

/** Style rules, with the `@media` they sit in; other at-rules (fonts, keyframes, supports) are skipped. */
function parseRules(source: string, media: string | null = null): Rule[] {
  const rules: Rule[] = []
  let at = 0
  while (at < source.length) {
    const open = source.indexOf('{', at)
    if (open === -1) break
    const semicolon = source.indexOf(';', at)
    if (semicolon !== -1 && semicolon < open) {
      at = semicolon + 1
      continue
    }
    const prelude = source.slice(at, open).trim()
    let depth = 1
    let end = open + 1
    while (end < source.length && depth > 0) {
      if (source[end] === '{') depth++
      else if (source[end] === '}') depth--
      end++
    }
    const inner = source.slice(open + 1, end - 1)
    if (prelude.startsWith('@media')) {
      rules.push(...parseRules(inner, prelude.slice('@media'.length).trim()))
    } else if (!prelude.startsWith('@')) {
      rules.push({ media, selector: prelude.replace(/\s+/g, ' '), body: inner })
    }
    at = end
  }
  return rules
}

/** Only width queries are understood; anything else (hover, motion) does not match here. */
function mediaMatches(media: string | null, width: number): boolean {
  if (media === null) return true
  return media.split(/\s+and\s+/).every((part) => {
    const query = part.trim().match(/^\((min|max)-width:\s*(\d+)px\)$/)
    if (!query) return false
    return query[1] === 'min' ? width >= Number(query[2]) : width <= Number(query[2])
  })
}

const declarations = (body: string) =>
  new Map(
    body
      .split(';')
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((entry): [string, string] => {
        const colon = entry.indexOf(':')
        return [entry.slice(0, colon).trim(), entry.slice(colon + 1).trim()]
      }),
  )

/** `3n`, `odd`, `even`, `2`: the forms the grid rules use. */
function nth(formula: string, position: number): boolean {
  if (formula === 'odd') return position % 2 === 1
  if (formula === 'even') return position % 2 === 0
  const plain = formula.match(/^\d+$/)
  if (plain) return position === Number(formula)
  const step = formula.match(/^([+-]?\d*)n([+-]\d+)?$/)
  if (!step) throw new Error(`unsupported :nth formula "${formula}"`)
  const a = step[1] === '' || step[1] === '+' ? 1 : step[1] === '-' ? -1 : Number(step[1])
  const b = Number(step[2] ?? 0)
  return a === 0 ? position === b : (position - b) / a >= 0 && Number.isInteger((position - b) / a)
}

/** A pseudo-class list such as `:last-child:nth-child(odd):not(:only-child)`, against card `index` of `count`. */
function matchesPseudos(pseudos: string, index: number, count: number): boolean {
  let rest = pseudos
  while (rest.length > 0) {
    const name = rest.match(/^:([a-z-]+)/)
    if (!name) throw new Error(`cannot read "${rest}"`)
    rest = rest.slice(name[0].length)
    let argument = ''
    if (rest.startsWith('(')) {
      let depth = 0
      let end = 0
      do {
        if (rest[end] === '(') depth++
        if (rest[end] === ')') depth--
        end++
      } while (depth > 0)
      argument = rest.slice(1, end - 1)
      rest = rest.slice(end)
    }
    const ok =
      name[1] === 'last-child'
        ? index === count
        : name[1] === 'only-child'
          ? count === 1
          : name[1] === 'nth-child'
            ? nth(argument, index)
            : name[1] === 'nth-last-child'
              ? nth(argument, count - index + 1)
              : name[1] === 'not'
                ? !matchesPseudos(argument, index, count)
                : null
    if (ok === null) throw new Error(`unsupported pseudo-class :${name[1]}`)
    if (!ok) return false
  }
  return true
}

const CARD_RULE = /^\.product-grid > \.product-card((?::[a-z-]+(?:\((?:[^()]|\([^()]*\))*\))?)*)$/

/** How many columns the grid has at this viewport width: the last `repeat(N, …)` that applies. */
function columnsAt(width: number, rules: Rule[]): number {
  let columns = Number.NaN
  for (const rule of rules) {
    if (rule.selector !== '.product-grid' || !mediaMatches(rule.media, width)) continue
    const value = declarations(rule.body).get('grid-template-columns')
    if (value) columns = Number(value.match(/^repeat\((\d+),/)?.[1] ?? Number.NaN)
  }
  return columns
}

type Placed = { row: number; col: number; span: number }

/**
 * A card's grid-column as the rules set it, and the CSS grid placement that follows (sparse
 * packing: the cursor only moves forward, and an item that asks for a column behind it starts the
 * next row).
 */
function layOut(
  count: number,
  width: number,
  rules: Rule[],
): { columns: number; placed: Placed[] } {
  const columns = columnsAt(width, rules)
  const items: Array<{ start?: number; span: number }> = []
  for (let index = 1; index <= count; index++) {
    let item: { start?: number; span: number } = { span: 1 }
    for (const rule of rules) {
      const match = rule.selector.match(CARD_RULE)
      if (!match || !mediaMatches(rule.media, width)) continue
      if (!matchesPseudos(match[1] ?? '', index, count)) continue
      const own = declarations(rule.body)
      const shorthand = own.get('grid-column')
      if (shorthand === '1 / -1') item = { start: 1, span: columns }
      const start = own.get('grid-column-start')
      if (start) item = { start: Number(start), span: 1 }
    }
    items.push(item)
  }

  const taken = new Set<string>()
  const free = (row: number, col: number, span: number) =>
    Array.from({ length: span }, (_, step) => !taken.has(`${row}:${col + step}`)).every(Boolean)
  const placed: Placed[] = []
  let row = 1
  let col = 1
  for (const item of items) {
    if (item.start !== undefined) {
      if (item.start < col) row++
      col = item.start
      while (!free(row, col, item.span)) row++
    } else {
      while (!free(row, col, item.span) || col + item.span - 1 > columns) {
        col++
        if (col + item.span - 1 > columns) {
          row++
          col = 1
        }
      }
    }
    for (let step = 0; step < item.span; step++) taken.add(`${row}:${col + step}`)
    placed.push({ row, col, span: item.span })
  }
  return { columns, placed }
}

/** The cards on each row, top to bottom, as the width each one takes. */
function rowsOf(placed: Placed[]): number[][] {
  const rows: number[][] = []
  for (const card of placed) {
    const row = rows[card.row - 1] ?? []
    row.push(card.span)
    rows[card.row - 1] = row
  }
  return rows
}

const RULES = parseRules(SITE_CSS)
const WIDTHS = [
  { width: 390, columns: 2 },
  { width: 1280, columns: 3 },
  // Four from 1440px since 2026-10-02 (the owner's call; it was 1600px, decision D4).
  { width: 1440, columns: 4 },
  { width: 1920, columns: 4 },
] as const

describe('the grid has the column counts the rules assume', () => {
  for (const { width, columns } of WIDTHS) {
    it(`${columns} columns at ${width}px`, () => {
      expect(columnsAt(width, RULES)).toBe(columns)
    })
  }

  it('is two below 900px, three from 900px, four from 1440px, and never auto-fill', () => {
    expect([320, 559, 560, 899].map((width) => columnsAt(width, RULES))).toEqual([2, 2, 2, 2])
    expect([900, 1280, 1439].map((width) => columnsAt(width, RULES))).toEqual([3, 3, 3])
    expect([1440, 1600, 2560].map((width) => columnsAt(width, RULES))).toEqual([4, 4, 4])
    expect(SITE_CSS).not.toMatch(/\.product-grid\s*\{[^}]*auto-fill/)
  })
})

describe('no card is left alone on the last row, whatever the count (VA-42)', () => {
  for (const { width, columns } of WIDTHS) {
    it(`${columns} columns: every count from 2 to 60 ends on two or more cards, or one card filling its row`, () => {
      const failures: string[] = []
      for (let count = 2; count <= 60; count++) {
        const rows = rowsOf(layOut(count, width, RULES).placed)
        const last = rows[rows.length - 1] ?? []
        const filled = last.reduce((sum, span) => sum + span, 0) === columns
        if (last.length < 2 && !filled)
          failures.push(`${count} cards: last row ${JSON.stringify(last)}`)
      }
      expect(failures, `a card is alone at ${columns} columns`).toEqual([])
    })

    it(`${columns} columns: the rule acts only when the count needs it`, () => {
      const failures: string[] = []
      for (let count = 2; count <= 60; count++) {
        const rows = rowsOf(layOut(count, width, RULES).placed)
        const full = (row: number[] | undefined) =>
          (row ?? []).reduce((sum, span) => sum + span, 0) === columns
        const needs = columns >= 3 && count % columns === 1
        const body = rows.slice(0, needs ? -2 : -1)
        if (!body.every((row) => full(row)))
          failures.push(`${count}: a row above the end has a hole`)
        if (needs) {
          if (rows[rows.length - 2]?.length !== columns - 1)
            failures.push(`${count}: row above is not ${columns - 1} cards`)
          if (rows[rows.length - 1]?.length !== 2)
            failures.push(`${count}: last row is not two cards`)
        }
      }
      expect(failures).toEqual([])
    })
  }

  // The count the audit named, and the ones the brief asked about by name.
  it('holds for 37, 38, 39, 40 and 41 cards at 1280, 1440 and 1920px (40 was the failure at three columns)', () => {
    for (const width of [1280, 1440, 1920]) {
      for (const count of [37, 38, 39, 40, 41]) {
        const rows = rowsOf(layOut(count, width, RULES).placed)
        expect(
          rows[rows.length - 1]?.length,
          `${count} cards at ${width}px`,
        ).toBeGreaterThanOrEqual(2)
      }
    }
  })

  // NEGATIVE CONTROL, run both ways: with the rules that move cards taken out, the model shows the
  // lone card at 1280px (40 = 3 x 13 + 1, three columns), at 1440px and 1920px (41 = 4 x 10 + 1,
  // four columns) and a hole beside the last card on a phone (41 is odd), so the tests above are
  // able to fail.
  it('sees the lone card when the rules are removed', () => {
    const without = RULES.filter(
      (rule) => !/nth-last-child|last-child/.test(rule.selector) || !CARD_RULE.test(rule.selector),
    )
    const rows = (count: number, width: number) => rowsOf(layOut(count, width, without).placed)
    expect(rows(40, 1280).at(-1)).toEqual([1])
    expect(rows(41, 1440).at(-1)).toEqual([1])
    expect(rows(41, 1920).at(-1)).toEqual([1])
    expect(rows(41, 390).at(-1)).toEqual([1])
    // …and the same counts are fixed with the rules in place.
    expect(rows(40, 1280)).not.toEqual(rowsOf(layOut(40, 1280, RULES).placed))
    expect(rowsOf(layOut(40, 1280, RULES).placed).at(-1)).toEqual([1, 1])
  })

  it('leaves a single card on a page as it is', () => {
    for (const { width } of WIDTHS) {
      expect(rowsOf(layOut(1, width, RULES).placed)).toEqual([[1]])
    }
  })
})

describe('the phone card, in the stylesheet (VA-42)', () => {
  const inPhone = (selector: string) =>
    RULES.filter((rule) => rule.media === '(max-width: 559px)' && rule.selector === selector)
  const declared = (rules: Rule[], property: string) =>
    rules.map((rule) => declarations(rule.body).get(property)).find((value) => value !== undefined)

  it('draws the picture square below 560px and 4:5 above', () => {
    expect(declared(inPhone('.product-card__figure'), 'aspect-ratio')).toBe('1 / 1')
    const base = RULES.find(
      (rule) => rule.media === null && rule.selector === '.product-card__figure',
    )
    expect(declarations(base?.body ?? '').get('aspect-ratio')).toBe('4 / 5')
  })

  it('keeps each colour dot at least 24px wide and the full 44px tall', () => {
    const phone = inPhone('.card-gallery__dot')
    expect(declared(phone, 'min-inline-size')).toBe('24px')
    // The height is the base rule's `--target-min`; the phone rule must not shrink it.
    expect(declared(phone, 'block-size')).toBeUndefined()
    const base = RULES.find((rule) => rule.media === null && rule.selector === '.card-gallery__dot')
    expect(declarations(base?.body ?? '').get('block-size')).toBe('var(--target-min)')
  })

  it('makes /products’ filter one row that scrolls sideways, on a phone only', () => {
    const row = inPhone('.filter-bar--scroll')
    expect(declared(row, 'flex-wrap')).toBe('nowrap')
    expect(declared(row, 'overflow-x')).toBe('auto')
    expect(declared(row, 'overscroll-behavior-x')).toBe('contain')
    const base = RULES.find((rule) => rule.media === null && rule.selector === '.filter-bar')
    expect(declarations(base?.body ?? '').get('flex-wrap')).toBe('wrap')
  })
})
