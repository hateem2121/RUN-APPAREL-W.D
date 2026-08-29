import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createIO } from './io'
import { PLACEHOLDER_COLOURWAYS, buildPlaceholderTee } from './placeholders'
import { viewerAssetMap } from './render'
import { GLB_HARD_MAX_BYTES as SHARED_HARD_MAX_BYTES } from '../../../packages/shared/src/media'
import {
  MAX_ABS_OVERLAY_BIAS as VIEWER_MAX_ABS_OVERLAY_BIAS,
  MIN_ABS_OVERLAY_BIAS as VIEWER_MIN_ABS_OVERLAY_BIAS,
  OFFSET_FACTOR as VIEWER_OFFSET_FACTOR,
  OFFSET_UNITS as VIEWER_OFFSET_UNITS,
} from '../../../apps/viewer/src/lib/decal-depth-bias'
import {
  MIN_NEAR as VIEWER_MIN_NEAR,
  NEAR_FRACTION as VIEWER_NEAR_FRACTION,
  computeNearPlane as viewerComputeNearPlane,
} from '../../../apps/viewer/src/lib/camera-near-plane'
import {
  DECAL_OFFSET_FACTOR,
  DECAL_OFFSET_UNITS,
  MAX_ABS_OVERLAY_BIAS,
  MIN_ABS_OVERLAY_BIAS,
  MIN_NEAR,
  NEAR_FRACTION,
  PRODUCTION_ENVIRONMENT_URL,
  productionEnvironmentPath,
  HARD_MAX_BYTES,
  type ReviewServerHandle,
  startReviewServer,
} from './review-server'

let dir: string
let handle: ReviewServerHandle

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'review-'))
  const io = await createIO()
  await io.write(
    join(dir, 'ALPHA GARMENT.glb'),
    await buildPlaceholderTee(PLACEHOLDER_COLOURWAYS[0]!),
  )
  await io.write(
    join(dir, 'BETA GARMENT.glb'),
    await buildPlaceholderTee(PLACEHOLDER_COLOURWAYS[1]!),
  )
  handle = await startReviewServer([dir])
}, 30_000)

afterAll(async () => {
  // handle.close(), not server.close(): the latter waits for keep-alive sockets
  // that Node's own fetch never closes, and hangs. See the note on the handle.
  await handle.close()
  await rm(dir, { recursive: true, force: true })
})

describe('a directory that cannot be read is skipped, not fatal', () => {
  it('indexes the good directory when a sibling does not exist', async () => {
    // This is what saved the CLI when `review <dir> --port 4180` passed "4180" as a
    // second directory: readdir throws, the directory is skipped, and the real one
    // still serves. The CLI bug is fixed, but one bad argument must still never
    // stop the other directory being reviewable.
    const h = await startReviewServer([dir, join(dir, 'does-not-exist')])
    try {
      const json = (await (await fetch(`${h.url}api/garments`)).json()) as unknown[]
      expect(json).toHaveLength(2)
    } finally {
      await h.close()
    }
  })
})

describe('the publish ceiling is not a second unpinned copy', () => {
  it('matches packages/shared/src/media.ts', () => {
    // Same arrangement as SIZE_WARNING_BYTES in validate.test.ts: this package
    // cannot depend on @run-apparel/shared, because it is installed with plain
    // `npm install` inside the shrink container's Docker image where a
    // `workspace:*` dependency cannot resolve. Two unpinned copies of a number the
    // CMS enforces is how a file passes here and is rejected on upload.
    expect(HARD_MAX_BYTES).toBe(SHARED_HARD_MAX_BYTES)
  })
})

