import type { ViewerColourway } from '@run-apparel/shared'
import { type KeyboardEvent, useEffect, useRef, useState } from 'react'
import { isCoarsePointer } from '../lib/capabilities'
import { shouldShowThumbnail } from '../lib/colourwayPreview'
import { HOVER_INTENT_MS } from '../lib/motion'

/**
 * The tablist's panel is the 3D stage, which lives in App.tsx as a sibling.
 *
 * `role="tab"` without `aria-controls` is an incomplete pattern: a screen reader
 * announces "tab, 2 of 5" and gives the user no way to reach what it controls.
 * axe does not flag it — a tab with no `aria-controls` is valid ARIA — which is
 * how this passed the a11y gate while being unusable by keyboard.
 */
export const COLOURWAY_PANEL_ID = 'colourway-stage'

export const colourwayTabId = (slug: string) => `colourway-tab-${slug}`

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
   * it is not — still downloading 27 MB, or WebGL unavailable — the thumbnail
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
    pending.current = setTimeout(() => onPreview(colourway), colourway ? HOVER_INTENT_MS : 0)
  }

  // A tab can unmount mid-hover (colourway list refetch); without this the
  // model would keep the previewed variant and disagree with the selection.
  //
  // Adding `clearPending` here would be an actual bug, not a tidy-up. It is
  // redefined every render, so it would re-run this effect every render — and the
  // effect IS the cleanup, so `onPreview(null)` would fire on every render and
  // cancel any hover preview the moment it started. `clearPending` only touches a
  // ref, so its identity change carries no information worth reacting to.
  // biome-ignore lint/correctness/useExhaustiveDependencies: adding clearPending would cancel every hover — see above
  useEffect(
    () => () => {
      clearPending()
      onPreview(null)
    },
    [onPreview],
  )

  const tabRefs = useRef<(HTMLButtonElement | null)[]>([])

  /**
   * Arrow-key navigation with MANUAL activation: arrows move focus, Enter/Space
   * selects (the native `<button>` already does that half).
   *
   * ⚠️ NOT automatic activation, and that is a deliberate departure from the
   * common tabs example. Selecting a colourway here is not free — it rebinds every
   * material on the loaded model, rewrites the URL, and fires a `colourway_selected`
   * analytics event. Auto-activating on each arrow press would fire all three per
   * keystroke, so arrowing from the first colourway to the fifth would log four
   * selections nobody made and leave the URL on whichever one the user passed
   * through. The APG allows manual activation exactly when activation is expensive.
   *
   * Focus still previews, via the existing onFocus handler — so arrowing shows each
   * colourway on the model without committing to it, which is the same bargain
   * hovering makes.
   */
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = colourways.length - 1
    let next: number
    switch (event.key) {
      // Up/Down as well as Left/Right: the list wraps to a second row on narrow
      // viewports, where pressing Down and having nothing happen reads as broken.
      case 'ArrowRight':
      case 'ArrowDown':
        next = index === last ? 0 : index + 1
        break
      case 'ArrowLeft':
      case 'ArrowUp':
        next = index === 0 ? last : index - 1
        break
      case 'Home':
        next = 0
        break
      case 'End':
        next = last
        break
      default:
        return
    }
    // Only once a key is handled — otherwise this would swallow Tab and trap focus
    // in the tablist, which is worse than the bug being fixed.
    event.preventDefault()
    tabRefs.current[next]?.focus()
  }

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
            id={colourwayTabId(colourway.slug)}
            aria-controls={COLOURWAY_PANEL_ID}
            /**
             * Roving tabindex: the tablist is ONE tab stop, and arrows move within
             * it. Without this, Tab walked through all five colourways — so on a
             * five-colourway garment a keyboard user hit four extra stops between
             * the product details and the enquiry form.
             */
            tabIndex={colourway.slug === selected.slug ? 0 : -1}
            ref={(node) => {
              tabRefs.current[index] = node
            }}
            className="colourway-tab"
            aria-selected={colourway.slug === selected.slug}
            onKeyDown={(event) => onKeyDown(event, index)}
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
            {/* The number and the name are wrapped so they stay ONE line when the
                tab stacks vertically on a phone. Unwrapped, a column layout makes
                each of them — and the selected-state dot — its own row. The
                accessible name is unchanged: it is still the text content. */}
            <span className="colourway-tab__label">
              <span className="colourway-tab__num">{String(index + 1).padStart(2, '0')}</span>
              {colourway.displayName}
            </span>
          </button>
        ))}
      </div>
      <p className="colourways__hint">YOUR COLOURWAY IS ALWAYS DEVELOPED AROUND YOUR BRIEF.</p>
    </section>
  )
}
