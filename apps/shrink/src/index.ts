import { PermanentJobError } from './permanentJobError'
import {
  criticalDeadLetterFailure,
  criticalReportFailure,
  detailOf,
  failureReport,
  outcomeFor,
} from './queueDecisions'
import { specRefusal } from './specGate'
import { Container, getContainer } from '@cloudflare/containers'
import {
  DEFAULT_SHRINK_DETAIL,
  GLB_HARD_MAX_BYTES,
  type ShrinkJobMessage,
  formatMb,
  nextDetailAdvice,
  shrinkFlagsFor,
  toFileColours,
} from '@run-apparel/shared'
import { type ProductState, describeModel, planModelAttach } from './attach'
import { cmsFetch, isMediaReferenced } from './cms'
import { planColourImport } from './colourImport'
import { DEAD_LETTER_QUEUE, deadLetterReport } from './deadLetter'
import { type ShrinkFailure, reportFailure } from './sentry'
import { readContainerFailure } from './containerFailure'

/**
 * One container instance, shared by every job.
 *
 * `wrangler.jsonc` sets `max_instances: 1`, and the queue consumer sets
 * `max_concurrency: 1`, so jobs are serialised and a shared instance is never asked
 * to run two at once. Using the job id here instead — as this did until 2026-08-30 —
 * meant a second garment arriving while the first instance was still warm could not
 * get an instance at all, and dead-lettered without ever being attempted.
 */
const SHRINK_CONTAINER_ID = 'shrink'

/**
 * Ceiling on one container run, comfortably under the queue's own 15-minute
 * invocation limit so the abort lands in this Worker's catch rather than being
 * killed by the platform with nothing reported.
 *
 * The measured worst case is far below it: a 1.31 GB CLO export took 32.5 s through
 * the whole pipeline. This is a hang detector, not a budget.
 */
const CONTAINER_TIMEOUT_MS = 600_000

/**
 * Shrink service Worker.
 *
 * Flow: the CMS enqueues a job when a raw GLB is uploaded → this consumer drives
 * the ShrinkContainer (Node + the asset pipeline) to shrink it → the small,
 * validated GLB is POSTed back to the CMS as a guardrailed Media doc, and the
 * raw-upload record is updated to "ready". The owner then reviews and publishes.
 *
 * ⚠️ IT ALSO PHOTOGRAPHED EVERY COLOUR AUTOMATICALLY UNTIL 2026-08-17, by
 * driving a headless browser over the viewer's own `/render` route. Removed by
 * owner decision: Cloudflare Browser Rendering bills on session-seconds, the
 * owner would rather upload the colour photos by hand, and the whole apparatus
 * — a Puppeteer session, a public `/render` route, a `BROWSER` binding, a
 * `VIEWER_ORIGIN`, and `posters.ts`'s planning layer — existed only to serve it.
 *
 * Nothing downstream depended on the capture. The publish gate already refuses
 * any switched-on colour with no photo and already says "Add 'Photo of this
 * colour' on the Colours tab" (apps/cms/src/collections/publishGating.ts), so
 * that message is now the only path rather than the fallback path. Link
 * previews are unaffected: `apps/viewer/worker/preview.ts` reads whatever photo
 * the colourway carries, and `og:cards` reads the pipeline's local
 * `output/posters/` — neither ever touched Browser Rendering.
 *
 * The Container is stateless: the read-only R2 (S3) credentials and the object
 * key are passed per-request in the body, so no long-lived secrets live in the
 * image. CMS writes go through an internal service binding (no public internet,
 * so the cms.wear-run.help Bot Fight Mode challenge never applies).
 */

interface Env {
  SHRINK: DurableObjectNamespace<ShrinkContainer>
  CMS: Fetcher
  CMS_ORIGIN: string
  CMS_ROBOT_API_KEY: string
  R2_INGEST_S3_ENDPOINT: string
  R2_INGEST_BUCKET: string
  R2_INGEST_ACCESS_KEY_ID: string
  R2_INGEST_SECRET_ACCESS_KEY: string
  /**
   * Optional. Absent means no alerting, which is the state everything ran in until
   * 2026-08-29 — so a missing secret must degrade to that rather than break a job.
   */
  SENTRY_DSN?: string
}

