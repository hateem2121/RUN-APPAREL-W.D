#!/usr/bin/env node
/**
 * SO-12 — the Cloudflare Web Analytics beacon is present on both hosts, and cookieless.
 *
 * The viewer embeds it manually (a `<script src>` in index.html, split across two
 * attribute lines — `apps/viewer/CLAUDE.md`'s own trap notes a single-line grep can miss
 * a tag written that way, which is exactly why this reads the WHOLE body rather than
 * grepping line by line). The site carries no such source line at all: confirmed live
 * 2026-09-24 it still serves the identical script, which means Cloudflare's AUTOMATIC
 * setup is doing it there — a different mechanism
 * (`apps/viewer/CLAUDE.md`: "a manual embed POSTs to cloudflareinsights.com while
 * automatic setup posts to your own origin"), but the same visible tag either way.
 *
 * Read-only: two page GETs and one script GET.
 *
 *   node scripts/beacon-probe.mjs
 */
import { pathToFileURL } from 'node:url'

export const HOSTS = ['https://wear-run.help', 'https://viewer.wear-run.help']
export const BEACON_SRC = 'static.cloudflareinsights.com/beacon.min.js'

/** Pure: does this (whole-body) HTML contain a beacon `<script src>` tag? */
export function hasBeaconTag(html) {
  return new RegExp(`<script[^>]*\\ssrc=["'][^"']*${BEACON_SRC}[^"']*["']`, 'i').test(html)
}

async function main() {
  const failures = []

  for (const host of HOSTS) {
    const res = await fetch(`${host}/`, { headers: { accept: 'text/html' } })
    if (res.status === 403 || res.status === 429) {
      console.log(`⚠️  ${host}/ returned ${res.status} — INCONCLUSIVE (Bot Fight Mode).`)
      continue
    }
    const html = await res.text()
    if (!hasBeaconTag(html)) {
      failures.push(`${host}/ carries no Cloudflare beacon script tag.`)
    } else {
      console.log(`   ${host}/ carries the beacon tag`)
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

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`beacon-probe: ${error instanceof Error ? error.message : String(error)}`)
    process.exit(2)
  })
}
