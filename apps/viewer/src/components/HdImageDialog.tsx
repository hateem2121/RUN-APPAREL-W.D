import { Dialog } from '@base-ui/react/dialog'
import type { ViewerColourway } from '@run-apparel/shared'
import { type RefObject, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { type Box, IDENTITY, panBy, toggleZoomAt, type View, zoomAt } from '../lib/zoomPan'

interface HdImageDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  productName: string
  colourways: ViewerColourway[]
  selected: ViewerColourway
  onSelectColourway?: (colourway: ViewerColourway) => void
  returnFocusTo: RefObject<HTMLButtonElement | null>
}

/** A second tap within this long, and this close, is a double-tap. */
const DOUBLE_TAP_MS = 300
const DOUBLE_TAP_SLOP_PX = 30
/** A press that moves further than this is a drag, never a tap. */
const TAP_SLOP_PX = 10
/** One wheel notch (deltaY 100) zooms ~16%. */
const WHEEL_ZOOM_RATE = 0.0015
const KEY_ZOOM = 1.5
const KEY_PAN_PX = 48

/** Fit a w×h picture inside a frame, keeping its shape. */
function fitInside(width: number, height: number, frame: Box): Box {
  if (width <= 0 || height <= 0 || frame.width <= 0 || frame.height <= 0)
    return { width: 0, height: 0 }
  const scale = Math.min(frame.width / width, frame.height / height)
  return { width: Math.floor(width * scale), height: Math.floor(height * scale) }
}

/**
 * The HD studio render, full screen, with pinch / double-tap / wheel zoom and pan
 * (2026-09-27). Loaded lazily by `HdImageButton` — nothing here is in the entry chunk.
 *
 * Built on base-ui's Dialog (docs/DECISION-UI-LIBRARIES.md: "a dialog that traps
 * focus" is exactly what that decision reserves it for): Escape, the focus trap, the
 * scroll lock and the screen-reader announcement come from it. The gestures are ours.
 *
 * ⚠️ THE PICTURE ARRIVES IN TWO LAYERS. The colour's poster, already in the browser's
 * cache from the page, is drawn blurred at once; the render fades in over it when it
 * has decoded. Both sit in a box sized from the render's own width and height, so
 * nothing moves when the sharp one lands.
 */
