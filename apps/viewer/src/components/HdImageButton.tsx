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
  /**
   * Polish D9 (owner-approved 2026-10-03): whether the 3D window is showing the HD picture in
   * place of the garment. Given, the button SWITCHES the window ("HD IMAGE" / "VIEW IN 3D") and
   * a FULL SCREEN button opens the full-screen view while the picture shows. Left out, the
   * button opens the full-screen view, as it did before D9: the no-3D states, where the
   * window already holds the colour's picture and there is no 3D to switch back to.
   */
  shown?: boolean
  onShownChange?: (shown: boolean) => void
}

/**
 * "HD IMAGE" — the CLO studio render of the selected colour (2026-09-27; in the 3D window
 * since polish D9).
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
 * for every scan would spend a buyer's data on a picture most never open. In the window the
 * picture is the colour's screen-sized copy (`renderScreen`, about a tenth of the bytes,
 * polish F16), so intent on the switch warms THAT, and only FULL SCREEN warms the full
 * render, which only the full-screen view draws.
 *
 * ⚠️ THE SWITCH'S NAME CHANGES WITH ITS WORDS, AND IT HAS NO `aria-pressed`. Its visible
 * label changes ("HD IMAGE" / "VIEW IN 3D"), and WCAG 2.5.3 wants the spoken name to contain
 * the words shown, so the name changes with them; a pressed state on a button whose name also
 * flips would announce the change twice, in contradicting terms.
 */
export function HdImageButton({
  productName,
  colourways,
  selected,
  onSelectColourway,
  shown,
  onShownChange,
}: HdImageButtonProps) {
  const render = selected.render
  const inWindow = selected.renderScreen ?? render
  const switches = shown !== undefined
  const [open, setOpen] = useState(false)
  // Mounted on first open and kept, so the closing transition has an element to run on.
  const [mounted, setMounted] = useState(false)
  const switchRef = useRef<HTMLButtonElement | null>(null)
  const fullRef = useRef<HTMLButtonElement | null>(null)
  const warmed = useRef(new Set<string>())

  const preload = useCallback((url: string | undefined) => {
    if (!url || warmed.current.has(url)) return
    warmed.current.add(url)
    const img = new Image()
    img.decoding = 'async'
    img.src = url
  }, [])

  /** Intent for the full-screen view: its chunk and the full render. */
  const warmFull = useCallback(() => {
    void loadDialog()
    preload(render?.url)
  }, [preload, render])

  /** Intent for the switch: only the picture the window will show. */
  const warmWindow = useCallback(() => preload(inWindow?.url), [preload, inWindow])

  if (!render) return null

  const openFull = () => {
    warmFull()
    setMounted(true)
    setOpen(true)
    track('hd_image_opened', { variant: selected.slug })
  }

  const fullName = `HD image: studio render of ${productName} in ${selected.displayName}`

  return (
    <>
      {switches && shown && (
        <button
          ref={fullRef}
          type="button"
          className="camera-btn hd-image-btn"
          aria-haspopup="dialog"
          aria-label={`Full screen: studio render of ${productName} in ${selected.displayName}`}
          onPointerDown={warmFull}
          onPointerEnter={warmFull}
          onFocus={warmFull}
          onClick={openFull}
        >
          <FrameIcon />
          {/* "FULL" alone below 22rem, as "HD" is: `.hd-image-btn__more` (page.css). */}
          <span>
            FULL<span className="hd-image-btn__more">{' SCREEN'}</span>
          </span>
        </button>
      )}
      <button
        ref={switchRef}
        type="button"
        className="camera-btn hd-image-btn"
        {...(switches ? {} : { 'aria-haspopup': 'dialog' as const })}
        aria-label={switches && shown ? 'View in 3D' : fullName}
        onPointerDown={switches ? warmWindow : warmFull}
        onPointerEnter={switches ? warmWindow : warmFull}
        onFocus={switches ? warmWindow : warmFull}
        onClick={() => (switches ? onShownChange?.(!shown) : openFull())}
      >
        {switches && shown ? (
          <>
            <CubeIcon />
            {/* "3D" alone below 22rem; the name is "View in 3D" either way (VA-09). */}
            <span>
              <span className="hd-image-btn__more">{'VIEW IN '}</span>3D
            </span>
          </>
        ) : (
          <>
            <FrameIcon />
            {/* ONE inline box for the label: in an inline-flex button each loose text run is
                its own flex item, so the 6px gap landed ON TOP of the word space — "HD   IMAGE",
                seen on the iPhone simulator 2026-09-27.

                ⚠️ A NORMAL SPACE, NOT `&nbsp;` (visual audit VA-09, 2026-10-02). The label was
                "HD" + a NO-BREAK space + "IMAGE" while the spoken name below starts "HD image:
                studio render of …" with a plain one, so the visible words and the name differed by
                one character. Lighthouse's label-in-name check compares them strictly and failed
                it, and WCAG 2.5.3 asks that the name contain the words shown. `.hd-image-btn`
                already sets `white-space: nowrap` (page.css), which is what keeps the two words on
                one line, so the no-break space was never doing that job. The space is a JS string so
                it is not trimmed as the edge of a JSX line. */}
            <span>
              HD<span className="hd-image-btn__more">{' IMAGE'}</span>
            </span>
          </>
        )}
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
            returnFocusTo={switches ? fullRef : switchRef}
          />
        </Suspense>
      )}
    </>
  )
}

function FrameIcon() {
  return (
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
  )
}

/** The same cube as the AR button's: "this turns in 3D". */
function CubeIcon() {
  return (
    <svg
      className="hd-image-btn__icon"
      viewBox="0 0 24 24"
      width="12"
      height="12"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M12 3 4 7.5v9l8 4.5 8-4.5v-9zM4 7.5l8 4.5 8-4.5M12 12v9"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  )
}
