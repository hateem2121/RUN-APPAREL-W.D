import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { declared, readRules } from './cssRules'

/**
 * The reader behind the visual-audit CSS guards (`visualAuditCss.test.ts`). A guard that reads
 * the wrong rule passes for the wrong reason, so the reader is held to the cases that could
 * fool it: the same property inside and outside an at-rule, a selector that is only part of
 * another, strings and `url()` carrying the characters it splits on, and blocks it must skip.
 */

const SAMPLE = `
/* .stage__hint { width: 1px } — a comment, not a rule */
.hint { width: auto; color: red; }
.hint { color: blue }
@media (forced-colors: active) {
  .hint { border: 1px solid ButtonText; }
  .a, .b:is(.x, .y), [data-k="p,q"] { outline: 3px solid Highlight }
}
@media (min-width: 900px) {
  @container (min-width: 22rem) {
    .hint { display: inline }
  }
}
@keyframes spin { from { width: 99px } to { width: 100px } }
@font-face { font-family: X; src: url(data:font/woff2;base64,AAAA) }
.quote::before { content: "a;b{c}"; background: url(data:image/svg+xml;utf8,<svg/>) }
.parent .hint { width: 7px }
`

const rules = readRules(SAMPLE)

describe('readRules / declared', () => {
  it('reads a top-level declaration, the last duplicate winning', () => {
    expect(declared(rules, '.hint', 'width')).toBe('auto')
    expect(declared(rules, '.hint', 'color')).toBe('blue')
  })

  it('tells a declaration inside an at-rule from the same one outside it', () => {
    expect(declared(rules, '.hint', 'border')).toBeUndefined()
    expect(declared(rules, '.hint', 'border', ['@media (forced-colors: active)'])).toBe(
      '1px solid ButtonText',
    )
  })

  it('follows nested grouping at-rules, outermost first', () => {
    const within = ['@media (min-width: 900px)', '@container (min-width: 22rem)']
    expect(declared(rules, '.hint', 'display', within)).toBe('inline')
    expect(declared(rules, '.hint', 'display', [within[1] as string])).toBeUndefined()
  })

  it('splits a selector list at its top-level commas only', () => {
    const within = ['@media (forced-colors: active)']
    expect(declared(rules, '.a', 'outline', within)).toBe('3px solid Highlight')
    expect(declared(rules, '.b:is(.x, .y)', 'outline', within)).toBe('3px solid Highlight')
    expect(declared(rules, '[data-k="p,q"]', 'outline', within)).toBe('3px solid Highlight')
    expect(declared(rules, '.x', 'outline', within)).toBeUndefined()
  })

  it('does not match a selector that is only the tail of another', () => {
    expect(declared(rules, '.parent .hint', 'width')).toBe('7px')
    expect(declared(rules, '.parent', 'width')).toBeUndefined()
  })

  it('skips @keyframes and @font-face, so their declarations never leak out', () => {
    expect(declared(rules, 'from', 'width')).toBeUndefined()
    expect(declared(rules, 'to', 'width')).toBeUndefined()
    expect(declared(rules, '.hint', 'width')).toBe('auto')
  })

  it('keeps ; { } and url(...) inside a value whole', () => {
    expect(declared(rules, '.quote::before', 'content')).toBe('"a;b{c}"')
    expect(declared(rules, '.quote::before', 'background')).toBe(
      'url(data:image/svg+xml;utf8,<svg/>)',
    )
  })

  it('ignores a rule that sits inside a comment', () => {
    expect(declared(rules, '.stage__hint', 'width')).toBeUndefined()
  })

  it('refuses a stylesheet whose braces do not close, instead of guessing', () => {
    expect(() => readRules('.a { color: red')).toThrow(/never closed/)
  })
})

describe('page.css stays inside what the reader understands', () => {
  const css = readFileSync(join(import.meta.dirname, 'page.css'), 'utf8')

  it('uses no CSS nesting and no @layer (the reader supports neither)', () => {
    const noComments = css.replace(/\/\*[\s\S]*?\*\//g, '')
    expect(noComments, 'CSS nesting: a line starting with &').not.toMatch(/^\s*&/m)
    expect(noComments, '@layer').not.toMatch(/@layer\b/)
  })

  it('reads a real, specific declaration out of the real file (negative control)', () => {
    const real = readRules(css)
    expect(real.length).toBeGreaterThan(100)
    expect(declared(real, '.camera-btn', 'min-width')).toBe('64px')
    expect(declared(real, '.camera-btn', 'no-such-property')).toBeUndefined()
  })
})
