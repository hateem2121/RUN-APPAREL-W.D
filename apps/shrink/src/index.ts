import { Container, getContainer } from '@cloudflare/containers'

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

/** Must match ShrinkJobMessage in apps/cms/src/collections/RawUploads.ts. */
interface ShrinkJobMessage {
  rawUploadId: number | string
  filename: string
  prefix: string | null
}

/** JSON the container returns in the `x-shrink-report` header (base64). */
interface ShrinkReport {
  ok: boolean
  suggestedFilename: string
  sizeBytes: number
  variants: string[]
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

export default {
  async queue(batch: MessageBatch<ShrinkJobMessage>, env: Env): Promise<void> {
    for (const message of batch.messages) {
      try {
        await processJob(message.body, env)
        message.ack()
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error)
        // Record the failure on the raw-upload record so the owner sees why,
        // then let the queue retry (and eventually dead-letter).
        await patchRawUpload(env, message.body.rawUploadId, {
          status: 'failed',
          report: `Automatic shrink failed:\n${detail}`,
        }).catch(() => {})
        message.retry()
      }
    }
  },
}

async function processJob(job: ShrinkJobMessage, env: Env): Promise<void> {
  await patchRawUpload(env, job.rawUploadId, { status: 'processing' })

  const key = job.prefix ? `${job.prefix}/${job.filename}` : job.filename

  // 1. Drive the container: it pulls the raw from ingest (S3, read-only), runs
  //    optimize --simplify + validate, and returns the small GLB + a report.
  const container = getContainer(env.SHRINK, String(job.rawUploadId))
  const containerRes = await container.fetch(
    new Request('http://shrink-container/shrink', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        key,
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
  const glbBytes = new Uint8Array(await containerRes.arrayBuffer())
  if (!report || !report.ok) {
    throw new Error(report?.error ?? 'Container did not report a successful shrink.')
  }

  // 2. Create the guardrailed Media doc from the SHRUNK output. The CMS media
  //    rules still run — safe filename + < 40 MB — so a bad output is rejected
  //    here rather than published.
  const mediaId = await createMedia(env, glbBytes, report)

  // 3. Mark the raw upload ready for the owner to review + publish.
  await patchRawUpload(env, job.rawUploadId, {
    status: 'ready',
    resultGlb: mediaId,
    report: report.text,
  })
}

/** POST the shrunk GLB to the CMS Media collection; returns the new media id. */
async function createMedia(
  env: Env,
  glbBytes: Uint8Array,
  report: ShrinkReport,
): Promise<number | string> {
  const form = new FormData()
  form.append(
    'file',
    new File([glbBytes], report.suggestedFilename, { type: 'model/gltf-binary' }),
  )
  form.append('alt', `Auto-processed 3D model (${report.suggestedFilename})`)

  const res = await cmsFetch(env, '/api/media', { method: 'POST', body: form })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(
      `CMS rejected the shrunk GLB (${res.status}). This usually means it is still over the 40 MB limit — lower the simplify ratio — or the filename was unsafe. Detail: ${body.slice(0, 400)}`,
    )
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
