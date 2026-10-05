/**
 * A small reader for this app's stylesheets: "what does THIS selector declare, inside THIS
 * at-rule?" — enough for a unit test to hold a declaration the browser suites also measure.
 *
 * It is a reader, not a CSS parser. It understands style rules, the grouping at-rules
 * (`@media`, `@supports`, `@container`) and skips the opaque ones (`@keyframes`,
 * `@font-face`, `@property`). It does NOT understand nesting or `@layer`, which `page.css`
 * does not use — `cssRules.test.ts` pins that, so adopting either fails loudly there instead
 * of silently reading a wrong answer here.
 *
 * Added with the VA-07 fix (visual audit, 2026-10-02), where the earlier crude string reads in
 * `specDuplication.test.ts` (deleted with the breakpoints it compared, polish D10) could not tell
 * a declaration inside `@media (forced-colors: active)` from the same property on the same
 * selector outside it.
 */

export interface CssRule {
  /** The grouping at-rules it sits inside, outermost first, whitespace collapsed. */
  atRules: string[]
  /** Each selector of a comma list, whitespace collapsed. */
  selectors: string[]
  /** Property (lower-case) to value (trimmed), later duplicates replacing earlier ones. */
  declarations: Record<string, string>
}

const OPAQUE_AT_RULES = new Set(['keyframes', 'font-face', 'property', 'counter-style'])

/** Blank comment BODIES, keeping every offset — the same helper `tokens.test.ts` uses. */
export function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, ' '))
}

const collapse = (text: string) => text.trim().replace(/\s+/g, ' ')

/** The index just past a quoted string that opens at `from`. */
function skipString(css: string, from: number): number {
  const quote = css[from]
  let i = from + 1
  while (i < css.length && css[i] !== quote) i += css[i] === '\\' ? 2 : 1
  return i + 1
}

/** The index of the `}` that closes the `{` at `open`, skipping strings and nested braces. */
function matchingBrace(css: string, open: number): number {
  let depth = 0
  for (let i = open; i < css.length; ) {
    const ch = css[i]
    if (ch === '"' || ch === "'") {
      i = skipString(css, i)
      continue
    }
    if (ch === '{') depth += 1
    if (ch === '}') {
      depth -= 1
      if (depth === 0) return i
    }
    i += 1
  }
  throw new Error('cssRules: a `{` is never closed')
}

/** Split a selector list on its top-level commas: not inside `:is(a, b)` or `[x="a,b"]`. */
function splitSelectors(head: string): string[] {
  const out: string[] = []
  let start = 0
  let depth = 0
  for (let i = 0; i < head.length; ) {
    const ch = head[i]
    if (ch === '"' || ch === "'") {
      i = skipString(head, i)
      continue
    }
    if (ch === '(' || ch === '[') depth += 1
    if (ch === ')' || ch === ']') depth -= 1
    if (ch === ',' && depth === 0) {
      out.push(collapse(head.slice(start, i)))
      start = i + 1
    }
    i += 1
  }
  out.push(collapse(head.slice(start)))
  return out
}

/** Split a declaration block on `;` — but not inside a string or a `url(...)`/function. */
function readDeclarations(body: string): Record<string, string> {
  const out: Record<string, string> = {}
  let start = 0
  let parens = 0
  for (let i = 0; i <= body.length; ) {
    const ch = body[i]
    if (ch === '"' || ch === "'") {
      i = skipString(body, i)
      continue
    }
    if (ch === '(') parens += 1
    if (ch === ')') parens -= 1
    if ((ch === ';' && parens === 0) || i === body.length) {
      const piece = body.slice(start, i)
      const colon = piece.indexOf(':')
      if (colon > 0)
        out[piece.slice(0, colon).trim().toLowerCase()] = collapse(piece.slice(colon + 1))
      start = i + 1
    }
    i += 1
  }
  return out
}

export function readRules(source: string): CssRule[] {
  const css = stripComments(source)
  const rules: CssRule[] = []
  const atStack: string[] = []
  let prelude = ''
  for (let i = 0; i < css.length; ) {
    const ch = css[i]
    if (ch === '"' || ch === "'") {
      const end = skipString(css, i)
      prelude += css.slice(i, end)
      i = end
      continue
    }
    if (ch === '{') {
      const head = collapse(prelude)
      prelude = ''
      if (head.startsWith('@')) {
        const name = /^@([a-z-]+)/i.exec(head)?.[1]?.toLowerCase() ?? ''
        if (OPAQUE_AT_RULES.has(name)) {
          i = matchingBrace(css, i) + 1
          continue
        }
        atStack.push(head)
        i += 1
        continue
      }
      const close = matchingBrace(css, i)
      rules.push({
        atRules: [...atStack],
        selectors: splitSelectors(head),
        declarations: readDeclarations(css.slice(i + 1, close)),
      })
      i = close + 1
      continue
    }
    if (ch === '}') {
      atStack.pop()
      prelude = ''
      i += 1
      continue
    }
    if (ch === ';') {
      prelude = ''
      i += 1
      continue
    }
    prelude += ch
    i += 1
  }
  return rules
}

/**
 * What `selector` finally declares for `property` inside exactly the at-rules in `within`
 * (none = top level). Source order decides between several rules, as the cascade would for
 * equal specificity. `undefined` when no such declaration exists.
 *
 * `selector` must equal one selector of a rule's comma list, whitespace aside: this does not
 * match `.a .b` when asked for `.b`, which is the point.
 */
export function declared(
  rules: CssRule[],
  selector: string,
  property: string,
  within: string[] = [],
): string | undefined {
  const wanted = within.map(collapse)
  const target = collapse(selector)
  let value: string | undefined
  for (const rule of rules) {
    if (rule.atRules.length !== wanted.length) continue
    if (!rule.atRules.every((atRule, index) => atRule === wanted[index])) continue
    if (!rule.selectors.includes(target)) continue
    const found = rule.declarations[property.toLowerCase()]
    if (found !== undefined) value = found
  }
  return value
}
