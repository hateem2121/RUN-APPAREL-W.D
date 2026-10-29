import { describe, expect, it } from 'vitest'
import { containerFailureResponse, ModelImageRefusal } from '../container/failure'
import {
  RasterProcessingRefusal,
  rasterProcessingError,
} from '../../../tools/asset-pipeline/src/raster-processing-refusal'
import {
  missingRawExport,
  readContainerFailure,
  decodeReportHeader,
  containerFailureError,
} from './containerFailure'
import { PermanentJobError } from './permanentJobError'
import { outcomeFor } from './queueDecisions'

/**
 * The container's 500 BODY used to echo `error.message`, which CodeQL flagged as
 * js/stack-trace-exposure and which could carry mkdtemp paths. The body is now
 * generic, so the DETAIL has to come from the `x-shrink-report` header — and the
 * Worker's non-OK branch never read that header before this module existed.
 *
 * Why this is a separate module rather than a test on index.ts: that file imports
 * @cloudflare/containers, which imports `cloudflare:workers`. Measured — a probe
 * importing './index' fails with "Cannot find package 'cloudflare:workers'". Same
 * constraint that put the container's pure half in container/report.ts.
 */
describe('readContainerFailure', () => {
  it('prefers the header detail over the generic body', async () => {
    const detail = 'meshopt encoder rejected primitive 4'
    const res = new Response('Shrink failed.', {
      status: 500,
      headers: { 'x-shrink-report': btoa(JSON.stringify({ ok: false, error: detail })) },
    })
    await expect(readContainerFailure(res)).resolves.toBe(detail)
  })

  it('falls back to the body when the header is absent or unparsable', async () => {
    await expect(readContainerFailure(new Response('legacy text', { status: 500 }))).resolves.toBe(
      'legacy text',
    )
    await expect(
      readContainerFailure(
        new Response('legacy text', {
          status: 500,
          headers: { 'x-shrink-report': 'not-base64-json' },
        }),
      ),
    ).resolves.toBe('legacy text')
    await expect(
      readContainerFailure(
        new Response('legacy text', {
          status: 500,
          headers: { 'x-shrink-report': btoa(JSON.stringify({ ok: false })) },
        }),
      ),
    ).resolves.toBe('legacy text')
  })

  it('caps the fallback at 500 characters so a huge body cannot flood a log line', async () => {
    const huge = 'x'.repeat(5_000)
    await expect(readContainerFailure(new Response(huge, { status: 500 }))).resolves.toHaveLength(
      500,
    )
  })

  it('returns empty rather than throwing when the body itself cannot be read', async () => {
    // The `.catch(() => '')` on res.text(). A container that dies mid-response leaves
    // a stream that errors on read, and this function is called from an error path —
    // throwing here would replace the real failure with an unrelated one.
    const stream = new ReadableStream({
      start(controller) {
        controller.error(new Error('connection reset'))
      },
    })
    await expect(readContainerFailure(new Response(stream, { status: 500 }))).resolves.toBe('')
  })
})

