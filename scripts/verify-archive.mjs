#!/usr/bin/env node
/**
 * Archive verifier — proves the master files in R2 `run-apparel-archive` are all there,
 * every one at the byte count recorded when it was uploaded.
 *
 * WHY THIS EXISTS. Until 2026-09-02 the five FIXED GLBs, the raw CLO exports and the
 * CLO project files existed ONCE, on one disk, in no backup (audit findings CI-02 and
 * CI-08). The archive bucket is the off-machine copy. But a copy nobody re-checks is a
 * hypothesis: an object deleted by hand, a truncated multipart upload, or a bucket
 * emptied by mistake would all go unnoticed until the day a restore is needed. So the
 * nightly backup workflow lists the bucket and compares it, object by object, with
 * `scripts/archive-manifest.json`.
 *
 * WHY IT FAILS ON AN EMPTY LISTING. `scripts/backup-r2.mjs` once exited green having
 * copied nothing (L20-11): "0 failed" is what an empty enumeration and a healthy run
 * both say. Here an empty listing, or an empty manifest, is a failure in its own
 * right — a check that checked nothing must not report success.
 *
 * WHY BYTE COUNTS AND NOT HASHES. The REST listing returns each object's size for one
 * request; a hash would need every byte downloaded (5.4 GB, nightly). The SHA-256 in
 * the manifest is for a RESTORE to compare against — see docs/BACKUP-RESTORE.md.
 * The one-off `rclone check` at upload time did compare hashes.
 *
 * Usage:
 *   CLOUDFLARE_API_TOKEN=… node scripts/verify-archive.mjs
 *   node scripts/verify-archive.mjs --manifest other.json   # e.g. a negative control
 *   node scripts/verify-archive.mjs --bucket some-bucket
 *
 * Exit 0 only when every manifest object is present at its recorded size.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))

export const MANIFEST_PATH = join(here, 'archive-manifest.json')
export const ARCHIVE_BUCKET = 'run-apparel-archive'
/** Where apps/shrink/src/archiveRaw.ts puts the robot's copies of raw exports. */
export const ROBOT_ARCHIVE_PREFIX = 'raw-exports/robot/'
/**
 * Not a secret: the account id appears in every wrangler URL and in the Cloudflare
 * dashboard's own address bar. `CLOUDFLARE_ACCOUNT_ID` in the
 * environment overrides it, which is what the workflow sets.
 */
export const DEFAULT_ACCOUNT_ID = 'd357a1779c40da5f8c44931f12390cc8'
/** R2's REST listing pages; 1000 is the documented maximum per page. */
export const PER_PAGE = 1000
/** A ceiling on pagination so a cursor that never ends cannot loop forever. */
const MAX_PAGES = 100

/**
 * Validate the manifest's SHAPE before trusting it. A manifest that lists nothing would
 * verify an empty bucket as healthy; a duplicate key would count one object twice.
 */
export function validateManifest(manifest) {
  if (!manifest || typeof manifest !== 'object' || !Array.isArray(manifest.objects)) {
    throw new Error('archive manifest has no objects[] array')
  }
  if (manifest.objects.length === 0) {
    throw new Error(
      'archive manifest lists ZERO objects — an empty list would verify an empty bucket as healthy',
    )
  }
  const seen = new Set()
  for (const object of manifest.objects) {
    if (typeof object?.key !== 'string' || object.key.length === 0) {
      throw new Error(`archive manifest entry without a key: ${JSON.stringify(object)}`)
    }
    if (seen.has(object.key)) throw new Error(`archive manifest lists ${object.key} twice`)
    seen.add(object.key)
    if (!Number.isInteger(object.bytes) || object.bytes <= 0) {
      throw new Error(`archive manifest entry ${object.key} has no positive byte count`)
    }
    if (!/^[0-9a-f]{64}$/.test(object.sha256 ?? '')) {
      throw new Error(`archive manifest entry ${object.key} has no SHA-256`)
    }
  }
  return manifest
}

export function loadManifest(path = MANIFEST_PATH) {
  return validateManifest(JSON.parse(readFileSync(path, 'utf8')))
}

/**
 * List every object in the bucket through the Cloudflare REST API, following the
 * cursor until R2 says the listing is complete. Throws on any non-success response
 * rather than returning a partial list — a partial list would read as "objects
 * missing" and send someone hunting for a deletion that never happened.
 *
 * @param {{ token?: string, accountId?: string, bucket?: string, fetchImpl?: typeof fetch, perPage?: number }} [options]
 * @returns {Promise<Array<{ key: string, size: number, etag: string, lastModified: string }>>}
 */
