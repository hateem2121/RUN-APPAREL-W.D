import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
// A root-level .mjs script, imported the same way collections/mediaReferences.test.ts
// imports find-orphan-media.mjs. `allowJs` in this app's tsconfig means its JSDoc
// types flow through, so no directive is needed — and adding one would itself be an
// error under `noUnusedLocals`-style checking.
import { EXPECTED_PACKAGES, REPO_LINE_FLOOR, evaluate } from '../../../scripts/check-coverage.mjs'

/**
 * Tests for the coverage gate itself.
 *
 * WHY THE GATE NEEDS ITS OWN TEST — and why this is not circular. `check-coverage.mjs`
 * exists to catch a package silently dropping out of the measurement. If IT breaks,
 * the symptom is that it passes: an empty report set, a package with no summary, a
 * stale file from last week's run. Every one of those looks exactly like success on
 * the terminal. So the assertions below are mostly NEGATIVE CONTROLS — they construct
 * each broken state and require a failure.
 *
 * WHY IT LIVES IN apps/cms. Root `scripts/` is not a workspace package and has no
 * runner; `collections/mediaReferences.test.ts` and `endpoints/publicViewerSmoke.test.ts`
 * both reach out of this app to test a root script for the same reason.
 */

const REPO_ROOT = join(import.meta.dirname, '..', '..', '..')

const summary = (covered: number, total: number) => ({
  total: { lines: { covered, total, pct: Number(((covered / total) * 100).toFixed(2)) } },
})

const report = (name: string, covered: number, total: number, ageMinutes: number | null = 0) => ({
  name,
  summary: summary(covered, total),
  ageMinutes,
})

describe('coverage gate', () => {
  it('passes when every package reports and the repo floor is met', () => {
    const result = evaluate([report('a', 90, 100), report('b', 80, 100)])

    expect(result.ok).toBe(true)
    expect(result.errors).toEqual([])
    expect(result.repoPct).toBe(85)
  })

  /**
   * THE CENTRAL CASE. Package `b` has no summary — its tests ran and passed, it
   * simply stopped being measured. Note what the naive implementation would report:
   * `a` alone is 90%, comfortably above the floor, so a gate that skipped missing
   * packages would announce a PASS and a HIGHER number than before.
   */
  it('fails when a package reports no summary at all, even if the rest are excellent', () => {
    const result = evaluate([report('a', 90, 100), { name: 'b', summary: null, ageMinutes: null }])

    expect(result.ok).toBe(false)
    expect(result.errors.join(' ')).toContain('b: no coverage/coverage-summary.json')
  })

  it('fails on a stale report when a max age is given', () => {
    const result = evaluate([report('a', 90, 100, 240)], { maxAgeMinutes: 30 })

    expect(result.ok).toBe(false)
    expect(result.errors.join(' ')).toContain('stale')
  })

  it('accepts a fresh report under the same age limit', () => {
    expect(evaluate([report('a', 90, 100, 2)], { maxAgeMinutes: 30 }).ok).toBe(true)
  })

  it('ignores age entirely when no limit is passed', () => {
    expect(evaluate([report('a', 90, 100, 99_999)]).ok).toBe(true)
  })

  it('fails below the repo-wide floor', () => {
    const result = evaluate([report('a', 10, 100)], { floor: 50 })

    expect(result.ok).toBe(false)
    expect(result.errors.join(' ')).toContain('below the floor')
  })

  /**
   * An empty input must never be a pass. This is the state a broken glob, a renamed
   * directory, or a `coverage/` that was cleaned mid-job would produce, and
   * `covered/total` would be `0/0` → NaN → a comparison that is false either way.
   */
  it('refuses to pass on no data rather than reporting 0% or NaN', () => {
    const result = evaluate([])

    expect(result.ok).toBe(false)
    expect(result.repoPct).toBe(0)
    expect(result.errors.join(' ')).toContain('empty measurement')
  })

  it('weights packages by line count, not by naive average of percentages', () => {
    // 1/10 and 900/1000 average to 50% unweighted, but the real figure is 90.2%.
    // A naive mean would let a tiny, badly covered package veto a large healthy one.
    const result = evaluate([report('small', 1, 10), report('large', 900, 1000)])

    expect(result.repoPct).toBeCloseTo(89.21, 1)
  })
})

describe('coverage gate wiring', () => {
  it('expects exactly the workspaces that actually run vitest', () => {
    // Hard-coded in the script on purpose (discovery would shrink with the thing it
    // checks). This is the assertion that notices when a sixth workspace is added.
    const packages = EXPECTED_PACKAGES as string[]
    const withVitestConfig = packages.filter((p) => {
      try {
        readFileSync(join(REPO_ROOT, p, 'vitest.config.ts'), 'utf8')
        return true
      } catch {
        return false
      }
    })

    expect(withVitestConfig.sort()).toEqual(packages.sort())
  })

  it('every expected package declares coverage thresholds', () => {
    const missing = (EXPECTED_PACKAGES as string[]).filter((p) => {
      const config = readFileSync(join(REPO_ROOT, p, 'vitest.config.ts'), 'utf8')
      return !config.includes('thresholds:')
    })

    expect(
      missing,
      'a package without thresholds is measured but not gated — it can regress to zero silently',
    ).toEqual([])
  })

  it('states a repo floor that is a real number below 100', () => {
    expect(REPO_LINE_FLOOR).toBeGreaterThan(0)
    expect(REPO_LINE_FLOOR).toBeLessThan(100)
  })
})
