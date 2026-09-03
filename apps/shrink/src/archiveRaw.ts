/**
 * Copy the raw CLO export into the archive bucket once a run has succeeded (fix plan
 * Rank 12, audit CI-01).
 *
 * THE DEFECT. The ingest bucket carries a 14-day expiry rule and is in no backup; the
 * raw export exists once, on the owner's disk, and once there. When the rule deleted the
 * only copy the CMS still said "Ready to review" and the Retry tick-box re-queued a job
 * that could not work. A garment that shrank fine on day 1 could not be re-run on day 15
 * — after a pipeline fix, after a preset change, after anything.
 *
 * THE FIX, best-effort by design. After the final write lands, the Worker streams the
 * object from the ingest bucket into `run-apparel-archive` (Standard storage, no expiry —
 * the bucket docs/BACKUP-RESTORE.md describes) under `raw-exports/robot/<ingest key>`.
 * The Workers R2 binding has no copy method (checked against the API reference on
 * 2026-09-03), but a `get()` body is a fixed-length stream that `put()` accepts, so the
 * bytes never sit in the Worker's memory. A raw export is 30 MB–1.3 GB; the single-put
 * ceiling is 4.995 GiB, so anything past `ARCHIVE_MAX_BYTES` is reported rather than
 * attempted. Idempotent: a copy already present at the same size is left alone, so a
 * re-run costs no storage.
 *
 * NEVER FAILS THE JOB. The shrink succeeded and the owner has their model; a failed copy
 * goes in the report as a sentence, not as a retry that would burn ten container minutes
 * to reproduce a result that is already correct.
 */

/** Where the robot's copies live; the hand-uploaded exports sit beside them. */
export const ARCHIVE_PREFIX = 'raw-exports/robot'

/** Under R2's 4.995 GiB single-put ceiling with room to spare. */
export const ARCHIVE_MAX_BYTES = Math.floor(4.9 * 1024 ** 3)

/** The two bindings, narrowed to what this needs so tests can hand in fakes. */
export interface ArchiveBuckets {
  ingest: { get(key: string): Promise<ArchiveSource | null> }
  archive: {
    head(key: string): Promise<{ size: number } | null>
    put(key: string, body: ReadableStream | null, options?: ArchivePutOptions): Promise<unknown>
  }
}

/** What `R2Bucket.get()` returns, narrowed. */
export interface ArchiveSource {
  size: number
  body: ReadableStream
  httpMetadata?: unknown
}

export interface ArchivePutOptions {
  httpMetadata?: unknown
  customMetadata?: Record<string, string>
}

export type ArchiveOutcome = 'archived' | 'already' | 'missing' | 'too-large' | 'failed'

export interface ArchiveResult {
  outcome: ArchiveOutcome
  key: string
  bytes: number | null
  /** One sentence for the owner's report. */
  note: string
}

const mb = (bytes: number) => `${(bytes / 1048576).toFixed(1)} MB`

/**
 * Archive one raw export. `key` is the ingest key (`<prefix>/<filename>` or bare);
 * `meta` is written as custom metadata so the archive explains itself.
 */
export async function archiveRawExport(
  buckets: ArchiveBuckets,
  key: string,
  meta: { rawUploadId: number | string; now?: Date },
): Promise<ArchiveResult> {
  const archiveKey = `${ARCHIVE_PREFIX}/${key}`
  try {
    const source = await buckets.ingest.get(key)
    if (!source) {
      return {
        outcome: 'missing',
        key: archiveKey,
        bytes: null,
        note:
          '⚠️ Not archived: the raw export was no longer in the upload store (uploads are kept ' +
          'for 14 days), so there was nothing to copy. Keep your own copy of the CLO export.',
      }
    }
    const existing = await buckets.archive.head(archiveKey)
    if (existing && existing.size === source.size) {
      await source.body.cancel().catch(() => {})
      return {
        outcome: 'already',
        key: archiveKey,
        bytes: source.size,
        note: `Archived earlier: the raw export is already in the archive bucket as ${archiveKey} (${mb(source.size)}).`,
      }
    }
    if (source.size > ARCHIVE_MAX_BYTES) {
      await source.body.cancel().catch(() => {})
      return {
        outcome: 'too-large',
        key: archiveKey,
        bytes: source.size,
        note:
          `⚠️ Not archived: the raw export is ${mb(source.size)}, over the ${mb(ARCHIVE_MAX_BYTES)} the robot ` +
          'can copy in one go. Copy it to the archive bucket by hand (docs/BACKUP-RESTORE.md).',
      }
    }
    await buckets.archive.put(archiveKey, source.body, {
      ...(source.httpMetadata ? { httpMetadata: source.httpMetadata } : {}),
      customMetadata: {
        source: 'ingest',
        rawUploadId: String(meta.rawUploadId),
        archivedAt: (meta.now ?? new Date()).toISOString(),
      },
    })
    return {
      outcome: 'archived',
      key: archiveKey,
      bytes: source.size,
      note:
        `Archived: the raw CLO export is now in the archive bucket as ${archiveKey} (${mb(source.size)}), ` +
        'so it survives the 14-day upload-store expiry.',
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    return {
      outcome: 'failed',
      key: archiveKey,
      bytes: null,
      note: `⚠️ Not archived: copying the raw export to the archive bucket failed (${detail}). The model is unaffected; copy the export by hand.`,
    }
  }
}