/** JSON the container returns in the `x-shrink-report` header (base64). */
interface ShrinkReport {
  ok: boolean
  suggestedFilename: string
  sizeBytes: number
  variants: string[]
  /** The same names in FILE order. Absent from containers built before this existed. */
  variantsInFileOrder?: string[]
  warnings: string[]
  translucentMaterialCount: number
  /** UV sets the materials sample. Absent from containers built before this existed. */
  texCoordsInUse?: number[]
  /**
   * One suggested colour per variant, read from the file. Absent from an older
   * container, which is why every consumer treats it as optional — the colour
   * dropdown must keep working on a product processed before this shipped.
   */
  variantColours?: {
    variantId: string
    hex: string
    name: string
    slug: string
    deltaE: number
    confidence: 'high' | 'low'
    sampledMaterial: string
    /** Since 2026-09-02: where the colour was read, and why a blank one is blank. */
    sampledFrom?: 'factor' | 'texture'
    note?: string
  }[]
  /**
   * The depth-bias records the container wrote for printed layers stacked on cloth
   * (fix plan Rank 7C, 2026-09-03). Absent from an older container.
   */
  overlays?:
    | {
        measured: number
        overlayReadings: number
        flagged: number
        review: number
        clones: number
        threadIgnored: number
        written: boolean
      }
    | { error: string }
  /**
   * What the decimation pass did. `fallback` primitives got no artwork
   * protection. Absent when no simplify ran, or from an older container.
   */
  simplify?: {
    attributeAware: number
    fallback: number
    skipped: number
    uvSetsWeighted?: number[]
    /**
     * Materials with printed artwork that were decimated WITHOUT their texture
     * coordinates in the error budget. Absent from a container built before this
     * existed — which is why the gate below treats absent as "nothing to report"
     * rather than failing closed: an old image must not start rejecting every job.
     */
    artworkAtRisk?: string[]
    /**
     * Print pieces left exactly as exported — never decimated since 2026-09-02 (fix
     * plan Rank 3). Absent from an older container.
     */
    artworkUntouched?: number
    artworkUntouchedMaterials?: string[]
  }
  /**
   * Artwork materials left translucent, or whose MASK threshold drifted.
   * Absent from a container built before this existed, which reads as
   * "nothing to report" rather than failing closed — an old image must not
   * start rejecting every job.
   */
  artworkAlphaProblems?: { material: string; problem: 'blend' | 'cutoff' }[]
  /**
   * Prints the pipeline deliberately left translucent (soft edges, or an opacity set
   * in CLO). Reported in `text`, NEVER refused — until 2026-09-02 these refused two of
   * the owner's five finished garments (audit F2-01). Absent from an older container.
   */
  artworkSoftOnBlend?: {
    material: string
    reason: 'graded' | 'sheer-factor' | 'undecodable'
    factor: number
    midFraction: number
  }[]
  /**
   * Khronos glTF-Validator's verdict on the SHRUNK output.
   *
   * Absent from a container built before 2026-08-29, which reads as "nothing to
   * report" rather than failing closed — the same choice the artwork gates make, and
   * for the same reason: an old image must not start refusing every job. The cost is
   * that an old container silently skips this gate, which is the correct trade while
   * images roll forward.
   *
   * `errors` is the count AFTER the noise filter in gltf-spec.ts. `issues` is at most
   * ten one-line summaries — the raw arrays are deliberately not sent.
   */
  spec?: {
    validatorVersion: string
    errors: number
    warnings: number
    issues: string[]
  }
  /** How textures were classified and encoded. Absent from an older container. */
  textures?: { artwork: number; standard: number; skipped: number; artworkNames: string[] }
  /** How each translucent material was resolved. Absent from an older container. */
  solidify?: { opaqued: number; masked: number; keptBlend: number; doubleSided: number }
  text: string
  error?: string
}

/**
 * The container instance. Extends DurableObject via @cloudflare/containers; the
 * DO handles lifecycle, the image runs the Node shrink server on port 8080.
 */
export class ShrinkContainer extends Container<Env> {
  // `override` is required by `noImplicitOverride`, which this package only
  // started inheriting on 2026-08-12 when it began extending tsconfig.base.json.
  // It is not ceremony here: both of these are configuration the BASE class reads,
  // so if @cloudflare/containers ever renames one, an unmarked property would
  // silently stop overriding anything and quietly revert to the library default —
  // a container that listens on the wrong port, or never sleeps and bills for it.
  // Marked, that same rename is a compile error.
  override defaultPort = 8080
  // A shrink is a few minutes at most; let the instance sleep soon after so we
  // only pay for active time.
  override sleepAfter = '3m'
}

/**
 * Fire-and-forget alert. Awaited rather than dangling, because a Worker may be
 * torn down the instant the queue handler returns and an un-awaited fetch would
 * simply not happen — but it cannot throw, so awaiting costs only latency.
 */
async function alert(env: Env, failure: ShrinkFailure): Promise<void> {
  await reportFailure(
    env.SENTRY_DSN,
    failure,
    crypto.randomUUID().replace(/-/g, ''),
    new Date().toISOString(),
  )
}

