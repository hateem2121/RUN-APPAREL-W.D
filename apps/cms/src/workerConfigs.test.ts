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

/**
 * The apex PDF caching fix spans a config file and a source file, and neither half
 * works alone. Nothing else connects them.
 *
 *   wrangler.jsonc  must enable Workers Caching, at a compatibility_date >= 2026-07-06
 *   index.js        must return a full 200, never its own 206
 *
 * Cloudflare does not store a 206 produced by a Worker, so leaving the range handling
 * in place makes `cache.enabled` do nothing at all — silently, with no error and no
 * header. That is precisely the state the two PDFs were in until 2026-08-30: served
 * with no `cf-cache-status` whatsoever, ~1.0-1.8 s to first byte, never improving.
 */
describe('apex Workers Caching', () => {
  const config = read('infra/apex-404/wrangler.jsonc')
  const source = read('infra/apex-404/index.js')

  it('enables Workers Caching', () => {
    expect(settings(config)).toMatch(/"cache":\s*\{\s*"enabled":\s*true/)
  })

  it('sits at or above the compatibility_date the feature requires', () => {
    const date = settings(config).match(/"compatibility_date":\s*"(\d{4}-\d{2}-\d{2})"/)?.[1]
    expect(date, 'no compatibility_date found').toBeDefined()
    // Workers Caching requires >= 2026-07-06. String compare is safe on ISO dates.
    expect(String(date) >= '2026-07-06').toBe(true)
  })

  it('does NOT return its own 206 — that would make the cache inert', () => {
    expect(
      source,
      'The apex Worker builds a 206 again. Cloudflare will not store it, so ' +
        '`cache.enabled` becomes a no-op and both PDFs go back to being re-read from ' +
        'R2 on every request — with no error anywhere to say so.',
    ).not.toMatch(/status:\s*206|status\s*=\s*206/)
    expect(source).not.toContain('content-range')
  })

  it('does not forward the client Range to R2 — the edge slices', () => {
    expect(source).not.toMatch(/range:\s*request\.headers/)
  })
})
