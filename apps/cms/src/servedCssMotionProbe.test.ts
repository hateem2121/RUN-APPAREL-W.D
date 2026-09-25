import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  extractLeafRules,
  findForbiddenWillChangeOrTransitionAll,
  findHoverOpacityFades,
  findLayoutPropertyTransitions,
} from '../../../scripts/served-css-motion-probe.mjs'

/**
 * MO-05 / MO-15 / MO-16 — three motion-discipline checks against the SERVED (built) CSS
 * on both surfaces, never the source — same reasoning as `cssDiscipline.test.ts`'s SZ-12
 * check, which this file's build-detection is copied from.
 *
 * ⚠️ THIS PROOF GENUINELY NEEDS A BUILD STEP FIRST. `pnpm build` runs AFTER
 * `test:coverage` in this repo's own gate order (root CLAUDE.md), so the first time this
 * suite runs in CI there is no `dist`/`.next` yet. Locally this test SKIPS (does not
 * fail) when the built output is absent; run `pnpm seed:assets && pnpm build` first to
 * exercise it for real. `test:built-config` runs it again with
 * `REQUIRE_BUILD_ARTIFACTS=1` after CI's own build step, so a missing build there is a
 * hard failure, not a silent skip.
 */

const VIEWER_DIST = join(import.meta.dirname, '..', '..', 'viewer', 'dist', 'assets')
const CMS_CHUNKS = join(import.meta.dirname, '..', '.next', 'static', 'chunks')
const REQUIRE_BUILD = process.env.REQUIRE_BUILD_ARTIFACTS === '1'

function allCssText(dir: string): string {
  const files = readdirSync(dir).filter((name) => name.endsWith('.css'))
  return files.map((file) => readFileSync(join(dir, file), 'utf8')).join('\n')
}

/**
 * `.next/static/chunks` also carries Payload's OWN admin-panel CSS (its drawer,
 * locale-select and other component styles) — third-party UI this repo does not author
 * and should not gate. Measured: it legitimately uses `transition: all` and holds
 * `will-change` outside any allow-list this repo would write. Scoped to the chunk(s)
 * that actually contain a site-authored selector, so the admin bundle is never scanned.
 */
function siteCssText(dir: string): string {
  const files = readdirSync(dir).filter((name) => name.endsWith('.css'))
  const siteFiles = files.filter((file) => {
    const css = readFileSync(join(dir, file), 'utf8')
    return css.includes('.site-hero') || css.includes('.notch__wordmark')
  })
  return siteFiles.map((file) => readFileSync(join(dir, file), 'utf8')).join('\n')
}

/**
 * The instrument's own negative control — runs unconditionally, no build required, and
 * proves the probe can SEE a defect it did not plant itself, not just pass a clean build.
 * `measurement-instruments-that-lie`: a reading of zero means nothing until the same
 * harness is shown reporting non-zero against a deliberately broken input.
 */
describe('the probe itself catches a planted violation of each kind', () => {
  it('flags a :hover opacity fade on a button/link selector, and only that selector', () => {
    const css = `
      .btn--primary:hover { opacity: 0.8; }
      .btn--primary:hover { transform: translateY(-1px); }
      .card:hover { opacity: 0.8; }
    `
    const rules = extractLeafRules(css)
    const violations = findHoverOpacityFades(rules)
    expect(violations.map((v) => v.selector)).toEqual(['.btn--primary:hover'])
  })

  it('flags will-change outside the allow-list, and transition: all anywhere', () => {
    const css = `
      [data-reveal] { will-change: opacity, transform; }
      .not-on-the-list { will-change: transform; }
      .everything-moves { transition: all 200ms; }
    `
    const rules = extractLeafRules(css)
    const violations = findForbiddenWillChangeOrTransitionAll(rules)
    const reasons = violations.map((v) => `${v.selector}: ${v.reason}`)
    expect(reasons).toContain('.not-on-the-list: will-change outside the allow-list')
    expect(reasons).toContain('.everything-moves: transition(-property): all')
    expect(reasons).not.toContain('[data-reveal]: will-change outside the allow-list')
  })

  it('flags a transition naming a layout property, and not one naming filter/opacity', () => {
    const css = `
      .grows-on-hover:hover { transition: width 200ms; }
      .fine { transition: filter 200ms, opacity 200ms; }
    `
    const rules = extractLeafRules(css)
    const violations = findLayoutPropertyTransitions(rules)
    expect(violations.map((v) => v.selector)).toEqual(['.grows-on-hover:hover'])
  })

  it('survives a nested @media container the way a real build ships one', () => {
    const css = `
      @media (min-width: 768px) {
        .card:hover { opacity: 0.5; }
      }
    `
    const rules = extractLeafRules(css)
    expect(findHoverOpacityFades(rules).map((v) => v.selector)).toEqual([])
    // .card is not a button/link selector, so this is a control for the OTHER direction:
    // the nested rule was reached at all (proven by extractLeafRules returning it).
    expect(rules.map((r) => r.selector)).toContain('.card:hover')
  })
})