export async function listArchive({
  token,
  accountId = DEFAULT_ACCOUNT_ID,
  bucket = ARCHIVE_BUCKET,
  fetchImpl = globalThis.fetch,
  perPage = PER_PAGE,
} = {}) {
  if (!token) throw new Error('a Cloudflare API token is required (CLOUDFLARE_API_TOKEN)')
  const objects = []
  let cursor
  for (let page = 0; page < MAX_PAGES; page++) {
    const url = new URL(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/r2/buckets/${bucket}/objects`,
    )
    url.searchParams.set('per_page', String(perPage))
    if (cursor) url.searchParams.set('cursor', cursor)
    const response = await fetchImpl(url, { headers: { Authorization: `Bearer ${token}` } })
    const body = await response.json().catch(() => null)
    if (!response.ok || !body?.success) {
      throw new Error(
        `R2 listing of ${bucket} failed: HTTP ${response.status} ${JSON.stringify(body?.errors ?? [])}`,
      )
    }
    for (const object of body.result ?? []) {
      objects.push({
        key: object.key,
        size: object.size,
        etag: object.etag,
        lastModified: object.last_modified,
      })
    }
    if (!body.result_info?.is_truncated) return objects
    cursor = body.result_info.cursor
    if (!cursor) throw new Error('R2 said the listing is truncated but returned no cursor')
  }
  throw new Error(`R2 listing of ${bucket} did not end after ${MAX_PAGES} pages`)
}

/**
 * Pure comparison. `ok` is true only when the listing is non-empty and every manifest
 * object is present at its exact byte count. Objects in the bucket that the manifest
 * does not know are reported as `extra` — unverified, not wrong — so a file added to
 * the bucket without a manifest row is visible in every nightly log.
 */
export function compareArchive(manifest, objects) {
  validateManifest(manifest)
  const byKey = new Map(objects.map((object) => [object.key, object]))
  const missing = []
  const mismatched = []
  let bytesVerified = 0
  for (const want of manifest.objects) {
    const have = byKey.get(want.key)
    if (!have) missing.push({ key: want.key, bytes: want.bytes })
    else if (have.size !== want.bytes) {
      mismatched.push({ key: want.key, expected: want.bytes, actual: have.size })
    } else bytesVerified += want.bytes
  }
  const known = new Set(manifest.objects.map((object) => object.key))
  const unknown = objects.filter((object) => !known.has(object.key))
  // The shrink robot writes its own copies of raw exports here (apps/shrink/src/archiveRaw.ts,
  // fix plan Rank 12) and no manifest row is ever written for them — they are reported as a
  // count with their bytes, never as "unverified", so the nightly log stays readable.
  const robotArchived = unknown
    .filter((object) => object.key.startsWith(ROBOT_ARCHIVE_PREFIX))
    .map((object) => ({ key: object.key, bytes: object.size }))
  const extra = unknown
    .filter((object) => !object.key.startsWith(ROBOT_ARCHIVE_PREFIX))
    .map((object) => object.key)
  const emptyListing = objects.length === 0
  return {
    ok: !emptyListing && missing.length === 0 && mismatched.length === 0,
    emptyListing,
    expected: manifest.objects.length,
    verified: manifest.objects.length - missing.length - mismatched.length,
    bytesVerified,
    missing,
    mismatched,
    extra,
    robotArchived,
  }
}

export function formatReport(result, bucket = ARCHIVE_BUCKET) {
  const gb = (bytes) => `${(bytes / 1e9).toFixed(2)} GB`
  const lines = []
  if (result.emptyListing) {
    lines.push(
      `[verify-archive] ERROR: ${bucket} listed ZERO objects. Either the bucket is empty or the listing is broken; both mean nothing was verified.`,
    )
  }
  for (const m of result.missing)
    lines.push(`[verify-archive]  ! MISSING: ${m.key} (${m.bytes} B expected)`)
  for (const m of result.mismatched) {
    lines.push(
      `[verify-archive]  ! WRONG SIZE: ${m.key} — bucket ${m.actual} B, manifest ${m.expected} B`,
    )
  }
  for (const key of result.extra)
    lines.push(`[verify-archive]  ~ not in the manifest (unverified): ${key}`)
  if (result.robotArchived?.length) {
    const bytes = result.robotArchived.reduce((sum, object) => sum + object.bytes, 0)
    lines.push(
      `[verify-archive]  + robot-archived raw exports (by design not in the manifest): ${result.robotArchived.length} object(s), ${gb(bytes)}`,
    )
  }
  lines.push(
    `[verify-archive] ${result.ok ? 'OK' : 'FAILED'}: ${result.verified} of ${result.expected} objects present at their recorded size (${gb(result.bytesVerified)}), ${result.missing.length} missing, ${result.mismatched.length} wrong size, ${result.extra.length} unlisted.`,
  )
  return lines
}

function argValue(flag) {
  const index = process.argv.indexOf(flag)
  return index >= 0 ? process.argv[index + 1] : undefined
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  const bucket = argValue('--bucket') ?? ARCHIVE_BUCKET
  try {
    const manifest = loadManifest(argValue('--manifest') ?? MANIFEST_PATH)
    const objects = await listArchive({
      token: process.env.CLOUDFLARE_API_TOKEN,
      accountId: process.env.CLOUDFLARE_ACCOUNT_ID || DEFAULT_ACCOUNT_ID,
      bucket,
    })
    const result = compareArchive(manifest, objects)
    for (const line of formatReport(result, bucket)) console.log(line)
    process.exitCode = result.ok ? 0 : 1
  } catch (error) {
    console.error(
      `[verify-archive] ERROR: ${error instanceof Error ? error.message : String(error)}`,
    )
    process.exitCode = 1
  }
}
