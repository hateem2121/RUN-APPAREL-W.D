import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = import.meta.dirname
const importMap = readFileSync(join(ROOT, 'app/(payload)/admin/importMap.js'), 'utf8')
const documentVisitsCollection = readFileSync(join(ROOT, 'collections/DocumentVisits.ts'), 'utf8')

const KEY = '/collections/DocumentVisitsSummary#DocumentVisitsSummary'

/**
 * Nothing asserted that importMap.js stays in sync with the components collections
 * actually register: measured 2026-09-16, no file under `apps/cms/src` referenced the
 * import map before this one. This is that assertion, for the one component this
 * plan adds. Reads the real files rather than grepping for a string
 * elsewhere, for the reason `mediaReferences.test.ts` already gives: asserting a
 * string exists only proves the string exists, not that the two sides agree.
 */
describe('the admin import map includes the visit summary component', () => {
  it('importMap.js contains the key DocumentVisits.ts registers', () => {
    expect(importMap).toContain(KEY)
  })

  it('DocumentVisits.ts references the same string', () => {
    expect(documentVisitsCollection).toContain(KEY)
  })

  it('a made-up key is absent (negative control)', () => {
    expect(importMap).not.toContain('/collections/DocumentVisitsSummary#NotARealExport')
  })
})
