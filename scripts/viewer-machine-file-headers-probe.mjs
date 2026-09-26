#!/usr/bin/env node
/**
 * SO-06 — the viewer's machine-readable files are served with the right CONTENT-TYPE,
 * not just the right body.
 *
 * `robots.txt` and `llms.txt` already have this on the SITE (`findability.spec.ts`'s
 * FA-N-16/17 block, asserting `text/plain`), because that host builds them from a Route
 * Handler that sets the header explicitly. The viewer's three machine files
 * (`public/robots.txt`, `public/sitemap.xml`, `public/llms.txt`) are plain STATIC files —
 * Cloudflare's Workers Static Assets infers the type from the extension, with no `_headers`
 * rule involved (unlike `/env/*.hdr`, which needed one because `.hdr` has no built-in
 * mapping — see `envDirectory.test.ts`). That means there is nothing in this repo's own
 * config to unit-test for these three: the only way to know Cloudflare is still inferring
 * them correctly is to ask the live edge.
 *
 * Read-only: three plain GETs.
 *
 *   node scripts/viewer-machine-file-headers-probe.mjs
 */
import { realpathSync } from 'node:fs'

export const VIEWER_ORIGIN = 'https://viewer.wear-run.help'

/** path -> the content-type prefix it must carry. A prefix, not an exact match, so a
 *  legitimate `; charset=` suffix is not a false positive. */
export const EXPECTED = {
  '/robots.txt': 'text/plain',
  '/sitemap.xml': 'application/xml',
  '/llms.txt': 'text/plain',
}

/** Pure: judge one path's declared content-type against what it must be. */
export function evaluateContentType(path, contentType) {
  const expected = EXPECTED[path]
  const actual = contentType ?? ''
  return {
    ok: actual.startsWith(expected),
    path,
    expected,
    actual,
  }
}

async function main() {
  const results = []
  for (const path of Object.keys(EXPECTED)) {
    const url = `${VIEWER_ORIGIN}${path}`
    const res = await fetch(url, { headers: { accept: '*/*' } })
    if (res.status === 403 || res.status === 429) {
      console.log(`⚠️  ${url} answered ${res.status} — INCONCLUSIVE (Bot Fight Mode).`)
      continue
    }
    if (!res.ok) {
      console.error(`viewer-machine-file-headers-probe: ${url} answered ${res.status}.`)
      process.exit(2)
    }
    results.push(evaluateContentType(path, res.headers.get('content-type')))
  }

  const failed = results.filter((r) => !r.ok)
  for (const r of results) {
    console.log(`  ${r.path} -> ${r.actual || '(none)'} (expected ${r.expected}*)`)
  }
  if (failed.length > 0) {
    for (const r of failed) {
      console.error(`::error::${VIEWER_ORIGIN}${r.path} is "${r.actual}", expected ${r.expected}*.`)
    }
    process.exit(1)
  }
  console.log('viewer-machine-file-headers-probe: OK')
}

if (process.argv[1] && import.meta.filename === realpathSync(process.argv[1])) {
  main().catch((error) => {
    console.error(
      `viewer-machine-file-headers-probe: ${error instanceof Error ? error.message : String(error)}`,
    )
    process.exit(2)
  })
}
