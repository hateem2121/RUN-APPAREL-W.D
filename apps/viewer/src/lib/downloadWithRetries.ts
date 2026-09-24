import { DownloadStalledError, type FetchProgress, fetchWithProgress } from './fetchWithProgress'

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

/**
 * Download a model, retrying ONLY when it stalls.
 *
 * ⚠️ THE SAME URL EVERY TIME, DELIBERATELY. A cache-busting query would skip the edge's copy and go back to R2 — and
 * on 2026-09-24 the edge's copies were the only ones still being delivered from Islamabad, while every fresh fetch
 * from R2 stalled. A retry opens a new connection, which is what has a chance of taking a working route.
 *
 * Every other failure is rethrown at once, so the caller keeps its old contract: hand the plain URL to
 * `<model-viewer>`, which can still succeed where the counted fetch could not.
 */
export async function downloadWithRetries(
  url: string,
  opts: {
    onProgress: (progress: FetchProgress) => void
    /** Called before each try, from 1. */
    onAttempt?: (attempt: number) => void
    /** Called on each stall, with the bytes that had arrived — for the diagnostic. */
    onStall?: (attempt: number, loaded: number) => void
    signal?: AbortSignal
    stallMs?: number
    attempts?: number
    fetcher?: typeof fetchWithProgress
  },
): Promise<Blob> {
  const { stallMs = STALL_MS, attempts = MAX_ATTEMPTS, fetcher = fetchWithProgress } = opts
  for (let attempt = 1; ; attempt++) {
    opts.onAttempt?.(attempt)
    try {
      return await fetcher(url, opts.onProgress, opts.signal, { stallMs })
    } catch (error) {
      if (!(error instanceof DownloadStalledError)) throw error
      opts.onStall?.(attempt, error.loaded)
      if (attempt >= attempts) throw error
    }
  }
}