export default {
  async queue(batch: MessageBatch<ShrinkJobMessage>, env: Env): Promise<void> {
    // The dead-letter queue arrives here too. Jobs on it have already failed
    // three times, so re-running the container is the one thing not to do —
    // it would burn several minutes to reproduce the same error. Say so on the
    // record and stop. Before this, the queue had no consumer at all and a
    // dead-lettered job simply evaporated.
    if (batch.queue === DEAD_LETTER_QUEUE) {
      for (const message of batch.messages) {
        await patchRawUpload(env, message.body.rawUploadId, {
          status: 'failed',
          // No error argument: a dead-letter message re-delivers the original job
          // body, so the failure detail genuinely is not here. The report says so
          // and points at where it is, rather than inventing a cause.
          report: deadLetterReport(undefined),
        }).catch((error: unknown) => {
          console.error(criticalDeadLetterFailure(message.body.rawUploadId, detailOf(error)))
        })
        await alert(env, {
          outcome: 'dead-letter',
          message:
            'A garment failed three times and was given up on. The cause is not carried on a ' +
            'dead-letter message — open the raw upload record to see the last error.',
          rawUploadId: message.body.rawUploadId,
          filename: message.body.filename,
        })
        message.ack()
      }
      return
    }

    for (const message of batch.messages) {
      try {
        await processJob(message.body, env)
        message.ack()
      } catch (error) {
        const detail = detailOf(error)
        // Record the failure on the raw-upload record so the owner sees why.
        //
        // This write is the ENTIRE failure-reporting mechanism: if it does not
        // land, the upload sits on "processing" forever and the owner is told
        // nothing at all. It used to end in a bare `.catch(() => {})` — twelve
        // lines from the machinery written to stop exactly that — so the one
        // failure that matters most was the one guaranteed to be silent.
        //
        // It still must not throw (that would lose the original error and
        // re-run the container), but it must leave a trace. Worker logs are
        // retained and searchable via `wrangler tail`; that is where this goes.
        await patchRawUpload(env, message.body.rawUploadId, {
          status: 'failed',
          report: failureReport(detail),
        }).catch((reportError: unknown) => {
          console.error(
            criticalReportFailure(message.body.rawUploadId, detail, detailOf(reportError)),
          )
        })

        // Somebody is now TOLD, rather than having to open the record and look.
        // Awaited before ack/retry so the Worker is still alive to send it.
        await alert(env, {
          outcome: error instanceof PermanentJobError ? 'refused' : 'retrying',
          message: detail,
          rawUploadId: message.body.rawUploadId,
          filename: message.body.filename,
        })

        // The report already tells the owner what to change; a retry would only
        // reproduce it. See queueDecisions.outcomeFor.
        if (outcomeFor(error) === 'ack') message.ack()
        else message.retry()
      }
    }
  },
}

