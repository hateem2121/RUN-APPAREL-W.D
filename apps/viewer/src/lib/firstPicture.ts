import { posterPicture } from './garmentContour'

/**
 * THE OPENING SCREEN WAITS FOR THE GARMENT'S PICTURE (12 Nov 2026, loader fix B2).
 *
 * Chrome trace of the live garment page at 4x CPU on Slow 4G, phone screen: the opening screen's
 * wipe ended at 3.9 s and the stage's picture painted at 5.1 s, so the screen lifted onto an empty
 * stage for 1.2 s. The picture cannot be asked for sooner, since its address arrives with the
 * garment's data (Chrome: "Request is discoverable in initial document: FAILED"), so the screen now
 * waits for it: once it has decoded, or failed, or after `maxMs`, whichever comes first.
 *
 * It asks for the SAME address in the same mode as the stage (`posterPicture`: `?seam=1`, CORS), or a
 * phone would download the picture twice (garmentContour.ts has the 243,042-byte measurement).
 */
export type FirstPictureOutcome = 'decoded' | 'timeout' | 'none' | 'failed'

function loadPoster(url: string): Promise<void> {
  const picture = new Image()
  const { src, crossOrigin } = posterPicture(url)
  picture.crossOrigin = crossOrigin
  picture.src = src
  return picture.decode()
}

export function waitForFirstPicture(
  url: string | null,
  maxMs: number,
  load: (url: string) => Promise<void> = loadPoster,
): Promise<FirstPictureOutcome> {
  if (!url) return Promise.resolve('none')
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve('timeout'), maxMs)
    load(url).then(
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