describe('the decal depth bias is not a second unpinned copy', () => {
  it('matches apps/viewer/src/lib/decal-depth-bias.ts', () => {
    /*
     * ⚠️ THIS PAGE MISREPRESENTED THE PRODUCT FOR A DAY BECAUSE IT HAD NO BIAS AT
     * ALL. `apps/viewer` gained one on 2026-08-27; this page did not, so a garment
     * judged here showed shattered artwork while the identical file rendered
     * correctly to a customer — which read to the owner as "the fix did not work".
     * The header of review-server.ts states the rule this broke: it must be the
     * renderer production uses, or it answers a different question.
     *
     * A second copy for the same reason HARD_MAX_BYTES is one — `biome.jsonc`'s
     * noRestrictedImports forbids the cross-app import outside tests, and this
     * package installs with plain npm inside the container. So pin it here.
     */
    expect(DECAL_OFFSET_FACTOR).toBe(VIEWER_OFFSET_FACTOR)
    expect(DECAL_OFFSET_UNITS).toBe(VIEWER_OFFSET_UNITS)
    // The overlay band too. If this page obeyed a wider band than the product, a
    // garment could be judged clean here and ship still flickering — the same
    // misrepresentation, one mechanism later.
    expect(MIN_ABS_OVERLAY_BIAS).toBe(VIEWER_MIN_ABS_OVERLAY_BIAS)
    expect(MAX_ABS_OVERLAY_BIAS).toBe(VIEWER_MAX_ABS_OVERLAY_BIAS)
  })

  it('matches the adaptive near plane in apps/viewer/src/lib/camera-near-plane.ts', () => {
    /*
     * ⚠️ THE SECOND TIME THIS PAGE MISREPRESENTED THE PRODUCT, THE SAME WAY. The bias
     * drift above cost a day in August. `apps/viewer` then gained the adaptive near
     * plane on 2026-08-29 and this page did not, so `minecut-motion` sparkled while
     * being reviewed here and was clean for a customer — the owner reported it the
     * same day. Two identical failures is a pattern, so pin it.
     */
    expect(NEAR_FRACTION).toBe(VIEWER_NEAR_FRACTION)
    expect(MIN_NEAR).toBe(VIEWER_MIN_NEAR)
  })

  it('the page computes the same near plane the viewer does', async () => {
    // Equal constants prove nothing if the arithmetic diverged. Re-run the page's own
    // expression against the viewer's function over the range a reviewer actually
    // orbits through, including inside the model where both must hit the floor.
    const html = await (await fetch(`${handle.url}g/0/0`)).text()
    const clamp = (orbitRadius: number, radius: number) => {
      const clearance = orbitRadius - Math.max(radius, 0)
      if (!(clearance > 0)) return MIN_NEAR
      return Math.max(MIN_NEAR, clearance * NEAR_FRACTION)
    }
    expect(html).toContain("Object.defineProperty(camera, 'near'")
    expect(html).toContain('installNearPlane()')
    // isObject3D, not `.camera` alone — the trap that costs a debugging session.
    expect(html).toContain('value.isObject3D')
    for (const [orbit, radius] of [
      [2.18, 0.9],
      [1.2, 0.9],
      [0.5, 0.9],
      [10, 0.9],
    ] as const) {
      expect(clamp(orbit, radius)).toBeCloseTo(viewerComputeNearPlane(orbit, radius), 12)
    }
  })

  it('defaults to production lighting, not the punchy sales light', async () => {
    /*
     * ⚠️ THE THIRD DRIFT OF THE SAME KIND, and the one the owner reported directly:
     * *"metallic/shiny feel is present in the whole garment, both of them"* — on files
     * measured to have metallicFactor 0 on every material, before and after the
     * pipeline. It was the LIGHT. This page's "Studio" is `legacy` + `commerce`, far
     * glossier than production's soft HDR + `neutral`, and until 2026-08-29 the page
     * offered no mode that matched production at all.
     */
    const html = await (await fetch(`${handle.url}g/0/0`)).text()
    const hdr = productionEnvironmentPath()
    // The default the page loads with must BE production, not merely be offered.
    expect(html).toContain('<button id="lit-production" aria-pressed="true">Production</button>')
    expect(html).toContain('<button id="lit-diagnostic" aria-pressed="false">Diagnostic</button>')
    expect(html).toContain('tone-mapping="neutral"')
    if (hdr) {
      expect(html).toContain(`environment-image="${PRODUCTION_ENVIRONMENT_URL}"`)
      expect(html).toContain('shadow-intensity="0.6"')
      // And it must actually be served, or the page renders an unlit garment.
      const res = await fetch(`${handle.url.replace(/\/$/, '')}${PRODUCTION_ENVIRONMENT_URL}`)
      expect(res.status).toBe(200)
      // The body, not content-length: sendFile streams, so it sets no length header.
      expect((await res.arrayBuffer()).byteLength).toBeGreaterThan(1000)
    } else {
      // Falls back rather than pointing at a file that is not there.
      expect(html).toContain('environment-image="neutral"')
    }
    // Studio must still exist — it is the only mode a metallic defect shows up in.
    expect(html).toContain('lit-studio')
    expect(html).toContain("'environment-image': 'legacy'")
  })

  it('serves those values into the page, and re-applies them per colourway', async () => {
    // The constants being equal proves nothing if the page never uses them, and a
    // load-time-only application reached 6 of 26 decals on the live garment.
    const html = await (await fetch(`${handle.url}g/0/0`)).text()
    expect(html).toContain(`const OFFSET_FACTOR = ${DECAL_OFFSET_FACTOR}`)
    expect(html).toContain(`const OFFSET_UNITS = ${DECAL_OFFSET_UNITS}`)
    expect(html).toContain("addEventListener('variant-applied', applyBias)")
    // And the SECOND mechanism: an opaque layer the pipeline flagged. Asserting the
    // band constants reach the page is what stops this becoming an unpinned copy —
    // the exact failure the block above records.
    expect(html).toContain(`const MIN_ABS_OVERLAY_BIAS = ${MIN_ABS_OVERLAY_BIAS}`)
    expect(html).toContain(`const MAX_ABS_OVERLAY_BIAS = ${MAX_ABS_OVERLAY_BIAS}`)
    expect(html).toContain('readOverlayBias(backing)')
  })
})

