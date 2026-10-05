'use client'

import { createElement, useCallback, useEffect, useRef, useState } from 'react'
import { autoLoadAllowed, type ConnectionHint, garmentTouchAction } from '../../lib/liveGarment'
import type { LiveModel } from '../../lib/projectPublic'
import {
  boundingRadius,
  installAdaptiveNearPlane,
  internalCamera,
} from '../../lib/render/camera-near-plane'
import { applyDecalDepthBias, correlatedThreeMaterials } from '../../lib/render/decal-depth-bias'
import { LIVE_RENDER } from '../../lib/render/liveRender'

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
 * an upright tablet), so nobody is trapped on it. `lib/liveGarment.ts` has the measurements. Zoom
 * and pan are off — this is a showcase, and the link beneath opens the full viewer.
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
  getCameraOrbit?: () => { radius: number }
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
}: {
  model: LiveModel
  label: string
  /**
   * The colour №03's dots chose (polish D2): its variant inside the one GLB, applied as the model
   * loads and the moment it changes after. `null` keeps the default colour's.
   */
  variant?: string | null
}) {
  const [phase, setPhase] = useState<Phase>('waiting')
  // The visitor has touched, dragged or keyed the garment: it stops turning for good (F7).
  const [touched, setTouched] = useState(false)
  const [touchAction, setTouchAction] = useState<'none' | 'pan-y'>('pan-y')
  const layer = useRef<HTMLDivElement>(null)
  const reduced = useRef(false)
  const viewer = useRef<ModelViewerElement | null>(null)
  // Read at load, so a colour chosen while the model was still on its way is the one it opens in.
  const chosen = useRef(variant ?? model.variantId)
  chosen.current = variant ?? model.variantId

  // A colour chosen once the model is up switches it in place: model-viewer 4.3.1 applies a
  // `variantName` set at any time, and fires `variant-applied`, which re-applies the depth bias.
  useEffect(() => {
    const mv = viewer.current
    const name = variant ?? model.variantId
    if (phase !== 'shown' || !mv || !name) return
    if (mv.availableVariants?.includes(name)) mv.variantName = name
  }, [phase, variant, model.variantId])

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

  useEffect(() => {
    if (navigator.webdriver) return
    reduced.current = matchMedia('(prefers-reduced-motion: reduce)').matches
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
      if (materials) applyDecalDepthBias(materials, (m) => correlatedThreeMaterials(m))
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
    const onPress = () => setTouched(true)
    const onCameraChange = (event: Event) => {
      if ((event as CustomEvent<{ source?: string }>).detail?.source === 'user-interaction') {
        setTouched(true)
      }
    }
    mv.addEventListener('load', onLoad)
    mv.addEventListener('variant-applied', bias)
    mv.addEventListener('error', onError)
    mv.addEventListener('pointerdown', onPress)
    mv.addEventListener('camera-change', onCameraChange)
    return () => {
      mv.removeEventListener('load', onLoad)
      mv.removeEventListener('variant-applied', bias)
      mv.removeEventListener('error', onError)
      mv.removeEventListener('pointerdown', onPress)
      mv.removeEventListener('camera-change', onCameraChange)
      viewer.current = null
    }
  }, [])

  const live = phase === 'loading' || phase === 'shown'
  return (
    <div className="live-garment" ref={layer} data-phase={phase}>
      {live
        ? createElement('model-viewer', {
            ref: attach,
            className: 'live-garment__model',
            src: model.url,
            alt: `${label} — a 3D model you can turn`,
            'camera-controls': '',
            'camera-orbit': model.camera.orbit,
            'camera-target': model.camera.target,
            'field-of-view': model.camera.fieldOfView,
            'disable-zoom': '',
            'disable-pan': '',
            'disable-tap': '',
            'interaction-prompt': 'none',
            'touch-action': touchAction,
            ...(reduced.current || touched
              ? {}
              : { 'auto-rotate': '', 'auto-rotate-delay': '0', 'rotation-per-second': '12deg' }),
            'interpolation-decay': reduced.current ? 1 : LIVE_RENDER.cameraDecayMs,
            'shadow-intensity': LIVE_RENDER.shadowIntensity,
            'shadow-softness': LIVE_RENDER.shadowSoftness,
            'environment-image': LIVE_RENDER.environmentImage,
            'tone-mapping': LIVE_RENDER.toneMapping,
            exposure: LIVE_RENDER.exposure,
            loading: 'eager',
            reveal: 'auto',
          })
        : null}
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
