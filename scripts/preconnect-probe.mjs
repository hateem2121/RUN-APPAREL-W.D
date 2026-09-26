#!/usr/bin/env node
/**
 * SO-05 — the poster-host preconnect hint reaches a real, live page.
 *
 * `apps/cms/src/app/(frontend)/products/page.tsx`'s `crossOriginPosterHost()` cannot be
 * exercised by ANY local runtime: under `next dev`, `next start` and
 * `opennextjs-cloudflare preview` alike, Payload emits a RELATIVE `/api/media/file/…`
 * poster URL, so the function correctly returns `null` and nothing is rendered — which
 * is indistinguishable from a hint that never fires at all. The function's own comment
 * records a one-off manual check against production as the only way this was ever
 * verified. This script makes that check repeatable rather than a memory.
 *
 * Read-only: a single GET of the live products page.
 *
 *   node scripts/preconnect-probe.mjs
 */
import { realpathSync } from 'node:fs'

export const PAGE_URL = 'https://wear-run.help/products'
export const EXPECTED_HOST = 'media.wear-run.help'
/** The page never same-page-fetches from here — it only LINKS to it. */
export const UNEXPECTED_HOST = 'viewer.wear-run.help'

/** Pure: every `<link rel="preconnect">` host in an HTML string. */
export function extractPreconnectHosts(html) {
  const hosts = []
  for (const match of html.matchAll(/<link\s+rel="preconnect"\s+href="([^"]+)"/gi)) {
    try {
      hosts.push(new URL(match[1]).host)
    } catch {
      // A malformed href is a template bug worth surfacing on its own terms, not here.
    }
  }
  return hosts
}

/** Pure: judge the set of preconnect hosts a page declared. */
export function evaluatePreconnect(hosts) {
  const problems = []
  if (!hosts.includes(EXPECTED_HOST)) {
    problems.push(
      `No preconnect to ${EXPECTED_HOST} on ${PAGE_URL} — the hint that should fire in ` +
        'production (posters are absolute URLs there) is absent.',
    )
  }
  if (hosts.includes(UNEXPECTED_HOST)) {
    problems.push(
      `A preconnect to ${UNEXPECTED_HOST} exists — /products only LINKS to that host, it ` +
        'never same-page-fetches from it, so this preconnect buys nothing and costs a ' +
        'connection.',
    )
  }
  return { ok: problems.length === 0, problems }
}

async function main() {
  const res = await fetch(PAGE_URL, { headers: { accept: 'text/html' } })
  if (res.status === 403 || res.status === 429) {
    console.log(`⚠️  ${PAGE_URL} answered ${res.status} — INCONCLUSIVE (Bot Fight Mode).`)
    process.exit(0)
  }
  if (!res.ok) {
    console.error(`preconnect-probe: ${PAGE_URL} answered ${res.status}.`)
    process.exit(2)
  }
  const html = await res.text()
  const hosts = extractPreconnectHosts(html)
  const { ok, problems } = evaluatePreconnect(hosts)
  console.log(`preconnect-probe: ${PAGE_URL} preconnects to: ${hosts.join(', ') || '(none)'}`)
  if (!ok) {
    for (const p of problems) console.error(`::error::${p}`)
    process.exit(1)
  }
  console.log('preconnect-probe: OK')
}

if (process.argv[1] && import.meta.filename === realpathSync(process.argv[1])) {
  main().catch((error) => {
    console.error(`preconnect-probe: ${error instanceof Error ? error.message : String(error)}`)
    process.exit(2)
  })
}