async function processJob(job: ShrinkJobMessage, env: Env): Promise<void> {
  await patchRawUpload(env, job.rawUploadId, { status: 'processing' })

  // What this upload already points at, read UP FRONT.
  //
  // Every run of this job used to create a brand-new Media doc and overwrite
  // `resultGlb`, stranding the previous doc and its object in the PUBLIC bucket
  // with nothing referencing it and nothing ever cleaning it up. The `-2` on
  // `cycling-all-colours-optimized-2.glb` is exactly that: the CMS's filename
  // dedup, quietly recording a second attempt.
  //
  // Read here rather than just before createMedia so this CMS round-trip does
  // not sit between receiving the container's streamed response and consuming
  // it — that connection carries the whole model and should not be held open
  // waiting on an unrelated request.
  const previousResultGlb = await readResultGlb(env, job.rawUploadId)

  // The target product's code, status, current model and colour-row count —
  // read up front for the same reason as above, and used for three things:
  // naming the Media doc so the library does not fill with identical-looking
  // models, deciding whether this run may import the file's colours (step 4b),
  // and deciding whether it may attach itself (step 4c).
  const target = await readProductState(env, job.targetProductId)

  const key = job.prefix ? `${job.prefix}/${job.filename}` : job.filename
  const detail = job.detail ?? DEFAULT_SHRINK_DETAIL

  // 1. Drive the container: it pulls the raw from ingest (S3, read-only), runs
  //    the pipeline with the flags for this job's detail level, and returns the
  //    small GLB + a report. The flags are passed per job rather than baked into
  //    the image, so re-tuning a garment does not need a container rebuild.
  // ⚠️ A STABLE ID, NOT `job.rawUploadId`. It was per-job until 2026-08-30, and that
  // combination could dead-letter a garment that was never even attempted:
  // `apps/shrink/wrangler.jsonc` sets `max_instances: 1`, so while the first job's
  // instance is still alive — containers idle for about three minutes before
  // sleeping — a second job asking for a DIFFERENT instance id cannot get one. It
  // fails, retries twice against the same wall, and lands in the DLQ.
  //
  // Safe because the consumer sets `max_concurrency: 1`, so jobs are already
  // serialised; a shared instance is never asked to do two at once. The DLQ consumer
  // does not touch the container at all — it patches status and alerts. Reusing one
  // warm instance also removes a per-job cold start.
  const container = getContainer(env.SHRINK, SHRINK_CONTAINER_ID)
  const containerRes = await container.fetch(
    new Request('http://shrink-container/shrink', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        key,
        flags: shrinkFlagsFor(detail),
        s3: {
          endpoint: env.R2_INGEST_S3_ENDPOINT,
          bucket: env.R2_INGEST_BUCKET,
          accessKeyId: env.R2_INGEST_ACCESS_KEY_ID,
          secretAccessKey: env.R2_INGEST_SECRET_ACCESS_KEY,
        },
      }),
      // ⚠️ NO TIMEOUT UNTIL 2026-08-30. A container that hung produced no error and
      // no report: the fetch simply waited until the queue's own 15-minute ceiling
      // killed the invocation, at which point the message retried into the same hang.
      // The owner saw nothing — not a failure, not an alert, just a garment that
      // never appeared. Ten minutes sits comfortably under that ceiling, so the
      // abort throws into the catch below and the failure is REPORTED instead.
      signal: AbortSignal.timeout(CONTAINER_TIMEOUT_MS),
    }),
  )

  if (!containerRes.ok) {
    // Reads `x-shrink-report` first, then the body. The container's body is generic
    // since 2026-08-19 (CodeQL js/stack-trace-exposure); this branch used to read the
    // body ONLY, so genericising it without this change would have reduced every
    // container failure to "Container returned 500: " with nothing to say so.
    const detail = await readContainerFailure(containerRes)
    throw new Error(`Container returned ${containerRes.status}: ${detail}`)
  }

  const report = decodeReport(containerRes.headers.get('x-shrink-report'))
  if (!report?.ok) {
    // Drain so the container connection is not left hanging.
    await containerRes.body?.cancel().catch(() => {})
    throw new Error(report?.error ?? 'Container did not report a successful shrink.')
  }

  // 2. Pre-flight the size HERE, against the same constant the CMS enforces.
  //    Without this the failure surfaces as a bare HTTP 400 from Payload with no
  //    hint of which knob to turn — and the check is free, because the container
  //    already measured the output.
  if (report.sizeBytes > GLB_HARD_MAX_BYTES) {
    await containerRes.body?.cancel().catch(() => {})
    throw new PermanentJobError(
      `The shrunk model is ${formatMb(report.sizeBytes)}, over the ${formatMb(GLB_HARD_MAX_BYTES)} limit for published media, so it was not saved. ${nextDetailAdvice(detail)}`,
    )
  }

  // 2b. Refuse to save a model whose printed artwork lost its protection.
  //
  //     For a B2B garment reference the artwork IS the product, so "the 3D
  //     loads" is not success — a file with a torn logo is worse than no file,
  //     because it publishes silently and looks fine to every automated check.
  //     N001 shipped exactly that on 2026-07-29 and nobody found out from the
  //     system; a human noticed the wordmark had holes in it.
  //
  //     Structural, not a guess: these primitives were decimated with texture
  //     coordinates outside the error metric, so their UVs were free to smear.
  //     Permanent rather than retryable — the same input gives the same result,
  //     so a retry would just burn several minutes of container time.
  const artworkAtRisk = report.simplify?.artworkAtRisk ?? []
  if (artworkAtRisk.length > 0) {
    await containerRes.body?.cancel().catch(() => {})
    throw new PermanentJobError(
      `The printed artwork on ${artworkAtRisk.join(', ')} was damaged while shrinking this file, so it was not saved. ` +
        `Re-upload it with the Detail setting on “Highest quality — bigger file”. ` +
        `If that still fails, the artwork on those parts needs its own UV map in CLO.`,
    )
  }

  // 2c. Refuse a model whose printed artwork ended up see-through.
  //
  //     <model-viewer> has no order-independent transparency, so a BLEND
  //     material renders half-visible and sorts badly against the garment behind
  //     it — that is the reported symptom almost word for word. The opaque step
  //     resolves hard cut-outs to MASK/0.5; until now nothing checked whether it
  //     had actually succeeded, only that it had run.
  const alphaProblems = report.artworkAlphaProblems ?? []
  if (alphaProblems.length > 0) {
    await containerRes.body?.cancel().catch(() => {})
    const blend = alphaProblems.filter((p) => p.problem === 'blend').map((p) => p.material)
    const cutoff = alphaProblems.filter((p) => p.problem === 'cutoff').map((p) => p.material)
    throw new PermanentJobError(
      (blend.length > 0
        ? `The printed artwork on ${blend.join(', ')} came out see-through: a hard-edged, fully opaque print was left ` +
          'blended, which the pipeline’s own opaque step should have cut out. '
        : `The cut-out threshold on ${cutoff.join(', ')} is wrong, which thins or fattens the lettering. `) +
        'The file was not saved. This is a pipeline fault, not an export problem — re-exporting will not ' +
        'change it; report it. (Soft-edged or deliberately translucent prints no longer refuse a garment; ' +
        'they are listed in the report instead.)',
    )
  }

  // 2d. Refuse a model the official Khronos validator calls invalid.
  //
  //     The validator has run on every garment since the spec check was added; its
  //     answer was computed and dropped on the floor (container server.ts). Both live
  //     garments are invalid glTF as a result — 44 errors on the cycling suit, all
  //     `IMAGE_NON_ENABLED_MIME_TYPE` / `TEXTURE_INVALID_IMAGE_MIME_TYPE` from a WebP
  //     pass that wrote the mime type without declaring EXT_texture_webp.
  //
  //     Browsers sniff the bytes and render anyway, which is precisely why nothing
  //     noticed. Other software is not obliged to: a factory system, a marketplace or a
  //     customer's own 3D tool may simply refuse the file.
  //
  //     Structural, so Permanent rather than retryable: `spec.errors` is severity 0
  //     with no false-positive case — the same bar the artwork gates meet — and the
  //     same input would produce the same verdict on a retry.
  //
  //     ⚠️ FAILS OPEN on an old container, deliberately. `spec` is absent from images
  //     built before 2026-08-29, and `specRefusal` reads an absent verdict as "nothing
  //     to report" rather than refusing every job while images roll forward.
  const specProblem = specRefusal(report.spec)
  if (specProblem) {
    await containerRes.body?.cancel().catch(() => {})
    throw new PermanentJobError(specProblem)
  }

  // 3. Create the guardrailed Media doc from the SHRUNK output. The CMS media
  //    rules still run — safe filename + < 40 MB — so a bad output is rejected
  //    there too rather than published.
  const media = await createMedia(env, containerRes, report, {
    productCode: target?.productCode ?? null,
    detail,
  })
  const mediaId = media.id

  // 4. Tell the product which colours are inside the file.
  //
  //    This is what removed the requirement to name colourways `N001-NAVY`
  //    inside CLO 3D — previously the merged GLB's variant names had to match
  //    the CMS character for character, and a mismatch only showed up as dead
  //    colour buttons on the live page after a ~350 MB re-upload. Now the file
  //    keeps whatever names CLO gave it, the CMS lists them back to the owner,
  //    and they point each of their colours at one. Nothing is renamed.
  //
  //    Best-effort on purpose: the shrink itself succeeded, and the owner can
  //    still attach the result by hand. Failing the job here would re-run several
  //    minutes of container time for a result that is already correct.
  //    Failure here must not fail the job — the shrink itself succeeded and the
  //    owner can still attach the result by hand — but it must not vanish either.
  //    It did on 2026-07-29: the CMS rejected this write and the bare
  //    `.catch(() => {})` swallowed it, so the colour dropdown stayed empty with
  //    nothing anywhere saying why. The reason goes in the report the owner reads.
  const fileColours = report.variantsInFileOrder ?? report.variants
  let fileColoursNote = ''
  if (job.targetProductId != null && fileColours.length > 0) {
    try {
      // `fileColourDetails` is written ALONGSIDE `fileColours`, never instead of
      // it. The existing dropdown reads the plain string list, so a product
      // processed by an older container — or by this one, if the container is
      // rolled back — keeps working with no backfill and no migration ordering
      // problem. The details are pure enrichment: swatch and suggested name.
      await patchProduct(env, job.targetProductId, {
        fileColours,
        ...(report.variantColours?.length ? { fileColourDetails: report.variantColours } : {}),
      })
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      fileColoursNote =
        `\n\n⚠️ Could not write the colour list onto the product, so the ` +
        `"Which colour in your CLO file is this?" dropdown will be empty. ` +
        `The colours found are listed above — tell your developer this:\n${detail}`
    }
  }

  // 4b. Add the file's own colours to the product — but ONLY to a draft that
  //     has none yet.
  //
  //     The owner used to have to open the Colours tab and press "Add the
  //     ticked colours" by hand for every garment this robot finished — a
  //     button they had to know to look for. On 2026-08-03 N001's file held
  //     five colourways and the CMS had three rows; the other two were
  //     invisible to every buyer, and the only way to discover them was to
  //     open the GLB.
  //
  //     THE TWO CONDITIONS ARE THE WHOLE SAFETY ARGUMENT, not caution — the
  //     full reasoning lives on planColourImport itself (./colourImport.ts),
  //     which this only calls:
  //
  //     - `status !== 'published'`. `colourways` is in GATED_FIELDS, exactly
  //       like `glbAsset` below, so the same 2026-07-29 argument applies:
  //       never write to a published product.
  //     - no colour rows yet. Appending to a product the owner has already set
  //       up is a surprise, not a convenience — "Add the ticked colours" stays
  //       for that case and must keep working unchanged.
  //
  //     A SEPARATE PATCH from both the colour-list write above and the model
  //     attach below, for the same reason those two are already kept apart:
  //     bundled into either, a failure here would risk losing a write that
  //     matters more (fileColours fills the colour dropdown; the model attach
  //     is what makes the product showable at all). Reports rather than
  //     throws, like both its neighbours: the shrink succeeded, and the owner
  //     can always press the button by hand.
  const colourPlan = planColourImport(target, toFileColours(report.variantColours))
  let colourImportNote = colourPlan.rows === null ? colourPlan.note : ''
  if (colourPlan.rows && colourPlan.rows.length > 0 && job.targetProductId != null) {
    try {
      await patchProduct(env, job.targetProductId, { colourways: colourPlan.rows })
      colourImportNote = colourPlan.note ?? ''
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      colourImportNote =
        '\n\n⚠️ Could not add the file’s colours to the product automatically. They are listed above ' +
        '— open the Colours tab and press “Add the ticked colours” by hand. ' +
        `Tell your developer this:\n${reason}`
    }
  }

  // 4c. Attach the model to the product itself — but ONLY to a draft that has
  //     none yet.
  //
  //     The owner used to do this by hand from a picker that listed every model
  //     the library had ever held, all created by this function and all carrying
  //     byte-identical `alt` text. On 2026-08-09 that was five GLBs differing
  //     only by a trailing number, four of them superseded and one of them a
  //     pre-2026-08-05 build with the old artwork damage — and picking the wrong
  //     one published cleanly, because the gate only tests that *something* is
  //     attached. The robot already knows exactly which document it just made and
  //     which product asked for it, so the safest thing it can do is say so.
  //
  //     THE TWO CONDITIONS ARE THE WHOLE SAFETY ARGUMENT, not caution:
  //
  //     - `status !== 'published'`. `glbAsset` is in GATED_FIELDS, so writing it
  //       re-runs the publish gate. On a draft `assertPublishable` returns on its
  //       first line, so the write cannot throw. On a LIVE product it can — and a
  //       gate rejecting the robot's own write is precisely the 2026-07-29 bug
  //       that GATED_FIELDS exists to prevent. Never write to a published one.
  //     - no model attached yet. Silently swapping the model under a garment the
  //       owner has already set up is not a convenience, it is a surprise. A
  //       deliberate re-run is what the Retry box and the picker are for.
  //
  //     A SEPARATE PATCH from the colour-list write and the colour import above,
  //     deliberately. Bundled into one call, any failure here would also lose
  //     `fileColours` — the write that fills the colour dropdown and the one
  //     thing that repairs a half-set-up product. Extra round trips are a cheap
  //     price for keeping those failure modes apart. Like both writes above,
  //     this one reports rather than throws: the shrink succeeded and the owner
  //     can always attach by hand.
  const plan = planModelAttach(job.targetProductId, target)
  let attachNote = plan.attach ? '' : plan.note
  if (plan.attach && job.targetProductId != null) {
    try {
      await patchProduct(env, job.targetProductId, { glbAsset: mediaId })
      attachNote =
        '\n\nAttached to the product as its finished 3D file. ' +
        'Nothing is public until you set Status to Published.'
    } catch (error) {
      // Named `reason` rather than `detail`: `detail` is the Detail LEVEL in
      // this function's scope, and shadowing it here reads as the wrong thing.
      const reason = error instanceof Error ? error.message : String(error)
      attachNote =
        '\n\n⚠️ Could not attach the model to the product automatically. It is saved and ' +
        'unharmed — open the product’s “3D file” tab and pick it by hand. ' +
        `Tell your developer this:\n${reason}`
    }
  }

  // 5. Mark the raw upload ready for the owner to review + publish.
  await patchRawUpload(env, job.rawUploadId, {
    status: 'ready',
    resultGlb: mediaId,
    report: report.text + fileColoursNote + colourImportNote + attachNote,
  })

  // 6. Retire the model this run replaced — but only once `resultGlb` points at
  //    the new one, so a failure here can never leave the upload pointing at a
  //    document that has been deleted.
  const supersededNote = await retireSupersededResult(
    env,
    previousResultGlb,
    mediaId,
    job.rawUploadId,
  )
  if (supersededNote) {
    await patchRawUpload(env, job.rawUploadId, {
      report: report.text + fileColoursNote + colourImportNote + attachNote + supersededNote,
    }).catch(() => {
      // The retirement note is the least important write in the job; the model
      // is already saved and attached. Do not fail a successful shrink for it.
    })
  }
}

