#!/usr/bin/env node
/**
 * Bing IndexNow push script.
 *
 * Submits public site URLs to the IndexNow protocol (supported by Bing, Microsoft Copilot,
 * Yandex, Seznam, and Naver) so newly published or updated garments and pages are indexed
 * in minutes instead of waiting for passive web crawls.
 *
 * Free protocol: zero subscription fees, instantaneous notification to search engines.
 * Key location verified via https://<host>/<key>.txt (served from apps/cms/public/).
 *
 * Usage:
 *   node scripts/ping-indexnow.mjs [--dry-run] [--host wear-run.com]
 */

import { realpathSync } from 'node:fs'

const DEFAULT_HOST = 'wear-run.com'
const DEFAULT_KEY = 'c7e4b2d9a1f83c5e6d0a7b4f2e9c1a3d'
const INDEXNOW_ENDPOINT = 'https://api.indexnow.org/indexnow'

/**
 * Fallback static URLs list if sitemap fetch is offline or unavailable.
 */
const CORE_URLS = [
  '/',
  '/products',
  '/custom-teamwear-manufacturer',
  '/custom-activewear-manufacturer',
  '/custom-outerwear-manufacturer',
  '/private-label-casual-wear-manufacturer',
  '/guides',
  '/guides/how-a-private-label-order-works',
  '/guides/3d-garment-reference',
  '/guides/minimum-order-and-samples',
  '/guides/garment-printing-methods',
  '/guides/sportswear-fabrics-and-weights',
  '/guides/private-label-packaging',
  '/guides/shipping-and-import-duties',
  '/contact',
]

/**
 * Fetch URLs from live sitemap.xml, falling back to CORE_URLS if unreachable.
 */
export async function getSubmissionUrls(origin) {
  try {
    const res = await fetch(`${origin}/sitemap.xml`, { signal: AbortSignal.timeout(5000) })
    if (res.ok) {
      const xml = await res.text()
      const matches = [...xml.matchAll(/<loc>(https:\/\/[^<]+)<\/loc>/g)].map((m) => m[1])
      if (matches.length > 0) {
        return matches
      }
    }
  } catch {
    // Sitemap offline or running locally without deployed server
  }

  return CORE_URLS.map((path) => `${origin}${path === '/' ? '' : path}`)
}

/**
 * Build IndexNow submission payload.
 */
export function buildIndexNowPayload(host, key, urlList) {
  return {
    host,
    key,
    keyLocation: `https://${host}/${key}.txt`,
    urlList,
  }
}

/**
 * Submit URLs to IndexNow API.
 */
export async function submitIndexNow(payload, { dryRun = false } = {}) {
  if (dryRun) {
    console.log('[indexnow] DRY RUN: Would submit payload:')
    console.log(JSON.stringify(payload, null, 2))
    return { ok: true, status: 200, message: 'dry-run-ok' }
  }

  const response = await fetch(INDEXNOW_ENDPOINT, {
    method: 'POST',
    headers: {
      'content-type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(10000),
  })

  // IndexNow answers 200 (OK) or 202 (Accepted) on success
  const ok = response.status === 200 || response.status === 202
  return {
    ok,
    status: response.status,
    message: response.statusText,
  }
}

// CLI execution
if (process.argv[1] && import.meta.filename === realpathSync(process.argv[1])) {
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')
  const hostIndex = args.indexOf('--host')
  const host = hostIndex !== -1 && args[hostIndex + 1] ? args[hostIndex + 1] : DEFAULT_HOST
  const key = process.env.INDEXNOW_KEY || DEFAULT_KEY
  const origin = `https://${host}`

  console.log(`[indexnow] Gathering URLs for host ${host}...`)
  const urlList = await getSubmissionUrls(origin)
  console.log(`[indexnow] Found ${urlList.length} URLs to submit.`)

  const payload = buildIndexNowPayload(host, key, urlList)
  const result = await submitIndexNow(payload, { dryRun })

  if (result.ok) {
    console.log(
      `[indexnow] Success (${result.status}): ${urlList.length} URLs submitted to IndexNow.`,
    )
    process.exit(0)
  } else {
    console.error(`[indexnow] Failed with HTTP status ${result.status}: ${result.message}`)
    process.exit(1)
  }
}
