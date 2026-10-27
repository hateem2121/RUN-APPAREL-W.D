#!/usr/bin/env node
/**
 * Fill the shared page store after a deploy (W1-A, 2026-10-24), then measure it.
 *
 * WHY. worker.mjs's SitePages entrypoint sits behind Workers Cache, which keys every copy by the
 * Worker version, so a deploy starts an empty store. Without this, the first buyer to open each
 * page after a deploy waits while it is drawn: that wait is what put home page opens at p90
 * 2,338 ms in the 7 days to 2026-10-24. This asks once for every website page in the live
 * sitemap, the three kept files and the data behind each garment page, then asks again and
 * counts how many the store answered (Server-Timing `page-cache` / `api-cache`).
 *
 * WHAT IT ASKS FOR. Website pages only: garment pages (/products/<p>/<c>) are drawn by the viewer
 * Worker and kept by the zone's cache, not by SitePages; what SitePages keeps for them is their
 * DATA (cms.wear-run.help/api/public/viewer/<p>/<c>), which this asks for instead.
 *
 * AND EACH PAGE'S TAP DATA (faster-taps plan, Task 3): what a tap from another website page asks
 * for, kept by apps/cms/tapStore.mjs with one copy per destination. A settled tap's tree depends
 * only on where the start page and the destination stop sharing segments, so a top-level page is
 * asked for once, and a nested page twice (from the home page and from its parent).
 *
 * IT NEVER FAILS A DEPLOY. The site works with an empty store, only slower. A 403, 429 or 503 from
 * a runner is inconclusive (Free-plan Bot Fight Mode blocks datacenter IPs at random,
 * .github/CLAUDE.md), and anything else odd becomes a GitHub warning, never a red run.
 *
 * Usage: node scripts/warm-shared-store.mjs [https://wear-run.com]
 */
import { realpathSync } from 'node:fs'
import { rscCode, stateTreeFor } from '../apps/cms/tapStore.mjs'

export const SITE_ORIGIN = 'https://wear-run.com'
export const API_ORIGIN = 'https://cms.wear-run.help'
const KEPT_FILES = ['/llms.txt', '/robots.txt']
const GARMENT_PAGE = /^\/products\/([^/]+)\/([^/]+)$/
const PRODUCT_PAGES = /^\/products\/[^/]+/
const CONCURRENCY = 4
const TIMEOUT_MS = 20_000

/** The addresses to ask for, from the live sitemap's text. Anything off the site is ignored. */
export function warmTargets(sitemapXml, origin = SITE_ORIGIN) {
  const host = new URL(origin).host
  const pages = []
  const garments = []
  for (const [, loc] of sitemapXml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)) {
    let url
    try {
      url = new URL(loc)
    } catch {
      continue
    }
    if (url.host !== host) continue
    const garment = GARMENT_PAGE.exec(url.pathname)
    if (garment) garments.push(`${API_ORIGIN}/api/public/viewer/${garment[1]}/${garment[2]}`)
    else if (!PRODUCT_PAGES.test(url.pathname)) pages.push(url.href)
  }
  if (pages.length > 0) for (const file of KEPT_FILES) pages.push(`${origin}${file}`)
  return { pages, garments }
}

/**
 * The settled taps that fill each static page's tap data: `{ url, headers }`, the code computed for
 * exactly the headers sent. Kept files and dynamic routes (stateTreeFor gives null) are skipped.
 */
export async function warmTapTargets(paths, origin = SITE_ORIGIN) {
  const targets = []
  for (const path of paths) {
    if (/\.[a-z]+$/i.test(path)) continue
    const segments = path.split('/').filter(Boolean)
    const starts = segments.length > 1 ? ['/', `/${segments.slice(0, -1).join('/')}`] : ['/']
    for (const from of starts) {
      const tree = stateTreeFor(path, from)
      if (tree === null) continue
      const code = await rscCode({ stateTree: tree })
      targets.push({
        url: `${origin}${path}?_rsc=${code}`,
        headers: { rsc: '1', 'next-router-state-tree': tree },
      })
    }
  }
  return targets
}

/** One answer, read: hit / miss / skip from the store, ok (no store timing), inconclusive, error. */
export function storeVerdict(status, serverTiming) {
  if (status === 0 || status === 403 || status === 429 || status === 503) return 'inconclusive'
  if (status < 200 || status >= 300) return 'error'
  const state = /(?:page|api)-cache;desc="(hit|miss|skip)"/.exec(serverTiming ?? '')?.[1]
  return state ?? 'ok'
}

/** Counts per verdict, a warning per error; the exit code is always 0. */
export function summarize(results) {
  const counts = { hit: 0, miss: 0, skip: 0, ok: 0, inconclusive: 0, error: 0 }
  for (const { verdict } of results) counts[verdict] += 1
  const warnings = results
    .filter(({ verdict }) => verdict === 'error')
    .map(({ url, status }) => `${url} answered ${status ?? 'an error'} while warming the store`)
  return { counts, warnings, exitCode: 0 }
}

async function ask(target) {
  const { url, headers = {} } = typeof target === 'string' ? { url: target } : target
  try {
    const response = await fetch(url, {
      headers: { 'user-agent': 'run-apparel-store-warmup/1.0', ...headers },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    await response.arrayBuffer() // the store keeps an answer only once it is read in full
    const timing = response.headers.get('server-timing') ?? ''
    return { url, status: response.status, verdict: storeVerdict(response.status, timing) }
  } catch {
    return { url, status: 0, verdict: 'inconclusive' }
  }
}

async function askAll(urls) {
  const results = []
  const queue = [...urls]
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
      while (queue.length > 0) results.push(await ask(queue.shift()))
    }),
  )
  return results
}

function report(label, results) {
  const { counts, warnings } = summarize(results)
  const parts = Object.entries(counts)
    .filter(([, n]) => n > 0)
    .map(([verdict, n]) => `${n} ${verdict}`)
  console.log(`[warm-shared-store] ${label}: ${results.length} asked — ${parts.join(', ')}`)
  for (const warning of warnings) console.log(`::warning::${warning}`)
}

async function main() {
  const origin = process.argv[2] ?? SITE_ORIGIN
  const sitemap = await ask(`${origin}/sitemap.xml`)
  if (sitemap.verdict === 'inconclusive' || sitemap.verdict === 'error') {
    console.log(`::warning::the sitemap answered ${sitemap.status}; the store was not warmed`)
    return
  }
  const xml = await (await fetch(`${origin}/sitemap.xml`)).text()
  const { pages, garments } = warmTargets(xml, origin)
  if (pages.length === 0) {
    console.log('::warning::the sitemap listed no website pages; the store was not warmed')
    return
  }
  const taps = await warmTapTargets(
    pages.map((url) => new URL(url).pathname),
    origin,
  )
  const targets = [...pages, ...garments, ...taps]
  report('first pass (fills the store)', await askAll(targets))
  report('second pass (from the store)', await askAll(targets))
}

if (process.argv[1] && import.meta.filename === realpathSync(process.argv[1])) {
  main().catch((error) => {
    console.log(`::warning::warming the store stopped: ${error?.message ?? error}`)
  })
}