/**
 * Read the target product's code, status, whether it already has a model, how
 * many colour rows it already has, and the RAW colour rows themselves.
 *
 * ⚠️ IT ALSO READ `frontCameraOrbit` AND `defaultFieldOfView` UNTIL 2026-08-17,
 * with their own schema-default constants. Those existed solely to aim the
 * automatic poster capture's headless browser; nothing else has ever read a
 * camera value in this Worker, so they went with it.
 *
 * Returns null on ANY failure, and every caller treats null as "do nothing
 * special": the Media doc falls back to its filename-based description, and the
 * auto-attach and the colour import are both skipped. Failing closed is the
 * right direction here — not acting leaves the owner exactly where they were
 * before this existed, while acting on a guess could change a live garment.
 */
async function readProductState(
  env: Env,
  id: number | string | null | undefined,
): Promise<
  | (ProductState & {
      colourwayCount: number
      colourways: Record<string, unknown>[]
    })
  | null
> {
  if (id == null) return null
  const res = await cmsFetch(env, `/api/products/${id}?depth=0`, { method: 'GET' }).catch(
    () => null,
  )
  if (!res?.ok) return null
  const doc = (await res.json().catch(() => null)) as {
    productCode?: unknown
    status?: unknown
    glbAsset?: unknown
    colourways?: unknown
  } | null
  if (!doc) return null
  // depth has no bearing on an array field's own rows, only on relationships
  // nested inside them, so this is accurate at depth=0 — each row's OWN
  // posterPreview/glbAsset still come back as bare ids, which is what
  // planColourImport needs to decide.
  const colourways = Array.isArray(doc.colourways)
    ? (doc.colourways as Record<string, unknown>[])
    : []
  return {
    productCode: typeof doc.productCode === 'string' ? doc.productCode : null,
    status: typeof doc.status === 'string' ? doc.status : null,
    // depth=0 gives a bare id, but a stray populated object must not read as empty.
    hasGlbAsset: doc.glbAsset != null && doc.glbAsset !== '',
    colourwayCount: colourways.length,
    colourways,
  }
}

