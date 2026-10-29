export interface FetchProgress {
  /** Bytes received so far, cumulative. */
  loaded: number
  /** Bytes to expect (the server's `content-length`, else the garment data's size), or 0. */
  total: number
}

/**
 * The download answered, then stopped sending bytes for `stallMs`.
 *
 * Kept distinct from HTTP errors and browser network errors so the recovery notice
 * can say that bytes stopped arriving. All transient failures share one retry budget.
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

/** A model request that answered, but not with a model. `reason` is safe to report: no URL. */
export class ModelFetchError extends Error {
  override readonly name = 'ModelFetchError'
  constructor(
    message: string,
    readonly reason: string,
    readonly status?: number,
    readonly retryAfterMs?: number,
  ) {
    super(message)
  }
}

/**
 * Why a model download failed, in words that are safe to send to telemetry: never the URL.
 *
 * Added 2026-10-21 because `model-prefetch-failed` said only "falling back…" on all 13 rows of
 * the previous 30 days, and each was followed by `model-load-error` and the fallback notice —
 * the largest cause of a missing 3D view, and nothing recorded which kind of failure it was.
 * `network` is the browser's own TypeError ("Load failed" in Safari, Sentry VIEWER-A).
 */
export function fetchFailureReason(error: unknown): string {
  if (error instanceof DownloadStalledError) return 'stalled'
  if (error instanceof ModelFetchError) return error.reason
  // By name, not class: an abort is a DOMException, which is not an `Error` everywhere (jsdom).
  if ((error as { name?: unknown } | null)?.name === 'AbortError') return 'aborted'
  if (error instanceof TypeError) return 'network'
  if (error instanceof Error) return error.name
  return 'unknown'
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
 * `media.wear-run.help` made this workable when it was written: it sent `content-length`
 * (28,271,780 for N001) and no `content-encoding`, so that figure was the real transfer
 * size. ⚠️ NO LONGER (polish F12): measured 2026-10-04, both media hosts answer a browser's
 * `accept-encoding` with a gzipped body and NO `content-length`, and the percentage and time
 * left vanished. The garment data now carries the model's size (`expectedBytes`, from
 * `glbBytes`); see the total below.
 *
 * The caller uses downloadWithRetries for one bounded attempt budget and preserves
 * failure categories for the picture fallback and explicit visitor retry.
 */
export function retryAfterMs(value: string | null, now = Date.now()): number | undefined {
  if (!value?.trim()) return undefined
  const seconds = Number(value)
  const delay = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(value) - now
  return Number.isFinite(delay) && delay >= 0 ? delay : undefined
}

