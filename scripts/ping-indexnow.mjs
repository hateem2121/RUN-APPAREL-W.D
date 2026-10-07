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
 * WHAT IT SENDS (since 2026-10-07, plan E10). Only the pages whose source changed in the
 * deploy: `scripts/indexnow-paths.mjs` maps the files in `git diff <before> HEAD` to paths, and
 * when no public page changed nothing is sent at all. IndexNow's documentation says to submit
 * changed, added or deleted URLs only (https://www.indexnow.org/documentation, read 2026-10-07).
 * With no trustworthy `before` (a hand-run workflow, a first push, git cannot see the commit)
 * it sends the whole sitemap, as it always did; `--all` forces that.
 *
 * ⚠️ WHAT IT PRINTS goes to a PUBLIC Actions log (the repository is public): counts and public
 * page paths only. The key is never printed outside `--dry-run`, and even there it is the value
 * served openly at https://<host>/<key>.txt, which is how IndexNow checks it. The key file and
 * `keyLocation` are unchanged.
 *
 * Usage:
 *   node scripts/ping-indexnow.mjs [--dry-run] [--all] [--host wear-run.com]
 *   (in CI: EVENT_NAME and BEFORE come from the push event, as for ci-changed-paths.mjs)
 */

import { realpathSync } from 'node:fs'
import { gitChangedFiles, indexNowSelection } from './indexnow-paths.mjs'

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
 * Public paths to absolute URLs. The home page is the bare origin, as in the sitemap.
 */
export function urlsForPaths(origin, paths) {
  return paths.map((path) => (path === '/' ? origin : `${origin}${path}`))
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

  const selection = args.includes('--all')
    ? { mode: 'all', paths: [] }
    : indexNowSelection({ eventName: process.env.EVENT_NAME, before: process.env.BEFORE }, (base) =>
        gitChangedFiles(base),
      )

  if (selection.mode === 'none') {
    console.log('[indexnow] No public page changed in this deploy; nothing to submit.')
    process.exit(0)
  }

  let urlList
  if (selection.mode === 'changed') {
    console.log(`[indexnow] Pages changed in this deploy: ${selection.paths.join(' ')}`)
    urlList = urlsForPaths(origin, selection.paths)
  } else {
    console.log(`[indexnow] No usable diff for this run; submitting the whole sitemap for ${host}.`)
    urlList = await getSubmissionUrls(origin)
  }
  console.log(`[indexnow] Found ${urlList.length} URLs to submit.`)

  const payload = buildIndexNowPayload(host, key, urlList)
  try {
    const result = await submitIndexNow(payload, { dryRun })

    if (result.ok) {
      console.log(
        `[indexnow] Success (${result.status}): ${urlList.length} URLs submitted to IndexNow.`,
      )
      process.exit(0)
    } else {
      console.warn(
        `[indexnow] Non-fatal: IndexNow endpoint returned status ${result.status}: ${result.message}`,
      )
      process.exit(0)
    }
  } catch (err) {
    console.warn(
      `[indexnow] Non-fatal: Could not reach IndexNow endpoint: ${err instanceof Error ? err.message : String(err)}`,
    )
    process.exit(0)
  }
}
