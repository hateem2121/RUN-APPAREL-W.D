'use client'

import { createElement, useCallback, useEffect, useRef, useState } from 'react'
import { autoLoadAllowed, type ConnectionHint } from '../../lib/liveGarment'
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
 * ⚠️ `touch-action="pan-y"`, NOT the viewer's `none`. A vertical swipe must scroll the home page
 * past the garment; a sideways drag turns it. Zoom and pan are off — this is a showcase, and the
 * link beneath opens the full viewer.
 */
type Phase = 'waiting' | 'offer' | 'loading' | 'shown' | 'failed'

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

export function LiveGarment({ model, label }: { model: LiveModel; label: string }) {
  const [phase, setPhase] = useState<Phase>('waiting')
  const layer = useRef<HTMLDivElement>(null)
  const reduced = useRef(false)

  const start = useCallback(() => {
    setPhase('loading')
    loadLibrary().catch(() => setPhase('failed'))
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

  const attach = useCallback(
    (element: HTMLElement | null) => {
      if (!element) return
      const mv = element as ModelViewerElement
      const bias = () => {
        const materials = mv.model?.materials
        if (materials) applyDecalDepthBias(materials, (m) => correlatedThreeMaterials(m))
      }
      const onLoad = () => {
        if (model.variantId && mv.availableVariants?.includes(model.variantId)) {
          mv.variantName = model.variantId
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
      mv.addEventListener('load', onLoad)
      mv.addEventListener('variant-applied', bias)
      mv.addEventListener('error', onError)
      return () => {
        mv.removeEventListener('load', onLoad)
        mv.removeEventListener('variant-applied', bias)
        mv.removeEventListener('error', onError)
      }
    },
    [model.variantId],
  )

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
            'touch-action': 'pan-y',
            ...(reduced.current
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
      {phase === 'offer' ? (
        <button type="button" className="btn btn--ghost live-garment__offer" onClick={start}>
          Turn it in 3D
        </button>
      ) : null}
    </div>
  )
}
