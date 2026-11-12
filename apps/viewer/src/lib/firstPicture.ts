/**
 * THE OPENING SCREEN WAITS FOR THE GARMENT'S PICTURE (12 Nov 2026, loader fix B2).
 *
 * Chrome trace of the live garment page at 4x CPU on Slow 4G, phone screen: the opening screen's
 * wipe ended at 3.9 s and the stage's picture painted at 5.1 s, so the screen lifted onto an empty
 * stage for 1.2 s. The picture cannot be asked for sooner, since its address arrives with the
 * garment's data (Chrome: "Request is discoverable in initial document: FAILED"), so the screen now
 * waits for it: once it has decoded, or failed, or after `maxMs`, whichever comes first.
 *
 * It asks for the very request the stage makes, address AND mode, or a phone would download the
 * picture twice (garmentContour.ts has the 243,042-byte measurement). The stage says which picture
 * it draws (`Stage`'s `onPicture`): the poster at `?seam=1` with CORS while the 3D downloads, or,
 * with no 3D, the screen-sized HD copy at its plain address. Waiting for the poster in that case
 * let the screen leave 0.9 s before the copy painted (CI's Firefox, which has no WebGL, PR #383).
 */
export type FirstPictureOutcome = 'decoded' | 'timeout' | 'none' | 'failed'

/** The picture as the stage asks for it: what goes in `src`, and `crossOrigin` when it sets one. */
export interface PictureRequest {
  src: string
  crossOrigin?: 'anonymous'
}

function loadPicture(request: PictureRequest): Promise<void> {
  const picture = new Image()
  if (request.crossOrigin) picture.crossOrigin = request.crossOrigin
  picture.src = request.src
  return picture.decode()
}

export function waitForFirstPicture(
  request: PictureRequest | null,
  maxMs: number,
  load: (request: PictureRequest) => Promise<void> = loadPicture,
): Promise<FirstPictureOutcome> {
  if (!request) return Promise.resolve('none')
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve('timeout'), maxMs)
    // A loader that throws at once (no `Image` here, say) counts as a broken picture, or the opening
    // screen would wait on a promise that never settles (review M6, 13 Nov 2026).
    let loading: Promise<void>
    try {
      loading = load(request)
    } catch (error) {
      loading = Promise.reject(error)
    }
    loading.then(
      () => {
        clearTimeout(timer)
        resolve('decoded')
      },
      () => {
        clearTimeout(timer)
        resolve('failed')
      },
    )
  })
}

/**
 * What is left of the allowance, counted from the FIRST wait. The stage can name a second picture
 * mid-wait (a 3D download that fails at once falls back to the HD copy), and starting a fresh
 * allowance then could hold the screen for twice the limit (review M5, 13 Nov 2026).
 */
export function pictureWaitLeft(startedAt: number, now: number, maxMs: number): number {
  return Math.max(0, maxMs - (now - startedAt))
}
