import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * The ONE page that both local <model-viewer> pages are built from — the headless
 * render harness (render.ts) and the interactive review server (review-server.ts).
 *
 * WHY THEY SHARE IT. The 2026-09 audit found the two pages answering different
 * questions about the same file. The review page carried production's lighting,
 * the adaptive near plane and the decal depth bias; the harness carried none of
 * them, so a contact sheet reported 0.00% for a fix the review page showed moving
 * 1.8% of the picture (HR-2), and the harness resolved depth 183x more coarsely
 * than the product, inventing sparkle no customer sees (HR-3). Two copies of the
 * same instruments had already drifted apart twice before that (see the history
 * on DECAL_OFFSET_FACTOR below). One source, two callers, is the only shape that
 * cannot drift.
 *
 * ⚠️ THE SCRIPT BELOW MUST CONTAIN ZERO BACKTICKS. Both callers embed it inside a
 * template literal; a backtick in a comment ends the literal, and the resulting
 * error names something else entirely (cost two cycles on 2026-08-29). Pinned by
 * viewer-page.test.ts.
 */

/**
 * The decal depth bias, held equal to `apps/viewer/src/lib/decal-depth-bias.ts`.
 *
 * ⚠️ WITHOUT THIS, A LOCAL PAGE MISREPRESENTS THE PRODUCT — and the review page did,
 * for a day. `apps/viewer` has biased printed cut-outs since 2026-08-27; the review
 * page did not, so a garment judged there showed shattered artwork while the
 * identical file rendered correctly to a customer. That read to the owner as "the
 * depth bias did not work". Measured 2026-08-27 on `p001`, whose decals sit 0.001 mm
 * off the cloth: bias OFF, the chevrons break into fragments; bias ON, solid. On
 * `n001` (0.169 mm off) it changes nothing — the control that makes the first
 * measurement trustworthy.
 *
 * A DELIBERATE SECOND COPY of the viewer's constants: `biome.jsonc` →
 * `noRestrictedImports` forbids a cross-app import outside tests, and this package
 * installs with plain npm inside the shrink container. Pinned equal by a drift test
 * in review-server.test.ts.
 */
export const DECAL_OFFSET_FACTOR = -8
export const DECAL_OFFSET_UNITS = -8
/** The band the VIEWER will obey for a pipeline-supplied overlay bias. */
export const MIN_ABS_OVERLAY_BIAS = 8
export const MAX_ABS_OVERLAY_BIAS = 64

/**
 * The adaptive near plane, held equal to `apps/viewer/src/lib/camera-near-plane.ts`.
 *
 * model-viewer pins `near` at 0.00436 m and never moves it; depth precision falls
 * with z², so printed layers start fighting as you zoom OUT — the sparkle is worst
 * pulled back and vanishes up close. `apps/viewer` gained this on 2026-08-29; the
 * review page did not, and the owner reported the sparkle the same day on a garment
 * that was fine (*"frackling/sparkling while rotating is still present"*). The
 * harness never had it either, which is HR-3 in the 2026-09 audit.
 */
export const NEAR_FRACTION = 0.5
export const MIN_NEAR = 0.01

/**
 * The production environment map, held equal to ENVIRONMENT_IMAGE in
 * `apps/viewer/src/components/Stage.tsx`. Served from `apps/viewer/public/env/` when
 * that tree is present; a page falls back to `neutral` when it is not, so the shrink
 * container — which has no `apps/` and never renders — cannot break on it.
 */
export const PRODUCTION_ENVIRONMENT_FILE = 'studio-soft.hdr'
export const PRODUCTION_ENVIRONMENT_URL = '/env/studio-soft.hdr'

/** Absolute path to the production HDR, or null when the viewer tree is not present. */
export function productionEnvironmentPath(): string | null {
  const file = join(
    dirname(fileURLToPath(import.meta.url)),
    '..',
    '..',
    '..',
    'apps',
    'viewer',
    'public',
    'env',
    PRODUCTION_ENVIRONMENT_FILE,
  )
  return existsSync(file) ? file : null
}

/** The environment URL a page should use right now: the real HDR, or neutral without it. */
export function environmentUrl(): string {
  return productionEnvironmentPath() ? PRODUCTION_ENVIRONMENT_URL : 'neutral'
}

export type LightingMode = 'production' | 'diagnostic' | 'studio'
export const LIGHTING_MODES: readonly LightingMode[] = ['production', 'diagnostic', 'studio']

