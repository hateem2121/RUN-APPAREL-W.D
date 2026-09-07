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
 *   2. `apps/cms` was the only Worker with `workers_dev: true`, which is a second,
 *      unprotected hostname outside the wear-run.help zone — no WAF, no bot
 *      protection, no rate limiting, no analytics. CLOSED 2026-08-31.
 *
 * ⚠️ TEST 2 WAS WRITTEN TO FAIL WHEN THE CUTOVER LANDED, and it did. Its own failure
 * message said to DELETE it. That advice is declined deliberately: deleting it also
 * deletes the only thing stopping the NEXT Worker from turning workers.dev back on —
 * a case the same message calls out as "do not". The assertion is INVERTED instead,
 * which is strictly stronger than what it replaced: it pinned one exception, this
 * permits none. Audit 2026-08-30 PM, findings L1-01, L4-01, L5-02, L18-04.
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

  it('no Worker exposes a workers.dev hostname', () => {
    const exposed = CONFIGS.filter((config) => /"workers_dev":\s*true/.test(settings(read(config))))

    expect(
      exposed,
      'A Worker exposes workers.dev. That is a second public hostname OUTSIDE the ' +
        'wear-run.help zone, so no WAF rule, rate limit, cache rule or analytics ' +
        'applies to it — and for apps/cms it also published the /admin login there.\n\n' +
        'apps/cms carried this until 2026-08-31 as the last step of the API cutover. ' +
        'It is closed. There is no longer an approved exception, and adding one means ' +
        'accepting an unprotected door, not just a convenience URL.',
    ).toEqual([])
  })

  it('the workers.dev check can actually fail (negative control)', () => {
    // The assertion above passes when every config is correct, which is also what it
    // would do if `settings()` silently returned nothing. Feed it a config that DOES
    // expose workers.dev and require the detector to fire.
    const exposing = '{\n  "name": "x",\n  "workers_dev": true\n}'
    const commented = '{\n  "name": "x",\n  // "workers_dev": true\n}'
    expect(/"workers_dev":\s*true/.test(settings(exposing))).toBe(true)
    expect(/"workers_dev":\s*true/.test(settings(commented))).toBe(false)
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

/**
 * The marketing site lives on the apex, and the PDFs keep their two paths.
 *
 * Cloudflare hands a request to the MOST SPECIFIC matching route, so the CMS Worker can
 * hold `wear-run.help/*` while the PDF Worker holds `wear-run.help/catalogue*` and the
 * PDFs never notice the site arriving. A route pattern belongs to ONE Worker at a time —
 * which is why ci.yml deploys the PDF Worker before the CMS Worker (see the deploy job).
 *
 * ⚠️ A WILDCARD RESTORED TO THE PDF WORKER TAKES THE SITE DOWN, and a wildcard removed
 * from the CMS Worker does the same. Both are one-line edits that read as tidying.
 */
describe('the apex route split (2026-09-06)', () => {
  const cms = settings(read('apps/cms/wrangler.jsonc'))
  const apex = settings(read('infra/apex-404/wrangler.jsonc'))
  const patterns = (source: string) =>
    [...source.matchAll(/"pattern":\s*"([^"]+)"/g)].map((m) => m[1]).sort()

  it('the CMS Worker holds the custom domain AND both wildcards', () => {
    expect(patterns(cms)).toEqual(['cms.wear-run.help', 'wear-run.help/*', 'www.wear-run.help/*'])
    expect(cms).toMatch(/"pattern":\s*"wear-run\.help\/\*",\s*"zone_name":\s*"wear-run\.help"/)
    expect(cms).toMatch(/"pattern":\s*"www\.wear-run\.help\/\*",\s*"zone_name":\s*"wear-run\.help"/)
  })

  it('the PDF Worker holds exactly the four PDF routes and no wildcard', () => {
    expect(patterns(apex)).toEqual([
      'wear-run.help/catalogue*',
      'wear-run.help/profile*',
      'www.wear-run.help/catalogue*',
      'www.wear-run.help/profile*',
    ])
  })

  it('the pattern reader can actually fail (negative control)', () => {
    expect(patterns('{ "routes": [{ "pattern": "a/*" }, { "pattern": "b" }] }')).toEqual([
      'a/*',
      'b',
    ])
    expect(patterns('{ "routes": [] }')).toEqual([])
  })
})

/**
 * `run_worker_first` on the viewer — audit FA-N-14 and FA-N-15.
 *
 * ⚠️ WHAT THIS IS DEFENDING. Cloudflare's Static Assets router has an automatic
 * `Sec-Fetch-Mode: navigate` rule: a top-level navigation is served straight from the
 * asset router and the Worker is never invoked. A navigation is the ONLY way a human or
 * a link crawler ever reaches a page, so both features the viewer's Worker exists for —
 * the per-garment Open Graph card and the soft-404 fix — were inert for their entire
 * audience. Neither was broken code; the script simply did not run.
 *
 * Measured against the LIVE viewer on 2026-09-07, one header apart:
 *
 *   /rxps/wine  Twitterbot, plain             og:title "R-XPS X-MILO PRO SKIN-SUIT"
 *   /rxps/wine  Twitterbot + navigate         og:title "RUN APPAREL — 3D Product…"
 *   /manifest.webmanifest  browser, plain     404
 *   /manifest.webmanifest  browser + navigate 200
 *
 * ⚠️ AND REPRODUCED LOCALLY WITH A CONTROL THAT RAN BOTH WAYS, under `wrangler dev
 * --local` on 4.122.0, so the assertion below is not resting on a config file reading
 * correctly. With the array removed: `/manifest.webmanifest` 404 plain, 200 navigate.
 * With it restored: 404 both. Cloudflare's own local observability confirmed WHICH
 * requests reached the script — `/PROBE-page`, `/rxps/PROBE-colour` and `/og/PROBE/x.jpg`
 * did; `/assets/PROBE-asset.js`, `/draco/PROBE.wasm`, `/basis/PROBE.js` and
 * `/sitemap.xml` did not, which is exactly the split the exclusions are for.
 *
 * ⚠️ MEASURE THIS WITH A RAW CLIENT, NEVER `fetch`. Node's `fetch` REWRITES
 * `sec-fetch-mode` to `cors` — it is a forbidden header name — so every "navigate"
 * reading comes back identical to plain, which reads as "already fixed". The first
 * version of this measurement said exactly that. `node:https` sends it verbatim.
 */
describe('the viewer Worker runs on navigations', () => {
  const viewer = JSON.parse(
    settings(read('apps/viewer/wrangler.jsonc')).replace(/\/\*[\s\S]*?\*\//g, ''),
  ) as { assets?: { run_worker_first?: unknown } }
  const patterns = viewer.assets?.run_worker_first

  it('declares run_worker_first as an ARRAY, not true and not absent', () => {
    /*
     * The array form is load-bearing twice over. Cloudflare's docs: an array "disables
     * the automatic Sec-Fetch-Mode: navigate detection" — `true` would also work but
     * puts the Worker in front of every hashed asset, which is the cost that kept this
     * absent for a year. Absent means the bypass is back.
     */
    expect(
      Array.isArray(patterns),
      'apps/viewer/wrangler.jsonc lost its run_worker_first array. Navigations no longer ' +
        'reach the Worker, so the per-garment link card and the 404 for unknown URLs are ' +
        'both silently inert — with nothing failing anywhere.',
    ).toBe(true)
  })

  it('runs the Worker for every path by default', () => {
    expect(patterns).toContain('/*')
  })

  it('never excludes /og/, because that is where the Worker turns a 200 into a 404', () => {
    /*
     * `/og/zzz-nope.jpg` answered 200 with 8 KB of SPA shell until 2026-08-31: a social
     * platform asked for an image and got a document with a success code. The Worker is
     * what makes it a 404, and it is a crawler — not a browser — that asks.
     */
    const excluded = (patterns as string[]).filter((p) => p.startsWith('!'))
    expect(excluded.filter((p) => p.includes('/og'))).toEqual(['!/og-default.jpg'])
  })

  it('keeps the hashed bundles and the decoders on the asset-router path', () => {
    /*
     * The reason `true` was refused. These are the volume paths — every visit fetches
     * the bundle, and a 3D page fetches decoders — and none of them has ever needed the
     * script. Negative patterns take precedence over positive ones, so `/*` above does
     * not reach them.
     */
    for (const path of ['!/assets/*', '!/draco/*', '!/basis/*']) {
      expect(
        patterns,
        `${path} is no longer exempt — every bundle now pays a Worker hop`,
      ).toContain(path)
    }
  })

  it('stays inside Cloudflare’s 100-entry limit, with room to add one', () => {
    expect((patterns as string[]).length).toBeLessThan(100)
  })

  it('the array detector can actually fail (negative control)', () => {
    /*
     * Every assertion above passes when the config is right, and would also pass if
     * `settings()` or the JSON parse quietly returned something empty. This feeds it the
     * configuration this change replaced.
     */
    const before = '{\n  "assets": {\n    "directory": "./dist",\n    "binding": "ASSETS"\n  }\n}'
    const parsed = JSON.parse(settings(before)) as { assets?: { run_worker_first?: unknown } }
    expect(Array.isArray(parsed.assets?.run_worker_first)).toBe(false)
  })
})
