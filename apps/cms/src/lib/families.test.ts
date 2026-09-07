import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { FAMILIES, familyBySlug } from './families'

/**
 * ⚠️ THE FAILURE THIS GUARDS IS SILENT, WHICH IS WHY IT READS THE COLLECTION AS TEXT.
 *
 * The gallery filter matches `product.category` against `FAMILIES[].name` by string
 * equality. Rename an option in `Products.ts` — "Casual Wear" to "Casualwear", say — and
 * nothing throws, nothing fails a typecheck, and nothing looks wrong: the chip is still
 * there, it is still clickable, and it returns an empty gallery for ever. That is the
 * same shape as the `aria-current` rule this project shipped, which was correct CSS that
 * had never once applied.
 *
 * Reading the source rather than importing it is deliberate. `Products.ts` pulls in
 * Payload's collection config and its hooks, which need a database and an environment;
 * `claudeMd.test.ts` and `workflowHardening.test.ts` take the same approach for the same
 * reason. The parse is narrow and would fail loudly if the file's shape changed.
 */
const PRODUCTS_TS = join(import.meta.dirname, '..', 'collections', 'Products.ts')

function categoryOptionsFromSource(): string[] {
  const source = readFileSync(PRODUCTS_TS, 'utf8')
  const start = source.indexOf("name: 'category'")
  expect(start, "Products.ts no longer declares a field named 'category'").toBeGreaterThan(-1)
  const optionsAt = source.indexOf('options: [', start)
  expect(optionsAt, "the 'category' field no longer declares options").toBeGreaterThan(-1)
  // to the closing bracket of `options: [ … ]`, not to the first `},` inside it
  const block = source.slice(optionsAt, source.indexOf(']', optionsAt))
  return [...block.matchAll(/\{\s*label:\s*'([^']+)',\s*value:\s*'([^']+)'\s*\}/g)].map((m) => {
    const [, label, value] = m
    expect(label, 'a category label and value have diverged').toBe(value)
    return value ?? ''
  })
}

describe('the five families are the collection’s five categories', () => {
  it('names match the Products collection exactly, in order', () => {
    expect(FAMILIES.map((f) => f.name)).toEqual(categoryOptionsFromSource())
  })

  it('the negative control: a renamed category would be caught', () => {
    // Proves the parse above reads real content rather than returning a constant — if it
    // silently returned [] or the same array it was compared against, this would pass
    // with any input, and the guard would be the kind that has never caught anything.
    const options = categoryOptionsFromSource()
    expect(options.length).toBe(5)
    expect(options).toContain('Teamwear & Uniforms')
    expect(FAMILIES.map((f) => f.name)).not.toEqual(options.map((o) => `${o} `))
  })
})

describe('familyBySlug', () => {
  it('resolves every declared slug', () => {
    for (const family of FAMILIES) expect(familyBySlug(family.slug)).toBe(family)
  })

  it('treats an unknown or absent value as "everything"', () => {
    expect(familyBySlug(undefined)).toBeNull()
    expect(familyBySlug('')).toBeNull()
    expect(familyBySlug('outerwear-')).toBeNull()
    // A hand-typed URL must not be able to produce an error page.
    expect(familyBySlug('<script>')).toBeNull()
  })

  it('slugs are unique, lowercase and URL-safe', () => {
    const slugs = FAMILIES.map((f) => f.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
    for (const slug of slugs) expect(slug).toMatch(/^[a-z0-9-]+$/)
  })
})
