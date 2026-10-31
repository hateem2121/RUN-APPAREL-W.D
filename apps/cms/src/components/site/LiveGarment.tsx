'use client'

import { copyModelFrame, playDye, readDyeTiming } from '@run-apparel/shared'
import { createElement, useCallback, useEffect, useRef, useState } from 'react'
import { autoLoadAllowed, type ConnectionHint, garmentTouchAction } from '../../lib/liveGarment'
import type { LiveModel } from '../../lib/projectPublic'
import {
  boundingRadius,
  installAdaptiveNearPlane,
  internalCamera,
} from '../../lib/render/camera-near-plane'
import {
  applyDecalDepthBias,
  askForFrame,
  correlatedThreeMaterials,
} from '../../lib/render/decal-depth-bias'
import { LIVE_RENDER } from '../../lib/render/liveRender'
import { webglAvailable } from '../../lib/webglAvailable'
import { KEEP_WHEEL_ATTRIBUTE } from './SmoothScroll'

/**
 * №03's garment, turning in real 3D (owner, 2026-09-29: "Live 3D on scroll"; decision D24,
 * which reverses 2026-09-07's "a still, not a live model").
 *
 * ⚠️ THE STILL IS STILL THERE, AND IT IS THE FALLBACK FOR EVERYTHING. The server renders the
 * poster figure exactly as before; this island lays a model OVER its picture and never removes
 * it. No JavaScript, no WebGL, a 404, a lost GPU context, automation — every one of them leaves
 * the poster, which is what the page showed before this existed.
 *
 * ⚠️ IT LOADS LATE AND ONLY WHERE IT IS KIND. Nothing is fetched until the section is within a
 * screen of view (the model is megabytes; the first screen must not pay for it), and on a
 * data-saving or 2G connection nothing is fetched until the visitor presses "Turn it in 3D".
 *
 * ⚠️ IT RENDERS AS THE VIEWER RENDERS, and three of the viewer's measured traps are why:
 *   - the draco and KTX2 decoder locations are read from a GLOBAL when model-viewer's module
 *     EVALUATES, so they are seeded BEFORE the import (`.claude/rules/viewer-model-viewer.md`);
 *   - the adaptive near plane and the decal depth bias, from verbatim copies of the viewer's
 *     files (`lib/render/viewerParity.test.ts`), or the print blinks out at this distance;
 *   - no `poster` attribute: model-viewer 4.x paints it and nothing can hide it
 *     (`viewer-layout.md`), so the page's own picture underneath is the poster.
 *
 * ⚠️ THE GARMENT WINS A SWIPE ONLY WHERE THERE IS ROOM TO SCROLL PAST IT (polish M3, 2026-10-04).
 * `touch-action: none`, the garment pages' setting, while the frame fits within about two-thirds
 * of the screen's height (every upright phone); `pan-y` where it does not (a phone held sideways,
 * an upright tablet), so nobody is trapped on it. `lib/liveGarment.ts` has the measurements. Pan
 * is off — this is a showcase, and the link beneath opens the full viewer.
 *
 * ⚠️ AND WHILE IT WINS, A STRIP DOWN EACH SIDE STILL SCROLLS THE PAGE (home page audit,
 * 2026-10-17; the owner: "leave a scroll strip"). A thumb that landed on the garment to scroll the
 * page turned it instead, and the page felt stuck. Each strip is 44px wide, lies over the
 * garment's edge and lets the browser scroll (`touch-action: pan-y`): model-viewer 4.3.1 decides
 * a touch on its own element (SmoothControls.ts), so a touch that starts on the strip never
 * reaches it. On touch screens only (site.css), and gone while zoom is on, which wants every finger.
 *
 * ⚠️ ZOOM WAITS FOR A CLICK (owner, 2026-10-17, after the home page audit: "you cannot zoom into
 * №03"). Zoom was off since PR #94 because a garment that zooms SWALLOWS the wheel and the pinch
 * (model-viewer's docs: `disable-zoom` has "the secondary effect of not swallowing mouse wheel
 * events"), and a visitor scrolling down the page would be stopped on it. Now a click or tap on the
 * garment (or Enter on it) switches zoom on, with the wheel kept from our smooth scroll
 * (`KEEP_WHEEL_ATTRIBUTE`) and a one-finger drag kept for the garment; moving the pointer off
 * it, pressing Escape, tapping elsewhere or scrolling it off the screen switches zoom off again, so
 * the page scrolls as before. A drag never counts as the click.
 * 🟡 AND ONLY WHERE A FRAME IS DRAWN (2026-10-25). Without WebGL the poster shows and there is
 * nothing to zoom, so a click leaves zoom off and the wheel the page's. model-viewer 4.3.1 did
 * that by accident: with no WebGL its camera-target sync threw ("arRenderer is null") on every
 * update, so `disable-zoom` never came off. 4.4.0 fixed the throw, and its zoom then held a
 * no-WebGL page still under the wheel (CI's Firefox, PR #245; reproduced on the Mac's Firefox with
 * `webgl.disabled`: 4.3.1 moved the page 300px, 4.4.0 held it).
 *
 * ⚠️ THE PAN TARGET IS REPLACED BY AN EMPTY ONE, OR THE GARMENT'S CENTRE SCROLLS THE PAGE (PR #200,
 * 2026-10-18). model-viewer 4.3.1 draws an 8px dot, `#default-pan-target`, at the exact centre of
 * the garment (template.js): see-through, but it still takes the pointer, and it lies outside the
 * element its controls listen on. A wheel there, with zoom on, reached no zoom handler and scrolled
 * the page 300px: CI's Chromium failed the zoom test so on two tries, and in CI's own Playwright
 * image the wheel's innermost target was that dot in 1 try of 8 and the controls' layer in the 7
 * that passed. Panning is off here, so the dot is never needed; an empty element in its
 * `pan-target` slot takes its place and takes no pointer at all.
 *
 * ⚠️ A NEW COLOUR SOAKS INTO THE GARMENT FROM THE DOT THAT CHOSE IT, LIKE DYE (owner, 2026-10-19,
 * option A of two recorded on the live hoodie; the 2026-10-17 cross-fade "just changes"; one dye
 * everywhere a garment changes colour since 2026-10-26, packages/shared/src/dyePlayer.ts). The garment's
 * current frame is copied from model-viewer's canvas (`copyModelFrame`, a synchronous `drawImage` of
 * the preserved buffer), laid over it on a canvas, the new colour applied under it, and the copy erased
 * from the chosen dot outwards along a noisy front with a darker wet edge. The copy replaced a
 * `toBlob` picture that encoded and decoded a WebP first: a pick took 283 ms median to show anything
 * at the reference machine's speed (measured 2026-10-26, e2e/liveGarment.spec.ts), against the owner's
 * 100 ms. While the garment still turns by itself it turns a little further with the pick; once a
 * visitor has turned it, it stays where they left it. Under reduced motion, or with no frame to copy,
 * the colour simply changes.
 *
 * ⚠️ IT TURNS UNTIL TOUCHED, THEN STAYS STILL (polish F7, the owner's answer Q20). The first
 * press, drag or arrow key stops the turning for the rest of the visit: model-viewer's own
 * `auto-rotate-delay` would start it again (staging.js, 4.3.1), so the attribute itself goes.
 * A "Drag to turn" hint shows until then. Under reduced motion it never turns at all.
 */
