#!/usr/bin/env node
/**
 * SO-12 — the Cloudflare Web Analytics beacon is present on the site and on a garment page,
 * and cookieless. Both embed it MANUALLY as a `<script src>` — the site from
 * apps/cms/src/components/site/Analytics.tsx (token: the CMS Worker's CF_ANALYTICS_TOKEN),
 * the garment pages from apps/viewer/index.html, split across two attribute lines
 * (`apps/viewer/CLAUDE.md`'s own trap notes a single-line grep can miss a tag written that
 * way, which is exactly why this reads the WHOLE body rather than grepping line by line).
 * (This header said "automatic setup" for the site until 2026-09-28; the Analytics API
 * reads auto_install: false for both analytics sites.)
 *
 * ⚠️ A PRESENT TAG IS NOT A COUNTED VISIT. Cloudflare checks the page's hostname against
 * the site the token was made for, by suffix (Web Analytics FAQ, read 2026-09-28), so a
 * wear-run.help token on a wear-run.com page is dropped without an error anywhere.
 * Read-only: two page GETs and one script GET.
 *
 *   node scripts/beacon-probe.mjs
 */
import { realpathSync } from 'node:fs'
import { escapeRegExp } from '../apps/cms/regexEscape.mjs'

/** The home page and one garment page, both on wear-run.com since the domain move (2026-09-28). */
export const PAGES = ['https://wear-run.com/', 'https://wear-run.com/products/rxps/wine']
export const BEACON_SRC = 'static.cloudflareinsights.com/beacon.min.js'

/**
 * Pure: does this (whole-body) HTML carry the beacon, as a `<script src>` tag or, since
 * 2026-10-08, as the inline loader that adds it for a browser that is not automated
 * (`packages/shared/src/analyticsBeacon.ts`)?
 */
export function hasBeaconTag(html) {
  // Escaped: an unescaped `.` matched any character, so a look-alike host passed
  // (GitHub code scan, js/incomplete-hostname-regexp, 2026-10-01).
  const host = escapeRegExp(BEACON_SRC)
  const tag = new RegExp(`<script[^>]*\\ssrc=["'][^"']*${host}[^"']*["']`, 'i')
  // The loader's whole body holds no `<`, so `[^<]*` keeps the match inside one script.
  const loader = new RegExp(`<script[^>]*>[^<]*["']https://${host}\\?token=[^<]*</script>`, 'i')
  return tag.test(html) || loader.test(html)
}

async function main() {
  const failures = []

  for (const page of PAGES) {
    const res = await fetch(page, { headers: { accept: 'text/html' } })
    if (res.status === 403 || res.status === 429) {
      console.log(`⚠️  ${page} returned ${res.status} — INCONCLUSIVE (Bot Fight Mode).`)
      continue
    }
    const html = await res.text()
    if (!hasBeaconTag(html)) {
      failures.push(`${page} carries no Cloudflare beacon script tag.`)
    } else {
      console.log(`   ${page} carries the beacon tag`)
    }
  }

  // Cookieless: GET the beacon script itself and confirm no Set-Cookie. Not plantable —
  // that would mean adding a real cookie to Cloudflare's own third-party script, which
  // this repo cannot do — so this half is proven only by today's live evidence.
  const beaconRes = await fetch(`https://${BEACON_SRC}`)
  if (beaconRes.status === 403 || beaconRes.status === 429) {
    console.log(`⚠️  https://${BEACON_SRC} returned ${beaconRes.status} — INCONCLUSIVE.`)
  } else if (beaconRes.headers.get('set-cookie')) {
    failures.push(`https://${BEACON_SRC} set a cookie: ${beaconRes.headers.get('set-cookie')}.`)
  } else {
    console.log(`   https://${BEACON_SRC} sets no cookie`)
  }

  if (failures.length > 0) {
    for (const f of failures) console.error(`::error::${f}`)
    process.exit(1)
  }
  console.log('beacon-probe: OK')
}

if (process.argv[1] && import.meta.filename === realpathSync(process.argv[1])) {
  main().catch((error) => {
    console.error(`beacon-probe: ${error instanceof Error ? error.message : String(error)}`)
    process.exit(2)
  })
}