/** The Media doc this raw upload currently points at, if any. */
async function readResultGlb(env: Env, id: number | string): Promise<number | string | null> {
  const res = await cmsFetch(env, `/api/raw-uploads/${id}?depth=0`, { method: 'GET' })
  if (!res.ok) return null
  const doc = (await res.json().catch(() => null)) as { resultGlb?: number | string | null } | null
  const value = doc?.resultGlb
  // depth=0 gives a bare id, but a stray populated object should not crash the job.
  if (value == null) return null
  if (typeof value === 'object') return (value as { id?: number | string }).id ?? null
  return value
}

/**
 * Delete the Media doc a re-run replaced, if nothing else uses it.
 *
 * Returns a note for the owner's report when the old file was left behind, and
 * an empty string when there was nothing to do or it was cleaned up silently —
 * a successful tidy-up is not news.
 */
async function retireSupersededResult(
  env: Env,
  previous: number | string | null,
  current: number | string,
  rawUploadId: number | string,
): Promise<string> {
  if (previous == null || String(previous) === String(current)) return ''

  if (await isMediaReferenced(env, previous, rawUploadId)) {
    return (
      `\n\nNote: this replaced an earlier processed model (#${previous}), which is still in use ` +
      'elsewhere, so it has been left alone. Point whatever uses it at the new file, then delete the ' +
      'old one from Media if you no longer want it.'
    )
  }

  const res = await cmsFetch(env, `/api/media/${previous}`, { method: 'DELETE' }).catch(() => null)
  if (!res?.ok) {
    return (
      `\n\nNote: this replaced an earlier processed model (#${previous}) that could not be deleted ` +
      'automatically. It is unused — remove it from Media when convenient.'
    )
  }
  return ''
}

