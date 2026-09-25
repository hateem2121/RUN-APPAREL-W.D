#!/usr/bin/env node
/**
 * SO-15 — R2 usage against the free tier, a weekly BUDGET proxy.
 *
 * ⚠️ THIS IS AN HONEST PROXY, NOT A RECONSTRUCTION OF WHAT ANY PAST AUDIT RUN
 * DOWNLOADED. It cannot say what one session's crawl cost; it can only say whether
 * the ACCOUNT's current storage and operations are still comfortably inside R2's
 * free tier, checked against a real published price list rather than a guess.
 *
 * R2 pricing, read from https://developers.cloudflare.com/r2/pricing/ 2026-09-24 and re-read
 * 2026-09-25 (page last updated 2026-08-07; every list below unchanged)
 * (Standard storage; this account uses no Infrequent Access class):
 *
 *   Storage              10 GB-month / month free, then $0.015 / GB-month
 *   Class A operations   1,000,000 / month free, then $4.50 / million
 *   Class B operations   10,000,000 / month free, then $0.36 / million
 *   Egress               Free, unconditionally — R2 charges nothing for bandwidth
 *                         out, at any volume. "R2 egress" in this row's name is
 *                         therefore a proxy for the two things that DO cost money:
 *                         storage and operation count.
 *
 * Class A/B membership per the same page's "Class A operations"/"Class B
 * operations" sections. Anything not explicitly listed there (a few low-volume
 * bucket-config actions exist, e.g. GetBucketSippyConfiguration) is counted as
 * Class A — the more expensive class — rather than ignored, so an unrecognised
 * action type can only ever make this check MORE cautious, never blind to a cost.
 *
 * Storage is billed on "the average of the PEAK storage per day over a billing
 * period (30 days)" (same page, last updated 2026-08-07). So two storage numbers are
 * read, and they answer different questions:
 *   - NOW: the newest reading of every bucket, summed. What the account is doing today.
 *   - BILLED: each day's peak (all buckets), averaged over 30 days. What the bill uses.
 * GB here is 10^9 bytes, the smaller unit, so the free tier is never overstated.
 *
 * The verdict is in DOLLARS against the owner's R2 budget, which is $0: the $5/month
 * total is Workers Paid, and R2 must stay inside its free tier (owner decision). FAIL = today's usage, carried for a month, would be billed (current
 * storage, or 30 days of requests, over a free allowance): that is actionable.
 * WARN = the trailing 30 days already carry a bill, or any allowance is past 80%.
 * A past bill is a WARN, not a FAIL, on purpose: measured 2026-09-25, the archive bucket
 * (13.8 GB) held the billed average at 11.68 GB for weeks after it was deleted, and a
 * check that fails every week for a fault already fixed is a check nobody reads.
 *
 * Queries Cloudflare's GraphQL Analytics API (read-only; a `query`, never a
 * `mutation`), account-wide (every bucket on the account drives the bill).
 * ⚠️ `orderBy: datetime_DESC` is refused unless `datetime` is a dimension, which is why
 * the first version of this check could never run (2026-09-24); both storage queries
 * group by `bucketName` plus the time field they order by.
 *
 *   CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ACCOUNT_ID=... node scripts/r2-budget-probe.mjs
 */
import { pathToFileURL } from 'node:url'

const GB = 1e9

export const FREE_TIER = {
  storageBytes: 10 * GB, // 10 GB-month
  classA: 1_000_000,
  classB: 10_000_000,
}

/** US dollars, developers.cloudflare.com/r2/pricing/ (Standard). */
export const PRICE = {
  perGBMonth: 0.015,
  perMillionClassA: 4.5,
  perMillionClassB: 0.36,
}

export const WARN_AT_FRACTION = 0.8

/** developers.cloudflare.com/r2/pricing/ → "Class A operations". */
export const CLASS_A_ACTIONS = new Set([
  'ListBuckets',
  'PutBucket',
  'ListObjects',
  'PutObject',
  'CopyObject',
  'CompleteMultipartUpload',
  'CreateMultipartUpload',
  'LifecycleStorageTierTransition',
  'ListMultipartUploads',
  'UploadPart',
  'UploadPartCopy',
  'ListParts',
  'PutBucketEncryption',
  'PutBucketCors',
  'PutBucketLifecycleConfiguration',
])

/** developers.cloudflare.com/r2/pricing/ → "Class B operations". */
export const CLASS_B_ACTIONS = new Set([
  'HeadBucket',
  'HeadObject',
  'GetObject',
  'UsageSummary',
  'GetBucketEncryption',
  'GetBucketLocation',
  'GetBucketCors',
  'GetBucketLifecycleConfiguration',
])

