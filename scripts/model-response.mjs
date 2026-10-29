import { checkModelTextures } from '../packages/shared/src/modelTextureSafety.ts'
import { GLB_HARD_MAX_BYTES } from '../packages/shared/src/media.ts'

/** Safe diagnostic fields only: status/category/request id; never cookies or private URLs. */
export function responseCategory(response) {
  if (response.headers.get('cf-mitigated') === 'challenge') return 'security-challenge'
  if (response.status === 403) return 'access-denied-unverified'
  if (response.status === 429) return 'rate-limited'
  if (response.status === 404) return 'missing-media'
  if (response.status >= 500) return 'service-error'
  return response.ok ? 'http-success' : 'http-error'
}

/** A full body check, bounded by the existing 40 MiB model upload limit. */
export async function inspectModelResponse(response, expectedBytes, maxBytes = GLB_HARD_MAX_BYTES) {
  if (!response.ok) throw new Error(`${responseCategory(response)} (HTTP ${response.status})`)
  if (response.headers.get('content-type')?.includes('text/html'))
    throw new Error('wrong-content: HTML instead of a model')
  if (!response.body) throw new Error('incomplete-media: no model body')
  const reader = response.body.getReader()
  const chunks = []
  let length = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      length += value.byteLength
      if (length > maxBytes) throw new Error('model-size-limit: response exceeds 40 MiB')
      chunks.push(value)
    }
  } finally {
    await reader.cancel().catch(() => {})
    reader.releaseLock()
  }
  if (expectedBytes > 0 && length !== expectedBytes)
    throw new Error(`incomplete-media: ${length} bytes received, ${expectedBytes} expected`)
  const bytes = new Uint8Array(length)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.length
  }
  const check = checkModelTextures(bytes)
  if (!check.ok) throw new Error(`model-image-check: ${check.problems.join(' ')}`)
  return {
    bytes: length,
    imageCount: check.images.length,
    estimatedTextureBytes: check.estimatedTextureBytes,
  }
}