/**
 * Build a `multipart/form-data` body that STREAMS the container's response
 * straight through, instead of materialising it.
 *
 * The obvious `new File([await res.arrayBuffer()], …)` + `FormData` costs two
 * full-size copies of the GLB on top of the original — 120–170 MB for a 40 MB
 * model — inside a Worker isolate capped at 128 MB. Cloudflare's own guidance is
 * explicit: use Streams to "avoid buffering large requests or responses in
 * memory". Here the bytes are only ever in flight.
 */
function streamMultipart(
  source: ReadableStream<Uint8Array>,
  fields: { alt: string; filename: string; contentType: string; artworkVerdict?: string },
): { body: ReadableStream<Uint8Array>; contentType: string } {
  const boundary = `----runapparel${crypto.randomUUID().replace(/-/g, '')}`
  const encoder = new TextEncoder()
  // Document fields MUST go in a single `_payload` part holding JSON. Payload
  // reads nothing else from a multipart body — `addDataAndFileToRequest` only
  // looks at `fields._payload` and JSON.parses it, so a part named "alt" is
  // silently dropped.
  //
  // This was sending `alt` as its own part. The first real 382 MB upload
  // (2026-07-29) transferred all 73 chunks, shrank correctly, and then died at
  // the last step with `ValidationError: Alt — This field is required`, because
  // `alt` never reached the document. Nothing before that had exercised this
  // path.
  const preamble = encoder.encode(
    `--${boundary}\r\nContent-Disposition: form-data; name="_payload"\r\n\r\n${JSON.stringify({
      alt: fields.alt,
      ...(fields.artworkVerdict ? { artworkVerdict: fields.artworkVerdict } : {}),
    })}\r\n` +
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${fields.filename}"\r\n` +
      `Content-Type: ${fields.contentType}\r\n\r\n`,
  )
  const epilogue = encoder.encode(`\r\n--${boundary}--\r\n`)

  const reader = source.getReader()
  let phase: 'preamble' | 'body' | 'epilogue' = 'preamble'

  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (phase === 'preamble') {
        controller.enqueue(preamble)
        phase = 'body'
        return
      }
      if (phase === 'body') {
        const { done, value } = await reader.read()
        if (!done) {
          controller.enqueue(value)
          return
        }
        phase = 'epilogue'
      }
      controller.enqueue(epilogue)
      controller.close()
    },
    cancel(reason) {
      return reader.cancel(reason)
    },
  })

  return { body, contentType: `multipart/form-data; boundary=${boundary}` }
}

