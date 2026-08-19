import { describe, expect, it } from 'vitest'
import { readContainerFailure } from './containerFailure'

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
