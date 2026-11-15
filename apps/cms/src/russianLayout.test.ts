import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * The Russian root layout is the English one with four stated differences (its header comment).
 * This holds the two to the same parts in the same order, so a component added to the English
 * layout (a new tracker, a new overlay) and forgotten in Russian fails here, not on a buyer's
 * screen. Comments are stripped first: the English file's comments name components too.
 */
const APP = join(__dirname, 'app')
const code = (file: string) =>
  readFileSync(join(APP, file), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/^\s*\/\/.*$/gm, '')

const parts = (source: string) =>
  [...source.matchAll(/<([A-Z][A-Za-z]+|main|script|a|html|body)\b/g)].map((match) => match[1])

const cssImports = (source: string) =>
  [...source.matchAll(/^import '([^']+\.css)'/gm)].map((match) =>
    (match[1] ?? '').replace('../(frontend)/', './'),
  )

describe('the Russian layout mirrors the English one (2026-11-15)', () => {
  const english = code('(frontend)/layout.tsx')
  const russian = code('(ru)/layout.tsx')

  it('draws the same parts in the same order', () => {
    expect(parts(russian)).toEqual(parts(english))
  })

  it('imports the same stylesheets, plus only the Cyrillic faces', () => {
    expect(cssImports(russian).filter((css) => !css.endsWith('cyrillic.css'))).toEqual(
      cssImports(english),
    )
    expect(cssImports(russian)).toContain('@run-apparel/ui/cyrillic.css')
    expect(cssImports(english).some((css) => css.endsWith('cyrillic.css'))).toBe(false)
  })

  it('declares Russian, and English keeps English', () => {
    expect(russian).toContain('<html lang="ru"')
    expect(english).toContain('<html lang="en"')
  })
})
