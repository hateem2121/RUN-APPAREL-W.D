import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { familySlug } from '@run-apparel/shared'
import { describe, expect, it } from 'vitest'

/**
 * The garment pages' trail and breadcrumbs link a category with no page of its own to the
 * website's family filter, `/products?family=<slug>` (domain move, 2026-09-28; categories WITH
 * a page link it since polish S5, packages/shared/src/categoryPages.ts). The website keeps each
 * family's slug next to its name in apps/cms/src/lib/families.ts, and the garment pages DERIVE
 * the slug from the name — two spellings no build step compares, the rename-breaks-a-gate
 * class `src/siteLinks.test.ts` describes.
 *
 * The CMS file is READ, not imported: `biome.jsonc` forbids cross-app imports.
 */
const FAMILIES = join(import.meta.dirname, '..', '..', 'cms', 'src', 'lib', 'families.ts')

function cmsFamilies(): Array<{ slug: string; name: string }> {
  const source = readFileSync(FAMILIES, 'utf8')
  return [...source.matchAll(/slug: '([^']+)',\s*name: '([^']+)'/g)].map((m) => ({
    slug: m[1] ?? '',
    name: m[2] ?? '',
  }))
}

describe('the breadcrumb spells each family the way the website does', () => {
  it('derives every family slug from its category name', () => {
    for (const family of cmsFamilies())
      expect(familySlug(family.name), family.name).toBe(family.slug)
  })

  it('reads the five families — negative control', () => {
    // Without this, the loop above passes on an empty read.
    expect(cmsFamilies()).toHaveLength(5)
    expect(familySlug('Teamwear & Uniforms')).not.toBe('teamwear-&-uniforms')
  })
})
