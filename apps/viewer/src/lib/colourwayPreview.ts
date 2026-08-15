import type { ViewerColourway } from '@run-apparel/shared'

/**
 * The decision behind "hover a colourway, see that colourway".
 *
 * Extracted rather than inlined because the wrong answer renders perfectly and is
 * invisible in review — a preview that quietly does nothing.
 *
 * This module held a second decision, `shouldShowThumbnail`, until 2026-08-15.
 * It gated a 132px poster that popped above the rail while the model downloaded;
 * the owner asked for the popup gone. See the header of `ColourwayTabs.tsx` for
 * what restoring it would take.
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
