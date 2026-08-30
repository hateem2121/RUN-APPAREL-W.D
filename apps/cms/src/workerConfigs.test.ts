import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Invariants across all four wrangler configs.
 *
 * These exist because two of them were violated silently and neither was visible
 * from any single file — you only see it by putting the four side by side.
 *
 *   1. `apps/viewer` was the ONLY Worker without an `observability` block, and it is
 *      the only public-facing one. Its logs went nowhere queryable until 2026-08-30.
 *   2. `apps/cms` is the only Worker with `workers_dev: true`, which is a second,
 *      unprotected hostname outside the wear-run.help zone — no WAF, no bot
 *      protection, no rate limiting, no analytics. The live viewer bundle calls THAT
 *      host, not cms.wear-run.help, so 100% of API traffic bypasses the zone.
 *
 * ⚠️ TEST 2 IS MEANT TO FAIL WHEN THE CUTOVER LANDS. It pins a temporary state, and
 * the failure message says what to do. Do not "fix" it by deleting the assertion.
 */
const REPO_ROOT = join(import.meta.dirname, '..', '..', '..')

const CONFIGS = [
  'apps/viewer/wrangler.jsonc',
  'apps/cms/wrangler.jsonc',
  'apps/shrink/wrangler.jsonc',
  'infra/apex-404/wrangler.jsonc',
] as const

const read = (rel: string) => readFileSync(join(REPO_ROOT, rel), 'utf8')

/** Strip `//` comments so a rule quoted in prose is not mistaken for the setting. */
const settings = (source: string) =>
  source
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n')

describe('wrangler config invariants', () => {
  it.each(CONFIGS)('%s declares observability', (config) => {
    expect(
      settings(read(config)),
      `${config} has no "observability" block. Its console output and uncaught ` +
        'exceptions go nowhere queryable, and the gap is invisible unless the four ' +
        'configs are compared.',
    ).toContain('"observability"')
  })

  it('only apps/cms exposes a workers.dev hostname, and only until the cutover', () => {
    const exposed = CONFIGS.filter((config) => /"workers_dev":\s*true/.test(settings(read(config))))

    expect(
      exposed,
      'A Worker exposes workers.dev. That is a second public hostname OUTSIDE the ' +
        'wear-run.help zone, so no WAF rule, rate limit, cache rule or analytics ' +
        'applies to it.\n\n' +
        'If this failed because apps/cms was FIXED: delete this test and update ' +
        'docs/RUNBOOK.md → "Viewer: Pages → Worker cutover" step 4. That is the ' +
        'intended end state.\n\n' +
        'If it failed because a NEW Worker turned workers_dev on: do not.',
    ).toEqual(['apps/cms/wrangler.jsonc'])
  })

  it.each(CONFIGS)('%s disables per-version preview URLs', (config) => {
    // Preview URLs are a third public hostname per deployed version. Every config
    // already sets this; the assertion stops a new one from omitting it.
    expect(settings(read(config))).toMatch(/"preview_urls":\s*false/)
  })
})
