import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { THEME_COLOR } from './themeColor'

const TOKENS = readFileSync(
  join(import.meta.dirname, '..', '..', '..', '..', 'packages', 'ui', 'src', 'tokens.css'),
  'utf8',
)

/** The two halves of `--bg: light-dark(<light>, <dark>)`. */
function backgroundTokens(css: string): { light: string; dark: string } {
  const match = css.match(
    /--bg:\s*light-dark\(\s*(#[0-9a-fA-F]{3,8})\s*,\s*(#[0-9a-fA-F]{3,8})\s*\)/,
  )
  if (!match) throw new Error('--bg is no longer a light-dark() pair in tokens.css')
  return { light: match[1]!.toLowerCase(), dark: match[2]!.toLowerCase() }
}

/** Every scheme whose theme-color no longer equals `--bg`. Empty means in step. */
function drift(css: string, themeColor: typeof THEME_COLOR): string[] {
  const bg = backgroundTokens(css)
  return themeColor.flatMap(({ media, color }) => {
    const scheme = media.includes('dark') ? 'dark' : 'light'
    return color.toLowerCase() === bg[scheme] ? [] : [`${scheme}: ${color} vs --bg ${bg[scheme]}`]
  })
}

describe('theme-color (CO-05)', () => {
  it('declares exactly one colour per scheme', () => {
    expect(THEME_COLOR.map((entry) => entry.media).sort()).toEqual([
      '(prefers-color-scheme: dark)',
      '(prefers-color-scheme: light)',
    ])
  })

  it('matches --bg in tokens.css, which is the source of truth', () => {
    expect(drift(TOKENS, THEME_COLOR)).toEqual([])
  })

  it('the drift check catches a changed token (negative control)', () => {
    const planted = TOKENS.replace(
      /--bg:\s*light-dark\([^)]*\)/,
      '--bg: light-dark(#ffffff, #000000)',
    )
    expect(planted, 'the plant did not change tokens.css').not.toBe(TOKENS)
    expect(drift(planted, THEME_COLOR)).toHaveLength(2)
  })
})