type Phase = 'waiting' | 'offer' | 'preparing' | 'loading' | 'shown' | 'failed'

type ModelViewerElement = HTMLElement & {
  variantName: string | null
  availableVariants?: string[]
  model?: { materials?: readonly { name?: string; isLoaded?: boolean }[] }
  getDimensions?: () => { x: number; y: number; z: number }
  getCameraOrbit?: () => { theta: number; phi: number; radius: number }
  cameraOrbit?: string
}

/** Where a pick came from: the chosen dot's centre on the screen, and its colour. */
export type PickedFrom = { x: number; y: number; swatch: string }

/** How far the dye opens, as a share of its trip, before model-viewer has drawn the new colour. */
const DYE_GATE = 0.2

/** How far an untouched, turning garment turns with a pick (about 29°). */
const PICK_TURN_RAD = 0.5

/** A press that moves further than this is a drag that turned the garment, not a click. */
const CLICK_SLOP_PX = 6

/** A pick's dot, in px from the top-left of `element`'s box; `null` when there is none to read. */
export function pointIn(
  element: { getBoundingClientRect(): { left: number; top: number } },
  picked: PickedFrom | null,
): { x: number; y: number } | null {
  if (!picked) return null
  const box = element.getBoundingClientRect()
  return { x: picked.x - box.left, y: picked.y - box.top }
}

