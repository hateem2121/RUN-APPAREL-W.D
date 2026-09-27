import type { ViewerColourway } from '@run-apparel/shared'
import { lazy, Suspense, useCallback, useRef, useState } from 'react'
import { track } from '../lib/analytics'

/*
 * The dialog is a DYNAMIC import, so base-ui and the zoom code never reach the entry
 * chunk: a QR scan on mobile data pays for them only when the visitor asks for the
 * picture. `loadDialog` is called on intent (pointer-down, hover, focus) so the chunk
 * is usually already here by the time the tap lands.
 */
const loadDialog = () => import('./HdImageDialog')
const HdImageDialog = lazy(loadDialog)

interface HdImageButtonProps {
  productName: string
  colourways: ViewerColourway[]
  selected: ViewerColourway
  /** Switches the PAGE's colour, so closing the dialog lands where the visitor was looking. */
  onSelectColourway?: (colourway: ViewerColourway) => void
}

/**
 * "HD IMAGE" — the CLO studio render of the selected colour, full screen (2026-09-27).
 *
 * ⚠️ RENDERED ONLY WHEN THE COLOUR HAS A RENDER. Not disabled, not hidden: absent, so a
 * buyer is never offered a picture that does not exist and the button never enters
 * the tab order for nothing.
 *
 * ⚠️ NOT DISABLED DURING THE 3D DOWNLOAD, unlike FRONT / BACK / SIDE. Those point a
 * camera that does not exist yet; this shows a picture that does. On a slow connection
 * it is the fastest way to see the garment.
 *
 * ⚠️ NOTHING IS DOWNLOADED UNTIL INTENT. The render is 1-3 MB; a page that fetched it
 * for every scan would spend a buyer's data on a picture most never open.
 */
export function HdImageButton({
  productName,
  colourways,
  selected,
  onSelectColourway,
}: HdImageButtonProps) {
  const render = selected.render
  const [open, setOpen] = useState(false)
  // Mounted on first open and kept, so the closing transition has an element to run on.
  const [mounted, setMounted] = useState(false)
  const buttonRef = useRef<HTMLButtonElement | null>(null)
  const warmed = useRef(new Set<string>())

  const warm = useCallback(() => {
    void loadDialog()
    if (!render || warmed.current.has(render.url)) return
    warmed.current.add(render.url)
    const img = new Image()
    img.decoding = 'async'
    img.src = render.url
  }, [render])

  if (!render) return null

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className="camera-btn hd-image-btn"
        aria-haspopup="dialog"
        aria-label={`HD image: studio render of ${productName} in ${selected.displayName}`}
        onPointerDown={warm}
        onPointerEnter={warm}
        onFocus={warm}
        onClick={() => {
          warm()
          setMounted(true)
          setOpen(true)
          track('hd_image_opened', { variant: selected.slug })
        }}
      >
        <svg
          className="hd-image-btn__icon"
          viewBox="0 0 16 16"
          width="12"
          height="12"
          aria-hidden="true"
          focusable="false"
        >
          <path
            d="M2 6V2h4M10 2h4v4M14 10v4h-4M6 14H2v-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          />
        </svg>
        HD<span className="hd-image-btn__more">&nbsp;IMAGE</span>
      </button>
      {mounted && (
        <Suspense fallback={null}>
          <HdImageDialog
            open={open}
            onOpenChange={setOpen}
            productName={productName}
            colourways={colourways}
            selected={selected}
            onSelectColourway={onSelectColourway}
            returnFocusTo={buttonRef}
          />
        </Suspense>
      )}
    </>
  )
}
