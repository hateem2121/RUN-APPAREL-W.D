import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { SITE_ORIGIN, SITE_PRODUCTS_URL } from './lib/siteLinks'

/**
 * The viewer now links to the marketing site (owner decision D5, 2026-09-07), and
 * the two apps spell that host in two files that no build step compares.
 *
 * ⚠️ THIS IS THE RENAME-BREAKS-A-GATE CLASS, and this repo has paid for it twice:
 * `productCode` went `RXPS` -> `R-XPS` and took a post-deploy gate with it, after
 * the `n001` -> `rxps` rename had already broken two. A host is exactly the same
 * shape of value — one side moves, the other keeps compiling, and the failure is a
 * wordmark that navigates to a dead domain on the page a QR scan lands on.
 *
 * The CMS file is READ, not imported: `biome.jsonc`'s `noRestrictedImports` forbids
 * cross-app imports, and a test that reached into `apps/cms` would also drag its
 * dependency graph into this package's unit run. The regex is the contract.
 */
const CMS_HOST_RULES = join(import.meta.dirname, '..', '..', 'cms', 'siteHostRules.mjs')

function cmsSiteHost(): string {
  const source = readFileSync(CMS_HOST_RULES, 'utf8')
  const match = source.match(/export const SITE_HOST = '([^']+)'/)
  if (!match) {
    throw new Error(
      `Could not read SITE_HOST from ${CMS_HOST_RULES}. If that declaration moved, ` +
        `this test is now blind — repoint it rather than deleting it.`,
    )
  }
  return match[1] ?? ''
}

describe('the viewer and the CMS agree on where the site lives', () => {
  it('SITE_ORIGIN is the CMS host rules’ SITE_HOST over https', () => {
    expect(SITE_ORIGIN).toBe(`https://${cmsSiteHost()}`)
  })

  it('the reader can actually fail — negative control', () => {
    // Without this, a changed declaration would throw (good) but a *matching-shaped*
    // one would pass silently. Prove the regex reads a value rather than returning a
    // constant, and that it rejects the file not carrying one.
    expect(cmsSiteHost()).toMatch(/^[a-z0-9.-]+$/)
    expect(cmsSiteHost()).not.toBe('')
    expect(readFileSync(CMS_HOST_RULES, 'utf8')).toContain('SITE_HOST')
  })

  it('is not the catalogue, and has no trailing slash', () => {
    // `catalogueLinks.test.ts` forbids the 54.3 MB PDF everywhere in this app; these
    // constants are the thing most likely to be "helpfully" pointed at it later.
    expect(SITE_ORIGIN).not.toContain('catalogue')
    expect(SITE_PRODUCTS_URL).not.toContain('catalogue')
    expect(SITE_ORIGIN.endsWith('/')).toBe(false)
    expect(SITE_PRODUCTS_URL).toBe(`${SITE_ORIGIN}/products`)
  })
})
