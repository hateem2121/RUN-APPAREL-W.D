/**
 * The photograph that stands in for the garment WHILE IT DOWNLOADS (fix plan Rank 6;
 * audits LIVE-04, LIVE-06).
 *
 * Measured 2026-08-30: a customer on 2 Mbit waited 45–62 s looking at an empty stage —
 * `Stage.tsx` mounts `<model-viewer>` only once the whole file is in a blob (so the bytes
 * can be counted), and the poster was taken out of the stage on 2026-08-21 because an
 * opaque poster covering the download was worse than the blueprint. The owner's design
 * (fix plan §1) puts the colourway's PHOTO back for that wait only: behind the MB / % /
 * time readout, blurred, sharpening as the bytes arrive, then cross-fading into the 3D
 * on `load`. Every failure state still shows no image — the notice, the specs and the
 * enquiry buttons are what a visitor without 3D gets, exactly as before.
 *
 * Pure so it is testable without a DOM: which asset, how blurred, how long the fade.
 */
import type { ViewerMediaAsset } from '@run-apparel/shared'
import type { LoadPhase } from './loadProgress'

/** Blur at 0% of the bytes, in CSS pixels. Enough that the photo reads as "arriving". */
export const PLACEHOLDER_BLUR_MAX_PX = 24
/**
 * Blur kept until the very end. The photo and the first 3D frame differ by a pixel or
 * two (camera, lighting), and a last soft step is what hides the "pop" at the swap.
 */
export const PLACEHOLDER_BLUR_MIN_PX = 2
/** Blur while the byte count cannot promise a percentage (no content-length). */
export const PLACEHOLDER_BLUR_UNKNOWN_PX = 12
/** How long the photo takes to cross-fade into the 3D. Must equal `--settle` in tokens.css. */
export const PLACEHOLDER_FADE_MS = 500

/** The picture to show for the colourway being displayed, or nothing. */
export function placeholderAsset(
  colourway: { poster: ViewerMediaAsset | null } | null | undefined,
  product: { posterFallback: ViewerMediaAsset | null },
): ViewerMediaAsset | null {
  return colourway?.poster ?? product.posterFallback ?? null
}

/** The blur radius for the current point of the download, in CSS pixels. */
export function placeholderBlurPx(phase: LoadPhase, percent: number | null): number {
  if (phase !== 'downloading') return PLACEHOLDER_BLUR_MIN_PX
  if (percent === null) return PLACEHOLDER_BLUR_UNKNOWN_PX
  const clamped = Math.min(100, Math.max(0, percent))
  return (
    PLACEHOLDER_BLUR_MIN_PX +
    ((PLACEHOLDER_BLUR_MAX_PX - PLACEHOLDER_BLUR_MIN_PX) * (100 - clamped)) / 100
  )
}

/** How long to keep the photo mounted after `load`: the fade, or nothing under reduced motion. */
export function placeholderLeaveMs(reducedMotion: boolean): number {
  return reducedMotion ? 0 : PLACEHOLDER_FADE_MS
}