describe('container refusal over the HTTP report boundary', () => {
  // Use the same status, body and encoded report that server.ts writes, rather
  // than fabricating a decoded verdict that cannot show the old transport bug.
  const wireResponse = (error: unknown) => {
    const response = containerFailureResponse(error)
    return new Response(response.body, response)
  }

  it('stops after a deterministic image refusal while keeping the response failed', async () => {
    const res = wireResponse(new ModelImageRefusal(['Image 19: 17787 × 18856 exceeds 4096.']))
    expect(res.status).toBe(422)
    expect(res.ok).toBe(false)
    expect(await res.clone().text()).toBe('Shrink failed.')
    const report = JSON.parse(decodeReportHeader(res.headers.get('x-shrink-report') ?? ''))
    expect(report).toEqual({
      ok: false,
      code: 'model-images-refused',
      error: 'Model image verification failed: Image 19: 17787 × 18856 exceeds 4096.',
    })
    const error = await containerFailureError(res)
    expect(error).toBeInstanceOf(PermanentJobError)
    expect(error.message).toContain('17787 × 18856')
    expect(outcomeFor(error)).toBe('ack')
  })

  it('retries infrastructure failures and never sends a stack in the report or body', async () => {
    const infrastructure = new Error('R2 connection reset')
    infrastructure.stack = 'private stack /tmp/shrink-private/trace'
    const res = wireResponse(infrastructure)
    expect(res.status).toBe(500)
    expect(await res.clone().text()).toBe('Shrink failed.')
    expect(decodeReportHeader(res.headers.get('x-shrink-report') ?? '')).not.toContain('private')
    const error = await containerFailureError(res)
    expect(error.message).toBe('Container returned 500: R2 connection reset')
    expect(outcomeFor(error)).toBe('retry')
  })

  it('stops a typed raster encoder refusal without importing the encoder into the Worker', async () => {
    const res = wireResponse(new RasterProcessingRefusal('required-print', new Error('bad PNG')))
    expect(res.status).toBe(422)
    expect(outcomeFor(await containerFailureError(res))).toBe('ack')
  })

  it('CONTROL: the old untyped HTTP 500 contract retries the same refused images', async () => {
    const refusal = new ModelImageRefusal(['Image 19 exceeds 4096.'])
    const res = wireResponse(new Error(refusal.message))
    expect(outcomeFor(await containerFailureError(res))).toBe('retry')
  })

  it.each([
    'Input image exceeds pixel limit',
    'Input buffer contains unsupported image format',
    'Input buffer has corrupt header: pngload_buffer: end of stream',
    'VipsJpeg: Premature end of input file',
  ])('stops a confirmed decoder input defect: %s', async (message) => {
    const error = rasterProcessingError('required-print', new Error(message))
    expect(error).toBeInstanceOf(RasterProcessingRefusal)
    const response = wireResponse(error)
    expect(response.status).toBe(422)
    expect(outcomeFor(await containerFailureError(response))).toBe('ack')
  })

  it.each([
    new Error('Input buffer has corrupt header: unable to allocate memory'),
    Object.assign(new Error('Input buffer has corrupt header:'), { code: 'ENOMEM' }),
    new Error('native encoder failed unexpectedly'),
    'unknown native failure',
  ])('retains retry for resource and unknown processing failures: %s', async (cause) => {
    const error = rasterProcessingError('required-print', cause)
    expect(error).not.toBeInstanceOf(RasterProcessingRefusal)
    expect(error.message).toContain('original is preserved')
    const response = wireResponse(error)
    expect(response.status).toBe(500)
    expect(outcomeFor(await containerFailureError(response))).toBe('retry')
  })

  it.each([
    { status: 422, report: { ok: false, error: 'refused' } },
    { status: 500, report: { ok: false, code: 'model-images-refused', error: 'refused' } },
    { status: 422, report: { ok: true, code: 'model-images-refused', error: 'refused' } },
  ])('requires the complete typed refusal contract: %j', async ({ status, report }) => {
    const res = new Response('Shrink failed.', {
      status,
      headers: { 'x-shrink-report': Buffer.from(JSON.stringify(report)).toString('base64') },
    })
    expect(outcomeFor(await containerFailureError(res))).toBe('retry')
  })

  it('keeps expired exports permanent and unknown thrown values retryable', async () => {
    const expired = wireResponse(new Error('Could not read raw object "a.glb" from ingest (404).'))
    expect(outcomeFor(await containerFailureError(expired))).toBe('ack')
    const error = await containerFailureError(wireResponse('service unavailable'))
    expect(error.message).toContain('service unavailable')
    expect(outcomeFor(error)).toBe('retry')
  })
})

