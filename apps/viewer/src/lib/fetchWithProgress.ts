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