/** developers.cloudflare.com/r2/pricing/ → "Free operations". */
export const FREE_ACTIONS = new Set(['DeleteObject', 'DeleteBucket', 'AbortMultipartUpload'])

/**
 * Pure: fold a list of {actionType, requests} into Class A / Class B totals.
 * @param {Array<{actionType: string, requests: number}>} operationSums
 */
export function classifyOperations(operationSums) {
  let classA = 0
  let classB = 0
  const unclassified = []
  for (const { actionType, requests } of operationSums ?? []) {
    if (CLASS_A_ACTIONS.has(actionType)) classA += requests
    else if (CLASS_B_ACTIONS.has(actionType)) classB += requests
    else if (FREE_ACTIONS.has(actionType)) continue
    else {
      classA += requests // conservative default — see the file header
      unclassified.push(actionType)
    }
  }
  return { classA, classB, unclassified }
}

/**
 * Pure: the newest reading of every bucket, summed. Rows carry a bucket and an ISO
 * datetime; order does not matter.
 * @param {Array<{bucketName: string, datetime: string, bytes: number}>} rows
 */
export function currentStorageBytes(rows) {
  const newest = new Map()
  for (const row of rows ?? []) {
    const seen = newest.get(row.bucketName)
    if (!seen || row.datetime > seen.datetime) newest.set(row.bucketName, row)
  }
  let total = 0
  for (const row of newest.values()) total += row.bytes
  return total
}

/**
 * Pure: what the bill uses. Each day's peak per bucket, summed across buckets, then
 * averaged over the days present.
 * @param {Array<{bucketName: string, date: string, bytes: number}>} rows
 */
export function billedStorageBytes(rows) {
  const perDay = new Map()
  for (const row of rows ?? []) {
    const day = perDay.get(row.date) ?? new Map()
    day.set(row.bucketName, Math.max(day.get(row.bucketName) ?? 0, row.bytes))
    perDay.set(row.date, day)
  }
  if (perDay.size === 0) return 0
  let sum = 0
  for (const day of perDay.values()) for (const bytes of day.values()) sum += bytes
  return sum / perDay.size
}

/**
 * Pure: dollars for a month at this usage, after the free tier.
 * @param {{ storageBytes: number, classA: number, classB: number }} usage
 */
export function estimateMonthlyCost({ storageBytes, classA, classB }) {
  const over = (used, free) => Math.max(0, used - free)
  return (
    (over(storageBytes, FREE_TIER.storageBytes) / GB) * PRICE.perGBMonth +
    (over(classA, FREE_TIER.classA) / 1e6) * PRICE.perMillionClassA +
    (over(classB, FREE_TIER.classB) / 1e6) * PRICE.perMillionClassB
  )
}

/**
 * Pure: the verdict. See the file header for why a past bill warns and a present one fails.
 * @param {{ currentBytes: number, billedBytes: number, classA: number, classB: number }} usage
 */
export function evaluateR2Budget({ currentBytes, billedBytes, classA, classB }) {
  const atCurrentRate = estimateMonthlyCost({ storageBytes: currentBytes, classA, classB })
  const trailing = estimateMonthlyCost({ storageBytes: billedBytes, classA, classB })
  const fraction = {
    storage: currentBytes / FREE_TIER.storageBytes,
    classA: classA / FREE_TIER.classA,
    classB: classB / FREE_TIER.classB,
  }
  const worst = Math.max(fraction.storage, fraction.classA, fraction.classB)
  const verdict =
    atCurrentRate > 0 ? 'FAIL' : trailing > 0 || worst >= WARN_AT_FRACTION ? 'WARN' : 'PASS'
  return { verdict, atCurrentRate, trailing, fraction, worst }
}