/**
 * The lighting attributes per mode, on the <model-viewer> element.
 *
 * `production` is what a customer sees — soft studio HDR, neutral tone-mapping,
 * shadow 0.6 — held equal to apps/viewer/src/components/Stage.tsx. `diagnostic` is
 * flat neutral light with shadows off: specular highlights move when geometry
 * changes, so a lit A/B diff lights up everywhere and the flat mode isolates the
 * texture and the UVs beneath it — which is why the artwork evals run in it and
 * their ceilings were calibrated in it. `studio` is a deliberately punchy sales
 * light, NOT what a customer sees, kept because metallic fabric only announces
 * itself when light moves.
 */
export function lightingAttributes(
  mode: LightingMode,
  envUrl: string = environmentUrl(),
): Record<'environment-image' | 'tone-mapping' | 'exposure' | 'shadow-intensity', string> {
  switch (mode) {
    case 'production':
      return {
        'environment-image': envUrl,
        'tone-mapping': 'neutral',
        exposure: '1',
        'shadow-intensity': envUrl === 'neutral' ? '0' : '0.6',
      }
    case 'diagnostic':
      return {
        'environment-image': 'neutral',
        'tone-mapping': 'neutral',
        exposure: '1',
        'shadow-intensity': '0',
      }
    case 'studio':
      return {
        'environment-image': 'legacy',
        'tone-mapping': 'commerce',
        exposure: '1',
        'shadow-intensity': '1',
      }
  }
}

/** The same attributes as HTML, for pasting into a <model-viewer> tag. */
export function lightingAttributeHtml(
  mode: LightingMode,
  envUrl: string = environmentUrl(),
): string {
  return Object.entries(lightingAttributes(mode, envUrl))
    .map(([k, v]) => `${k}="${v}"`)
    .join('\n  ')
}

/**
 * The three modes as a JavaScript object literal for a page's lighting switcher.
 * Single-quoted on purpose: review-server.test.ts asserts the literal text.
 */
export function lightingModesLiteral(envUrl: string = environmentUrl()): string {
  const line = (mode: LightingMode) =>
    `{ ${Object.entries(lightingAttributes(mode, envUrl))
      .map(([k, v]) => `${k.includes('-') ? `'${k}'` : k}: '${v}'`)
      .join(', ')} }`
  return `{
    // Held equal to apps/viewer/src/components/Stage.tsx. If you change one, change both.
    production: ${line('production')},
    // Byte-for-byte the render harness's flat mode: isolates texture and UVs, and hides
    // specular entirely — which is why it is the wrong mode for judging metalness.
    diagnostic: ${line('diagnostic')},
    // NOT what a customer sees — that is 'production' above. A deliberately punchy
    // sales light, kept because metallic fabric only announces itself when light moves.
    studio: ${line('studio')},
  }`
}

/**
 * The camera-freedom attributes every local page must carry.
 *
 * `min-field-of-view`: model-viewer's default is 12deg (25deg in some builds), and a
 * tighter crop was silently ignored until 2026-08-08 — four byte-identical renders
 * at 1.4°/2°/3.1°/4.5°. `max-camera-orbit`: the default radius is `auto`, which clamps
 * at the framed distance, so any view asking to stand further back than ~105% came
 * out byte-identical to 105% (audit HR-5: 110/140/200/500% all one hash). Both are
 * the same trap — the renderer overrides what you asked for and returns a perfectly
 * plausible frame anyway — and both are now explicit and pinned by render.test.ts.
 */
export const CAMERA_FREEDOM_ATTRIBUTES = `min-field-of-view="1deg"
  max-camera-orbit="Infinity 180deg 1000%"`

/**
 * The instruments a local page must carry to render what production renders: the
 * adaptive near plane and the decal depth bias, re-applied on every colourway.
 * Plain JavaScript, NO backticks, to be placed inside a page's module script after
 * `const mv = document.getElementById('mv')`.
 *
 * Exposes `window.__instruments` so a test or a probe can read the state back:
 *   nearPlane   { installed, skipped }   skipped is '' or the reason the install
 *                                        was not possible (model-viewer API changed)
 *   bias        the last applyBias() summary
 *   camera()    the internal three.js camera, so `camera().near` can be read
 *   setBias(on) turn the bias off/on and re-apply (the review page's buttons)
 *
 * If the page has an element with id `bias-report`, the summary is written there
 * too — and, since 2026-09-02, so is a skipped near-plane install (audit HR-7:
 * the bias reported UNREACHABLE on screen, the near plane failed silently).
 */
