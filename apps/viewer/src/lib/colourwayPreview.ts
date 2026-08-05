import type { ViewerColourway } from '@run-apparel/shared'

/**
 * The two decisions behind "hover a colourway, see that colourway".
 *
 * Extracted rather than inlined because both have a wrong answer that renders
 * perfectly and is invisible in review — a preview that quietly does nothing, or
 * one that fires on a device with no hover at all.
 */

/**
 * Which colourway the MODEL should display, as distinct from which one is
 * selected.
 *
 * The `separateMode` guard is the load-bearing part. Under
 * `separate-glb-per-colour` a colourway is a different FILE, not a variant
 * inside one, so honouring a preview there would mean fetching a multi-megabyte
 * GLB because a pointer crossed a button. `Stage` resolves its `src` from the
 * selection, so a preview would also disagree with what is actually loaded.
 */
export function displayedColourway(
  separateMode: boolean,
  preview: ViewerColourway | null,
  selected: ViewerColourway,
): ViewerColourway {
  if (separateMode) return selected
  return preview ?? selected
}

/**
 * Whether to show the small static thumbnail.
 *
 * Only when a variant swap would NOT be visible. Once the model is up, hovering
 * changes the garment in the viewport at full size, and a 132px thumbnail of the
 * same thing in the corner is noise. Before then — still downloading, or WebGL
 * unavailable — the thumbnail is the only preview obtainable.
 */
export function shouldShowThumbnail(
  canPreview: boolean,
  modelReady: boolean,
  previewed: ViewerColourway | null,
  selected: ViewerColourway,
): boolean {
  if (!canPreview) return false
  if (modelReady) return false
  if (!previewed) return false
  return previewed.slug !== selected.slug
}
