import {
  DownloadStalledError,
  ModelFetchError,
  type FetchProgress,
  fetchWithProgress,
} from './fetchWithProgress'

/**
 * No new bytes for this long means the download has stopped — issue #41.
 *
 * A NO-PROGRESS window, not a deadline: see the watchdog in `fetchWithProgress`. 12 s is well past the gap between
 * chunks on any connection that is still moving (a phone on poor 3G delivers something every second or two), and
 * short enough that three tries end inside NN/g's patience limits for a page that shows its progress.
 */
export const STALL_MS = 12_000

/** Tries in total, the first included. The visitor reads "TRYING AGAIN (2 OF 3)" and then "(3 OF 3)". */
export const MAX_ATTEMPTS = 3

/** Temporary failures share one attempt budget; permanent responses and cancellation never retry. */
export function retryableDownload(error: unknown): boolean {
  return (
    error instanceof DownloadStalledError ||
    error instanceof TypeError ||
    (error instanceof ModelFetchError && [408, 429, 500, 502, 503, 504].includes(error.status ?? 0))
  )
}

function waitForRetry(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const aborted = () => {
      clearTimeout(timer)
      signal?.removeEventListener('abort', aborted)
      reject(new DOMException('Download cancelled', 'AbortError'))
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', aborted)
      resolve()
    }, ms)
    if (signal?.aborted) aborted()
    else signal?.addEventListener('abort', aborted, { once: true })
  })
}

export async function downloadWithRetries(
  url: string,
  opts: {
    onProgress: (progress: FetchProgress) => void
    /** Called before each try, from 1. */
    onAttempt?: (attempt: number) => void
    /** Called on each stall, with the bytes that had arrived — for the diagnostic. */
    onStall?: (attempt: number, loaded: number) => void
    onFailure?: (attempt: number, error: unknown) => void
    signal?: AbortSignal
    stallMs?: number
    attempts?: number
    fetcher?: typeof fetchWithProgress
    /** The model's size from the garment data, for the percentage (fetchWithProgress, F12). */
    expectedBytes?: number | null
  },
): Promise<Blob> {
  const { stallMs = STALL_MS, attempts = MAX_ATTEMPTS, fetcher = fetchWithProgress } = opts
  const limit = Number.isFinite(attempts)
    ? Math.max(1, Math.min(MAX_ATTEMPTS, Math.floor(attempts)))
    : MAX_ATTEMPTS
  for (let attempt = 1; ; attempt++) {
    if (opts.signal?.aborted) throw new DOMException('Download cancelled', 'AbortError')
    opts.onAttempt?.(attempt)
    try {
      return await fetcher(url, opts.onProgress, opts.signal, {
        stallMs,
        expectedBytes: opts.expectedBytes,
      })
    } catch (error) {
      if (opts.signal?.aborted) throw new DOMException('Download cancelled', 'AbortError')
      opts.onFailure?.(attempt, error)
      if (error instanceof DownloadStalledError) opts.onStall?.(attempt, error.loaded)
      if (!retryableDownload(error) || attempt >= limit) throw error
      const retryAfter = error instanceof ModelFetchError ? error.retryAfterMs : undefined
      // Never retry before Retry-After; a long server pause leaves an explicit visitor retry.
      if (retryAfter !== undefined && retryAfter > 30_000) throw error
      const backoff = 250 * 2 ** (attempt - 1) + Math.floor(Math.random() * 250)
      await waitForRetry(Math.max(backoff, retryAfter ?? 0), opts.signal)
    }
  }
}
