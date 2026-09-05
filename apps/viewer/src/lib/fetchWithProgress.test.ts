import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchWithProgress } from './fetchWithProgress'

/**
 * The only route to the megabyte counts the readout promises.
 *
 * `<model-viewer>`'s own `progress` event cannot supply them: its detail is
 * `{ totalProgress, reason }`, the byte counts are reduced to a ratio inside
 * `CachingGLTFLoader` and discarded, and the number it does expose blends the
 * GLB with the environment HDR. Verified against @google/model-viewer 4.3.1.
 * So the app fetches the file itself and counts what arrives.
 */

const streamOf = (chunks: Uint8Array[]): ReadableStream<Uint8Array> =>
  new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk)
      controller.close()
    },
  })

const stubFetch = (opts: {
  chunks: Uint8Array[]
  contentLength?: string | null
  ok?: boolean
  status?: number
}) => {
  const fake = vi.fn(async () => ({
    ok: opts.ok ?? true,
    status: opts.status ?? 200,
    headers: {
      get: (name: string) =>
        name.toLowerCase() === 'content-length' ? (opts.contentLength ?? null) : null,
    },
    body: streamOf(opts.chunks),
  }))
  vi.stubGlobal('fetch', fake)
  return fake
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('fetchWithProgress', () => {
  it('reports CUMULATIVE bytes as each chunk arrives', async () => {
    stubFetch({
      chunks: [new Uint8Array(100), new Uint8Array(50), new Uint8Array(25)],
      contentLength: '175',
    })
    const seen: number[] = []
    await fetchWithProgress('https://media.example/x.glb', (p) => seen.push(p.loaded))
    // Cumulative, not per-chunk. Reporting 100/50/25 would make the bar jump
    // backwards on every chunk after the first.
    expect(seen).toEqual([100, 150, 175])
  })

  it('reads the total from content-length', async () => {
    stubFetch({ chunks: [new Uint8Array(10)], contentLength: '28271780' })
    const seen: number[] = []
    await fetchWithProgress('https://media.example/x.glb', (p) => seen.push(p.total))
    // The real N001 GLB. media.wear-run.help sends this header with no
    // content-encoding, which is what makes the count truthful.
    expect(seen).toEqual([28_271_780])
  })

  it('reports a total of 0 when the server sends no content-length', async () => {
    // Not a crash case — a "we cannot promise a percentage" case. The formatters
    // turn total 0 into a null percent and a null ETA rather than Infinity.
    stubFetch({ chunks: [new Uint8Array(10)], contentLength: null })
    const seen: number[] = []
    await fetchWithProgress('https://media.example/x.glb', (p) => seen.push(p.total))
    expect(seen).toEqual([0])
  })

  it('resolves to a blob carrying every byte, in order', async () => {
    const a = new Uint8Array([1, 2, 3])
    const b = new Uint8Array([4, 5])
    stubFetch({ chunks: [a, b], contentLength: '5' })
    const blob = await fetchWithProgress('https://media.example/x.glb', () => {})
    expect(blob.size).toBe(5)
    expect(new Uint8Array(await blob.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3, 4, 5]))
  })

  it('rejects on a non-OK response so the caller can fall back', async () => {
    // The fallback is what keeps this safe to ship: if our own fetch fails for
    // any reason, Stage hands the plain URL to <model-viewer> and the visitor
    // gets exactly today's behaviour rather than an error screen.
    stubFetch({ chunks: [], ok: false, status: 404 })
    await expect(fetchWithProgress('https://media.example/x.glb', () => {})).rejects.toThrow(/404/)
  })
})

describe('a model URL that answers with an HTML page', () => {
  /**
   * ⚠️ MEASURED LIVE 2026-09-05, and the 200 case is the one that matters.
   *
   *     GET media.wear-run.help/<missing>.glb
   *     -> 404, content-type: text/html, 27,150 bytes, Cloudflare's error document
   *
   * The 404 is already caught by the status check. This covers the same document
   * arriving with a 200 — an edge rule, an interstitial, or a misrouted custom
   * domain — where the bytes would otherwise reach three.js and surface as an
   * unhandled GLB parse error instead of the branded recovery screen.
   */
  it('rejects rather than handing HTML to the 3D loader', async () => {
    const response = new Response('<!doctype html><title>Not Found</title>', {
      status: 200,
      headers: { 'content-type': 'text/html; charset=utf-8', 'content-length': '39' },
    })
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(response)
    await expect(fetchWithProgress('https://media.example/x.glb', () => {})).rejects.toThrow(
      /HTML page/i,
    )
  })

  it('still accepts a real model, whatever the type says (negative control)', async () => {
    // The check must be narrow. A GLB served as model/gltf-binary, as
    // application/octet-stream, or with no type at all must all still load — the
    // live environment map already ships with an EMPTY content-type.
    for (const type of ['model/gltf-binary', 'application/octet-stream', '']) {
      const headers: Record<string, string> = { 'content-length': '4' }
      if (type) headers['content-type'] = type
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(new Uint8Array([0x67, 0x6c, 0x54, 0x46]), { status: 200, headers }),
      )
      await expect(
        fetchWithProgress('https://media.example/x.glb', () => {}),
        `a model served as "${type || '(none)'}" was refused`,
      ).resolves.toBeInstanceOf(Blob)
    }
  })
})