export default function HdImageDialog({
  open,
  onOpenChange,
  productName,
  colourways,
  selected,
  onSelectColourway,
  returnFocusTo,
}: HdImageDialogProps) {
  const render = selected.render
  const withRenders = colourways.filter((c) => c.render !== null)
  const index = withRenders.findIndex((c) => c.slug === selected.slug)
  const canStep = onSelectColourway !== undefined && withRenders.length > 1 && index >= 0

  /*
   * ⚠️ STATE, NOT A REF. base-ui's Portal mounts its children a render AFTER this
   * component commits, and re-renders only its own subtree when it does — so an effect
   * reading `ref.current` ran once, found null, and never ran again: the frame measured
   * 0×0 and the picture never drew (caught by hd-image.spec.ts on all four engines).
   * A state setter as the ref re-renders THIS component the moment the node exists.
   */
  const [frameEl, setFrameEl] = useState<HTMLDivElement | null>(null)
  const [frame, setFrame] = useState<Box>({ width: 0, height: 0 })
  const [view, setView] = useState<View>(IDENTITY)
  // True only for a discrete jump (double-tap, a key), so a finger drag is never eased.
  const [animate, setAnimate] = useState(false)
  const [loaded, setLoaded] = useState(false)

  const box = fitInside(render?.width ?? 0, render?.height ?? 0, frame)

  // A new colour starts fitted and un-loaded.
  const renderUrl = render?.url
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset whenever the picture changes
  useEffect(() => {
    setView(IDENTITY)
    setLoaded(false)
  }, [renderUrl])

  useLayoutEffect(() => {
    const el = frameEl
    if (!el) return
    const measure = () => {
      // The frame's padding is not room for the picture.
      const style = getComputedStyle(el)
      const padX = Number.parseFloat(style.paddingLeft) + Number.parseFloat(style.paddingRight)
      const padY = Number.parseFloat(style.paddingTop) + Number.parseFloat(style.paddingBottom)
      setFrame({ width: el.clientWidth - padX, height: el.clientHeight - padY })
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [frameEl])

  const step = useCallback(
    (delta: number) => {
      if (!canStep || !onSelectColourway) return
      const next = withRenders[(index + delta + withRenders.length) % withRenders.length]
      if (next) onSelectColourway(next)
    },
    [canStep, onSelectColourway, withRenders, index],
  )

  // ── Gestures ────────────────────────────────────────────────────────────
  const [layerEl, setLayerEl] = useState<HTMLDivElement | null>(null)
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const pressStart = useRef<{ x: number; y: number; moved: boolean } | null>(null)
  const lastTap = useRef<{ t: number; x: number; y: number } | null>(null)
  /**
   * ⚠️ WHICH KIND OF POINTER PRESSED LAST. iOS Safari can follow a touch double-tap with
   * its OWN `dblclick` once the page has turned off double-tap-to-zoom (touch-action:
   * none does). Handled by both paths, the pointer path zooms in and the dblclick zooms
   * straight back out — a double-tap that visibly does nothing. Playwright's phone
   * emulation never sends that dblclick, so only a guard written for it can hold; the
   * double-click path therefore answers to a mouse only.
   */
  const lastPointerType = useRef<string>('mouse')

  const local = (clientX: number, clientY: number) => {
    const rect = layerEl?.getBoundingClientRect()
    return rect ? { x: clientX - rect.left, y: clientY - rect.top } : { x: 0, y: 0 }
  }

  const pinchState = () => {
    const [a, b] = [...pointers.current.values()]
    if (!a || !b) return null
    return {
      distance: Math.hypot(a.x - b.x, a.y - b.y),
      mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
    }
  }

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId)
    lastPointerType.current = event.pointerType
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    pressStart.current =
      pointers.current.size === 1 ? { x: event.clientX, y: event.clientY, moved: false } : null
    setAnimate(false)
  }

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const previous = pointers.current.get(event.pointerId)
    if (!previous) return
    const before = pinchState()
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    const start = pressStart.current
    if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) > TAP_SLOP_PX) {
      start.moved = true
    }
    if (pointers.current.size >= 2 && before) {
      const after = pinchState()
      if (!after || before.distance === 0) return
      const mid = local(after.mid.x, after.mid.y)
      setView((v) => {
        const zoomed = zoomAt(v, after.distance / before.distance, mid, box)
        return panBy(zoomed, after.mid.x - before.mid.x, after.mid.y - before.mid.y, box)
      })
      return
    }
    setView((v) => panBy(v, event.clientX - previous.x, event.clientY - previous.y, box))
  }

  const onPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const wasOnly = pointers.current.size === 1
    pointers.current.delete(event.pointerId)
    const start = pressStart.current
    pressStart.current = null
    // Mouse double-clicks come through onDoubleClick; this is the touch and pen path.
    if (!wasOnly || !start || start.moved || event.pointerType === 'mouse') return
    const now = event.timeStamp
    const tap = lastTap.current
    if (
      tap &&
      now - tap.t < DOUBLE_TAP_MS &&
      Math.hypot(event.clientX - tap.x, event.clientY - tap.y) < DOUBLE_TAP_SLOP_PX
    ) {
      lastTap.current = null
      setAnimate(true)
      setView((v) => toggleZoomAt(v, local(event.clientX, event.clientY), box))
      return
    }
    lastTap.current = { t: now, x: event.clientX, y: event.clientY }
  }

  const onPointerCancel = (event: React.PointerEvent<HTMLDivElement>) => {
    pointers.current.delete(event.pointerId)
    pressStart.current = null
  }

  // A native listener, because React's wheel handler is passive and cannot stop the
  // browser's own page zoom on a trackpad pinch (which arrives as ctrl+wheel).
  useEffect(() => {
    const el = layerEl
    if (!el) return
    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      const rect = el.getBoundingClientRect()
      const point = { x: event.clientX - rect.left, y: event.clientY - rect.top }
      setAnimate(false)
      setView((v) => zoomAt(v, Math.exp(-event.deltaY * WHEEL_ZOOM_RATE), point, box))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [layerEl, box])

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const centre = { x: box.width / 2, y: box.height / 2 }
    const zoomed = view.scale > 1
    const act = (next: View) => {
      event.preventDefault()
      setAnimate(true)
      setView(next)
    }
    switch (event.key) {
      case '+':
      case '=':
        return act(zoomAt(view, KEY_ZOOM, centre, box))
      case '-':
        return act(zoomAt(view, 1 / KEY_ZOOM, centre, box))
      case '0':
        return act(IDENTITY)
      case 'ArrowLeft':
        if (zoomed) return act(panBy(view, KEY_PAN_PX, 0, box))
        event.preventDefault()
        return step(-1)
      case 'ArrowRight':
        if (zoomed) return act(panBy(view, -KEY_PAN_PX, 0, box))
        event.preventDefault()
        return step(1)
      case 'ArrowUp':
        if (zoomed) return act(panBy(view, 0, KEY_PAN_PX, box))
        return
      case 'ArrowDown':
        if (zoomed) return act(panBy(view, 0, -KEY_PAN_PX, box))
        return
    }
  }

  if (!render) return null
  const poster = selected.poster
  const title = `Studio render — ${productName} in ${selected.displayName}`
  const previous = canStep
    ? withRenders[(index - 1 + withRenders.length) % withRenders.length]
    : null
  const next = canStep ? withRenders[(index + 1) % withRenders.length] : null

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="hd-image__backdrop" />
        <Dialog.Popup className="hd-image" finalFocus={returnFocusTo} onKeyDown={onKeyDown}>
          <div className="hd-image__bar">
            <Dialog.Title className="hd-image__title">{title}</Dialog.Title>
            <Dialog.Close className="hd-image__close" aria-label="Close the studio render">
              <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">
                <path
                  d="M3 3l10 10M13 3L3 13"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                />
              </svg>
            </Dialog.Close>
          </div>
          <Dialog.Description className="visually-hidden">
            A CLO 3D studio render, not a photograph. Pinch, double-tap, scroll or press plus and
            minus to zoom; drag to move around.
            {canStep ? ' Use the arrows to see the other colours.' : ''}
          </Dialog.Description>

          {/* A tap on the empty space around the picture closes, as a tap on a
              backdrop would: the popup covers the whole screen, so base-ui's own
              outside-press never fires. `target === currentTarget` keeps a tap ON
              the picture (a zoom or a drag) from closing it. */}
          {/* biome-ignore lint/a11y/useKeyWithClickEvents: Escape and the close button are the keyboard route */}
          {/* biome-ignore lint/a11y/noStaticElementInteractions: a pointer convenience only */}
          <div
            className="hd-image__frame"
            ref={setFrameEl}
            onClick={(event) => {
              if (event.target === event.currentTarget) onOpenChange(false)
            }}
          >
            {box.width > 0 && (
              // biome-ignore lint/a11y/noStaticElementInteractions: a pinch/pan surface; the keyboard route is the popup's own +, -, 0 and arrow keys
              <div
                ref={setLayerEl}
                className="hd-image__viewport"
                style={{ width: box.width, height: box.height }}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerCancel}
                onDoubleClick={(event) => {
                  if (lastPointerType.current !== 'mouse') return
                  setAnimate(true)
                  setView((v) => toggleZoomAt(v, local(event.clientX, event.clientY), box))
                }}
              >
                <div
                  className="hd-image__layer"
                  data-animate={animate ? 'true' : undefined}
                  style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}
                >
                  {poster && (
                    <img
                      className="hd-image__poster"
                      src={poster.url}
                      alt=""
                      aria-hidden="true"
                      draggable={false}
                    />
                  )}
                  <img
                    className="hd-image__render"
                    data-loaded={loaded ? 'true' : undefined}
                    src={render.url}
                    alt={render.alt || `${productName} in ${selected.displayName}, studio render`}
                    width={render.width ?? undefined}
                    height={render.height ?? undefined}
                    decoding="async"
                    draggable={false}
                    onLoad={() => setLoaded(true)}
                  />
                </div>
              </div>
            )}
            <p className="hd-image__status" role="status">
              {loaded ? '' : 'LOADING HD IMAGE'}
            </p>
          </div>

          {canStep && previous && next && (
            <div className="hd-image__steps">
              <button
                type="button"
                className="hd-image__step"
                aria-label={`Previous colour: ${previous.displayName}`}
                onClick={() => step(-1)}
              >
                <svg
                  viewBox="0 0 16 16"
                  width="16"
                  height="16"
                  aria-hidden="true"
                  focusable="false"
                >
                  <path d="M10 3L5 8l5 5" fill="none" stroke="currentColor" strokeWidth="1.5" />
                </svg>
              </button>
              <span className="hd-image__count" aria-hidden="true">
                {`${index + 1} / ${withRenders.length}`}
              </span>
              <button
                type="button"
                className="hd-image__step"
                aria-label={`Next colour: ${next.displayName}`}
                onClick={() => step(1)}
              >
                <svg
                  viewBox="0 0 16 16"
                  width="16"
                  height="16"
                  aria-hidden="true"
                  focusable="false"
                >
                  <path d="M6 3l5 5-5 5" fill="none" stroke="currentColor" strokeWidth="1.5" />
                </svg>
              </button>
            </div>
          )}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
