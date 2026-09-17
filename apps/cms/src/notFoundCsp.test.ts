import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  OTHER_PAGE_CSP_SOURCE,
  OTHER_PATH_ISOLATION,
  PUBLIC_PAGE_CSP,
  PUBLIC_PAGE_SOURCES,
} from '../publicViewerHeaders.mjs'

/**
 * The 404's Content-Security-Policy (audit FA-O-01), read out of the BUILD.
 *
 * ⚠️ MEASURED BEFORE IT WAS FIXED, on the real build, 2026-09-07:
 *
 *   /                       200  default-src 'self'; script-src 'self' …
 *   /products               200  default-src 'self'; script-src 'self' …
 *   /definitely-not-a-page  404  frame-ancestors 'none'          <- the finding
 *   /admin                  200  frame-ancestors 'none'          <- correct, and must stay
 *
 * `PUBLIC_PAGE_SOURCES` is an explicit list of five paths and a 404 is by definition not
 * on any list, so the page a visitor reaches by mistyping a URL was the one page with no
 * `default-src`, no `script-src` and no `form-action`.
 *
 * ⚠️ THIS FILE READS THE BUILT REGEX, NOT THE SOURCE STRING, AND THAT IS THE POINT.
 * `sourceMatches` in publicViewerHeaders.mjs models Next's matching well enough for a
 * plain `:param`, and it knows nothing about a custom regex parameter — it rewrites
 * `:name` to `[^/]+` and would silently mis-model `(?!admin(?:/|$)|api(?:/|$)).*`.
 * Asserting against it would be a test of my own helper. Next compiles the real pattern
 * into `.next/routes-manifest.json`; that is what the running server uses, so that is
 * what is checked here. Same discipline, and the same reason, as
 * src/hostRulesManifest.test.ts.
 *
 * ⚠️ AND THE FAILURE THIS GUARDS AGAINST IS NOT THE 404. It is a lookahead that reaches
 * `/admin`, where this policy has no `unsafe-eval` and would break the Payload login —
 * on the side of the system that holds the password, with no error anywhere but the
 * browser console of whoever tried to log in.
 */

const CMS_ROOT = join(import.meta.dirname, '..')
const MANIFEST = join(CMS_ROOT, '.next', 'routes-manifest.json')
const REQUIRE_BUILD = process.env.REQUIRE_BUILD_ARTIFACTS === '1'
const HAS_BUILD = existsSync(MANIFEST)

type HeaderRule = { source: string; regex: string; headers: { key: string; value: string }[] }

function builtRules(): HeaderRule[] {
  return (JSON.parse(readFileSync(MANIFEST, 'utf8')) as { headers: HeaderRule[] }).headers
}

/** Every path whose answer must not change, and the one whose answer is the fix. */
const MATCHES: Record<string, boolean> = {
  '/': true,
  '/products': true,
  '/contact': true,
  '/definitely-not-a-page': true,
  '/a/b/c': true,
  '/robots.txt': true,
  '/llms.txt': true,
  // Two paths that merely BEGIN with the excluded words. The first version of the
  // lookahead was `(?!admin|api/)` and excluded `/administrator`, whose 404 would then
  // have been the one page still shipping with no policy.
  '/administrator': true,
  '/apix': true,
  // The two route roots, which must keep the weaker admin policy.
  '/admin': false,
  '/admin/': false,
  '/admin/collections/products': false,
  '/api': false,
  '/api/media': false,
  '/api/public/viewer/rxps/wine': false,
}

describe('the catch-all CSP', () => {
  it('a CI step that forgot to build cannot pass this file', () => {
    expect(
      REQUIRE_BUILD && !HAS_BUILD,
      'REQUIRE_BUILD_ARTIFACTS=1 but .next has no routes-manifest.json',
    ).toBe(false)
  })

  it.skipIf(!HAS_BUILD && !REQUIRE_BUILD)('reached the build at all', () => {
    const rule = builtRules().find((r) => r.source === OTHER_PAGE_CSP_SOURCE)
    expect(
      rule,
      'the catch-all CSP rule is not in routes-manifest.json — a rule that did not reach ' +
        'the build does not exist, however correct next.config.mjs reads',
    ).toBeDefined()
    expect(rule?.headers).toEqual([
      { key: 'Content-Security-Policy', value: PUBLIC_PAGE_CSP },
      ...OTHER_PATH_ISOLATION,
    ])
    expect(OTHER_PATH_ISOLATION).toEqual([
      { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
      { key: 'Cross-Origin-Resource-Policy', value: 'cross-origin' },
    ])
  })

  it.skipIf(!HAS_BUILD && !REQUIRE_BUILD)('matches exactly the paths it should', () => {
    const rule = builtRules().find((r) => r.source === OTHER_PAGE_CSP_SOURCE)
    if (!rule) throw new Error('no catch-all rule to test')
    const compiled = new RegExp(rule.regex)

    const wrong = Object.entries(MATCHES).filter(([path, want]) => compiled.test(path) !== want)
    expect(
      wrong.map(([path, want]) => `${path} should ${want ? 'match' : 'NOT match'}`),
      'the negative lookahead is wrong. Reaching /admin applies a policy with no ' +
        "'unsafe-eval' to the Payload login; not reaching a 404 leaves that page with no " +
        'policy at all.',
    ).toEqual([])
  })

  /*
   * ORDER IS THE MECHANISM, as it is everywhere in this file's neighbourhood. Next applies
   * matching rules in order and the LAST one wins, so the five explicit pages must come
   * AFTER the catch-all or they would lose their COOP and CORP headers to it.
   */
  it.skipIf(!HAS_BUILD && !REQUIRE_BUILD)('is overridden by the five explicit pages', () => {
    const rules = builtRules()
    const catchAll = rules.findIndex((r) => r.source === OTHER_PAGE_CSP_SOURCE)
    expect(catchAll).toBeGreaterThanOrEqual(0)

    for (const source of PUBLIC_PAGE_SOURCES) {
      const explicit = rules.findIndex((r) => r.source === source)
      expect(explicit, `no explicit rule for ${source}`).toBeGreaterThanOrEqual(0)
      expect(
        explicit,
        `${source} is matched by the catch-all AFTER its own rule, so it loses its ` +
          'Cross-Origin-Opener-Policy and Cross-Origin-Resource-Policy',
      ).toBeGreaterThan(catchAll)
    }
  })

  /*
   * The control for the assertion above: it compares two indices and would pass just as
   * happily against a manifest where neither rule existed and both were -1. This proves
   * the catch-all really does match a page that has its own rule, which is the only
   * reason the ordering matters at all.
   */
  it.skipIf(!HAS_BUILD && !REQUIRE_BUILD)('the ordering check is not vacuous', () => {
    const rule = builtRules().find((r) => r.source === OTHER_PAGE_CSP_SOURCE)
    if (!rule) throw new Error('no catch-all rule to test')
    const compiled = new RegExp(rule.regex)
    for (const source of PUBLIC_PAGE_SOURCES) {
      expect(compiled.test(source), `${source} is not matched by the catch-all`).toBe(true)
    }
  })
})