async function queryR2Usage(accountId, apiToken) {
  const end = new Date()
  const start = new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000)
  const recent = new Date(end.getTime() - 12 * 60 * 60 * 1000)
  // Readings arrive every 10 minutes per bucket: 12 hours of six buckets is 432 rows,
  // well inside the limit, and every live bucket has a reading in that window.
  const query = `
    query R2Budget($accountTag: string!, $start: Time!, $recent: Time!, $end: Time!, $startDate: Date!, $endDate: Date!) {
      viewer {
        accounts(filter: { accountTag: $accountTag }) {
          now: r2StorageAdaptiveGroups(
            limit: 2000
            filter: { datetime_geq: $recent, datetime_leq: $end }
            orderBy: [datetime_DESC]
          ) {
            max { payloadSize metadataSize }
            dimensions { datetime bucketName }
          }
          daily: r2StorageAdaptiveGroups(
            limit: 2000
            filter: { date_geq: $startDate, date_leq: $endDate }
            orderBy: [date_DESC]
          ) {
            max { payloadSize metadataSize }
            dimensions { date bucketName }
          }
          operations: r2OperationsAdaptiveGroups(
            limit: 1000
            filter: { datetime_geq: $start, datetime_leq: $end }
          ) {
            sum { requests }
            dimensions { actionType }
          }
        }
      }
    }
  `
  const res = await fetch('https://api.cloudflare.com/client/v4/graphql', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      query,
      variables: {
        accountTag: accountId,
        start: start.toISOString(),
        recent: recent.toISOString(),
        end: end.toISOString(),
        startDate: start.toISOString().slice(0, 10),
        endDate: end.toISOString().slice(0, 10),
      },
    }),
  })
  if (!res.ok) {
    throw new Error(`Cloudflare GraphQL API answered ${res.status}`)
  }
  const body = await res.json()
  if (body.errors?.length) {
    throw new Error(`Cloudflare GraphQL API returned errors: ${JSON.stringify(body.errors)}`)
  }
  const account = body.data?.viewer?.accounts?.[0]
  if (!account) throw new Error('Cloudflare GraphQL API returned no account')
  const bytes = (row) => (row.max?.payloadSize ?? 0) + (row.max?.metadataSize ?? 0)
  const now = (account.now ?? []).map((row) => ({
    bucketName: row.dimensions?.bucketName,
    datetime: row.dimensions?.datetime,
    bytes: bytes(row),
  }))
  const daily = (account.daily ?? []).map((row) => ({
    bucketName: row.dimensions?.bucketName,
    date: row.dimensions?.date,
    bytes: bytes(row),
  }))
  const operationSums = (account.operations ?? []).map((row) => ({
    actionType: row.dimensions?.actionType,
    requests: row.sum?.requests ?? 0,
  }))
  return { now, daily, operationSums }
}

async function main() {
  const apiToken = process.env.CLOUDFLARE_API_TOKEN
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID
  if (!apiToken || !accountId) {
    console.log(
      '[r2-budget-probe] INCONCLUSIVE: CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID not set.',
    )
    process.exit(2)
  }

  const { now, daily, operationSums } = await queryR2Usage(accountId, apiToken)
  if (now.length === 0) {
    // No reading at all in 12 hours is a broken query, not an empty account: every
    // bucket reports every 10 minutes, empty ones included (measured 2026-09-25).
    console.log('[r2-budget-probe] INCONCLUSIVE: no storage reading in the last 12 hours.')
    process.exit(2)
  }
  const currentBytes = currentStorageBytes(now)
  const billedBytes = billedStorageBytes(daily)
  const { classA, classB, unclassified } = classifyOperations(operationSums)
  const r = evaluateR2Budget({ currentBytes, billedBytes, classA, classB })

  const gb = (bytes) => (bytes / GB).toFixed(2)
  const usd = (dollars) => `$${dollars.toFixed(2)}`
  console.log('[r2-budget-probe] account-wide, every bucket:')
  console.log(`  storage now      ${gb(currentBytes)} GB of 10 GB free`)
  console.log(`  storage billed   ${gb(billedBytes)} GB-month (30-day average of daily peaks)`)
  console.log(`  Class A, 30 days ${classA} of 1,000,000 free`)
  console.log(`  Class B, 30 days ${classB} of 10,000,000 free`)
  console.log(`  cost at today's usage ${usd(r.atCurrentRate)} / month; last 30 days ${usd(r.trailing)}`)
  if (unclassified.length > 0) {
    console.log(
      `  ⚠️  unclassified action type(s), counted as Class A: ${[...new Set(unclassified)].join(', ')}`,
    )
  }

  if (r.verdict === 'FAIL') {
    console.error(
      `::error::[r2-budget-probe] today's R2 usage would cost ${usd(r.atCurrentRate)} a month, ` +
        'and the R2 budget is $0. Storage or requests are over the free tier.',
    )
    process.exit(1)
  }
  if (r.verdict === 'WARN') {
    console.log(
      `::warning::[r2-budget-probe] last 30 days ${usd(r.trailing)}; ` +
        `${(r.worst * 100).toFixed(0)}% of the largest free allowance in use. Not a bill yet at today's usage.`,
    )
  }
  console.log(`[r2-budget-probe] ${r.verdict}`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`r2-budget-probe: ${error instanceof Error ? error.message : String(error)}`)
    process.exit(2)
  })
}
