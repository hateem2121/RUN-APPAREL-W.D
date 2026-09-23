import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Regression guard for the defect that meant the raw-upload inbox had NEVER
 * worked (fixed for us 2026-07-27 by a pnpm patch, re-keyed at every Payload
 * bump through @3.88.0.patch; REMOVED 2026-09-23 — see below).
 *
 * `@payloadcms/storage-r2`'s browser-side multipart handler used to compute its
 * upload endpoint ONCE, as a string:
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
 * THE PATCH IS GONE, NOT RE-KEYED. Verified directly against the installed
 * `node_modules/@payloadcms/storage-r2` at 3.90.1 (the 2026-09-18 security
 * release this repo took on 2026-09-23): upstream now builds the same URL as a
 * function, `const getEndpoint = () => …`, called fresh at all three call sites
 * — the same fix our patch applied, under a different name, landed in the 3.x
 * line itself rather than only in `4.0.0-canary.17` as this comment used to say.
 * The patch's second fix (tolerating a missing `extra` object) is also
 * structurally moot now: `r2Storage()`'s own `extraClientHandlerProps` always
 * supplies one (`@payloadcms/plugin-cloud-storage`'s `initClientUploads.js`), so
 * `extra` can never be `undefined` on the only path this repo wires up.
 * Full history: docs/RAW-UPLOAD-PIPELINE.md.
 *
 * WHY THIS TEST STILL EXISTS WITH NO PATCH TO GUARD. The fix now lives entirely
 * in a dependency we do not control, and it is baked into a Next.js client chunk
 * at build time — if a future Payload release reintroduces the frozen-string
 * bug, under any variable name, nothing else here would fail. This asserts the
 * INSTALLED bytes carry a fresh-per-call endpoint, the same property the patch
 * used to guarantee, so that regression is still caught rather than discovered
 * the next time someone tries to publish a garment.
 */

const require_ = createRequire(import.meta.url)
// The package does not export ./package.json, so resolve the main entry
// (dist/index.js) and walk up to the package root.
const packageRoot = dirname(dirname(require_.resolve('@payloadcms/storage-r2')))
const handlerPath = join(packageRoot, 'dist', 'client', 'R2ClientUploadHandler.js')

describe('@payloadcms/storage-r2 multipart upload endpoint (was our patch; now upstream)', () => {
  const source = readFileSync(handlerPath, 'utf8')

  it('builds the upload endpoint per call, not once as a frozen string', () => {
    // Match either name a fix might use — this repo's own patch called it
    // `endpoint`, upstream's independent fix calls it `getEndpoint`. Either is
    // fine; a bare template literal assigned once is not.
    expect(source).toMatch(/const \w*endpoint = \(\)\s*=>/i)
    expect(source).not.toMatch(/const \w*endpoint = `/i)
  })

  it('uses the freshly-built endpoint for init, every part, and complete', () => {
    const endpointFn = /const (\w*endpoint) = \(\)\s*=>/i.exec(source)?.[1]
    expect(endpointFn, 'no per-call endpoint function found at all').toBeTruthy()
    const calls = source.match(new RegExp(`fetch\\(${endpointFn}\\(\\)`, 'g')) ?? []
    expect(calls).toHaveLength(3)
    // No call may still read a frozen value under the same name.
    expect(source).not.toMatch(new RegExp(`fetch\\(${endpointFn},`))
  })

  it('keeps the 5 MB default chunk size this repo depends on', () => {
    // Not "must have `= {}`" any more — 3.90.1 dropped that fallback because
    // r2Storage()'s own extraClientHandlerProps always supplies `extra` (see
    // initClientUploads.js: `extra: extraClientHandlerProps ? … : undefined`,
    // and this plugin's extraClientHandlerProps is never undefined). Assert the
    // destructure still names `chunkSize` with its own default, which is the
    // part this repo actually depends on (the 5 MB chunk size).
    expect(source).toMatch(/extra: \{ chunkSize = 5 \* 1024 \* 1024/)
  })
})
