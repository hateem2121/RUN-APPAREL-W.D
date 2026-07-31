import { Container, getContainer } from '@cloudflare/containers'
import {
  DEFAULT_SHRINK_DETAIL,
  GLB_HARD_MAX_BYTES,
  type ShrinkJobMessage,
  formatMb,
  nextDetailAdvice,
  shrinkFlagsFor,
} from '@run-apparel/shared'

/**
 * Shrink service Worker.
 *
 * Flow: the CMS enqueues a job when a raw GLB is uploaded → this consumer drives
 * the ShrinkContainer (Node + the asset pipeline) to shrink it → the small,
 * validated GLB is POSTed back to the CMS as a guardrailed Media doc, and the
 * raw-upload record is updated to "ready". The owner then reviews and publishes.
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
   * What the decimation pass did. `fallback` primitives got no artwork
   * protection. Absent when no simplify ran, or from an older container.
   */
  simplify?: { attributeAware: number; fallback: number; skipped: number; uvSetsWeighted?: number[] }
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
  defaultPort = 8080
  // A shrink is a few minutes at most; let the instance sleep soon after so we
  // only pay for active time.
  sleepAfter = '3m'
}

/**
 * A failure that retrying cannot fix — the output was too big, the raw file is
 * not usable, the CMS refused the document. Retrying these costs several minutes
 * of `standard-4` container time each, three times over, for a guaranteed
 * identical result; on a $5/month budget that matters. Transient failures
 * (container 5xx, a dropped CMS call) still retry as before.
 */
class PermanentJobError extends Error {
  readonly permanent = true
}

export default {
  async queue(batch: MessageBatch<ShrinkJobMessage>, env: Env): Promise<void> {
    for (const message of batch.messages) {
      try {
        await processJob(message.body, env)
        message.ack()
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error)
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
          report: `Automatic shrink failed:\n${detail}`,
        }).catch((reportError: unknown) => {
          const reportDetail = reportError instanceof Error ? reportError.message : String(reportError)
          console.error(
            `[shrink] CRITICAL: could not report failure for raw upload ${message.body.rawUploadId}. ` +
              `The upload will appear stuck with no explanation.\n` +
              `  original failure: ${detail}\n` +
              `  reporting failure: ${reportDetail}`,
          )
        })

        if (error instanceof PermanentJobError) {
          // The report already tells the owner what to change; a retry would
          // only reproduce it. Ack so the job stops here instead of running the
          // container twice more and then dead-lettering.
          message.ack()
        } else {
          message.retry()
        }
      }
    }
  },
}

