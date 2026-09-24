export interface FetchProgress {
  /** Bytes received so far, cumulative. */
  loaded: number
  /** Bytes the server said to expect, or 0 when it did not say. */
  total: number
}

/**
 * Fetch a URL while counting the bytes as they arrive.
 *
 * This exists because `<model-viewer>` will not tell us. Its `progress` event
 * carries `{ totalProgress, reason }` and nothing else: inside
 * `CachingGLTFLoader` the real `event.loaded / event.total` is collapsed to a
 * ratio on one line and thrown away, and the number that does surface blends the
 * GLB with the environment HDR, so it is not even about the garment alone.
 * Verified against @google/model-viewer 4.3.1.
 *
 * `media.wear-run.help` makes this workable: it sends `content-length`
 * (28,271,780 for N001), sends no `content-encoding` so that figure is the real
 * transfer size, and allows the viewer origin to read it.
 *
 * ⚠️ The caller MUST treat a rejection as "use the plain URL instead", never as
 * an error to show. Every failure mode here — offline, CORS, a 5xx, an aborted
 * navigation — is one where handing the URL straight to `<model-viewer>` still
 * works, because that is exactly what shipped before this function existed.
 */
/**
 * The download answered, then stopped sending bytes for `stallMs`.
 *
 * ⚠️ A DIFFERENT KIND OF FAILURE FROM EVERY OTHER ONE HERE, and the caller must NOT treat it like them. Every
 * other rejection means "hand the plain URL to `<model-viewer>`", which can still work. A stall would not: the
 * element fetches the same file over the same route and stalls the same way, except with no readout at all.
 * `downloadWithRetries` retries this error and nothing else.
 */
export class DownloadStalledError extends Error {
  override readonly name = 'DownloadStalledError'
  constructor(
    readonly url: string,
    /** Bytes that did arrive before the silence. */
    readonly loaded: number,
    readonly stallMs: number,
  ) {
    super(`fetchWithProgress: no bytes from ${url} for ${stallMs} ms (after ${loaded} bytes)`)
  }
}

export async function fetchWithProgress(
  url: string,
  onProgress: (progress: FetchProgress) => void,
  signal?: AbortSignal,
  options: { stallMs?: number } = {},
): Promise<Blob> {
  /**
   * ⚠️ THE NO-PROGRESS WATCHDOG — issue #41. On 2026-09-24 Cloudflare's Islamabad edge answered `200` with the
   * right headers and then sent 0 body bytes (its own analytics: 18 requests, status 499, 0 bytes). Nothing below
   * could settle on that: no error, no `done`, so the stage read "LOADING 3D MODEL · 0.0 MB" for as long as the
   * tab stayed open.
   *
   * A NO-PROGRESS WINDOW, NOT A DEADLINE. The timer restarts on every chunk, so a phone on a poor connection that
   * takes 90 s and keeps moving is never cut off; only silence is. A total timeout cannot tell those two apart. It
   * is armed before `fetch` too, because "no headers either" is the same silence one step earlier.
   *
   * The caller's own abort (a colourway change, an unmount) is forwarded and stays an abort: `stalled` is set
   * only by the timer, so a deliberate cancel is never retried as though the network had failed.
   */
  const internal = new AbortController()
  if (signal?.aborted) internal.abort(signal.reason)
  else signal?.addEventListener('abort', () => internal.abort(signal.reason), { once: true })
  let loaded = 0
  let stalled = false
  let timer: ReturnType<typeof setTimeout> | undefined
  const arm = () => {
    if (!options.stallMs) return
    clearTimeout(timer)
    timer = setTimeout(() => {
      stalled = true
      internal.abort()
    }, options.stallMs)
  }

  try {
    arm()
    return await readCounted(url, internal.signal, onProgress, (bytes) => {
      loaded = bytes
      arm()
    })
  } catch (error) {
    if (stalled) throw new DownloadStalledError(url, loaded, options.stallMs as number)
    throw error
  } finally {
    clearTimeout(timer)
  }
}

async function readCounted(
  url: string,
  signal: AbortSignal,
  onProgress: (progress: FetchProgress) => void,
  onChunk: (loaded: number) => void,
): Promise<Blob> {
  const response = await fetch(url, { signal })
  if (!response.ok) {
    throw new Error(`fetchWithProgress: ${url} responded ${response.status}`)
  }

  /**
   * ⚠️ A 200 IS NOT ENOUGH — A MISSING MODEL ARRIVES AS AN HTML PAGE.
   *
   * `media.wear-run.help` is R2's public bucket domain with no Worker in front, so a
   * key that is not there gets Cloudflare's own branded error document. Measured
   * live 2026-09-05:
   *
   *     GET media.wear-run.help/<missing>.glb
   *     -> 404, content-type: text/html, 27,150 bytes, <title>Not Found</title>
   *
   * The 404 is caught above. What is NOT caught is the same document arriving with a
   * 200 — which is exactly what happens when an edge rule, an interstitial or a
   * misrouted custom domain answers instead of the object. Without this check those
   * bytes reach `<model-viewer>`, three.js tries to parse HTML as a GLB, and the
   * visitor gets an unhandled parse error rather than the branded "reference
   * unavailable" screen with Email and WhatsApp on it.
   *
   * Checking the type rather than sniffing the bytes: a GLB begins with the magic
   * `glTF`, but a truncated or compressed body would fail that check for reasons
   * that are not "this is a web page", and turning a slow connection into an error
   * is worse than the bug being fixed.
   */
  const contentType = response.headers.get('content-type') ?? ''
  if (contentType.includes('text/html')) {
    throw new Error(
      `fetchWithProgress: ${url} returned an HTML page (${contentType}), not a model. ` +
        'The object is probably missing from storage — R2 answers a missing key with ' +
        "Cloudflare's own error document.",
    )
  }

  const header = response.headers.get('content-length')
  const parsed = header === null ? Number.NaN : Number(header)
  // 0 rather than NaN: `percentComplete` and `secondsRemaining` both treat a
  // non-positive total as "cannot promise a percentage" and return null, which
  // is the honest readout. NaN would propagate into the formatters instead.
  const total = Number.isFinite(parsed) && parsed > 0 ? parsed : 0

  const body = response.body
  if (!body) {
    // No stream to read — nothing to count, but the bytes are still obtainable.
    const blob = await response.blob()
    onProgress({ loaded: blob.size, total: total || blob.size })
    return blob
  }

  const reader = body.getReader()
  const chunks: Uint8Array[] = []
  let loaded = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    if (!value) continue
    chunks.push(value)
    // Cumulative. Reporting the chunk size instead would send the bar backwards
    // on every chunk after the first.
    loaded += value.byteLength
    onChunk(loaded)
    onProgress({ loaded, total })
  }
  return new Blob(chunks as BlobPart[])
}