describe('MO-05 / MO-15 / MO-16 — the served CSS carries none of the three forbidden motion patterns', () => {
  const viewerDistExists = existsSync(VIEWER_DIST)
  const cmsChunksExist = existsSync(CMS_CHUNKS)

  it('a CI step that forgot to build cannot pass this file', () => {
    expect(
      REQUIRE_BUILD && !viewerDistExists,
      'REQUIRE_BUILD_ARTIFACTS=1 but no viewer CSS bundle was found under dist/assets',
    ).toBe(false)
    expect(
      REQUIRE_BUILD && !cmsChunksExist,
      'REQUIRE_BUILD_ARTIFACTS=1 but no CMS CSS chunk directory was found under .next',
    ).toBe(false)
  })

  it.skipIf(!viewerDistExists && !REQUIRE_BUILD)(
    'the viewer bundle has no hover-opacity fade, no stray will-change, no transition:all, no layout-property transition',
    () => {
      const css = allCssText(VIEWER_DIST)
      const rules = extractLeafRules(css)
      expect(
        rules.length,
        'no CSS rules were parsed at all — the probe is reading nothing',
      ).toBeGreaterThan(0)

      const hoverFades = findHoverOpacityFades(rules)
      expect(
        hoverFades,
        `hover-opacity fades on a button/link: ${JSON.stringify(hoverFades)}`,
      ).toEqual([])

      const willChange = findForbiddenWillChangeOrTransitionAll(rules)
      expect(
        willChange,
        `will-change outside the allow-list, or transition: all: ${JSON.stringify(willChange)}`,
      ).toEqual([])

      const layoutTransitions = findLayoutPropertyTransitions(rules)
      expect(
        layoutTransitions,
        `a transition names a layout property: ${JSON.stringify(layoutTransitions)}`,
      ).toEqual([])
    },
  )

  it.skipIf(!cmsChunksExist && !REQUIRE_BUILD)(
    'the site bundle has no hover-opacity fade, no stray will-change, no transition:all, no layout-property transition',
    () => {
      const css = siteCssText(CMS_CHUNKS)
      expect(
        css.length,
        'no CSS chunk with a site-authored selector was found — check the marker classes',
      ).toBeGreaterThan(0)
      const rules = extractLeafRules(css)
      expect(
        rules.length,
        'no CSS rules were parsed at all — the probe is reading nothing',
      ).toBeGreaterThan(0)

      const hoverFades = findHoverOpacityFades(rules)
      expect(
        hoverFades,
        `hover-opacity fades on a button/link: ${JSON.stringify(hoverFades)}`,
      ).toEqual([])

      // The default allow-list applies here too: `[data-reveal]` is shared with the
      // viewer through `packages/ui/src/base.css`, which both surfaces bundle.
      // `.stage__placeholder` is viewer-only and simply never matches on this side.
      const willChange = findForbiddenWillChangeOrTransitionAll(rules)
      expect(
        willChange,
        `will-change outside the allow-list, or transition: all: ${JSON.stringify(willChange)}`,
      ).toEqual([])

      const layoutTransitions = findLayoutPropertyTransitions(rules)
      expect(
        layoutTransitions,
        `a transition names a layout property: ${JSON.stringify(layoutTransitions)}`,
      ).toEqual([])
    },
  )
})
