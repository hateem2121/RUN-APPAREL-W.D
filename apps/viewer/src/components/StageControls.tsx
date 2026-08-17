export type CameraView = 'front' | 'back' | 'side'

export const CAMERA_VIEWS = ['front', 'back', 'side'] as const

interface StageControlsProps {
  /** The view currently framed, or null once the visitor has orbited by hand. */
  activeView: CameraView | null
  onSelect: (view: CameraView) => void
  /**
   * True while there is no model to point a camera at — the whole ~23s a 27 MB
   * garment takes on 4G. See the note on rendering-while-disabled below.
   */
  disabled: boolean
}

/**
 * FRONT / BACK / SIDE, as a row BENEATH the canvas rather than a pill on top of
 * the garment.
 *
 * ⚠️ WHY IT MOVED, measured on the live site 2026-08-17. This was
 * `position: absolute; bottom: 16px` inside `.stage__canvas`, and the garment
 * fills 86.3% of that canvas at every viewport — so the pill sat ON the product.
 * At 1440x900 the garment's lowest pixel was y=689 and the pill spanned 663-717:
 * **26px of garment underneath it**, and visually the whole hem. At 390x844 it
 * was **38px**, on a canvas where the sticky header was already covering 29px at
 * the other end (see App.tsx's `preventScroll` comment — that was the same
 * complaint, from the other direction).
 *
 * The owner reported these as two problems, "the model gets cut off" and "the
 * buttons are on top of the 3D product". They are one problem. The garment is
 * never CLIPPED — the numbers above are obscuring, not cropping, which is why
 * making the block taller on its own would not have fixed it.
 *
 * ⚠️ IT RENDERS WHILE DISABLED, and that is deliberate rather than lazy. Gating
 * the row on `modelLoaded` would insert 52px of layout ~23 seconds after first
 * paint, shoving the colourway rail and everything below it down mid-read — a
 * large, late layout shift on the slowest connection, which is the one that can
 * least afford it. Reserving the space and disabling the controls costs nothing
 * and says the true thing.
 *
 * `disabled` also closes a real defect it inherited: the buttons used to be live
 * from first paint with `activeView` pre-set to 'front', so one looked pressed,
 * and `applyView` returned silently when the element did not exist yet. A
 * visitor tapping BACK during the download got no camera move and no
 * explanation.
 */
export function StageControls({ activeView, onSelect, disabled }: StageControlsProps) {
  return (
    <div className="stage__controls" role="group" aria-label="Camera positions">
      {CAMERA_VIEWS.map((view) => (
        <button
          key={view}
          type="button"
          className="camera-btn"
          // Kept unconditional, as it was: this is real state, not a hover hint.
          aria-pressed={activeView === view}
          disabled={disabled}
          onClick={() => onSelect(view)}
        >
          {view}
        </button>
      ))}
    </div>
  )
}