/**
 * POST the shrunk GLB to the CMS Media collection; returns the new media doc's
 * id AND its public url. The url is read straight off THIS response rather than
 * fetched again, because Payload's upload plugin already computes and returns it
 * on create (apps/cms/src/payload.config.ts's r2Storage `generateFileURL`).
 *
 * The url's only consumer was the poster capture, removed 2026-08-17. It is kept
 * because it costs nothing — it is already in the response body — and because
 * `planModelAttach`'s report text is the obvious next thing to want it.
 */
async function createMedia(
  env: Env,
  containerRes: Response,
  report: ShrinkReport,
  label: { productCode: string | null; detail: string },
): Promise<{ id: number | string; url: string | null }> {
  if (!containerRes.body) throw new Error('Container returned no model data.')

  const { body, contentType } = streamMultipart(containerRes.body, {
    alt: describeModel({
      productCode: label.productCode,
      detail: label.detail,
      sizeBytes: report.sizeBytes,
      suggestedFilename: report.suggestedFilename,
      now: new Date(),
    }),
    filename: report.suggestedFilename,
    contentType: 'model/gltf-binary',
    // Reaching here means the artwork check ran and passed — a file that failed
    // it never gets this far (see the PermanentJobError above). Recording the
    // pass is what separates "checked, fine" from "nobody ever looked", which is
    // the state of every file uploaded before the check existed.
    artworkVerdict: 'ok',
  })

  // Deliberately no Content-Length: Payload accepts a streamed multipart body
  // (`addDataAndFileToRequest` falls through on `hasBodyStream`), and a
  // Content-Length that disagreed with the actual byte count by even one would
  // hang the request instead of failing cleanly.
  const res = await cmsFetch(env, '/api/media', {
    method: 'POST',
    headers: { 'content-type': contentType },
    body,
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    const message = `The CMS would not accept the shrunk model (${res.status}). The size was already checked, so this is most likely the filename. Detail: ${detail.slice(0, 400)}`
    // A 4xx is the CMS's guardrails saying no — identical on every retry. A 5xx
    // may well be transient, so let those run the normal retry path.
    throw res.status < 500 ? new PermanentJobError(message) : new Error(message)
  }
  const created = (await res.json()) as { doc?: { id?: number | string; url?: string | null } }
  const id = created?.doc?.id
  if (id == null) throw new Error('CMS media create returned no id.')
  return { id, url: created.doc?.url ?? null }
}

async function patchRawUpload(
  env: Env,
  id: number | string,
  data: Record<string, unknown>,
): Promise<void> {
  const res = await cmsFetch(env, `/api/raw-uploads/${id}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Failed to update raw upload ${id} (${res.status}): ${body.slice(0, 300)}`)
  }
}

async function patchProduct(
  env: Env,
  id: number | string,
  data: Record<string, unknown>,
): Promise<void> {
  const res = await cmsFetch(env, `/api/products/${id}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Failed to update product ${id} (${res.status}): ${body.slice(0, 300)}`)
  }
}

function decodeReport(header: string | null): ShrinkReport | null {
  if (!header) return null
  try {
    return JSON.parse(atob(header)) as ShrinkReport
  } catch {
    return null
  }
}
