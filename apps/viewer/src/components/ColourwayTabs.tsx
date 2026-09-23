import type { ViewerColourway } from '@run-apparel/shared'
import { type KeyboardEvent, useEffect, useRef, useState } from 'react'
import { useCoarsePointer } from '../lib/useCoarsePointer'
import { HOVER_INTENT_MS } from '../lib/motion'
import { softHyphenate } from '../lib/softHyphenate'

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
}

/**
 * Hover a colourway, see that colourway.
 *
 * Until 2026-08-05 this rendered a 132px static poster in the corner while the
 * real garment sat in the viewport at full size, and `hexSwatch` — carried all
 * the way from the CMS through `projectViewer.ts` and `ViewerColourway` into the
 * live API response — was never read by anything. The buttons showed a number
 * and a name, so a colour picker communicated no colour.
 *
 * ⚠️ THE THUMBNAIL IS GONE SINCE 2026-08-15, by owner decision, and the `modelReady`
 * prop went with it — it fed nothing else.
 *
 * What it did: while the 27 MB model was still downloading, hovering a colourway
 * popped a 132px poster above the rail. `shouldShowThumbnail` suppressed it the
 * moment the model was ready, so it only ever appeared during the load window —
 * which is why it reads as an intermittent popup rather than a feature.
 *
 * The cost of removing it is real and was accepted knowingly: for the whole
 * download — ~22s on 4G at the ~27 MB models of the time, less at the 1.8-7.8 MB
 * model takes on 4G, hovering a colourway now does nothing at all. Restoring it
 * means restoring `shouldShowThumbnail` (deleted from `lib/colourwayPreview.ts`),
 * the `.colourways__preview` slot, and the `modelReady` wiring in `App.tsx` —
 * not just an element.
 */