describe('review server', () => {
  it('lists every GLB in the directory on the index', async () => {
    const html = await (await fetch(handle.url)).text()
    expect(html).toContain('ALPHA GARMENT')
    expect(html).toContain('BETA GARMENT')
  })

  it('serves a GLB with the correct content type', async () => {
    const res = await fetch(`${handle.url}model/0/0`)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('model/gltf-binary')
  })

  it('serves the SAME model-viewer build the render harness uses', async () => {
    // If these ever diverge the viewer stops answering "what does the customer
    // see", which is the only question it exists to answer.
    expect(Object.keys(viewerAssetMap())).toContain('/model-viewer.js')
    const res = await fetch(`${handle.url}model-viewer.js`)
    expect(res.status).toBe(200)
  })

  it('serves the meshopt decoder, without which no production GLB renders', async () => {
    // Every production model is --meshopt. A missing decoder here shows up as a
    // blank viewer, which reads as "the garment is broken".
    const res = await fetch(`${handle.url}meshopt_decoder.js`)
    expect(res.status).toBe(200)
  })

  it('serves the draco decoder too, so a local --draco file is not a mystery', async () => {
    const res = await fetch(`${handle.url}draco/draco_decoder.wasm`)
    expect(res.status).toBe(200)
  })

  it('reports the describe readout alongside each garment', async () => {
    const json = (await (await fetch(`${handle.url}api/garments`)).json()) as unknown[]
    expect(Array.isArray(json)).toBe(true)
    expect(json).toHaveLength(2)
    expect(json[0]).toHaveProperty('family')
    expect(json[0]).toHaveProperty('bytes')
    expect(json[0]).toHaveProperty('overHardMax')
    expect(json[0]).toHaveProperty('triangles')
  })

  it('refuses a path outside the served directories', async () => {
    // The server takes a directory from argv and maps INDEXES to files. It must
    // never resolve a caller-supplied path — same class as the /etc/passwd shape
    // recorded in apps/shrink/container/server.ts, where a bare argument became
    // the input path.
    const res = await fetch(`${handle.url}model/0/../../../../etc/passwd`)
    expect(res.status).toBeGreaterThanOrEqual(400)
  })

  it('404s an unknown model index rather than throwing', async () => {
    expect((await fetch(`${handle.url}model/0/999`)).status).toBe(404)
    expect((await fetch(`${handle.url}model/9/0`)).status).toBe(404)
  })

  it('404s a non-numeric index rather than coercing it', async () => {
    expect((await fetch(`${handle.url}model/a/b`)).status).toBe(404)
  })

  it('serves a garment page that wires the decoders before any model loads', async () => {
    // Without this ordering every production GLB fails with "setMeshoptDecoder must
    // be called before loading compressed files" — the bug that made the first real
    // garment render as an empty stage.
    const html = await (await fetch(`${handle.url}g/0/0`)).text()
    expect(html).toContain('meshoptDecoderLocation')
    expect(html).toContain('dracoDecoderLocation')
    expect(html).toContain('<model-viewer')
  })

  it('does not let model-viewer clamp the field of view at its 12deg default', () => {
    // Measured 2026-08-08: anything under 12deg was silently ignored, so a zoom
    // the viewer never applied looked exactly like one it did.
    return fetch(`${handle.url}g/0/0`)
      .then((r) => r.text())
      .then((html) => expect(html).toContain('min-field-of-view="1deg"'))
  })

  it('offers a colourway switcher and a lighting toggle', async () => {
    // The lighting toggle is the point, not decoration: a metallic-fabric defect is
    // invisible under the flat diagnostic light the render harness uses and obvious
    // under a studio environment.
    const html = await (await fetch(`${handle.url}g/0/0`)).text()
    expect(html).toContain('availableVariants')
    expect(html).toContain('lighting')
  })

  it('404s an unknown route rather than serving the index for everything', async () => {
    expect((await fetch(`${handle.url}nope`)).status).toBe(404)
  })
})

describe('⚠️ the viewer must never show a STALE garment', () => {
  it('sends no-store on model files, because these URLs are POSITIONAL', async () => {
    /*
     * COST A WHOLE REVIEW PASS ON 2026-08-28, AND READ AS "the fix does not work".
     *
     * `/model/<dirIndex>/<fileIndex>` identifies a garment by POSITION, so the same URL
     * serves entirely different bytes as soon as the server is restarted on a different
     * directory — which is how this tool is used: rebuild, re-serve, look again. With no
     * cache-control, no ETag and no Last-Modified, the browser is free to reuse what it
     * already has, and it did.
     *
     * The owner reviewed a rebuilt catalogue, saw the defect unchanged, and reported "it
     * looks like you did nothing". Verified afterwards on the same hardware: with the
     * CURRENT bytes the skirt is clean, and toggling the bias off puts the specks back.
     * The renderer was right the whole time; the transport was serving last week's file.
     */
    const res = await fetch(`${handle.url}model/0/0`)
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toContain('no-store')
  })

  it('sends it on the PAGE too, so a stale shell cannot pin an old bias', async () => {
    const res = await fetch(`${handle.url}g/0/0`)
    expect(res.headers.get('cache-control')).toContain('no-store')
  })
})
