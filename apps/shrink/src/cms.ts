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
}

/** Fetch the CMS through the internal service binding with robot API-key auth. */
export function cmsFetch(env: CmsEnv, path: string, init: RequestInit): Promise<Response> {
  const headers = new Headers(init.headers)
  headers.set('Authorization', `users API-Key ${env.CMS_ROBOT_API_KEY}`)
  return env.CMS.fetch(new Request(`${env.CMS_ORIGIN}${path}`, { ...init, headers }))
}

/**
 * Every field in the CMS that can point at a Media document, besides
 * `raw_uploads.resultGlb` which is handled separately.
 *
 * If a Media relationship is added to a collection it MUST be added here AND to
 * scripts/find-orphan-media.mjs, or one of them will treat a live asset as an
 * orphan. apps/cms/src/collections/mediaReferences.test.ts asserts the two stay in
 * step — there has never been an apps/shrink/src/index.test.ts.
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