export function ColourwayTabs({ colourways, selected, onSelect, onPreview }: ColourwayTabsProps) {
  /**
   * Which tab currently OWNS the single tab stop.
   *
   * The roving tabindex tracked SELECTION, not FOCUS: `tabIndex` was
   * `slug === selected.slug ? 0 : -1`. Because activation here is MANUAL — arrows
   * move focus, Enter/Space selects, deliberately, since selecting rebinds every
   * material on a multi-megabyte model — arrowing away from the selected tab left focus on
   * a tab whose tabIndex was -1. Tabbing out and back then returned the browser
   * to the SELECTED tab rather than the one the user had arrowed to, silently
   * discarding their navigation.
   *
   * `null` means "nothing has been arrowed to yet", so the selected tab holds the
   * stop — which is the correct resting state and what `onBlur` restores.
   */
  const [focusedSlug, setFocusedSlug] = useState<string | null>(null)
  // Touch has no hover: the first tap would fire mouseenter AND click, so a
  // preview state there is both invisible and misleading.
  //
  // ⚠️ THE HOOK, NOT `isCoarsePointer()`. The plain function is read during render
  // and never re-checked, so an iPad that has its Magic Keyboard detached mid-visit
  // kept hover-preview switched ON for a touch screen — precisely the state the two
  // lines above call misleading. See lib/useCoarsePointer.ts.
  const canPreview = !useCoarsePointer()

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
    setFocusedSlug(colourways[next]?.slug ?? null)
    tabRefs.current[next]?.focus()
  }

  return (
    <section className="colourways" aria-label="Colorways" data-reveal>
      <div className="colourways__list" role="tablist" aria-label="Select colorway">
        {colourways.map((colourway, index) => (
          <button
            key={colourway.variantId}
            type="button"
            role="tab"
            /**
             * The plain name, because the label below carries soft hyphens (SZ-06) and a
             * screen reader must never be handed one. The stage panel is labelled by this
             * tab's id (App.tsx), so it inherits the same clean name.
             */
            aria-label={colourway.displayName}
            id={colourwayTabId(colourway.slug)}
            aria-controls={COLOURWAY_PANEL_ID}
            /**
             * Roving tabindex: the tablist is ONE tab stop, and arrows move within
             * it. Without this, Tab walked through all five colourways — so on a
             * five-colourway garment a keyboard user hit four extra stops between
             * the product details and the enquiry form.
             */
            tabIndex={(focusedSlug ?? selected.slug) === colourway.slug ? 0 : -1}
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
            onBlur={() => {
              preview(null)
              // Return the tab stop to the selected tab when focus leaves the
              // list. onBlur already restores the preview, so the reset has a
              // natural home here — and it means Tab re-entry lands on the
              // colourway actually being shown rather than wherever the user
              // last arrowed to and abandoned.
              setFocusedSlug(null)
            }}
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
            {/*
              ⚠️ THE ONE RULE THAT OUTLIVED BOTH DECORATIONS: NEVER PUT A CUE ON
              THIS BUTTON WITH `::after { content: … }`.

              Generated content IS included in the accessible name. The selected
              dot was written that way originally, so the chosen tab announced as
              "01 Wine ●" while `aria-selected` already carried the state. Making
              it a real `aria-hidden` element fixed the announcement on
              2026-08-14; the element itself then went on 2026-08-21 (below), and
              the ordinal that shared this span on 2026-08-20. What must not come
              back is the pseudo-element.

              The span itself stays. It is the flex sibling of the swatch, and the
              two must not become separate rows when a tab stacks on a narrow
              container.
            */}
            {/*
              ⚠️ THE "01 / 02 / 03" PREFIX WAS REMOVED HERE ON 2026-08-20 —
              owner decision. Do not reinstate it without re-reading this.

              It rendered at 8.5px (0.85em of a 10px label), the smallest text in
              the viewer, and it was already `aria-hidden` decoration: the owner
              confirmed on 2026-08-14 that the number appears on no tag, no
              printed catalogue and no order form. It is `index + 1`, so removing
              a colourway silently renumbers every one after it — it could never
              have been a reference.

              What it cost was width, on the tightest control on the page.
              Measured at 402x714: the widest tab needed **67.2px** with the
              number and **51.7px** without. That 15.5px is the difference
              between five swatches fitting one row only on a 402px phone and
              fitting one row on EVERY phone, 320px included — which is why
              removing it also deleted a container-query branch rather than
              adding one, and why the garment grew on every width at once.
            */}
            {/*
              ⚠️ THE SELECTED-STATE DOT WAS REMOVED HERE ON 2026-08-21 — owner
              decision. Do not reinstate it as an accessibility fix; it was not
              one.

              The argument for it was "selected state is never colour-only". It
              never was colour-only. `[aria-selected="true"]` INVERTS THE FILL:
              measured in both themes, the tab's background goes from the page
              surface to `--btn-primary-bg` at 14.47:1 in light and 13.11:1 in
              dark, and greyscale luminance flips 0.864 -> 0.013 (light) and
              0.013 -> 0.775 (dark). A fill inversion of that size is not a hue
              distinction, so WCAG 1.4.1 is satisfied without it — and
              `aria-selected` already carries the state for assistive technology,
              which is why the dot had to be `aria-hidden` in the first place.

              It was also the third cue for one piece of state, on the tightest
              control on the page: the "01 / 02" ordinal went on 2026-08-20 for
              the 15.5px of width it cost, and this ` ●` was inside the same
              `.colourway-tab__label` span that existed to keep the pair on one
              line.
            */}
            <span className="colourway-tab__label">{softHyphenate(colourway.displayName)}</span>
          </button>
        ))}
      </div>
      {/*
        ⚠️ THE "THESE COLOURWAYS ARE EXAMPLES" NOTE LIVED HERE UNTIL 2026-08-20
        AND HAS MOVED TO <ProductPanel>. Do not put it back.

        Measured on the live site before the move: it rendered at y=710-741
        against an action bar starting at y=740, so its last pixel row sat under
        the bar — a sentence nobody could finish reading, on the most valuable
        screen in the product. It is also the one thing in this band a visitor
        does not need before choosing a colour.

        Under the flex stage band its 31px plus the 12px grid gap go straight to
        the garment: measured +43px at 375x812, 402x714 and 414x896 alike. That
        was NOT true of the old fixed-subtrahend layout, where the canvas height
        was set by a number and anything below the rail was free — which is why
        an earlier audit correctly said moving it would buy nothing, and why that
        stopped being correct the moment the band started sizing itself.
      */}
    </section>
  )
}