describe('missingRawExport — the upload store expired the file (CI-01)', () => {
  it("turns the container's S3 404 into words the owner can act on", () => {
    const message = missingRawExport(
      'Could not read raw object "uploads/X-MILO PRO BIB.glb" from ingest (404).',
    )
    expect(message).toMatch(/expired from the upload store/)
    expect(message).toMatch(/Upload the CLO export again/)
  })

  it('leaves every other container failure alone, including other S3 statuses', () => {
    expect(missingRawExport('Could not read raw object "a.glb" from ingest (403).')).toBeNull()
    expect(missingRawExport('meshopt encoder rejected primitive 4')).toBeNull()
    expect(missingRawExport('')).toBeNull()
  })
})

/**
 * THE REPORT'S NON-ASCII CHARACTERS WERE CORRUPTED IN PRODUCTION until 2026-09-04, and
 * these tests are the regression. Measured on the first real garment through the
 * container after the pipeline fix plan deployed: D1 held
 * `Shrunk 16.1 MB â 1.8 MB` and `â ï¸ Ink vs cloth` — six bytes
 * (`c3 a2 c2 86 c2 92`) where an arrow's three (`e2 86 92`) belong.
 *
 * The container was never at fault: `Buffer.from(str)` is utf8. `atob` is — it returns
 * one character per byte, so multi-byte characters arrive pre-split and are re-encoded
 * on the way to the CMS. The arrow and the `⚠️` marker are exactly the characters this
 * report leans on, and it is the only thing the owner reads before publishing.
 *
 * The second test is the control: it asserts the OLD code fails this text. Without it,
 * the first test would pass just as happily against `atob` for an ASCII-only string and
 * would prove nothing.
 */
describe('decodeReportHeader', () => {
  /** Encode the way the container does — apps/shrink/container/server.ts. */
  const asContainerSends = (value: unknown) =>
    Buffer.from(JSON.stringify(value), 'utf8').toString('base64')

  /** Verbatim from the live report of 2026-09-04. */
  const liveText =
    'Shrunk 16.1 MB → 1.8 MB.\n⚠️ Ink vs cloth: 10 of 15 print-colourway pairs read as bare cloth'

  it('round-trips the arrows and warning markers the report is built from', () => {
    const header = asContainerSends({ text: liveText })
    expect(JSON.parse(decodeReportHeader(header)).text).toBe(liveText)
  })

  it('CONTROL: plain atob mangles that same text, which is what shipped', () => {
    const header = asContainerSends({ text: liveText })
    const viaAtob = JSON.parse(atob(header)).text
    expect(viaAtob).not.toBe(liveText)
    /**
     * Pin the exact corruption, not merely "it differs".
     *
     * The arrow's three UTF-8 bytes `e2 86 92` arrive as three separate Latin-1
     * characters: U+00E2, U+0086, U+0092. The last two are invisible C1 controls, which
     * is why this looks like a lone "â" in a terminal and why the first version of this
     * assertion was written against that appearance and failed. Re-encoding these three
     * as UTF-8 gives `c3 a2 c2 86 c2 92` — exactly the bytes measured in D1.
     */
    expect(viaAtob).toContain('16.1 MB \u00e2\u0086\u0092 1.8 MB')
    expect(Buffer.from('\u00e2\u0086\u0092', 'utf8').toString('hex')).toBe('c3a2c286c292')
  })

  it('leaves ASCII-only reports untouched', () => {
    const text = 'Shrunk 16.1 MB to 1.8 MB. No warnings.'
    expect(JSON.parse(decodeReportHeader(asContainerSends({ text }))).text).toBe(text)
  })

  it('carries a non-ASCII failure message through readContainerFailure', async () => {
    // A CLO material name can be non-ASCII — the pipeline notes have seen `ルン ろご。`.
    const error = 'Could not read raw object "ルン ろご。.glb" from ingest (401).'
    const res = new Response('Shrink failed.', {
      status: 500,
      headers: { 'x-shrink-report': asContainerSends({ ok: false, error }) },
    })
    await expect(readContainerFailure(res)).resolves.toBe(error)
  })
})
