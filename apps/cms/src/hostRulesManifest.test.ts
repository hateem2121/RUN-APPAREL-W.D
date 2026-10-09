import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { siteRedirects, siteRewrites } from '../siteHostRules.mjs'

/**
 * The host rules, read back from the BUILD.
 *
 * publicViewerHeaders.mjs records why this is the only proof that counts: a header set
 * in a handler was tested, green, merged, deployed — and overridden in production by a
 * rule appended after it. A config rule that does not reach .next/routes-manifest.json
 * does not exist, however correct next.config.mjs reads.
 *
 * Same shape as apps/viewer/scripts/preload.test.ts: skipped locally when there is no
 * build, so `pnpm test` stays fast; REQUIRED in CI's post-build guard step, where a
 * missing build is a hard failure rather than a silent skip.
 */
const CMS_ROOT = join(import.meta.dirname, '..')
const MANIFEST = join(CMS_ROOT, '.next', 'routes-manifest.json')
const REQUIRE_BUILD = process.env.REQUIRE_BUILD_ARTIFACTS === '1'
const HAS_BUILD = existsSync(MANIFEST)

type HostRule = { source: string; destination: string; has?: { type: string; value: string }[] }
const describeRule = (r: HostRule) =>
  `${r.has?.find((h) => h.type === 'host')?.value} ${r.source} -> ${r.destination}`

describe('the build carries every host rule', () => {
  it('a CI step that forgot to build cannot pass this file', () => {
    expect(
      REQUIRE_BUILD && !HAS_BUILD,
      'REQUIRE_BUILD_ARTIFACTS=1 but .next has no routes-manifest.json',
    ).toBe(false)
  })

  it.skipIf(!HAS_BUILD && !REQUIRE_BUILD)('every redirect landed, with its host condition', () => {
    const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8')) as {
      redirects: (HostRule & { statusCode?: number })[]
    }
    const built = manifest.redirects.filter((r) => r.has?.some((h) => h.type === 'host'))
    expect(built.map(describeRule).sort()).toEqual(siteRedirects().map(describeRule).sort())
    for (const rule of built) expect(rule.statusCode, describeRule(rule)).toBe(308)
  })

  /*
   * The /factory forward (the about-factory build, 2026-10-09) is EXACT PATH: the factory photos
   * really live at /factory/<file>.webp, and a rule that caught them would answer a photo request
   * with a page. Judged on the BUILT regexes, which are what the server runs.
   */
  const PHOTO = '/factory/exterior-640.webp'
  const redirectsCatching = <Rule extends { regex: string }>(rules: Rule[], path: string) =>
    rules.filter((rule) => new RegExp(rule.regex).test(path))

  it.skipIf(!HAS_BUILD && !REQUIRE_BUILD)(
    'forwards /factory, and leaves the factory photo files alone',
    () => {
      expect(existsSync(join(CMS_ROOT, 'public', PHOTO)), `${PHOTO} is not a real file`).toBe(true)
      const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8')) as {
        redirects: (HostRule & { regex: string; statusCode?: number })[]
      }
      const forward = redirectsCatching(manifest.redirects, '/factory')
      expect(forward.map(describeRule)).toEqual([
        '^wear-run\\.com$ /factory -> https://wear-run.com/inside-the-factory',
      ])
      expect(redirectsCatching(manifest.redirects, PHOTO).map(describeRule)).toEqual([])
    },
  )

  // NEGATIVE CONTROL: the same rule written as a prefix (`/factory/:path*`) catches the photo.
  it.skipIf(!HAS_BUILD && !REQUIRE_BUILD)('sees the fault: a prefix rule takes the photo', () => {
    const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8')) as {
      redirects: (HostRule & { regex: string })[]
    }
    const exact = manifest.redirects.find((rule) => rule.source === '/factory')
    if (!exact) throw new Error('no built /factory rule to plant a fault in')
    // Next compiles `/factory/:path*` to this shape (path-to-regexp's optional repeat).
    const prefix = { ...exact, regex: '^/factory(?:/((?:[^/]+?)(?:/(?:[^/]+?))*))?(?:/)?$' }
    expect(redirectsCatching([prefix], PHOTO)).toHaveLength(1)
  })

  it.skipIf(!HAS_BUILD && !REQUIRE_BUILD)(
    'every beforeFiles rewrite landed, with its host condition',
    () => {
      const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8')) as {
        rewrites: { beforeFiles: HostRule[] } | HostRule[]
      }
      const beforeFiles = Array.isArray(manifest.rewrites) ? [] : manifest.rewrites.beforeFiles
      const built = beforeFiles.filter((r) => r.has?.some((h) => h.type === 'host'))
      expect(built.map(describeRule).sort()).toEqual(
        siteRewrites().beforeFiles.map(describeRule).sort(),
      )
    },
  )
})
