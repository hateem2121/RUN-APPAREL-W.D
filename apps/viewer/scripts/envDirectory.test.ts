import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildHeadersFile } from './csp.mjs'

/** Same fixture shape csp.test.ts uses: buildCsp hashes the inline theme bootstrap. */
const HEADERS = () =>
  buildHeadersFile({
    html: `<script>document.documentElement.dataset.theme='dark'</script>`,
    apiBaseUrl: 'https://cms.wear-run.help',
  })

/**
 * The `/env/*` rule in the generated `_headers` asserts a Content-Type for EVERY
 * file under `public/env/`.
 *
 * WHY THIS EXISTS. Measured on the live edge 2026-09-05:
 *
 *     GET https://viewer.wear-run.help/env/studio-soft.hdr
 *     -> 200, content-type: (empty)
 *
 * Workers Static Assets derives the type from the file extension and has no entry
 * for `.hdr`, so the environment map — which model-viewer needs before it can light
 * a garment — shipped with no type at all. The fix is one line in `csp.mjs`:
 *
 *     /env/*
 *       Content-Type: image/vnd.radiance
 *
 * ⚠️ AND THAT LINE IS A STANDING BET ON THE DIRECTORY'S CONTENTS. `_headers` has no
 * per-extension form, so the moment a `.ktx2`, a `.jpg` or a `.exr` lands in
 * `public/env/` it is served as Radiance HDR — a mislabelling that is invisible
 * locally (nothing checks the type) and breaks only in a browser strict enough to
 * enforce it. This test is what makes the bet safe: it fails on the added file, not
 * on the eventual bug report.
 *
 * If a second format genuinely needs to live there, the fix is to move it to its own
 * path prefix with its own rule — NOT to widen this one. Two rules matching one path
 * would have Cloudflare comma-join the Cache-Control values, which is the trap
 * `csp.mjs` documents at length.
 */

const ENV_DIR = join(import.meta.dirname, '..', 'public', 'env')

describe('public/env/ and the Content-Type it is served with', () => {
  it('finds the directory and at least one file, so nothing below passes vacuously', () => {
    const entries = readdirSync(ENV_DIR)
    expect(entries.length, 'public/env/ is empty — has the environment map moved?').toBeGreaterThan(
      0,
    )
    expect(entries).toContain('studio-soft.hdr')
  })

  it('contains only Radiance .hdr files, because the header rule types them all', () => {
    const wrong = readdirSync(ENV_DIR).filter((name) => !name.endsWith('.hdr'))
    expect(
      wrong,
      'A non-.hdr file is in public/env/, and the /env/* rule in scripts/csp.mjs ' +
        'declares Content-Type: image/vnd.radiance for everything under that path — ' +
        'so this file is now served mislabelled. Give it its own path prefix and its ' +
        'own rule; do not widen /env/*.',
    ).toEqual([])
  })

  it('the generated _headers actually carries the type on the /env/ rule', () => {
    const block = HEADERS()
      .split(/\n(?=\/)/)
      .find((b) => b.startsWith('/env/*'))
    expect(block, 'the /env/* rule is gone from _headers').toBeDefined()
    expect(block).toContain('Content-Type: image/vnd.radiance')
    // The cache directive must survive alongside it — the whole reason this was
    // appended to the existing block rather than given a rule of its own.
    expect(block).toContain('Cache-Control: public, max-age=31536000, immutable')
  })

  it('there is exactly ONE /env/ rule (negative control on the comma-joining trap)', () => {
    const matches = HEADERS()
      .split('\n')
      .filter((line) => line.trim() === '/env/*')
    expect(
      matches,
      'Two rules match /env/*. Cloudflare JOINS duplicate headers from every matching ' +
        'rule with a comma rather than picking a winner, so the environment map would ' +
        'ship two Cache-Control values.',
    ).toHaveLength(1)
  })
})
