#!/usr/bin/env node
/**
 * SO-15 — R2 usage against the free tier, a weekly BUDGET proxy.
 *
 * ⚠️ THIS IS AN HONEST PROXY, NOT A RECONSTRUCTION OF WHAT ANY PAST AUDIT RUN
 * DOWNLOADED. It cannot say what one session's crawl cost; it can only say whether
 * the ACCOUNT's current storage and operations are still comfortably inside R2's
 * free tier, checked against a real published price list rather than a guess.
 *
 * R2 pricing, read from https://developers.cloudflare.com/r2/pricing/ 2026-09-24
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
 * Thresholds are fractions of the free tier, not an invented dollar figure:
 * WARN at 50%, FAIL at 80%, leaving real headroom against the owner's $5/month
 * total Cloudflare budget before a single cent of R2 usage is ever billed.
 *
 * Queries Cloudflare's GraphQL Analytics API (read-only; a `query`, never a
 * `mutation`) for the trailing 30 days, account-wide (every bucket on the
 * account, since that is what actually drives the bill).
 *
 *   CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ACCOUNT_ID=... node scripts/r2-budget-probe.mjs
 */
import { pathToFileURL } from 'node:url'

export const FREE_TIER = {
  storageBytes: 10 * 1024 ** 3, // 10 GB-month
  classA: 1_000_000,
  classB: 10_000_000,
}

export const WARN_AT_FRACTION = 0.5
export const FAIL_AT_FRACTION = 0.8

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
 * Pure: judge usage against the free tier.
 * @param {{ storageBytes: number, classA: number, classB: number }} usage
 */
export function evaluateR2Budget({ storageBytes, classA, classB }) {
  const fraction = {
    storage: storageBytes / FREE_TIER.storageBytes,
    classA: classA / FREE_TIER.classA,
    classB: classB / FREE_TIER.classB,
  }
  const worst = Math.max(fraction.storage, fraction.classA, fraction.classB)
  const verdict = worst >= FAIL_AT_FRACTION ? 'FAIL' : worst >= WARN_AT_FRACTION ? 'WARN' : 'PASS'
  return { verdict, fraction, worst }
}

async function queryR2Usage(accountId, apiToken) {
  const end = new Date()
  const start = new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000)
  const query = `
    query R2Budget($accountTag: string!, $start: Time!, $end: Time!) {
      viewer {
        accounts(filter: { accountTag: $accountTag }) {
          storage: r2StorageAdaptiveGroups(
            limit: 1
            filter: { datetime_geq: $start, datetime_leq: $end }
            orderBy: [datetime_DESC]
          ) {
            max { payloadSize metadataSize }
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
      variables: { accountTag: accountId, start: start.toISOString(), end: end.toISOString() },
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
  const storageBytes =
    (account?.storage?.[0]?.max?.payloadSize ?? 0) + (account?.storage?.[0]?.max?.metadataSize ?? 0)
  const operationSums = (account?.operations ?? []).map((row) => ({
    actionType: row.dimensions?.actionType,
    requests: row.sum?.requests ?? 0,
  }))
  return { storageBytes, operationSums }
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

  const { storageBytes, operationSums } = await queryR2Usage(accountId, apiToken)
  const { classA, classB, unclassified } = classifyOperations(operationSums)
  const { verdict, fraction, worst } = evaluateR2Budget({ storageBytes, classA, classB })

  const gb = (storageBytes / 1024 ** 3).toFixed(3)
  console.log(`[r2-budget-probe] trailing 30 days, account-wide:`)
  console.log(`  storage    ${gb} GB (${(fraction.storage * 100).toFixed(1)}% of 10 GB free)`)
  console.log(
    `  Class A    ${classA} requests (${(fraction.classA * 100).toFixed(2)}% of 1,000,000 free)`,
  )
  console.log(
    `  Class B    ${classB} requests (${(fraction.classB * 100).toFixed(2)}% of 10,000,000 free)`,
  )
  if (unclassified.length > 0) {
    console.log(
      `  ⚠️  unclassified action type(s), counted as Class A: ${[...new Set(unclassified)].join(', ')}`,
    )
  }

  if (verdict === 'FAIL') {
    console.error(
      `::error::[r2-budget-probe] ${(worst * 100).toFixed(0)}% of the free tier on at least one ` +
        `dimension — approaching a real R2 bill against the $5/month total budget.`,
    )
    process.exit(1)
  }
  if (verdict === 'WARN') {
    console.log(
      `::warning::[r2-budget-probe] ${(worst * 100).toFixed(0)}% of the free tier — worth a look, not yet a problem.`,
    )
  }
  console.log(`[r2-budget-probe] ${verdict}`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`r2-budget-probe: ${error instanceof Error ? error.message : String(error)}`)
    process.exit(2)
  })
}
