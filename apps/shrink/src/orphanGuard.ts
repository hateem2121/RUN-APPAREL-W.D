/**
 * When the run's FINAL write fails, the model it just saved must not be stranded in
 * the public bucket (fix plan Rank 12, audit Q-04).
 *
 * THE DEFECT. processJob creates the Media doc (and its object in the public media
 * bucket) in step 3, then writes `resultGlb` onto the raw upload last. If that last
 * write fails — the CMS down, a hook rejecting the PATCH — the catch marks the upload
 * failed and the queue retries the whole job. The retry reads `resultGlb` up front to
 * retire the previous model (see `retireSupersededResult`), finds nothing, because the
 * pointer never landed, and creates a SECOND Media doc. The first sits in the public
 * bucket forever, referenced by nothing, found only by scripts/find-orphan-media.mjs.
 *
 * THE RULE, the same one that governs every delete in this repo ("Before you delete
 * anything in the CMS", root CLAUDE.md): delete only what `isMediaReferenced` says is
 * unused, and treat "cannot tell" as "in use". The auto-attach step may already have
 * pointed the product at this model before the final write failed; that model is then
 * referenced and stays. And when the CMS cannot even answer the reference query, the
 * count comes back 'unknown', the check says referenced, and nothing is deleted — a
 * stale file in a bucket is the cheap mistake, a model missing off a product page is
 * not.
 *
 * Separate from index.ts for the reason cms.ts gives: index.ts imports
 * `@cloudflare/containers`, which cannot load under plain vitest, and a guard around an
 * irreversible DELETE is the last thing that should be untestable.
 */
import { type CmsEnv, cmsFetch, isMediaReferenced } from './cms'
import { PermanentJobError } from './permanentJobError'

export type OrphanOutcome = 'deleted' | 'kept-referenced' | 'delete-failed'

/**
 * Retire the model this run just created, if nothing references it. Never throws:
 * the caller is already handling the failure that got it here, and that error is the
 * one the owner must see.
 *
 * Returns what happened and a sentence for the failure report.
 */
export async function retireOrphanedMedia(
  env: CmsEnv,
  mediaId: number | string,
  rawUploadId: number | string,
): Promise<{ outcome: OrphanOutcome; note: string }> {
  // isMediaReferenced never throws — it answers "referenced" on any doubt — so no
  // try/catch here: an unreachable catch would only hide a change to that contract.
  if (await isMediaReferenced(env, mediaId, rawUploadId)) {
    return {
      outcome: 'kept-referenced',
      note:
        `The model this run saved (#${mediaId}) is already in use or its use could not be checked, ` +
        'so it was left in place.',
    }
  }

  const res = await cmsFetch(env, `/api/media/${mediaId}`, { method: 'DELETE' }).catch(() => null)
  if (!res?.ok) {
    return {
      outcome: 'delete-failed',
      note:
        `The model this run saved (#${mediaId}) is unused and could not be deleted automatically — ` +
        'remove it from Media when convenient, or the next attempt leaves it stranded.',
    }
  }
  return {
    outcome: 'deleted',
    note:
      `The model this run had just saved (#${mediaId}) was deleted again, so the failed write ` +
      'does not strand it in the public bucket; the next attempt starts clean.',
  }
}

/**
 * The original failure, with the guard's sentence appended, keeping its class: a
 * PermanentJobError stays permanent (the queue acks it), anything else stays retryable.
 */
export function appendToError(error: unknown, note: string): Error {
  const detail = error instanceof Error ? error.message : String(error)
  const message = `${detail} ${note}`
  return error instanceof PermanentJobError ? new PermanentJobError(message) : new Error(message)
}