let libraryLoading: Promise<void> | null = null

/** Seed the decoder globals, THEN import, once per page. */
function loadLibrary(): Promise<void> {
  if (!libraryLoading) {
    const global = self as unknown as {
      ModelViewerElement?: { dracoDecoderLocation?: string; ktx2TranscoderLocation?: string }
    }
    global.ModelViewerElement = global.ModelViewerElement ?? {}
    global.ModelViewerElement.dracoDecoderLocation = LIVE_RENDER.dracoDecoderUrl
    global.ModelViewerElement.ktx2TranscoderLocation = LIVE_RENDER.ktx2TranscoderUrl
    libraryLoading = import('@google/model-viewer').then(({ ModelViewerElement }) => {
      const element = ModelViewerElement as unknown as { meshoptDecoderLocation?: string }
      element.meshoptDecoderLocation = LIVE_RENDER.meshoptDecoderUrl
    })
  }
  return libraryLoading
}

export function LiveGarment({
  model,
  label,
  variant = null,
  from,
}: {
  model: LiveModel
  label: string
  /**
   * The colour №03's dots chose (polish D2): its variant inside the one GLB, applied as the model
   * loads and the moment it changes after. `null` keeps the default colour's.
   */
  variant?: string | null
  /** Where the chosen dot is, read as the new colour lands, so the wipe opens from it. */
  from?: () => PickedFrom | null
}) {
  const [phase, setPhase] = useState<Phase>('waiting')
  // The visitor has touched, dragged or keyed the garment: it stops turning for good (F7).
  const [touched, setTouched] = useState(false)
  const [touchAction, setTouchAction] = useState<'none' | 'pan-y'>('pan-y')
  // Zoom is on only after a click on the garment (owner, 2026-10-17); see the header.
  const [zoom, setZoom] = useState(false)
  const layer = useRef<HTMLDivElement>(null)
  // The canvas the dye is drawn on, laid over the garment.
  const dye = useRef<HTMLCanvasElement>(null)
  // The visitor's reduced-motion setting, followed live (see the effect below). The state draws
  // the model's attributes; the ref is the same value for the colour swap's callback.
  const [reducedMotion, setReducedMotion] = useState(false)
  const reduced = useRef(false)
  reduced.current = reducedMotion
  const viewer = useRef<ModelViewerElement | null>(null)
  // Read at load, so a colour chosen while the model was still on its way is the one it opens in.
  const chosen = useRef(variant ?? model.variantId)
  chosen.current = variant ?? model.variantId
  const pickedFrom = useRef(from)
  pickedFrom.current = from
  const turning = useRef(true)
  turning.current = !touched

  // A colour chosen once the model is up switches it in place: model-viewer 4.4.0 applies a
  // `variantName` set at any time, and fires `variant-applied`, which re-applies the depth bias.
  // The old colour's frame lies over the swap and soaks away from the dot (see the header).
  useEffect(() => {
    const mv = viewer.current
    const name = variant ?? model.variantId
    if (phase !== 'shown' || !mv || !name || !mv.availableVariants?.includes(name)) return
    if (mv.variantName === name) return
    const canvas = dye.current
    const old = document.createElement('canvas')
    const picked = pickedFrom.current?.() ?? null
    /*
     * ⚠️ THE FRONT WAITS AT THE DOT UNTIL model-viewer HAS DRAWN THE NEW COLOUR (whole-branch review,
     * 2026-10-26): the old path waited for `variant-applied` before wiping, and without that a heavy
     * garment's dye could sweep over cloth still in the old colour, then snap. And a pick mid-dye
     * starts from what is on screen (the player's takeover), never from a cleared garment.
     */
    const applied = new Promise((done) =>
      mv.addEventListener('variant-applied', done, { once: true }),
    )
    const run =
      !reduced.current && canvas && copyModelFrame(mv, old)
        ? playDye({
            layer: canvas,
            old,
            point: pointIn(canvas, picked),
            swatch: picked?.swatch || null,
            kind: 'full',
            timing: readDyeTiming((token) => getComputedStyle(canvas).getPropertyValue(token)),
            gate: { until: applied, at: DYE_GATE },
          })
        : null
    /*
     * ⚠️ THE NEW COLOUR GOES ON ONE FRAME AFTER THE DYE'S FIRST FRAME, NOT WITH IT (2026-10-26). The
     * first render of a new variant is model-viewer's heaviest frame, and drawn together with the
     * dye's first opening it held the visitor's first change back: 160-178 ms from the press at the
     * reference machine's speed (e2e/liveGarment.spec.ts). The dye's wet front shows at the dot first;
     * the colour is applied under the overlay a frame later, while the dye spreads.
     */
    let alive = true
    const apply = () => {
      if (!alive) return
      mv.variantName = name
      const orbit = mv.getCameraOrbit?.()
      if (run && turning.current && orbit) {
        mv.cameraOrbit = `${orbit.theta + PICK_TURN_RAD}rad ${orbit.phi}rad ${orbit.radius}m`
      }
    }
    if (run) run.firstFrame.then(() => requestAnimationFrame(apply))
    else apply()
    // A newer pick, or the garment leaving: clear this pick's dye at once.
    return () => {
      alive = false
      run?.cancel()
    }
  }, [phase, variant, model.variantId])

  /*
   * Zoom off again when the garment leaves the screen, when a press lands anywhere else on the
   * page, and on Escape (the pointer leaving is in `attach`, below, with the press that switches
   * it on).
   */
  useEffect(() => {
    if (!zoom) return
    const element = layer.current
    if (!element) return
    const off = () => setZoom(false)
    const pressElsewhere = (event: PointerEvent) => {
      if (!element.contains(event.target as Node)) off()
    }
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') off()
    }
    const away = new IntersectionObserver((entries) => {
      if (entries.every((entry) => !entry.isIntersecting)) off()
    })
    away.observe(element)
    document.addEventListener('pointerdown', pressElsewhere)
    document.addEventListener('keydown', onEscape)
    return () => {
      away.disconnect()
      document.removeEventListener('pointerdown', pressElsewhere)
      document.removeEventListener('keydown', onEscape)
    }
  }, [zoom])

  // Re-decided whenever the frame or the screen changes size: turning a phone sideways is the case.
  useEffect(() => {
    const element = layer.current
    if (!element) return
    const decide = () => {
      const screen = Math.min(window.innerHeight, window.visualViewport?.height ?? Infinity)
      setTouchAction(garmentTouchAction(element.getBoundingClientRect().height, screen))
    }
    decide()
    const resize = new ResizeObserver(decide)
    resize.observe(element)
    window.addEventListener('resize', decide)
    return () => {
      resize.disconnect()
      window.removeEventListener('resize', decide)
    }
  }, [])

  /*
   * ⚠️ THE ELEMENT IS RENDERED ONLY AFTER THE LIBRARY HAS LOADED, NOT WHILE IT LOADS. Rendered
   * any earlier, `<model-viewer src>` sits in the page as an unknown tag; model-viewer's module
   * defines the element as it evaluates, the waiting tag upgrades on the spot and fetches its
   * model — all before `loadLibrary`'s `.then` sets `meshoptDecoderLocation`. Every production
   * GLB is Meshopt-compressed, so every one failed ("setMeshoptDecoder must be called before
   * loading compressed files") and the home page showed only the picture. Found 2026-09-29
   * against a copy of production; `e2e/liveGarment.spec.ts` now loads a real compressed model.
   */
  const start = useCallback(() => {
    setPhase('preparing')
    loadLibrary().then(
      () => setPhase('loading'),
      () => setPhase('failed'),
    )
  }, [])

  /*
   * ⚠️ REDUCED MOTION IS FOLLOWED LIVE, NOT READ ONCE (site check-up, 2026-10-22). It was read when
   * the model was prepared, so switching "Reduce motion" on mid-visit left the garment turning until
   * a reload; `OrderStagesList` and `ProductsFilm` already listen for `change`. A state, not just the
   * ref, so the model's `auto-rotate` attribute is drawn again the moment the setting flips (back
   * too). Declared before the loading effect, so the first read still comes first.
   */
  useEffect(() => {
    if (navigator.webdriver) return
    const query = matchMedia('(prefers-reduced-motion: reduce)')
    setReducedMotion(query.matches)
    const onMotionChange = (event: MediaQueryListEvent) => setReducedMotion(event.matches)
    query.addEventListener('change', onMotionChange)
    return () => query.removeEventListener('change', onMotionChange)
  }, [])

  useEffect(() => {
    if (navigator.webdriver) return
    const connection = (navigator as Navigator & { connection?: ConnectionHint }).connection
    if (!autoLoadAllowed(connection)) {
      setPhase('offer')
      return
    }
    const element = layer.current
    if (!element) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return
        observer.disconnect()
        start()
      },
      { rootMargin: '100% 0px' },
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [start])

  const attach = useCallback((element: HTMLElement | null) => {
    if (!element) return
    const mv = element as ModelViewerElement
    viewer.current = mv
    const bias = () => {
      const materials = mv.model?.materials
      if (!materials) return
      applyDecalDepthBias(materials, (m) => correlatedThreeMaterials(m))
      askForFrame(materials)
    }
    const onLoad = () => {
      const name = chosen.current
      if (name && mv.availableVariants?.includes(name)) {
        mv.variantName = name
      }
      const dimensions = mv.getDimensions?.()
      if (dimensions) {
        installAdaptiveNearPlane(
          internalCamera(mv),
          () => mv.getCameraOrbit?.().radius ?? 0,
          boundingRadius(dimensions),
        )
      }
      bias()
      setPhase('shown')
    }
    const onError = () => setPhase('failed')
    // A press is a touch even before it moves anything; the arrow keys report as a camera change.
    let pressedAt: { x: number; y: number } | null = null
    const onPress = (event: PointerEvent) => {
      setTouched(true)
      pressedAt = { x: event.clientX, y: event.clientY }
    }
    // A click that did not turn the garment switches zoom on, where a frame is drawn (the header).
    // Probed at the first click, not on load, and once.
    let draws: boolean | undefined
    const zoomOn = () => {
      draws ??= webglAvailable()
      if (draws) setZoom(true)
    }
    const onClick = (event: MouseEvent) => {
      const moved = pressedAt
        ? Math.hypot(event.clientX - pressedAt.x, event.clientY - pressedAt.y)
        : 0
      pressedAt = null
      if (moved <= CLICK_SLOP_PX) zoomOn()
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Enter') zoomOn()
    }
    // A mouse leaving the garment hands the wheel back to the page; a finger never "leaves".
    const onLeave = (event: PointerEvent) => {
      if (event.pointerType === 'mouse') setZoom(false)
    }
    const onCameraChange = (event: Event) => {
      if ((event as CustomEvent<{ source?: string }>).detail?.source === 'user-interaction') {
        setTouched(true)
      }
    }
    mv.addEventListener('load', onLoad)
    mv.addEventListener('variant-applied', bias)
    mv.addEventListener('error', onError)
    mv.addEventListener('pointerdown', onPress)
    mv.addEventListener('click', onClick)
    mv.addEventListener('keydown', onKey)
    mv.addEventListener('pointerleave', onLeave)
    mv.addEventListener('camera-change', onCameraChange)
    return () => {
      mv.removeEventListener('load', onLoad)
      mv.removeEventListener('variant-applied', bias)
      mv.removeEventListener('error', onError)
      mv.removeEventListener('pointerdown', onPress)
      mv.removeEventListener('click', onClick)
      mv.removeEventListener('keydown', onKey)
      mv.removeEventListener('pointerleave', onLeave)
      mv.removeEventListener('camera-change', onCameraChange)
      viewer.current = null
    }
  }, [])

  const live = phase === 'loading' || phase === 'shown'
  return (
    <div
      className="live-garment"
      ref={layer}
      data-phase={phase}
      data-zoom={zoom ? '' : undefined}
      // Our smooth scroll leaves the wheel to the garment while zoom is on (SmoothScroll.tsx).
      {...(zoom ? { [KEEP_WHEEL_ATTRIBUTE]: '' } : {})}
    >
      {live
        ? createElement(
            'model-viewer',
            {
              ref: attach,
              className: 'live-garment__model',
              src: model.url,
              alt: `${label}, a 3D model you can turn`,
              'camera-controls': '',
              'camera-orbit': model.camera.orbit,
              'camera-target': model.camera.target,
              'field-of-view': model.camera.fieldOfView,
              ...(zoom ? {} : { 'disable-zoom': '' }),
              'disable-pan': '',
              'disable-tap': '',
              'interaction-prompt': 'none',
              // A pinch needs every finger once zoom is on; until then the page keeps its swipe.
              'touch-action': zoom ? 'none' : touchAction,
              ...(reducedMotion || touched
                ? {}
                : { 'auto-rotate': '', 'auto-rotate-delay': '0', 'rotation-per-second': '12deg' }),
              'interpolation-decay': reducedMotion ? 1 : LIVE_RENDER.cameraDecayMs,
              'shadow-intensity': LIVE_RENDER.shadowIntensity,
              'shadow-softness': LIVE_RENDER.shadowSoftness,
              'environment-image': LIVE_RENDER.environmentImage,
              'tone-mapping': LIVE_RENDER.toneMapping,
              exposure: LIVE_RENDER.exposure,
              loading: 'eager',
              reveal: 'auto',
            },
            // Empty, so the centre of the garment is the garment's own (the header).
            createElement('span', { slot: 'pan-target' }),
          )
        : null}
      {phase === 'shown' && !zoom && touchAction === 'none' ? (
        <>
          <span className="live-garment__scroll live-garment__scroll--start" aria-hidden="true" />
          <span className="live-garment__scroll live-garment__scroll--end" aria-hidden="true" />
        </>
      ) : null}
      {live ? (
        // The dye's canvas (dyePlayer.ts): a copy of what is already on screen, so hidden from screen
        // readers; it never takes the pointer, so a drag during a change turns the garment.
        // biome-ignore lint/a11y/noAriaHiddenOnFocusable: a canvas has no tabindex and takes no focus (the garment pages' colour canvas and the website's globe carry the same note).
        <canvas className="dye-layer" ref={dye} aria-hidden="true" />
      ) : null}
      {phase === 'shown' && !touched ? (
        // The garment pages' hint (`.stage__hint` in apps/viewer), in this page's words. Hidden from
        // screen readers as that one is: the model's own label already says it can be turned.
        <p className="live-garment__hint" aria-hidden="true">
          <svg viewBox="0 0 24 24" focusable="false">
            <title>Turn</title>
            <path
              d="M4.5 12a7.5 7.5 0 0 1 12.8-5.3M19.5 12a7.5 7.5 0 0 1-12.8 5.3"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
            <path
              d="M17.3 3.4v3.3h-3.3M6.7 20.6v-3.3h3.3"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          Drag to turn
        </p>
      ) : null}
      {phase === 'offer' ? (
        <button type="button" className="btn btn--ghost live-garment__offer" onClick={start}>
          Turn it in 3D
        </button>
      ) : null}
    </div>
  )
}
