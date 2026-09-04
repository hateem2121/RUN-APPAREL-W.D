import { describe, expect, it } from 'vitest'
import { bytesFromHeaders, measureModelBytes } from '../../../scripts/model-size.mjs'

/**
 * Tests for the model-size read used by the post-deploy smoke check.
 *
 * THE BUG THESE PIN WAS A BLIND GATE, NOT A WRONG NUMBER. `MIN_MODEL_BYTES` in
 * `scripts/smoke-viewer-payload.mjs` exists to fail the deploy when a product's payload
 * points at a stub or an error page rather than a garment. Measured 2026-09-04: it had
 * never been able to fire, because the size always read 0 and 0 took a WARN branch.
 *
 * Node's fetch sends `accept-encoding: gzip, deflate, br`, Cloudflare compresses the
 * GLB and drops `content-length`, and the old code fell back to a ranged GET only on
 * 405/501 — a status this domain never returns. `curl -I` sees the length, which is why
 * it looked fine by hand.
 *
 * THE TEST THAT MATTERS IS "a HEAD that answers 200 with no length". It is the live
 * case, and it is the one that fails the moment the ranged fallback is narrowed back to
 * a status check. The others are its controls: a length that IS present must not cost a
 * second request, and a silent edge must still resolve to 0 so the caller reports
 * "unverified" rather than a pass.
 */

const headers = (init: Record<string, string>) => new Headers(init)
const res = (init: Record<string, string>) => ({ headers: headers(init) })

/** Records every call so "did it fall back?" is an assertion, not an inference. */
function stubFetch(response: Record<string, string>) {
  const calls: { url: string; range?: string }[] = []
  const fetchFn = async (url: string, opts: { headers?: Record<string, string> }) => {
    calls.push({ url, range: opts?.headers?.range })
    return res(response)
  }
  return { fetchFn, calls }
}

describe('bytesFromHeaders', () => {
  it('reads the total from a content-range, not the slice length', () => {
    // "bytes 0-0/28271780" — the slice is one byte; the object is 28 MB.
    expect(
      bytesFromHeaders(headers({ 'content-range': 'bytes 0-0/28271780', 'content-length': '1' })),
    ).toBe(28271780)
  })

  it('falls back to content-length when there is no range', () => {
    expect(bytesFromHeaders(headers({ 'content-length': '28271780' }))).toBe(28271780)
  })

  it('returns 0 when the edge says neither, so the caller reports unverified', () => {
    expect(bytesFromHeaders(headers({ 'content-type': 'model/gltf-binary' }))).toBe(0)
  })

  it('returns 0 rather than NaN for a malformed range', () => {
    expect(bytesFromHeaders(headers({ 'content-range': 'bytes 0-0/not-a-number' }))).toBe(0)
  })

  it('treats a zero length as unverified, not as a zero-byte object', () => {
    expect(bytesFromHeaders(headers({ 'content-length': '0' }))).toBe(0)
  })
})

describe('measureModelBytes', () => {
  it('THE LIVE CASE: a HEAD that answers 200 with no content-length still yields the size', async () => {
    // What media.wear-run.help actually returns to Node's fetch: 200, content-encoding
    // applied, no length. Before the fix this resolved to 0 and the deploy gate went
    // blind. If the ranged fallback is ever narrowed back to a status check, this fails.
    const { fetchFn, calls } = stubFetch({
      'content-range': 'bytes 0-0/28271780',
      'content-length': '1',
    })
    const headResponse = res({ 'content-type': 'model/gltf-binary', 'content-encoding': 'br' })

    const bytes = await measureModelBytes('https://media.example/g.glb', headResponse, { fetchFn })

    expect(bytes).toBe(28271780)
    expect(calls).toHaveLength(1)
    expect(calls[0].range).toBe('bytes=0-0')
  })

  it('does not spend a second request when the HEAD already carried the length', async () => {
    const { fetchFn, calls } = stubFetch({ 'content-range': 'bytes 0-0/999' })
    const bytes = await measureModelBytes(
      'https://media.example/g.glb',
      res({ 'content-length': '28271780' }),
      { fetchFn },
    )
    expect(bytes).toBe(28271780)
    expect(calls).toHaveLength(0)
  })

  it('resolves to 0 when neither the HEAD nor the range says anything', async () => {
    // Must stay 0: the caller prints "size not verified" and does NOT assert a floor,
    // which is honest. Returning a guess here would make the gate lie the other way.
    const { fetchFn } = stubFetch({ 'content-type': 'model/gltf-binary' })
    const bytes = await measureModelBytes('https://media.example/g.glb', res({}), { fetchFn })
    expect(bytes).toBe(0)
  })
})
