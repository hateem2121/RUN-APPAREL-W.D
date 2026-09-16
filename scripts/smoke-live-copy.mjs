#!/usr/bin/env node
/**
 * Post-deploy: does every live garment page describe ITSELF, and does the text the CMS
 * serves for each garment follow the copy rules?
 *
 * WHY. The two browser suites see fixtures, never the CMS. On 2026-09-10 two of the 80
 * pages answered a crawler with the generic shell from the edge cache, and five garments'
 * text still carried British spellings the owner had ruled out on 2026-09-04 — both
 * invisible to every gate. This reads what a crawler and the viewer actually receive.
 *
 * ⚠️ A 403 OR 429 IS INCONCLUSIVE, NOT A FAILURE, for the reason smoke-viewer-preview.mjs
 * gives: a crawler user-agent from a datacenter IP is the most challengeable request there is.
 *
 * Usage: node scripts/smoke-live-copy.mjs [viewerBase] [cmsBase]
 */
import http from 'node:http'
import https from 'node:https'
import { headProblems, payloadCopyProblems, readHead, runVerdict } from './live-copy.mjs'
import { LIVE_PRODUCTS } from './live-products.mjs'

const VIEWER = (process.argv[2] || 'https://viewer.wear-run.help').replace(/\/+$/, '')
const CMS = (process.argv[3] || 'https://cms.wear-run.help').replace(/\/+$/, '')
const CRAWLER_UA = 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)'
const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36'
// `wrangler deploy` returns before every colo serves the new version (smoke-viewer-preview.mjs).
const ATTEMPTS = Number(process.env.SMOKE_ATTEMPTS || 6)
const RETRY_DELAY_MS = Number(process.env.SMOKE_RETRY_DELAY_MS || 10000)
const EXPECTED_PAGES = LIVE_PRODUCTS.reduce((sum, product) => sum + product.colourways.length, 0)

/** A GET that can send Sec-Fetch-Mode, which `fetch` silently rewrites (smoke-viewer-preview.mjs). */
function rawGet(target, headers) {
  const url = new URL(target)
  const mod = url.protocol === 'https:' ? https : http
  return new Promise((resolve, reject) => {
    const req = mod.request(
      {
        hostname: url.hostname,
        port: url.port || undefined,
        path: url.pathname + url.search,
        method: 'GET',
        headers,
      },
      (res) => {
        let body = ''
        res.setEncoding('utf8')
        res.on('data', (chunk) => {
          body += chunk
        })
        res.on('end', () => resolve({ status: res.statusCode ?? 0, body }))
      },
    )
    req.on('error', reject)
    req.end()
  })
}

/** A top-level navigation — the only way a person or a link crawler ever reaches a page. */
const navigate = (url, ua) =>
  rawGet(url, {
    'user-agent': ua,
    accept: 'text/html',
    'sec-fetch-mode': 'navigate',
    'sec-fetch-dest': 'document',
    'sec-fetch-site': 'none',
  })

const refused = (status) => status === 403 || status === 429

async function check() {
  const problems = []
  let refusedCount = 0
  const first = LIVE_PRODUCTS[0]
  const shellResponse = await navigate(`${VIEWER}/${first.slug}/${first.colourway}`, BROWSER_UA)
  if (refused(shellResponse.status)) return { problems, refusedCount: -1, pages: 0 }
  const shell = readHead(shellResponse.body)
  if (!shell.description)
    problems.push('the generic shell has no description, so the comparison would be blind')

  const pages = []
  for (const product of LIVE_PRODUCTS) {
    for (const colourway of product.colourways) {
      const url = `${VIEWER}/${product.slug}/${colourway}`
      const response = await navigate(url, CRAWLER_UA)
      if (refused(response.status)) refusedCount++
      else if (response.status !== 200) problems.push(`${url}: HTTP ${response.status}`)
      else pages.push({ url, ...readHead(response.body) })
    }
  }
  problems.push(...headProblems(pages, shell))

  for (const product of LIVE_PRODUCTS) {
    const response = await fetch(`${CMS}/api/public/viewer/${product.slug}`, {
      headers: { accept: 'application/json' },
    })
    if (refused(response.status)) refusedCount++
    else if (!response.ok) problems.push(`${product.slug}: payload HTTP ${response.status}`)
    else problems.push(...payloadCopyProblems(product.slug, await response.json()))
  }
  return { problems, refusedCount, pages: pages.length }
}

let result = { problems: [], refusedCount: 0, pages: 0 }
for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
  result = await check()
  if (result.refusedCount === -1 || result.problems.length === 0 || attempt === ATTEMPTS) break
  console.log(
    `   attempt ${attempt}/${ATTEMPTS}: ${result.problems.length} problem(s), retrying in ${RETRY_DELAY_MS / 1000}s…`,
  )
  await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS))
}

// One decision, in live-copy.mjs, so a refusal can never overrule a finding again.
const verdict = runVerdict(result)
if (verdict === 'problems') {
  console.error(`\n❌ ${result.problems.length} copy problem(s) on the live garments:\n`)
  for (const problem of result.problems) console.error(`   • ${problem}`)
  process.exit(1)
}
if (verdict === 'inconclusive') {
  console.log(
    '⚠️  The viewer refused the requests (403/429). INCONCLUSIVE — a bot rule, not the copy.',
  )
  process.exit(0)
}
console.log(
  `\n✅ ${result.pages} of ${EXPECTED_PAGES} garment pages describe themselves, and the CMS text of ` +
    `${LIVE_PRODUCTS.length} garments follows the copy rules.`,
)
if (result.refusedCount > 0)
  console.log(`⚠️  ${result.refusedCount} request(s) were refused (403/429) and not checked.`)
