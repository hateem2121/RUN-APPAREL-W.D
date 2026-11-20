/**
 * What the encode of each product film measured (2026-11-20). TEST-ONLY: nothing in an app imports
 * this, so none of it ships to a visitor (productFilms.ts says why it was split out).
 *
 * ⚠️ ENCODED FROM THE DESIGNER'S MASTERS, NEVER FROM THE "SHARING" COPIES. The Sharing MP4s are
 * H.264 High 4:4:4 Predictive at level 5.2 and 84-163 Mbit/s (ffprobe, 2026-11-20): 100-194 MB
 * for ten seconds, in a profile Chromium rated only "maybe". Each film is 1080x1080, 60 fps,
 * 4:2:0, BT.709-tagged, `+faststart`, in two encodings (the recipe of scripts/build-products-film.mjs):
 * AV1 (SVT-AV1 preset 4, CRF 48) for browsers that decode it, H.264 (x264 veryslow, CRF 29, High
 * profile level 4.2) for the rest — except KURA and ORBX, re-encoded at CRF 27 because at 29 they
 * measured 0.964 and 0.966, under the 0.97 bar. CRF 29 was the owner's choice (2026-11-20) over a
 * 1.7 MB CRF 32 that measured 0.958.
 *
 * SSIM is against a lossless 1080x1080 decode of the Master, frames paired by index
 * (`setpts=N/60/TB` on both inputs: the two files' time bases differ, and paired by timestamp the
 * same film read 0.916 instead of 0.992). Bytes are the uploaded files', verified the same day by a
 * full GET whose SHA-256 matched the local file.
 */
export const PRODUCT_FILM_MEASUREMENTS: Readonly<
  Record<
    string,
    { bytes: { av1: number; h264: number; still: number }; ssim: { av1: number; h264: number } }
  >
> = {
  kaizen: {
    bytes: { av1: 1_930_398, h264: 2_327_811, still: 114_190 },
    ssim: { av1: 0.9895, h264: 0.9704 },
  },
  maxfly: {
    bytes: { av1: 1_078_089, h264: 1_482_272, still: 64_260 },
    ssim: { av1: 0.9873, h264: 0.9749 },
  },
  kura: {
    bytes: { av1: 1_788_111, h264: 2_607_738, still: 94_804 },
    ssim: { av1: 0.9814, h264: 0.9711 },
  },
  orbx: {
    bytes: { av1: 1_809_321, h264: 2_489_277, still: 79_264 },
    ssim: { av1: 0.9847, h264: 0.9717 },
  },
}
