/**
 * THE PICTURE FIRST, THEN THE 3D FILE (polish F13, 2026-10-04).
 *
 * Measured by the polish audit on the live site at 1.6 Mbit/s (Lighthouse's "Slow 4G": 150 ms,
 * 1.6 Mbps down — its docs/throttling.md, read 2026-10-04): the stage stood empty for 3 s and
 * the blurred colour picture appeared only at about 12 s. The
 * picture is small — the 195 garment pictures in the CMS run from 24 to 187 KB, 46 KB in the
 * middle (read off the media records 2026-10-04), a quarter of a second on that line — but it was
 * asked for in the same moment as the model (about 4 MB) from the same media host.
 *
 * Why it lost (web.dev, "Optimize resource loading with the Fetch Priority API", updated
 * 2023-11-14): an image starts at "Low" and is raised to "High" only once layout puts it on
 * screen, while "the browser executes `fetch` with a high priority" — so the picture queued behind
 * the model. `fetchpriority="high"` on the picture (which it also carries) asks for the opposite,
 * but the same article warns that "CDNs don't implement HTTP/2 prioritization uniformly": a hint
 * the server may ignore. An ORDER the page keeps holds in every browser on every connection.
 *
 * So the model's download waits until the picture has arrived or failed, and never longer than
 * `PICTURE_HEAD_START_MAX_MS`: a picture that hangs must not hold the 3D. With no picture on the
 * page, or one already in from the cache, it does not wait at all.
 */

/**
 * The longest the model's download waits for the picture, in ms. The largest garment picture
 * (187 KB) needs about 1.5 s on the 1.6 Mbit/s line with a new connection to the media host
 * (~0.6 s at Lighthouse's 150 ms round trip) — so every picture in the catalogue lands inside
 * it on that line, and the model, about 20 s there, starts at most 2 s later.
 */
export const PICTURE_HEAD_START_MAX_MS = 2000

/**
 * Resolves once `picture` has arrived or failed, once `signal` aborts, or after `maxMs` —
 * whichever comes first; at once when there is no picture or it is already complete. Never
 * rejects: the model must start whatever happens to the picture.
 *
 * Checking `complete` and adding the listeners happen in one task, and `load` / `error` are
 * dispatched as tasks of their own, so a picture cannot finish in between and be missed.
 */
export function pictureHeadStart(
  picture: HTMLImageElement | null,
  signal: AbortSignal,
  maxMs: number = PICTURE_HEAD_START_MAX_MS,
): Promise<void> {
  if (!picture || picture.complete || signal.aborted) return Promise.resolve()
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer)
      picture.removeEventListener('load', done)
      picture.removeEventListener('error', done)
      signal.removeEventListener('abort', done)
      resolve()
    }
    const timer = setTimeout(done, maxMs)
    picture.addEventListener('load', done)
    picture.addEventListener('error', done)
    signal.addEventListener('abort', done)
  })
}
