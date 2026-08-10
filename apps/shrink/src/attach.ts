import { SHRINK_DETAIL_LEVELS, formatMb } from '@run-apparel/shared'

/**
 * The two decisions the shrink worker makes ABOUT a product, kept pure.
 *
 * Both were inline in `index.ts` when they were written on 2026-08-09 and both
 * moved out immediately, for the reason `containerReport.test.ts` already
 * records about `container/server.ts`: `index.ts` declares a Durable Object and
 * imports `@cloudflare/containers`, so importing it from a test drags the whole
 * Workers surface in. The rules that decide whether a robot may write to a live
 * garment should be checkable without any of that — same argument as
 * `apps/cms/src/collections/publishGating.ts`.
 */

/** What the target product looks like right now, or null if it cannot be read. */
export interface ProductState {
  productCode: string | null
  status: string | null
  hasGlbAsset: boolean
}

/**
 * May this run attach its model to the product, and if not, what does the owner
 * need to be told?
 *
 * WHY ATTACH AT ALL. The owner used to pick the finished model by hand from a
 * list of every model the library had ever held — all created by this worker and
 * all carrying byte-identical descriptions. On 2026-08-09 that was five GLBs
 * differing only by a trailing number, four of them superseded and one a
 * pre-2026-08-05 build with the old artwork damage. Picking the wrong one
 * published cleanly, because the publish gate only tests that *something* is
 * attached. The worker knows exactly which document it just made and which
 * product asked for it, so the safest thing it can do is say so.
 *
 * THE TWO REFUSALS BELOW ARE THE WHOLE SAFETY ARGUMENT, not caution:
 *
 *   - `published`. `glbAsset` is in the CMS's GATED_FIELDS, so writing it
 *     re-runs the publish gate. On a draft `assertPublishable` returns on its
 *     first line and the write cannot throw. On a LIVE product it can — and a
 *     gate rejecting the robot's own write is exactly the 2026-07-29 bug that
 *     GATED_FIELDS exists to prevent. Never write to a published one.
 *   - already has a model. Silently swapping the model under a garment the owner
 *     has set up is a surprise, not a convenience. A deliberate re-run is what
 *     the Retry box and the picker are for.
 */
export function planModelAttach(
  targetProductId: number | string | null | undefined,
  target: ProductState | null,
): { attach: true } | { attach: false; note: string } {
  // No product on the upload. Nothing to attach to and nothing to report — the
  // field is required, so this is only reachable on a row created before it was.
  if (targetProductId == null) return { attach: false, note: '' }

  // The product could not be read. Say so rather than not attaching in silence:
  // "the robot used to do this and today it didn't" reads as a bug when it is a
  // degraded read.
  if (!target) {
    return {
      attach: false,
      note:
        '\n\nCould not check the product, so the model was not attached automatically. ' +
        'It is saved — open the product’s “3D file” tab and pick it by hand.',
    }
  }

  if (target.status === 'published') {
    return {
      attach: false,
      note:
        '\n\nThis product is already live, so the new model was NOT attached automatically — ' +
        'swapping the model under a published page is your decision, not the robot’s. ' +
        'Open the product’s “3D file” tab and pick it when you are ready.',
    }
  }

  if (target.hasGlbAsset) {
    return {
      attach: false,
      note:
        '\n\nThis product already has a finished 3D file, so the new one was NOT attached ' +
        'automatically. Open the product’s “3D file” tab and pick it if you meant to replace it.',
    }
  }

  return { attach: true }
}

/**
 * A description that tells the models in the library apart.
 *
 * Every run used to write the identical string. `suggestedFilename` is derived
 * from the raw export, so it is the same on every re-run of the same garment,
 * while the CMS's filename dedup quietly appends -1, -2, -3, -4 to the stored
 * object. The result on 2026-08-09 was five entries in the "Finished 3D file"
 * picker all reading "Auto-processed 3D model
 * (cycling-all-colours-optimized.glb)". Date, size and Detail level are what
 * separate a re-run from the run before it, so they go in the name.
 *
 * `now` is a parameter rather than a `new Date()` inside, so the test asserts a
 * fixed string instead of re-deriving today's date and passing whatever the code
 * happens to produce.
 */
export function describeModel(input: {
  productCode: string | null
  detail: string
  sizeBytes: number
  suggestedFilename: string
  now: Date
}): string {
  const detailLabel =
    SHRINK_DETAIL_LEVELS.find((level) => level.value === input.detail)?.label ?? input.detail
  const day = input.now.toISOString().slice(0, 10)
  const subject = input.productCode ? `${input.productCode} 3D model` : '3D model'
  return `${subject} — shrunk ${day}, ${formatMb(input.sizeBytes)}, ${detailLabel} (from ${input.suggestedFilename})`
}
