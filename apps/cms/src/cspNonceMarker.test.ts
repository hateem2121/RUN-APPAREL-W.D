import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { PUBLIC_PAGE_CSP, PUBLIC_PAGE_SOURCES } from '../publicViewerHeaders.mjs'

/**
 * The script guard's trigger, read out of the BUILD (SE-04, decided 2026-09-18).
 *
 * worker.mjs nonces a response only when its Content-Security-Policy is EXACTLY
 * PUBLIC_PAGE_CSP (cspNonce.mjs → nonceable). This proves that the policy a client really
 * receives is exactly that string for the five pages and the 404, and is NOT for /admin or
 * /api. A path that stopped matching would fall open to 'unsafe-inline' with no error
 * anywhere, and this is the first thing that would notice.
 *
 * It reads the COMPILED regexes, for the reason notFoundCsp.test.ts gives: `sourceMatches`
 * cannot model the catch-all's lookahead.
 */
const CMS_ROOT = join(import.meta.dirname, '..')
const MANIFEST = join(CMS_ROOT, '.next', 'routes-manifest.json')
const REQUIRE_BUILD = process.env.REQUIRE_BUILD_ARTIFACTS === '1'
const HAS_BUILD = existsSync(MANIFEST)

type HeaderRule = { source: string; regex: string; headers: { key: string; value: string }[] }

const builtRules = (): HeaderRule[] =>
  (JSON.parse(readFileSync(MANIFEST, 'utf8')) as { headers: HeaderRule[] }).headers

/** Last matching rule wins, over the compiled regexes. */
function receivedCsp(rules: HeaderRule[], pathname: string): string | undefined {
  let value: string | undefined
  for (const rule of rules) {
    if (!new RegExp(rule.regex).test(pathname)) continue
    for (const h of rule.headers) {
      if (h.key.toLowerCase() === 'content-security-policy') value = h.value
    }
  }
  return value
}

const NONCED = [...PUBLIC_PAGE_SOURCES, '/definitely-not-a-page']
const NEVER = [
  '/admin',
  '/admin/collections/products',
  '/api/media',
  '/api/public/viewer/rxps/wine',
]

describe('the script guard trigger, as built', () => {
  it('a CI step that forgot to build cannot pass this file', () => {
    expect(
      REQUIRE_BUILD && !HAS_BUILD,
      'REQUIRE_BUILD_ARTIFACTS=1 but no routes-manifest.json',
    ).toBe(false)
  })

  it.skipIf(!HAS_BUILD && !REQUIRE_BUILD)(
    'the five pages and the 404 receive exactly PUBLIC_PAGE_CSP',
    () => {
      const rules = builtRules()
      for (const path of NONCED) {
        expect(receivedCsp(rules, path), `${path} would fall open`).toBe(PUBLIC_PAGE_CSP)
      }
    },
  )

  it.skipIf(!HAS_BUILD && !REQUIRE_BUILD)('the admin and the API never do', () => {
    const rules = builtRules()
    for (const path of NEVER) {
      expect(receivedCsp(rules, path), `${path} would be rewritten`).not.toBe(PUBLIC_PAGE_CSP)
    }
  })

  it.skipIf(!HAS_BUILD && !REQUIRE_BUILD)('the reader can fail (negative control)', () => {
    const planted = builtRules().map((rule) => ({
      ...rule,
      headers: rule.headers.map((h) =>
        h.key.toLowerCase() === 'content-security-policy' && h.value === PUBLIC_PAGE_CSP
          ? { ...h, value: `${h.value}; upgrade-insecure-requests` }
          : h,
      ),
    }))
    expect(receivedCsp(planted, '/')).not.toBe(PUBLIC_PAGE_CSP)
  })
})