export async function fetchWithProgress(
  url: string,
  onProgress: (progress: FetchProgress) => void,
  signal?: AbortSignal,
  options: { stallMs?: number; expectedBytes?: number | null } = {},
): Promise<Blob> {
  /**
   * ⚠️ THE NO-PROGRESS WATCHDOG — issue #41. On 2026-09-24 Cloudflare's Islamabad edge answered `200` with the
   * right headers and then sent 0 body bytes (its own analytics: 18 requests, status 499, 0 bytes). Nothing below
   * could settle on that: no error, no `done`, so the stage read "LOADING 3D MODEL · 0.0 MB" for as long as the
   * tab stayed open.
   *
   * A NO-PROGRESS WINDOW, NOT A DEADLINE. The timer restarts on every chunk, so a phone on a poor connection that
   * takes 90 s and keeps moving is never cut off; only silence is. A total timeout cannot tell those two apart. It
   * is armed before `fetch` (no headers either is the same silence one step earlier) and again when the headers
   * arrive, so a slow connection setup does not eat into the body's window.
   *
   * ⚠️ PAUSED WHILE THE PAGE IS HIDDEN. A visitor who scans the QR code and flips to WhatsApp for 15 s leaves a
   * backgrounded tab whose reads are deferred; on return the overdue timer could fire before the chunks that
   * arrived meanwhile are read, throwing away a healthy download. Silence we cannot observe is not a stall.
   *
   * The caller's own abort (a colourway change, an unmount) is forwarded and stays an abort: `stalled` is set
   * only by the timer, so a deliberate cancel is never retried as though the network had failed.
   */
  const internal = new AbortController()
  const onAbort = () => internal.abort(signal?.reason)
  if (signal?.aborted) onAbort()
  else signal?.addEventListener('abort', onAbort, { once: true })
  let loaded = 0
  let stalled = false
  let timer: ReturnType<typeof setTimeout> | undefined
  const hidden = () => typeof document !== 'undefined' && document.visibilityState === 'hidden'
  const arm = () => {
    if (!options.stallMs) return
    clearTimeout(timer)
    if (hidden()) return
    timer = setTimeout(() => {
      stalled = true
      internal.abort()
    }, options.stallMs)
  }
  const onVisibility = () => (hidden() ? clearTimeout(timer) : arm())
  if (options.stallMs && typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', onVisibility)
  }

  try {
    arm()
    return await readCounted(
      url,
      internal.signal,
      onProgress,
      arm,
      options.expectedBytes,
      (bytes) => {
        loaded = bytes
        arm()
      },
    )
  } catch (error) {
    if (stalled) throw new DownloadStalledError(url, loaded, options.stallMs as number)
    throw error
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', onAbort)
    if (typeof document !== 'undefined')
      document.removeEventListener('visibilitychange', onVisibility)
  }
}

async function readCounted(
  url: string,
  signal: AbortSignal,
  onProgress: (progress: FetchProgress) => void,
  onHeaders: () => void,
  expectedBytes: number | null | undefined,
  onChunk: (loaded: number) => void,
): Promise<Blob> {
  const response = await fetch(url, { signal })
  onHeaders()
  if (!response.ok) {
    await response.body?.cancel().catch(() => {})
    throw new ModelFetchError(
      `fetchWithProgress: ${url} responded ${response.status}`,
      `http ${response.status}`,
      response.status,
      retryAfterMs(response.headers.get('retry-after')),
    )
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
    await response.body?.cancel().catch(() => {})
    throw new ModelFetchError(
      `fetchWithProgress: ${url} returned an HTML page (${contentType}), not a model. ` +
        'The object is probably missing from storage — R2 answers a missing key with ' +
        "Cloudflare's own error document.",
      'html page',
    )
  }

  /**
   * ⚠️ THE TOTAL (polish F12, 2026-10-04). The bytes counted below are the body AFTER the browser
   * has decompressed it, so a `content-length` is the same unit only when nothing is encoded:
   * beside a `content-encoding` it counts the compressed bytes and the percentage would pass 100
   * before the end. The header is trusted only then; otherwise the garment data's size, which is
   * the uncompressed file's (ViewerProduct.glbBytes). The media hosts gzip every model and send no
   * header (measured the same day), so in production the data's size is the one in use.
   */
  const encoding = (response.headers.get('content-encoding') ?? 'identity').trim().toLowerCase()
  const header = encoding === 'identity' ? response.headers.get('content-length') : null
  const parsed = header === null ? Number.NaN : Number(header)
  // 0 rather than NaN: `percentComplete` and `secondsRemaining` both treat a
  // non-positive total as "cannot promise a percentage" and return null, which
  // is the honest readout. NaN would propagate into the formatters instead.
  const fromHeader = Number.isFinite(parsed) && parsed > 0 ? parsed : 0
  const fromData =
    typeof expectedBytes === 'number' && Number.isFinite(expectedBytes) && expectedBytes > 0
      ? expectedBytes
      : 0
  let total = fromHeader || fromData

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
    // A size from the data that the bytes outgrow was wrong (the file changed without its
    // record): no percentage beats one that reads 100 and "preparing" mid-download.
    if (!fromHeader && loaded > total) total = 0
    onChunk(loaded)
    onProgress({ loaded, total })
  }
  return new Blob(chunks as BlobPart[])
}
