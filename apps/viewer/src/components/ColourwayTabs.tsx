import type { ViewerColourway } from '@run-apparel/shared'
import { useEffect, useRef, useState } from 'react'
import { isCoarsePointer } from '../lib/capabilities'
import { shouldShowThumbnail } from '../lib/colourwayPreview'

interface ColourwayTabsProps {
  colourways: ViewerColourway[]
  selected: ViewerColourway
  onSelect: (colourway: ViewerColourway) => void
  /**
   * Raise the hovered/focused colourway so <Stage> can swap the loaded model's
   * variant. Null means "back to the selected one".
   */
  onPreview: (colourway: ViewerColourway | null) => void
  /**
   * Whether the 3D model is on screen and ready to accept a variant swap. When
   * it is, hovering shows the real garment and the thumbnail is redundant; when
   * it is not — still downloading 37.7 MB, or WebGL unavailable — the thumbnail
   * is the only preview a visitor can get.
   */
  modelReady: boolean
}

/**
 * Hover a colourway, see that colourway.
 *
 * Until 2026-08-05 this rendered a 132px static poster in the corner while the
 * real garment sat in the viewport at full size, and `hexSwatch` — carried all
 * the way from the CMS through `projectViewer.ts` and `ViewerColourway` into the
 * live API response — was never read by anything. The buttons showed a number
 * and a name, so a colour picker communicated no colour.
 */
export function ColourwayTabs({
  colourways,
  selected,
  onSelect,
  onPreview,
  modelReady,
}: ColourwayTabsProps) {
  const [previewed, setPreviewed] = useState<ViewerColourway | null>(null)
  // Touch has no hover: the first tap would fire mouseenter AND click, so a
  // preview state there is both invisible and misleading.
  const canPreview = !isCoarsePointer()
  const showThumbnail = shouldShowThumbnail(canPreview, modelReady, previewed, selected)

  // Pointer travel across five buttons fires five enters. Rebinding a variant
  // swaps every material on the model, so coalesce to where the pointer settled.
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null)
  const clearPending = () => {
    if (pending.current !== null) {
      clearTimeout(pending.current)
      pending.current = null
    }
  }

  const preview = (colourway: ViewerColourway | null) => {
    if (!canPreview) return
    setPreviewed(colourway)
    clearPending()
    pending.current = setTimeout(() => onPreview(colourway), colourway ? 90 : 0)
  }

  // A tab can unmount mid-hover (colourway list refetch); without this the
  // model would keep the previewed variant and disagree with the selection.
  useEffect(
    () => () => {
      clearPending()
      onPreview(null)
    },
    [onPreview],
  )

  return (
    <section className="colourways" aria-label="Colourways" data-reveal>
      <div className="colourways__preview" aria-hidden="true">
        {showThumbnail && previewed && (
          <div className="colourway-preview">
            <img
              src={previewed.poster.url}
              alt=""
              width={previewed.poster.width ?? undefined}
              height={previewed.poster.height ?? undefined}
              loading="lazy"
              decoding="async"
            />
          </div>
        )}
      </div>
      <div className="colourways__list" role="tablist" aria-label="Select colourway">
        {colourways.map((colourway, index) => (
          <button
            key={colourway.variantId}
            type="button"
            role="tab"
            className="colourway-tab"
            aria-selected={colourway.slug === selected.slug}
            onClick={() => {
              clearPending()
              onPreview(null)
              onSelect(colourway)
            }}
            onMouseEnter={() => preview(colourway)}
            onMouseLeave={() => preview(null)}
            onFocus={() => preview(colourway)}
            onBlur={() => preview(null)}
          >
            {/* Decorative: the name beside it already carries the meaning, so a
                swatch that failed to load must not leave the button unreadable. */}
            {colourway.hexSwatch && (
              <span
                className="colourway-tab__swatch"
                style={{ background: colourway.hexSwatch }}
                aria-hidden="true"
              />
            )}
            <span className="colourway-tab__num">{String(index + 1).padStart(2, '0')}</span>
            {colourway.displayName}
          </button>
        ))}
      </div>
      <p className="colourways__hint">YOUR COLOURWAY IS ALWAYS DEVELOPED AROUND YOUR BRIEF.</p>
    </section>
  )
}
