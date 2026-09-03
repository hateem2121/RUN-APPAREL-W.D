/**
 * CMS access for the shrink service, and the one definition of "is this Media
 * document still in use".
 *
 * SEPARATE FROM index.ts ON PURPOSE. The Worker entry imports
 * `@cloudflare/containers`, which pulls in the `cloudflare:workers` runtime
 * module and cannot load outside workerd — so anything living there is
 * untestable without the Workers vitest pool. The reference check guards an
 * irreversible DELETE against production media, which makes it the last thing
 * in this service that should be hard to test.
 */

/** Just the bindings CMS calls need, so callers can be stubbed in tests. */
export interface CmsEnv {
  CMS: { fetch: (request: Request) => Promise<Response> }
  CMS_ORIGIN: string
  CMS_ROBOT_API_KEY: string
  /** Optional override, in milliseconds, of `CMS_TIMEOUT_MS` — a var, so it needs no deploy. */
  CMS_TIMEOUT_MS?: string
}

/**
 * How long one CMS call may take before the Worker gives up on it (fix plan Rank 12,
 * audit Q-03). Until 2026-09-03 the container fetch was the ONLY outbound call with a
 * timeout; every CMS write — the 40 MB media upload, the status patches, the product
 * writes — could sit forever, and a stalled one was killed only by the queue's own
 * 15-minute ceiling, which reports nothing and retries into the same stall.
 *
 * Two minutes: the largest call streams a ≤ 40 MB model through the service binding into
 * R2, which takes seconds, and the container fetch already owns ten of the fifteen.
 */
export const CMS_TIMEOUT_MS = 120_000

function timeoutFor(env: CmsEnv): number {
  const raw = Number(env.CMS_TIMEOUT_MS)
  return Number.isFinite(raw) && raw > 0 ? raw : CMS_TIMEOUT_MS
}

/**
 * Fetch the CMS through the internal service binding with robot API-key auth.
 *
 * The timeout is enforced TWICE on purpose: the request carries an `AbortSignal`, so a
 * transport that honours it cancels the work, and the promise is raced against the same
 * signal, so the Worker moves on even if the transport ignores it. A timeout rejects with
 * an ordinary Error naming the call, which the queue treats as retryable — a stalled
 * CMS may well answer next time.
 */
export function cmsFetch(env: CmsEnv, path: string, init: RequestInit): Promise<Response> {
  const headers = new Headers(init.headers)
  headers.set('Authorization', `users API-Key ${env.CMS_ROBOT_API_KEY}`)
  const ms = timeoutFor(env)
  const signal = init.signal ?? AbortSignal.timeout(ms)
  const request = new Request(`${env.CMS_ORIGIN}${path}`, { ...init, headers, signal })
  return new Promise<Response>((resolve, reject) => {
    const method = init.method ?? 'GET'
    const onAbort = () =>
      reject(
        new Error(`The CMS did not answer within ${Math.round(ms / 1000)}s: ${method} ${path}`),
      )
    if (signal.aborted) return onAbort()
    signal.addEventListener('abort', onAbort, { once: true })
    env.CMS.fetch(request).then(
      (response) => {
        signal.removeEventListener('abort', onAbort)
        resolve(response)
      },
      (error: unknown) => {
        signal.removeEventListener('abort', onAbort)
        if (signal.aborted) onAbort()
        else reject(error)
      },
    )
  })
}

/**
 * Every field in the CMS that can point at a Media document, besides
 * `raw_uploads.resultGlb` which is handled separately.
 *
 * If a Media relationship is added to a collection it MUST be added here AND to
 * scripts/find-orphan-media.mjs, or one of them will treat a live asset as an
 * orphan. apps/cms/src/collections/mediaReferences.test.ts asserts the two stay in
 * step — there has never been an apps/shrink/src/index.test.ts.
 *
 * NOT here: `media.folder` (Payload's Folders feature, enabled 2026-08-11 —
 * see Media.ts's `folders: true`). Deliberate, not an oversight. These paths
 * find documents in OTHER collections that point AT a media id, to answer "is
 * this file still in use" — each is queried as `where[or][n][path][equals]` on
 * `/api/products`. `folder` is the opposite direction: a field ON media
 * itself, pointing OUT at a `payload-folders` document. Which folder a file is
 * organised under says nothing about whether a product is using it, and the
 * path shape does not fit this query (`/api/products` has no `folder` field to
 * match against). mediaReferences.test.ts would not catch a miss here either
 * way — it only scans for `relationTo: 'media'`, and `folder`'s is
 * `relationTo: 'payload-folders'`.
 */
export const MEDIA_REFERENCE_PATHS = [
  'glbAsset',
  'posterFallback',
  'colourways.posterPreview',
  'colourways.glbAsset',
] as const

/** Count matching docs, treating anything unexpected as "cannot rule it out". */
async function countOrUnknown(env: CmsEnv, path: string): Promise<number | 'unknown'> {
  try {
    const res = await cmsFetch(env, path, { method: 'GET' })
    if (!res.ok) return 'unknown'
    const json = (await res.json()) as { totalDocs?: number }
    return typeof json?.totalDocs === 'number' ? json.totalDocs : 'unknown'
  } catch {
    return 'unknown'
  }
}

/**
 * Is this Media doc used by anything?
 *
 * Checks products AND other raw uploads — the same two collections
 * scripts/find-orphan-media.mjs walks. One definition of "orphan" that deletes
 * and another that only reports would mean the automated path could remove
 * something the manual audit calls live.
 *
 * Fails SAFE: any error, any unexpected shape, and the answer is "yes, it is
 * referenced". Being wrong in that direction leaves a stale file in a bucket.
 * Being wrong the other way deletes a model off a published product page.
 */
export async function isMediaReferenced(
  env: CmsEnv,
  mediaId: number | string,
  /** The upload being processed — its own pointer has already been repointed. */
  exceptRawUploadId?: number | string,
): Promise<boolean> {
  const productParams = new URLSearchParams({ limit: '1', depth: '0' })
  MEDIA_REFERENCE_PATHS.forEach((path, index) => {
    productParams.set(`where[or][${index}][${path}][equals]`, String(mediaId))
  })

  const uploadParams = new URLSearchParams({ limit: '1', depth: '0' })
  uploadParams.set('where[and][0][resultGlb][equals]', String(mediaId))
  if (exceptRawUploadId != null) {
    uploadParams.set('where[and][1][id][not_equals]', String(exceptRawUploadId))
  }

  const [products, uploads] = await Promise.all([
    countOrUnknown(env, `/api/products?${productParams.toString()}`),
    countOrUnknown(env, `/api/raw-uploads?${uploadParams.toString()}`),
  ])

  if (products === 'unknown' || uploads === 'unknown') return true
  return products > 0 || uploads > 0
}
