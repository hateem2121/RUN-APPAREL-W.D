import type { ViewerColourway } from '@run-apparel/shared'
import { Component, lazy, type ReactNode, Suspense, useCallback, useRef, useState } from 'react'
import { track } from '../lib/analytics'
import { diagnostic } from '../lib/diagnostic'
import { OfflineReloadNote, ReloadPageButton, useOnline } from './ReloadPageButton'

/*
 * The dialog is a DYNAMIC import, so base-ui and the zoom code never reach the entry
 * chunk: a QR scan on mobile data pays for them only when the visitor asks for the
 * picture. `loadDialog` is called on intent (pointer-down, hover, focus) so the chunk
 * is usually already here by the time the tap lands.
 */
const loadDialog = () => import('./HdImageDialog')
const HdImageDialog = lazy(loadDialog)

/**
 * Catches the full-screen view's code failing to arrive, so the garment page stays.
 *
 * ⚠️ WITHOUT THIS, A FAILED DOWNLOAD WAS A "NO LONGER LIVE" PAGE. Measured 2026-10-14 in
 * Chromium (e2e/hd-image.spec.ts now plants it): with `HdImageDialog`'s file refused by the
 * network, FULL SCREEN made `lazy()` throw, the throw reached the page-wide `ErrorBoundary`,
 * and the whole garment page was replaced by "This reference is no longer live" — the same
 * false sentence as the 8 Oct 2026 translated-page crash. Patchy mobile data does it, and so
 * does a page left open across a deploy, whose old file names no longer exist.
 *
 * It reports, for the reason `ErrorBoundary` gives: a caught error no longer reaches
 * `window.onerror`, so a boundary that stayed silent would hide the failure.
 *
 * It also catches a CRASH inside the full-screen view, not only a download that failed,
 * and that is deliberate: either way the garment page is fine and the view is not, and the
 * note's words are true of both. The report's `reason` tells them apart (a download reads
 * "Failed to fetch dynamically imported module", or "Importing a module script failed" in
 * Safari), so read it before treating a row as a network problem.
 */
class DialogLoadBoundary extends Component<{ children: ReactNode; onFailed: () => void }> {
  override state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  override componentDidCatch(error: Error): void {
    diagnostic('hd-image-load-failed', { reason: error.message || String(error) })
    this.props.onFailed()
  }

  override render(): ReactNode {
    return this.state.failed ? null : this.props.children
  }
}

/**
 * The note shown in place of the full-screen view when its code did not arrive. Only a
 * reload can fetch that code again (`ReloadPageButton`), so it offers one, and a way to
 * close the note and go on with the garment, which is all still here.
 */
function DialogFailedNote({ onClose }: { onClose: () => void }) {
  const online = useOnline()
  return (
    <div className="notice hd-image-failed" role="alert">
      <span className="label">[ NOTE ]</span>
      <div className="hd-image-failed__body">
        <span>The full-screen picture did not load. Reload the page to try again.</span>
        <div className="hd-image-failed__actions">
          <ReloadPageButton online={online} className="btn btn--primary" />
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            Close
          </button>
        </div>
        <OfflineReloadNote online={online} className="reload-page__offline" />
      </div>
    </div>
  )
}

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
  // The view's code failed to arrive; the same address will fail again until a reload
  // (`ReloadPageButton`), so later taps show the note instead of trying.
  const [loadFailed, setLoadFailed] = useState(false)
  const [noteShown, setNoteShown] = useState(false)
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
    // Caught here and reported by `DialogLoadBoundary` when a tap actually needs the view:
    // a warm-up that failed on a hover is not something the visitor saw.
    loadDialog().catch(() => {})
    preload(render?.url)
  }, [preload, render])

  /** Intent for the switch: only the picture the window will show. */
  const warmWindow = useCallback(() => preload(inWindow?.url), [preload, inWindow])

  if (!render) return null

  const openFull = () => {
    if (loadFailed) {
      setNoteShown(true)
      return
    }
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
        {/*
          ⚠️ EACH LABEL CARRIES ITS OWN `key`, OR A TRANSLATED PAGE CRASHES ON THE TAP. Without
          them React kept the one <span> and swapped the words inside it, removing the English
          text nodes one by one — but a browser's translation had already replaced those nodes, so
          the browser threw NotFoundError and the error boundary showed "This reference is no
          longer live" in place of the garment (Spanish Safari, PostHog replay 2026-10-08;
          facebook/react#11538). With a new key React removes the whole <span>, which is still
          the button's child however its words were translated. `e2e/hd-image.spec.ts` plants a
          translation and taps both ways.
        */}
        {switches && shown ? (
          <>
            <CubeIcon />
            {/* "3D" alone below 22rem; the name is "View in 3D" either way (VA-09). */}
            <span key="view-in-3d">
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
            <span key="hd-image">
              HD<span className="hd-image-btn__more">{' IMAGE'}</span>
            </span>
          </>
        )}
      </button>
      {mounted && !loadFailed && (
        <DialogLoadBoundary
          onFailed={() => {
            setLoadFailed(true)
            setNoteShown(true)
            setOpen(false)
          }}
        >
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
        </DialogLoadBoundary>
      )}
      {noteShown && (
        <DialogFailedNote
          onClose={() => {
            setNoteShown(false)
            // Back to the button that opened it, as the dialog does, or focus falls to <body>.
            const from = switches && shown ? fullRef : switchRef
            from.current?.focus({ preventScroll: true })
          }}
        />
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
