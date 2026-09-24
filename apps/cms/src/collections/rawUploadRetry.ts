/**
 * What a save of a raw upload means for the shrink queue (fix plan Rank 12, audits Q-07
 * and CI-01). Pure, so the two decisions the afterChange hook makes can be tested without
 * Payload, a queue or a bucket.
 *
 * Q-07. "Try this again" used to enqueue whenever the box flipped false → true, whatever
 * the row's status. Ticked while a job was still queued or processing, it started a
 * SECOND run of the same upload: two containers on one file, two Media docs, and the
 * later one silently winning. The box is now hidden unless the row is failed or ready
 * (`admin.condition`), and — because a hidden field is a courtesy, not a guard — the hook
 * refuses the same case itself.
 *
 * CI-01. The ingest bucket expires objects after 14 days. A retry on a row whose file has
 * expired used to queue a job that could only fail, twice, then dead-letter — and the
 * record said "Ready to review" the whole time. The hook now HEADs the object before
 * queuing and, when it is gone, writes the sentence below instead of a job.
 */

/** The statuses from which a retry makes sense: the last run finished, one way or the other. */
export const RETRYABLE_STATUSES = ['failed', 'ready'] as const

export type RetryDecision =
  /** A new upload: enqueue. */
  | 'create'
  /** The box was just ticked on a finished row: check the file, then enqueue. */
  | 'retry'
  /** The box was ticked while a run is queued or in progress: un-tick it, enqueue nothing. */
  | 'retry-while-running'
  /** Any other write — the robot's own status patches included. */
  | 'ignore'

interface RowLike {
  retry?: unknown
  status?: unknown
}

export function retryDecision(args: {
  operation: string
  doc: RowLike | null | undefined
  previousDoc: RowLike | null | undefined
}): RetryDecision {
  if (args.operation === 'create') return 'create'
  const ticked =
    args.operation === 'update' && args.doc?.retry === true && args.previousDoc?.retry !== true
  if (!ticked) return 'ignore'
  const before = args.previousDoc?.status
  // A row with no recorded status (nothing older than the field exists, but be safe)
  // is allowed through: refusing would leave a stuck row with no way out.
  if (typeof before !== 'string') return 'retry'
  return (RETRYABLE_STATUSES as readonly string[]).includes(before)
    ? 'retry'
    : 'retry-while-running'
}

/** Does the row's status allow the Retry box to show at all? The admin-side half of Q-07. */
export function retryBoxVisible(status: unknown): boolean {
  return typeof status === 'string' && (RETRYABLE_STATUSES as readonly string[]).includes(status)
}

/** Written onto the row instead of queuing a job, when the raw file is gone (CI-01). */
export const EXPIRED_UPLOAD_REPORT =
  'This file has expired from the upload store, so there is nothing to shrink — uploads are ' +
  'kept for 14 days after they arrive, and this one is older. Nothing was queued. Upload the CLO ' +
  'export again as a new raw upload.'
