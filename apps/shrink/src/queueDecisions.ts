/**
 * What the queue consumer decides, extracted so it can be tested.
 *
 * ⚠️ WHY THIS EXISTS. `apps/shrink/vitest.config.ts` excludes `src/index.ts` from
 * coverage and justifies it like this: *"a fetch/queue handler whose branches are the
 * Cloudflare runtime's, not ours; every decision it makes is delegated to the tested
 * modules beside it, which is the reason it is excluded rather than the excuse."*
 *
 * That was not true. The dead-letter fork, the ack-versus-retry decision, the failure
 * report text and the CRITICAL fallback all lived inside those 760 excluded lines —
 * so this package's 100%/100%/98%/100% thresholds measured 75 lines and none of the
 * decisions that determine whether a customer's garment is refused, retried or
 * abandoned. A threshold that strict over a denominator that small reads as the
 * strongest gate in the repo while checking almost nothing.
 *
 * Rather than lower a floor — this repo's floors are MEASURED and lowering one to go
 * green is explicitly forbidden — the fix is to make the config's claim true. Each
 * function here is a decision `index.ts` used to make inline.
 */
import { PermanentJobError } from './permanentJobError'

/** What to do with a message after `processJob` threw. */
export type QueueOutcome = 'ack' | 'retry'

/**
 * Whether to stop or try again.
 *
 * A `PermanentJobError` is one the same input would reproduce — an over-size output,
 * damaged artwork, an invalid glTF file. Retrying it burns several minutes of container
 * time to reach the identical answer and then dead-letters anyway, so the report on the
 * record is the whole outcome and the job stops here.
 */
export function outcomeFor(error: unknown): QueueOutcome {
  return error instanceof PermanentJobError ? 'ack' : 'retry'
}

/** The text written onto the raw-upload record when a job fails. */
export function failureReport(detail: string): string {
  return `Automatic shrink failed:\n${detail}`
}

/**
 * The log line for when the failure report ITSELF could not be written.
 *
 * This is the last resort. If this write fails the upload sits on "processing"
 * forever and the owner is told nothing at all, so the message has to carry both
 * errors — the original one is otherwise lost completely. It used to end in a bare
 * `.catch(() => {})`, twelve lines from the machinery written to prevent exactly that.
 */
export function criticalReportFailure(
  rawUploadId: string | number,
  originalDetail: string,
  reportDetail: string,
): string {
  return (
    `[shrink] CRITICAL: could not report failure for raw upload ${rawUploadId}. ` +
    'The upload will appear stuck with no explanation.\n' +
    `  original failure: ${originalDetail}\n` +
    `  reporting failure: ${reportDetail}`
  )
}

/** The same, for a message that had already been given up on. */
export function criticalDeadLetterFailure(rawUploadId: string | number, detail: string): string {
  return (
    `[shrink] CRITICAL: dead-lettered raw upload ${rawUploadId} could not be ` +
    'marked failed. It will appear stuck forever with no explanation. ' +
    detail
  )
}

/** Normalise a thrown value to text, because `catch` gives `unknown`. */
export function detailOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
