import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { t } from './ui'
import { UI_RU } from './ui.ru'
import { UI_RU_CLIENT } from './ui.ru.client'

const SRC = join(__dirname, '..', '..')
const CYRILLIC = /[Ѐ-ӿ]/

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return name === 'node_modules' ? [] : sources(path)
    return /\.tsx?$/.test(name) && !/\.test\./.test(name) ? [path] : []
  })
}

/** Every literal key passed to `fn(…, '…')` across the app's source. */
function keys(fn: 't' | 'tc'): string[] {
  const call = new RegExp(
    `\\b${fn}\\(\\s*[\\w.]+,\\s*(['"\`])((?:(?!\\1)[^\\\\]|\\\\.)*)\\1\\s*\\)`,
    'g',
  )
  return [
    ...new Set(
      sources(SRC).flatMap((file) =>
        [...readFileSync(file, 'utf8').matchAll(call)].map((match) => match[2] ?? ''),
      ),
    ),
  ]
}

describe('the components’ own words in Russian (2026-11-15)', () => {
  it('gives every server-side t() key a Russian entry', () => {
    const missing = keys('t').filter((key) => !(key in UI_RU))
    expect(missing, 'add these to lib/i18n/ui.ru.ts').toEqual([])
  })

  it('gives every client-side tc() key a Russian entry in the small client table', () => {
    const missing = keys('tc').filter((key) => !(key in UI_RU_CLIENT))
    expect(missing, 'add these to lib/i18n/ui.ru.client.ts').toEqual([])
  })

  it('has no Russian entry left that no code asks for', () => {
    const used = new Set(keys('t'))
    const usedClient = new Set(keys('tc'))
    expect(Object.keys(UI_RU).filter((key) => !used.has(key))).toEqual([])
    expect(Object.keys(UI_RU_CLIENT).filter((key) => !usedClient.has(key))).toEqual([])
  })

  it('writes every Russian entry in Russian', () => {
    for (const value of [...Object.values(UI_RU), ...Object.values(UI_RU_CLIENT)]) {
      expect(value, value).toMatch(CYRILLIC)
    }
  })

  it('leaves English exactly as it was', () => {
    expect(t('en', 'Sources')).toBe('Sources')
    expect(t(undefined, 'Sources')).toBe('Sources')
  })
})