async function processJob(job: ShrinkJobMessage, env: Env): Promise<void> {
  await patchRawUpload(env, job.rawUploadId, { status: 'processing' })

  const key = job.prefix ? `${job.prefix}/${job.filename}` : job.filename
  const detail = job.detail ?? DEFAULT_SHRINK_DETAIL

  // 1. Drive the container: it pulls the raw from ingest (S3, read-only), runs
  //    the pipeline with the flags for this job's detail level, and returns the
  //    small GLB + a report. The flags are passed per job rather than baked into
  //    the image, so re-tuning a garment does not need a container rebuild.
  const container = getContainer(env.SHRINK, String(job.rawUploadId))
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
    }),
  )

  if (!containerRes.ok) {
    const body = await containerRes.text().catch(() => '')
    throw new Error(`Container returned ${containerRes.status}: ${body.slice(0, 500)}`)
  }

  const report = decodeReport(containerRes.headers.get('x-shrink-report'))
  if (!report || !report.ok) {
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

  // 3. Create the guardrailed Media doc from the SHRUNK output. The CMS media
  //    rules still run — safe filename + < 40 MB — so a bad output is rejected
  //    there too rather than published.
  //
  //    Note what this upload already points at, BEFORE replacing it. Every run
  //    of this job used to create a brand-new Media doc and overwrite
  //    `resultGlb`, stranding the previous doc and its object in the PUBLIC
  //    bucket with nothing referencing it and nothing ever cleaning it up. The
  //    `-2` suffix on `cycling-all-colours-optimized-2.glb` is that: the CMS's
  //    filename dedup, quietly recording a second attempt.
  const previousResultGlb = await readResultGlb(env, job.rawUploadId)
  const mediaId = await createMedia(env, containerRes, report)

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
      await patchProduct(env, job.targetProductId, { fileColours })
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      fileColoursNote =
        `\n\n⚠️ Could not write the colour list onto the product, so the ` +
        `"Which colour in your CLO file is this?" dropdown will be empty. ` +
        `The colours found are listed above — tell your developer this:\n${detail}`
    }
  }

  // 5. Mark the raw upload ready for the owner to review + publish.
  await patchRawUpload(env, job.rawUploadId, {
    status: 'ready',
    resultGlb: mediaId,
    report: report.text + fileColoursNote,
  })

  // 6. Retire the model this run replaced — but only once `resultGlb` points at
  //    the new one, so a failure here can never leave the upload pointing at a
  //    document that has been deleted.
  const supersededNote = await retireSupersededResult(env, previousResultGlb, mediaId)
  if (supersededNote) {
    await patchRawUpload(env, job.rawUploadId, {
      report: report.text + fileColoursNote + supersededNote,
    }).catch(() => {
      // The retirement note is the least important write in the job; the model
      // is already saved and attached. Do not fail a successful shrink for it.
    })
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
 * Every field in the CMS that can point at a Media document, other than the
 * `raw_uploads.resultGlb` we are about to replace. If a field is added to any of
 * these collections it MUST be added here, or the reaper will consider a live
 * asset unreferenced.
 */
const MEDIA_REFERENCE_PATHS = [
  'glbAsset',
  'posterFallback',
  'colourways.posterPreview',
  'colourways.glbAsset',
] as const

/**
 * Is this Media doc used by any product?
 *
 * Fails SAFE: any error, any unexpected shape, and the answer is "yes, it is
 * referenced". Being wrong in that direction leaves a stale file in a bucket.
 * Being wrong the other way deletes a model off a published product page.
 */
export async function isMediaReferenced(
  env: Pick<Env, 'CMS' | 'CMS_ORIGIN' | 'CMS_ROBOT_API_KEY'>,
  mediaId: number | string,
): Promise<boolean> {
  const params = new URLSearchParams({ limit: '1', depth: '0' })
  MEDIA_REFERENCE_PATHS.forEach((path, index) => {
    params.set(`where[or][${index}][${path}][equals]`, String(mediaId))
  })

  try {
    const res = await cmsFetch(env as Env, `/api/products?${params.toString()}`, { method: 'GET' })
    if (!res.ok) return true
    const json = (await res.json()) as { totalDocs?: number }
    if (typeof json?.totalDocs !== 'number') return true
    return json.totalDocs > 0
  } catch {
    return true
  }
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
): Promise<string> {
  if (previous == null || String(previous) === String(current)) return ''

  if (await isMediaReferenced(env, previous)) {
    return (
      `\n\nNote: this replaced an earlier processed model (#${previous}), which is still attached to a ` +
      'product, so it has been left alone. Point that product at the new file, then delete the old one ' +
      'from Media if you no longer want it.'
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
  fields: { alt: string; filename: string; contentType: string },
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
    `--${boundary}\r\nContent-Disposition: form-data; name="_payload"\r\n\r\n${JSON.stringify({ alt: fields.alt })}\r\n` +
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

/** POST the shrunk GLB to the CMS Media collection; returns the new media id. */
async function createMedia(
  env: Env,
  containerRes: Response,
  report: ShrinkReport,
): Promise<number | string> {
  if (!containerRes.body) throw new Error('Container returned no model data.')

  const { body, contentType } = streamMultipart(containerRes.body, {
    alt: `Auto-processed 3D model (${report.suggestedFilename})`,
    filename: report.suggestedFilename,
    contentType: 'model/gltf-binary',
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
  const created = (await res.json()) as { doc?: { id?: number | string } }
  const id = created?.doc?.id
  if (id == null) throw new Error('CMS media create returned no id.')
  return id
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

/** Fetch the CMS through the internal service binding with robot API-key auth. */
function cmsFetch(env: Env, path: string, init: RequestInit): Promise<Response> {
  const headers = new Headers(init.headers)
  headers.set('Authorization', `users API-Key ${env.CMS_ROBOT_API_KEY}`)
  return env.CMS.fetch(new Request(`${env.CMS_ORIGIN}${path}`, { ...init, headers }))
}

function decodeReport(header: string | null): ShrinkReport | null {
  if (!header) return null
  try {
    return JSON.parse(atob(header)) as ShrinkReport
  } catch {
    return null
  }
}
