import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { PHONE_QUERY, THEME_COLOR } from './themeColor'

const UI = join(import.meta.dirname, '..', '..', '..', '..', 'packages', 'ui', 'src')
const TOKENS = readFileSync(join(UI, 'tokens.css'), 'utf8')
const NOTCH = readFileSync(join(UI, 'notch.css'), 'utf8')

const HEX = '(#[0-9a-fA-F]{3,8})'

/** The two halves of `--<name>: light-dark(<light>, <dark>)`. */
function pair(css: string, name: string): { light: string; dark: string } {
  const match = css.match(new RegExp(`--${name}:\\s*light-dark\\(\\s*${HEX}\\s*,\\s*${HEX}\\s*\\)`))
  if (!match) throw new Error(`--${name} is no longer a light-dark() pair in tokens.css`)
  return { light: match[1]!.toLowerCase(), dark: match[2]!.toLowerCase() }
}

/** A plain `--<name>: <hex>`. */
function single(css: string, name: string): string {
  const match = css.match(new RegExp(`--${name}:\\s*${HEX}\\s*;`))
  if (!match) throw new Error(`--${name} is no longer a single colour in tokens.css`)
  return match[1]!.toLowerCase()
}

/** What each tag must carry, read from the tokens: the page's `--bg`, and on phones the bar's. */
function expected(css: string) {
  const bg = pair(css, 'bg')
  return {
    page: bg,
    // --notch-bg is light-dark(var(--ink), var(--raised)): pinned below, read from notch.css.
    phone: { light: single(css, 'ink'), dark: pair(css, 'raised').dark },
  }
}

/** Every tag whose colour no longer equals its token. Empty means in step. */
function drift(css: string, themeColor: typeof THEME_COLOR): string[] {
  const want = expected(css)
  return themeColor.flatMap(({ media, color }) => {
    const scheme = media.includes('dark') ? 'dark' : 'light'
    const kind = media.includes(PHONE_QUERY) ? 'phone' : 'page'
    const token = want[kind][scheme]
    return color.toLowerCase() === token ? [] : [`${kind} ${scheme}: ${color} vs ${token}`]
  })
}

/** Phone tags must come before the page's: the first matching tag wins, and a phone matches both. */
function phoneFirst(themeColor: readonly { media: string }[]): boolean {
  const kinds = themeColor.map(({ media }) => media.includes(PHONE_QUERY))
  return kinds.indexOf(false) > kinds.lastIndexOf(true)
}

describe('theme-color (CO-05, VA-50)', () => {
  it('declares a page colour per scheme and, before them, a phone colour per scheme', () => {
    expect(THEME_COLOR.map((entry) => entry.media)).toEqual([
      `(prefers-color-scheme: light) and ${PHONE_QUERY}`,
      `(prefers-color-scheme: dark) and ${PHONE_QUERY}`,
      '(prefers-color-scheme: light)',
      '(prefers-color-scheme: dark)',
    ])
    expect(phoneFirst(THEME_COLOR)).toBe(true)
    // The HTML standard: each theme-color media value must be unique on the page.
    expect(new Set(THEME_COLOR.map((entry) => entry.media)).size).toBe(THEME_COLOR.length)
  })

  it('matches the tokens: --bg for the page, the bar colour on phones', () => {
    expect(drift(TOKENS, THEME_COLOR)).toEqual([])
  })

  it('the phone colour is the bar colour notch.css paints, and its phone is the strip’s', () => {
    expect(NOTCH).toMatch(/--notch-bg: light-dark\(var\(--ink\), var\(--raised\)\)/)
    expect(NOTCH).toContain(`@media ${PHONE_QUERY} {\n  .notch-strip {`)
  })

  it('the drift check catches a changed token (negative control)', () => {
    const page = TOKENS.replace(/--bg:\s*light-dark\([^)]*\)/, '--bg: light-dark(#ffffff, #000000)')
    expect(page, 'the plant did not change tokens.css').not.toBe(TOKENS)
    expect(drift(page, THEME_COLOR)).toHaveLength(2)
    const ink = TOKENS.replace(/--ink:\s*#[0-9a-fA-F]+;/, '--ink: #000000;')
    expect(ink, 'the plant did not change tokens.css').not.toBe(TOKENS)
    expect(drift(ink, THEME_COLOR)).toEqual(['phone light: #1d1f1a vs #000000'])
  })

  it('the order check catches page tags placed first (negative control)', () => {
    expect(phoneFirst([...THEME_COLOR].reverse())).toBe(false)
  })
})
