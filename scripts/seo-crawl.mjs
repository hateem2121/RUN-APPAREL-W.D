#!/usr/bin/env node
/**
 * Crawl every page the sitemap offers and report what a search engine would find wrong.
 *
 *   node scripts/seo-crawl.mjs                       # the live site
 *   node scripts/seo-crawl.mjs https://wear-run.com  # the same, named
 *   node scripts/seo-crawl.mjs --json=report.json    # also write the full report
 *
 * WHY THIS EXISTS (2026-09-30). The owner asked for the free Screaming Frog crawl. That is
 * a desktop program; this does the same job from the sitemap with nothing to install, and
 * can be run every month. The rules and their reasons are in `seo-page-rules.mjs` (tested
 * in `apps/cms/src/seoPageRules.test.ts`); this file only fetches and prints.
 *
 * ⚠️ IT ASKS AS A SEARCH ROBOT, ON PURPOSE. A garment page gives a robot a different,
 * richer copy than it gives a person (`apps/viewer/worker/index.ts` has the measured
 * reason), so asking as a browser would check a page no search engine ever reads. The
 * agent string below names this script honestly and contains "bot", which is what the
 * Worker matches on.
 *
 * ⚠️ READ-ONLY AND POLITE: plain GETs, four at a time, of pages the sitemap already
 * advertises. A 403 or 429 is reported as "could not check", never as a broken page: that
 * is the bot rule answering, and it says nothing about the page.
 *
 * It prints only page addresses and findings, all public. Exit code 1 when any `error`
 * finding exists, 0 otherwise (warnings do not fail it).
 */
import { writeFileSync } from 'node:fs'
import { checkPage, checkSite, sitemapUrls } from './seo-page-rules.mjs'

const args = process.argv.slice(2)
const jsonPath = args.find((arg) => arg.startsWith('--json='))?.slice('--json='.length)
const origin = (args.find((arg) => !arg.startsWith('--')) ?? 'https://wear-run.com').replace(
  /\/+$/,
  '',
)

const AGENT = 'run-apparel-seo-crawl-bot/1.0 (+https://wear-run.com; site owner self-check)'
const CONCURRENCY = 4
const TIMEOUT_MS = 20_000

async function get(url) {
  try {
    const res = await fetch(url, {
      headers: { 'user-agent': AGENT, accept: 'text/html,application/xml' },
      redirect: 'manual',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    return {
      url,
      status: res.status,
      html: await res.text(),
      xRobotsTag: res.headers.get('x-robots-tag'),
    }
  } catch (error) {
    return {
      url,
      status: 0,
      html: '',
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

const sitemap = await get(`${origin}/sitemap.xml`)
if (sitemap.status !== 200) {
  console.error(`❌ ${origin}/sitemap.xml answered ${sitemap.status || sitemap.error}.`)
  process.exit(1)
}
const urls = sitemapUrls(sitemap.html)
if (urls.length === 0) {
  console.error(`❌ ${origin}/sitemap.xml lists no pages.`)
  process.exit(1)
}
console.log(`Checking ${urls.length} pages from ${origin}/sitemap.xml …`)

const pages = []
const queue = [...urls]
await Promise.all(
  Array.from({ length: CONCURRENCY }, async () => {
    for (let url = queue.shift(); url; url = queue.shift()) pages.push(await get(url))
  }),
)
pages.sort((a, b) => urls.indexOf(a.url) - urls.indexOf(b.url))

const unchecked = pages.filter((page) => [0, 403, 429].includes(page.status))
const checked = pages.filter((page) => !unchecked.includes(page))

const perPage = checked
  .map((page) => ({ url: page.url, findings: checkPage(page) }))
  .filter((entry) => entry.findings.length > 0)
const siteWide = checkSite(checked)

const all = [...perPage.flatMap((entry) => entry.findings), ...siteWide]
const errors = all.filter((finding) => finding.level === 'error').length
const warnings = all.length - errors

// One line per rule first: 200 pages failing the same way is one problem, not 200.
const byRule = new Map()
for (const entry of perPage) {
  for (const finding of entry.findings) {
    const group = byRule.get(finding.rule) ?? {
      level: finding.level,
      urls: [],
      sample: finding.message,
    }
    group.urls.push(entry.url)
    byRule.set(finding.rule, group)
  }
}

console.log('')
if (byRule.size === 0 && siteWide.length === 0) {
  console.log(`✅ All ${checked.length} checked pages are clean.`)
} else {
  for (const [rule, group] of [...byRule.entries()].sort(
    (a, b) => b[1].urls.length - a[1].urls.length,
  )) {
    const mark = group.level === 'error' ? '❌' : '⚠️ '
    console.log(`${mark} ${rule}: ${group.urls.length} page(s). Example: ${group.sample}`)
    for (const url of group.urls.slice(0, 5)) console.log(`     ${url}`)
    if (group.urls.length > 5) console.log(`     … and ${group.urls.length - 5} more`)
  }
  for (const finding of siteWide) {
    const mark = finding.level === 'error' ? '❌' : '⚠️ '
    console.log(`${mark} ${finding.rule}: ${finding.message}`)
    for (const url of finding.urls.slice(0, 5)) console.log(`     ${url}`)
    if (finding.urls.length > 5) console.log(`     … and ${finding.urls.length - 5} more`)
  }
}
if (unchecked.length > 0) {
  console.log(
    `\n⚠️  ${unchecked.length} page(s) could not be checked (blocked or timed out), e.g. ` +
      `${unchecked[0].url} → ${unchecked[0].status || unchecked[0].error}. Not counted as broken.`,
  )
}
console.log(
  `\n${checked.length} of ${urls.length} pages checked: ${errors} error(s), ${warnings} warning(s).`,
)

if (jsonPath) {
  writeFileSync(
    jsonPath,
    `${JSON.stringify({ origin, checkedAt: new Date().toISOString(), pages: urls.length, errors, warnings, perPage, siteWide, unchecked: unchecked.map((page) => ({ url: page.url, status: page.status })) }, null, 2)}\n`,
  )
  console.log(`Full report written to ${jsonPath}`)
}

process.exit(errors > 0 ? 1 : 0)
