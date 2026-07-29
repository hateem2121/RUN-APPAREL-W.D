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
        await patchRawUpload(env, message.body.rawUploadId, {
          status: 'failed',
          report: `Automatic shrink failed:\n${detail}`,
        }).catch(() => {})

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
  const fileColours = report.variantsInFileOrder ?? report.variants
  if (job.targetProductId != null && fileColours.length > 0) {
    await patchProduct(env, job.targetProductId, { fileColours }).catch(() => {})
  }

  // 5. Mark the raw upload ready for the owner to review + publish.
  await patchRawUpload(env, job.rawUploadId, {
    status: 'ready',
    resultGlb: mediaId,
    report: report.text,
  })
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
