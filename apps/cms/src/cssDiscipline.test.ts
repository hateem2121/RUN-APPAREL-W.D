import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * SZ-12: `dvh` re-resolves on every browser-chrome change (measured on a real iPhone:
 * one swipe produced 14 separate values across a 40px range — `apps/viewer/CLAUDE.md`).
 * Both stylesheets moved to `svh` for exactly that reason (`page.css:5-8,13,413,564`,
 * `site.css:1083,1089`) — this reads the BUILT output rather than the source, since a
 * bundler or a future dependency could reintroduce `dvh` in a way `grep`-ing the source
 * alone would not catch.
 *
 * ⚠️ THIS PROOF GENUINELY NEEDS A BUILD STEP FIRST. `pnpm
 * build` runs AFTER `test:coverage` in this repo's own gate order (root CLAUDE.md), so
 * the very first time this suite runs in CI there is no `dist`/`.next` yet. Locally this
 * test SKIPS (does not fail) when the built output is absent, so `pnpm test` stays fast —
 * run `pnpm --filter @run-apparel/viewer build` and `pnpm --filter @run-apparel/cms build`
 * (or the repo's own `seed:assets && build`) first to exercise it for real. `test:built-config`
 * runs it again with `REQUIRE_BUILD_ARTIFACTS=1` after CI's own build step, same shape as
 * `hostRulesManifest.test.ts`, so a missing build there is a hard failure, not a silent skip.
 */

const VIEWER_DIST = join(import.meta.dirname, '..', '..', 'viewer', 'dist', 'assets')
const CMS_CHUNKS = join(import.meta.dirname, '..', '.next', 'static', 'chunks')
const REQUIRE_BUILD = process.env.REQUIRE_BUILD_ARTIFACTS === '1'

/**
 * Every `dvh` occurrence NOT inside a `/* ... *\/` comment. Simple on purpose (SZ-12's
 * own citation): strip comments first, then look at what is left.
 *
 * ⚠️ NO `\b` WORD BOUNDARY BEFORE THE UNIT. `dvh`/`svh` always follow a NUMBER in real
 * CSS (`100dvh`, `34svh`) — and a digit and a letter are both "word" characters, so
 * `\bdvh\b` never matches `100dvh` at all. Measured while writing this file: the first
 * version reported zero `svh` in a stylesheet that `grep -c` confirmed does contain it,
 * which would have made the `dvh` half of this same check silently blind to a real
 * `100dvh` too — the exact "control that did not apply" shape this repo has hit before.
 */
function nonCommentDvhCount(css: string): number {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '')
  return (withoutComments.match(/dvh\b/g) ?? []).length
}

function firstCssFile(dir: string): string | null {
  if (!existsSync(dir)) return null
  const file = readdirSync(dir).find((name) => name.endsWith('.css'))
  return file ? join(dir, file) : null
}

describe('SZ-12 — the built CSS never ships a real dvh, on either surface', () => {
  const viewerCssPath = firstCssFile(VIEWER_DIST)
  // The CMS ships one CSS rule per <dvh>-bearing declaration across several chunks;
  // the one carrying `prefers-contrast`/`svh` is not guaranteed to be the first
  // alphabetically, so scan every chunk rather than assume a single file.
  const cmsChunkDir = existsSync(CMS_CHUNKS) ? CMS_CHUNKS : null

  it('a CI step that forgot to build cannot pass this file', () => {
    expect(
      REQUIRE_BUILD && !viewerCssPath,
      'REQUIRE_BUILD_ARTIFACTS=1 but no viewer CSS bundle was found under dist/assets',
    ).toBe(false)
    expect(
      REQUIRE_BUILD && !cmsChunkDir,
      'REQUIRE_BUILD_ARTIFACTS=1 but no CMS CSS chunk directory was found under .next',
    ).toBe(false)
  })

  it.skipIf(!viewerCssPath && !REQUIRE_BUILD)(
    'the viewer bundle has zero real dvh and at least one svh',
    () => {
      const css = readFileSync(viewerCssPath as string, 'utf8')
      expect(nonCommentDvhCount(css), `${viewerCssPath} contains a real dvh declaration`).toBe(0)
      expect(
        /svh\b/.test(css),
        `${viewerCssPath} has no svh at all — the control for this test`,
      ).toBe(true)
    },
  )

  it.skipIf(!cmsChunkDir && !REQUIRE_BUILD)(
    'the site bundle has zero real dvh and at least one svh',
    () => {
      const files = readdirSync(cmsChunkDir as string).filter((name) => name.endsWith('.css'))
      expect(files.length, 'no CSS chunks were emitted at all').toBeGreaterThan(0)

      let dvhCount = 0
      let sawSvh = false
      for (const file of files) {
        const css = readFileSync(join(cmsChunkDir as string, file), 'utf8')
        dvhCount += nonCommentDvhCount(css)
        if (/svh\b/.test(css)) sawSvh = true
      }
      expect(dvhCount, 'a real dvh declaration was found across the built CSS chunks').toBe(0)
      expect(sawSvh, 'no svh was found anywhere — the control for this test').toBe(true)
    },
  )
})