export function instrumentsScript(): string {
  return `
  // === INSTRUMENTS — shared with the other local page via viewer-page.ts ===
  //
  // THE ADAPTIVE NEAR PLANE. model-viewer pins its near plane at 0.00436 m and never
  // moves it, so the depth step grows with z^2 and printed layers start fighting as
  // you zoom OUT. Without this block a garment sparkles here and is clean for a
  // customer. A GETTER, NOT AN ASSIGNMENT: model-viewer recomputes the near plane on
  // every camera change, so a written value is undone by the first drag. Fails SAFE,
  // and now SAYS SO: if the internals move, the install is skipped, model-viewer's
  // own behaviour stands, and window.__instruments.nearPlane.skipped names why.
  const NEAR_FRACTION = ${NEAR_FRACTION}
  const MIN_NEAR = ${MIN_NEAR}
  let nearPlaneInstalled = false
  let nearPlaneSkipped = ''

  const computeNearPlane = (orbitRadius, radius) => {
    if (!Number.isFinite(orbitRadius) || !Number.isFinite(radius)) return MIN_NEAR
    const clearance = orbitRadius - Math.max(radius, 0)
    if (!(clearance > 0)) return MIN_NEAR
    return Math.max(MIN_NEAR, clearance * NEAR_FRACTION)
  }

  // TWO of model-viewer's internal symbols expose a .camera. Symbol(scene) is the
  // three.js Scene; Symbol(controls) is the orbit controller, which holds the same
  // camera but is NOT an Object3D. Selecting on .camera alone returns whichever
  // enumerates last. Select the SCENE by isObject3D.
  const internalCamera = (element) => {
    if (!element) return null
    for (const sym of Object.getOwnPropertySymbols(element)) {
      const value = element[sym]
      if (value && value.isObject3D && value.camera) return value.camera
    }
    return null
  }

  const installNearPlane = () => {
    if (nearPlaneInstalled) return
    const camera = internalCamera(mv)
    if (!camera || typeof camera.updateProjectionMatrix !== 'function') {
      nearPlaneSkipped = 'camera not found - model-viewer API changed'
      return
    }
    const d = mv.getDimensions ? mv.getDimensions() : null
    if (!d) {
      nearPlaneSkipped = 'getDimensions() unavailable - model-viewer API changed'
      return
    }
    const radius = Math.sqrt(d.x * d.x + d.y * d.y + d.z * d.z) / 2
    try {
      Object.defineProperty(camera, 'near', {
        configurable: true,
        get: () => computeNearPlane(mv.getCameraOrbit().radius, radius),
        set: () => {},
      })
    } catch (error) {
      nearPlaneSkipped = 'camera.near is not configurable: ' + String(error)
      return
    }
    nearPlaneInstalled = true
    camera.updateProjectionMatrix()
  }

  // THE DECAL DEPTH BIAS. A printed cut-out authored flush with the cloth gives the
  // GPU two surfaces at near-identical depth, and the winner changes per pixel and
  // per frame. glTF 2.0 cannot express a polygon offset, so the FILE cannot carry
  // this; three.js can, so the viewer applies it. Kept equal to
  // apps/viewer/src/lib/decal-depth-bias.ts and pinned by review-server.test.ts.
  //
  // RE-APPLIED ON EVERY COLOURWAY, NOT ONLY ON LOAD. model-viewer builds only the
  // arriving variant's materials; anything reachable solely through
  // KHR_materials_variants is a lazy stub holding an EMPTY Set, so its backing
  // three.js material does not exist yet and cannot be biased. Measured on the live
  // garment: 6 of 26 decals reachable on arrival, 20 not. 'variant-applied' fires
  // after the swap resolves, which is exactly when the rest become reachable.
  const OFFSET_FACTOR = ${DECAL_OFFSET_FACTOR}
  const OFFSET_UNITS = ${DECAL_OFFSET_UNITS}
  let biasOn = true
  let biasSummary = null

  const backingOf = (material) => {
    for (const source of [material, Object.getPrototypeOf(material)]) {
      if (!source) continue
      for (const symbol of Object.getOwnPropertySymbols(source)) {
        if (symbol.description !== 'backingThreeMaterial') continue
        const value = material[symbol]
        if (value && typeof value === 'object') return value
      }
    }
    return null
  }

  // Kept equal to readOverlayBias() in apps/viewer/src/lib/decal-depth-bias.ts.
  // Validated, not trusted: a record that is disabled, mis-typed, too weak (-1
  // shipped and did nothing) or the wrong sign (positive pushes the print BEHIND
  // the cloth) is refused.
  const MIN_ABS_OVERLAY_BIAS = ${MIN_ABS_OVERLAY_BIAS}
  const MAX_ABS_OVERLAY_BIAS = ${MAX_ABS_OVERLAY_BIAS}
  const readOverlayBias = (backing) => {
    const raw = backing.userData && backing.userData.depthBias
    if (!raw || typeof raw !== 'object') return null
    if (raw.enabled !== true) return null
    if (typeof raw.factor !== 'number' || typeof raw.units !== 'number') return null
    const inBand = (n) => n <= -MIN_ABS_OVERLAY_BIAS && n >= -MAX_ABS_OVERLAY_BIAS
    if (!inBand(raw.factor) || !inBand(raw.units)) return null
    return { factor: raw.factor, units: raw.units }
  }

  const reportInstruments = () => {
    const report = document.getElementById('bias-report')
    if (!report || !biasSummary) return
    const s = biasSummary
    report.textContent = s.biased + ' surface(s) ' + (biasOn ? 'biased' : 'left un-biased') +
      (s.overlays ? ' [' + s.overlays + ' opaque overlay]' : '') +
      (s.pending ? ', ' + s.pending + ' material(s) awaiting their colourway' : '') +
      (s.unreachable ? ' - ' + s.unreachable + ' UNREACHABLE, model-viewer API changed' : '') +
      (nearPlaneSkipped ? ' - NEAR PLANE NOT INSTALLED: ' + nearPlaneSkipped : '')
    report.style.color = s.unreachable || nearPlaneSkipped ? '#ff9b9b' : '#888'
  }

  const applyBias = () => {
    const materials = mv.model ? mv.model.materials : []
    let biased = 0
    let overlays = 0
    let pending = 0
    let unreachable = 0
    let firstBiased = null
    let firstOverlay = null
    for (const material of materials) {
      const backing = backingOf(material)
      if (!backing) {
        // isLoaded separates the two silences: a lazy variant material is EXPECTED
        // to be unreachable and will be caught by the next 'variant-applied'; a
        // LOADED material with no backing means the internal API has gone.
        if (material.isLoaded) unreachable++
        else pending++
        continue
      }
      // TWO MECHANISMS. alphaTest > 0 IS alphaMode MASK - a printed CUT-OUT, which
      // three.js exposes directly. An OPAQUE printed layer stacked on cloth is
      // invisible from here and is flagged by the PIPELINE in the asset's material
      // extras, which three.js copies to userData. Fabric with nothing in front of
      // it is flagged by neither and is never biased.
      const overlay = readOverlayBias(backing)
      if (!overlay && !(backing.alphaTest > 0)) continue
      backing.polygonOffset = biasOn
      backing.polygonOffsetFactor = biasOn ? (overlay ? overlay.factor : OFFSET_FACTOR) : 0
      backing.polygonOffsetUnits = biasOn ? (overlay ? overlay.units : OFFSET_UNITS) : 0
      backing.needsUpdate = true
      biased++
      if (overlay) overlays++
      if (!firstBiased && backing.alphaTest > 0) firstBiased = material
      if (!firstOverlay && overlay) firstOverlay = material
    }
    // Writing a three.js property does NOT schedule a frame. A no-op write through
    // model-viewer's OWN public setter fires its internal onUpdate, which does - and
    // unlike nudging the camera it cannot move the view being judged. setAlphaCutoff
    // would CHANGE an OPAQUE material, so a garment whose only biased surfaces are
    // opaque overlays gets the baseColorFactor written back to itself instead - the
    // one write measured to repaint at all.
    if (firstBiased) firstBiased.setAlphaCutoff(firstBiased.getAlphaCutoff())
    else if (firstOverlay) {
      const pbr = firstOverlay.pbrMetallicRoughness
      pbr.setBaseColorFactor(pbr.baseColorFactor)
    }
    biasSummary = { biased, overlays, pending, unreachable, on: biasOn }
    reportInstruments()
  }

  window.__instruments = {
    get nearPlane() { return { installed: nearPlaneInstalled, skipped: nearPlaneSkipped } },
    get bias() { return biasSummary },
    camera: () => internalCamera(mv),
    setBias: (on) => { biasOn = on; applyBias() },
    applyBias,
    installNearPlane,
  }
  mv.addEventListener('variant-applied', applyBias)
  mv.addEventListener('load', () => {
    installNearPlane()
    applyBias()
  })
  // === end of the shared instruments ===
`
}
