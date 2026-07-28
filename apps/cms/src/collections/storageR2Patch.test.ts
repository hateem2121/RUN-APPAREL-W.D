import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Regression guard for the defect that meant the raw-upload inbox had NEVER
 * worked (fixed 2026-07-27 by patches/@payloadcms__storage-r2@3.86.0.patch).
 *
 * `@payloadcms/storage-r2`'s browser-side multipart handler computed its upload
 * endpoint ONCE, as a string:
 *
 *     const endpoint = `${baseURL}?${String(new URLSearchParams(params))}`
 *
 * then mutated `params.multipartId` / `multipartKey` / `multipartNumber` and
 * re-fetched that same frozen string. The mutations never reached the URL, so
 * every 5 MB chunk POST hit the *init* endpoint: the server ran
 * createMultipartUpload again for each one, no part was ever uploaded, the
 * upload was never completed, and NOTHING was written to R2 — while the document
 * was still created, because Payload treats the resulting 404 as success.
 * Confirmed in production: 66 requests, zero carrying multipartId.
 *
 * WHY THIS TEST EXISTS. The fix lives in a pnpm patch, not in our source. It is
 * applied at `pnpm install` and baked into a Next.js client chunk at build time,
 * so if it ever stops applying, nothing fails — uploads just silently go back to
 * writing zero bytes, and we would not find out until someone tried to publish a
 * garment. pnpm 10 does raise ERR_PNPM_UNUSED_PATCH when the version key matches
 * nothing, but that does not cover the patch being edited, removed, or applied
 * to a file that upstream has since changed. Asserting the installed bytes does.
 *
 * WHEN THIS CAN GO. Upstream fixed it in @payloadcms/storage-r2 4.0.0-canary.17
 * (`const getEndpoint = () => …`). `latest` is still 3.86.0, and the 4.0 handler
 * signature changed (`extra`→`props`, `serverHandlerPath`→`endpointPath`), so the
 * patch must stay until Payload 4.0 is stable — that is a migration, not a bump.
 * See docs/RAW-UPLOAD-PIPELINE.md.
 */

const require_ = createRequire(import.meta.url)
// The package does not export ./package.json, so resolve the main entry
// (dist/index.js) and walk up to the package root.
const packageRoot = dirname(dirname(require_.resolve('@payloadcms/storage-r2')))
const handlerPath = join(packageRoot, 'dist', 'client', 'R2ClientUploadHandler.js')

describe('@payloadcms/storage-r2 multipart patch', () => {
  const source = readFileSync(handlerPath, 'utf8')

  it('builds the upload endpoint per call, not once as a frozen string', () => {
    expect(source).toMatch(/const endpoint = \(\) =>/)
    // The exact shape of the bug: a `const endpoint = ` followed by a template
    // literal rather than a function.
    expect(source).not.toMatch(/const endpoint = `/)
  })

  it('uses the freshly-built endpoint for init, every part, and complete', () => {
    const calls = source.match(/fetch\(endpoint\(\)/g) ?? []
    expect(calls).toHaveLength(3)
    // No call may still read the frozen value.
    expect(source).not.toMatch(/fetch\(endpoint,/)
  })

  it('tolerates a missing `extra` object (the earlier clientUploads crash)', () => {
    expect(source).toMatch(/extra: \{ chunkSize = 5 \* 1024 \* 1024 \} = \{\}/)
  })
})
