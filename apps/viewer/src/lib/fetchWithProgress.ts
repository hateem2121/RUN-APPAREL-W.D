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
export async function fetchWithProgress(
  url: string,
  onProgress: (progress: FetchProgress) => void,
  signal?: AbortSignal,
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
    onProgress({ loaded, total })
  }
  return new Blob(chunks as BlobPart[])
}
