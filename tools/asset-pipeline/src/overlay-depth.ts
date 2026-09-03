import type { Document, Node as GNode, Primitive } from '@gltf-transform/core'

/**
 * Find printed layers that sit a hair IN FRONT of the cloth, geometrically.
 *
 * THE DEFECT, reported from the first message of 2026-08-27 and still open at the end
 * of 2026-08-28: small white specks scattered over the fabric that appear and vanish as
 * the garment turns. The owner called it "sparkling" and "bits of the garment are
 * missing". A CLO garment stacks TWO OPAQUE surfaces at almost the same depth — a
 * printed layer over a plain fabric layer. Hiding Minecut Motion's `Material_Graphic`
 * turns the skirt 100% white, exposing the layer behind it. The two fight for the depth
 * test, the winner changes per pixel and per frame, and the pale layer punches through.
 * It is NOT in any texture: every base-colour image was measured and none has light
 * flecks on a dark field. See docs/SESSION-2026-08-28.md section 0.
 *
 * ⚠️ WHY NOT MATCH ON THE MATERIAL NAME. `Material_Graphic` is the name on the one
 * garment that was looked at, and this repo has already shipped a name-based artwork
 * check that was silently inert — 0 of 5,048 textures in the catalogue carry a name at
 * all (material-class.ts), and real artwork materials are called `ZZ00000ZZZZ0`, `01`,
 * `Untitled-1` and `ルン ろご。`. A name is a hint. Geometry is a measurement.
 *
 * ⚠️ WHY NOT BIAS EVERY OPAQUE MATERIAL. That is the failure the comment in
 * apps/viewer/src/lib/decal-depth-bias.ts guards: pulling the garment BODY forward
 * pushes it through whatever is behind it. Measured here on p001 — the garment worst
 * affected on the crude "bias everything" screen measurement — the body panel
 * `Fleece_Terry_FCL1PSK002_4036` scores frontness 0.34 and is correctly REJECTED,
 * while its artwork scores 0.58-0.64 and is kept.
 *
 * WHAT IS MEASURED INSTEAD. From area-weighted samples over each primitive, a short ray
 * is cast both ways along the surface normal. A surface sitting immediately in front of
 * another, with a closely aligned normal, IS an overlay whatever its material is called.
 */

/**
 * Share of a primitive's samples that must take part in a near-coplanar stack.
 *
 * Rejects thread and hardware, which touch cloth only along a narrow line. Measured
 * 2026-08-28 across all 16 processed GLBs: topstitch scores 0.13-0.21 and zipper parts
 * 0.03-0.29, against 0.50 for Minecut's graphic layer and 1.01 for KINETIC's.
 */
export const OVERLAY_MIN_LAYERED_FRACTION = 0.3

/**
 * Of the stacked part of a surface, the share that must be the FRONT-most layer.
 *
 * ⚠️ THIS IS A RATIO, NOT A RAW FRACTION, AND THAT IS THE WHOLE POINT. The obvious
 * measure — "what share of this surface has something behind it" — is badly conditioned
 * because CLO writes a printed layer as DOUBLE-SIDED geometry: Minecut's graphic has
 * exactly 2.00x the area of the fabric under it, half of it facing inward, so only 48%
 * of its samples can ever find support. Dividing by the stacked share instead turns that
 * 48% into 0.964 and leaves the cloth beneath it at 0.026 — three orders of separation
 * in a number that does not care how the sheet was authored.
 *
 * Measured, OPAQUE primitives, all 16 files:
 *     Minecut/t003 Material_Graphic  0.964    KINETIC 2Sublimated Sports Bra  0.82
 *     Minecut Default Fabric (cloth) 0.026    p001 Fleece_Terry (body)        0.34
 * 0.75 sits in the empty band between the body panels and the prints.
 */
export const OVERLAY_MIN_FRONTNESS = 0.75

/**
 * How close two surfaces must sit, in millimetres, to fight for the depth test.
 *
 * Real overlays in this catalogue land at 0.05-0.30 mm. Topstitch sits at 0.37-0.50 mm
 * and does not z-fight. n001 — the tightest cloth in the catalogue and the source of the
 * LIVE product — has its front and back panels far outside this.
 */
export const OVERLAY_MAX_GAP_MM = 0.3

/**
 * How parallel the two surfaces must be. Below this they are crossing, not stacked.
 *
 * Rejects topstitch (0.93-0.97, a round cord lying on flat cloth) and zipper hardware.
 * Every real print measures 0.999-1.000.
 */
export const OVERLAY_MIN_ALIGNMENT = 0.98

/** Below this the pipeline REPORTS the primitive and refuses to bias it unattended. */
export const OVERLAY_AUTO_CONFIDENCE = 0.7

/**
 * Pulled TOWARD the camera so the printed layer wins the depth test against the cloth.
 *
 * The SAME value the cut-out bias uses, and for the same measured reason. Biasing
 * `Material_Graphic` on Minecut Motion: none 5.196% white specks, -1 1.586%, -4 0.173%,
 * -8 0.002%, -16 0.000%. -8 is the start of a wide plateau, not a knife edge. On n001,
 * nothing changes at -8 or -64 (0.000% of pixels); the first change is 0.009% at -512.
 */
export const OVERLAY_BIAS_FACTOR = -8
export const OVERLAY_BIAS_UNITS = -8

/** The band the viewer will honour. Never -1 (measured too weak), never positive. */
export const MIN_ABS_BIAS = 8
export const MAX_ABS_BIAS = 64

export interface OverlayMetrics {
  /** Share of samples with an aligned neighbour within OVERLAY_MAX_GAP_MM, either way. */
  layeredFraction: number
  /** back / (back + front). 1 = always the front-most layer of its stack. */
  frontness: number
  /** Median distance to the surface immediately behind, in millimetres. */
  gapMm: number
  /** Median dot product of the two surface normals. */
  alignment: number
}

export interface OverlayVerdict {
  overlay: boolean
  /** 0..1. Below OVERLAY_AUTO_CONFIDENCE the caller must not bias unattended. */
  confidence: number
  reason: string
}

const clamp01 = (n: number): number => (n < 0 ? 0 : n > 1 ? 1 : n)

/**
 * Decide whether one primitive is a printed layer sitting on cloth. PURE, so the whole
 * rule is testable without a GLB, a browser or a GPU — the shape decal-depth-bias.ts
 * already uses for the same reason.
 *
 * ⚠️ THE FAILURE DIRECTION IS DELIBERATE AND IT IS THE SAFETY ARGUMENT. A false
 * positive biases a surface that is ALREADY in front of what is behind it, so it merely
 * wins a fight it was already winning — and anything in front of IT is also detected and
 * biased by the same amount, so relative order is preserved. A false negative leaves the
 * owner looking at white specks. Same reasoning as ARTWORK_MAX_UV_SPAN in
 * artwork-geometry.ts: bias toward catching more.
 */
export function classifyOverlay(m: OverlayMetrics): OverlayVerdict {
  if (!(m.layeredFraction >= OVERLAY_MIN_LAYERED_FRACTION))
    return { overlay: false, confidence: 0, reason: 'not stacked: nothing sits against it' }
  if (!(m.alignment >= OVERLAY_MIN_ALIGNMENT))
    return {
      overlay: false,
      confidence: 0,
      reason: `crossing, not stacked (align ${m.alignment.toFixed(3)})`,
    }
  if (!(m.gapMm <= OVERLAY_MAX_GAP_MM))
    return {
      overlay: false,
      confidence: 0,
      reason: `too far to z-fight (${m.gapMm.toFixed(3)} mm)`,
    }
  if (!(m.frontness >= OVERLAY_MIN_FRONTNESS))
    return {
      overlay: false,
      confidence: 0,
      reason: `this is the surface UNDERNEATH (frontness ${m.frontness.toFixed(3)})`,
    }

  // Confidence is frontness, damped by how comfortably the other three cleared their
  // gates. A print that is unambiguously in front, well inside the z-fight zone and
  // exactly parallel scores ~1; anything marginal drops below OVERLAY_AUTO_CONFIDENCE
  // and goes to the review report instead of being biased unattended.
  const damping = Math.min(
    clamp01(m.layeredFraction / (OVERLAY_MIN_LAYERED_FRACTION + 0.2)),
    clamp01((OVERLAY_MAX_GAP_MM - m.gapMm) / (OVERLAY_MAX_GAP_MM * 0.5)),
    clamp01((m.alignment - OVERLAY_MIN_ALIGNMENT) / 0.015),
  )
  const confidence = m.frontness * damping
  return {
    overlay: true,
    confidence,
    reason: `sits ${m.gapMm.toFixed(3)} mm in front of an aligned surface (frontness ${m.frontness.toFixed(2)})`,
  }
}

/** Is a depth bias value one the viewer is allowed to obey? */
export function isBiasInBand(value: number): boolean {
  return Number.isFinite(value) && value <= -MIN_ABS_BIAS && value >= -MAX_ABS_BIAS
}

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

interface Tri {
  ax: number
  ay: number
  az: number
  bx: number
  by: number
  bz: number
  cx: number
  cy: number
  cz: number
  nx: number
  ny: number
  nz: number
  prim: number
}

export interface PrimitiveReading extends OverlayMetrics {
  /** Index into the flattened primitive list, in glTF mesh/primitive order. */
  index: number
  meshIndex: number
  primitiveIndex: number
  materialName: string
  alphaMode: string
  /** The primitive found immediately behind this one, if any (its material name). */
  supportPrimitive: string | null
  /**
   * The same support primitive by position, so a caller can resolve ITS material per
   * colourway — the material name above is the default material's only. Added
   * 2026-09-03 for the ink report (fix plan Rank 9); absent on an older reading.
   */
  supportMeshIndex?: number | null
  supportPrimitiveIndex?: number | null
  verdict: OverlayVerdict
}

/** Samples per primitive. 500 keeps a 1.3M-triangle garment under two seconds. */
const SAMPLES_PER_PRIMITIVE = 500
/** Normals closer than this are treated as the same surface direction when pairing. */
const PAIRING_ALIGNMENT = 0.85

/**
 * How far to look for a neighbouring surface, in millimetres. DELIBERATELY WIDER THAN
 * OVERLAY_MAX_GAP_MM, and they are not the same question.
 *
 * The gap threshold decides "are these two close enough to fight for the depth test".
 * The SEARCH radius decides "is anything in front of me at all" — and a surface 1 mm
 * ahead still means this primitive is not the front-most layer, so it must be seen.
 * Searching only to the threshold would count such a primitive as unoccluded and could
 * bias a middle layer as if it were the top one.
 */
const SEARCH_MM = 2

type Vec3 = [number, number, number]
// prettier-ignore
type Mat4 = readonly [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
]

function transform(m: Mat4, x: number, y: number, z: number, w: number): Vec3 {
  return [
    m[0] * x + m[4] * y + m[8] * z + m[12] * w,
    m[1] * x + m[5] * y + m[9] * z + m[13] * w,
    m[2] * x + m[6] * y + m[10] * z + m[14] * w,
  ]
}

const IDENTITY: Mat4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]

/**
 * Measure every primitive in a document. Read-only; touches no material and no accessor.
 *
 * ⚠️ THE MODEL IS READ IN ITS OWN UNITS AND CONVERTED. glTF is metres by convention and
 * every processed garment here measures ~1.0 tall, but a file authored in centimetres
 * would put every gap 10x out and silently classify nothing. The scale is taken from the
 * scene bounding box rather than assumed.
 */
export function measureOverlays(document: Document): PrimitiveReading[] {
  const root = document.getRoot()
  const tris: Tri[] = []
  const meta: Array<{
    meshIndex: number
    primitiveIndex: number
    materialName: string
    alphaMode: string
  }> = []
  const bmin: Vec3 = [Infinity, Infinity, Infinity]
  const bmax: Vec3 = [-Infinity, -Infinity, -Infinity]
  const meshIndexOf = new Map(root.listMeshes().map((mesh, i) => [mesh, i]))

  const grow = (v: Vec3) => {
    if (v[0] < bmin[0]) bmin[0] = v[0]
    if (v[1] < bmin[1]) bmin[1] = v[1]
    if (v[2] < bmin[2]) bmin[2] = v[2]
    if (v[0] > bmax[0]) bmax[0] = v[0]
    if (v[1] > bmax[1]) bmax[1] = v[1]
    if (v[2] > bmax[2]) bmax[2] = v[2]
  }

  const addPrimitive = (
    prim: Primitive,
    world: Mat4,
    meshIndex: number,
    primitiveIndex: number,
  ) => {
    const position = prim.getAttribute('POSITION')
    if (!position) return
    const normal = prim.getAttribute('NORMAL')
    const indices = prim.getIndices()
    const count = indices ? indices.getCount() : position.getCount()
    const self = meta.length
    const A: Vec3 = [0, 0, 0],
      B: Vec3 = [0, 0, 0],
      C: Vec3 = [0, 0, 0]
    const NA: Vec3 = [0, 0, 0],
      NB: Vec3 = [0, 0, 0],
      NC: Vec3 = [0, 0, 0]
    for (let i = 0; i + 2 < count; i += 3) {
      const i0 = indices ? indices.getScalar(i) : i
      const i1 = indices ? indices.getScalar(i + 1) : i + 1
      const i2 = indices ? indices.getScalar(i + 2) : i + 2
      position.getElement(i0, A)
      position.getElement(i1, B)
      position.getElement(i2, C)
      const a = transform(world, A[0], A[1], A[2], 1)
      const b = transform(world, B[0], B[1], B[2], 1)
      const c = transform(world, C[0], C[1], C[2], 1)
      grow(a)
      grow(b)
      grow(c)
      let nx: number, ny: number, nz: number
      if (normal) {
        // The SHADING normal, averaged over the face. CLO authors it correctly and it
        // is what lighting uses; triangle winding in these exports is not reliable.
        normal.getElement(i0, NA)
        normal.getElement(i1, NB)
        normal.getElement(i2, NC)
        ;[nx, ny, nz] = transform(
          world,
          NA[0] + NB[0] + NC[0],
          NA[1] + NB[1] + NC[1],
          NA[2] + NB[2] + NC[2],
          0,
        )
      } else {
        const ux = b[0] - a[0],
          uy = b[1] - a[1],
          uz = b[2] - a[2]
        const vx = c[0] - a[0],
          vy = c[1] - a[1],
          vz = c[2] - a[2]
        nx = uy * vz - uz * vy
        ny = uz * vx - ux * vz
        nz = ux * vy - uy * vx
      }
      const len = Math.hypot(nx, ny, nz) || 1
      tris.push({
        ax: a[0],
        ay: a[1],
        az: a[2],
        bx: b[0],
        by: b[1],
        bz: b[2],
        cx: c[0],
        cy: c[1],
        cz: c[2],
        nx: nx / len,
        ny: ny / len,
        nz: nz / len,
        prim: self,
      })
    }
    const material = prim.getMaterial()
    meta.push({
      meshIndex,
      primitiveIndex,
      materialName: material?.getName() ?? '',
      alphaMode: material?.getAlphaMode() ?? 'OPAQUE',
    })
  }

  const walk = (node: GNode, parent: Mat4) => {
    const world = (node.getWorldMatrix?.() as Mat4 | undefined) ?? parent
    const mesh = node.getMesh()
    if (mesh) {
      const meshIndex = meshIndexOf.get(mesh) ?? -1
      mesh.listPrimitives().forEach((prim, i) => {
        addPrimitive(prim, world, meshIndex, i)
      })
    }
    for (const child of node.listChildren()) walk(child, world)
  }
  for (const scene of root.listScenes())
    for (const node of scene.listChildren()) walk(node, IDENTITY)

  if (!tris.length) return []

  // glTF is metres by convention; a garment authored in centimetres measures ~100 tall.
  const height = bmax[1] - bmin[1]
  const mm = height > 10 ? 0.1 : 0.001
  const maxGap = SEARCH_MM * mm
  // Cell size follows the MODEL, not the threshold. Sizing it from the 0.3 mm gap gave
  // 0.6 mm cells and blew past V8's Map entry limit on n001 (1.28 M triangles) before a
  // single ray was cast. A 256-cell grid across the longest axis is ~4 mm on a garment.
  const extent = Math.max(bmax[0] - bmin[0], bmax[1] - bmin[1], bmax[2] - bmin[2])
  const cell = Math.max(maxGap * 2, extent / 256)

  const grid = new Map<string, number[]>()
  tris.forEach((t, i) => {
    const lo: Vec3 = [
      Math.min(t.ax, t.bx, t.cx),
      Math.min(t.ay, t.by, t.cy),
      Math.min(t.az, t.bz, t.cz),
    ]
    const hi: Vec3 = [
      Math.max(t.ax, t.bx, t.cx),
      Math.max(t.ay, t.by, t.cy),
      Math.max(t.az, t.bz, t.cz),
    ]
    for (let x = Math.floor(lo[0] / cell); x <= Math.floor(hi[0] / cell); x++)
      for (let y = Math.floor(lo[1] / cell); y <= Math.floor(hi[1] / cell); y++)
        for (let z = Math.floor(lo[2] / cell); z <= Math.floor(hi[2] / cell); z++) {
          const key = `${x},${y},${z}`
          const bucket = grid.get(key)
          if (bucket) bucket.push(i)
          else grid.set(key, [i])
        }
  })

  /** Nearest aligned surface along a ray, within maxGap. Möller-Trumbore. */
  const cast = (
    px: number,
    py: number,
    pz: number,
    dx: number,
    dy: number,
    dz: number,
    self: number,
  ) => {
    let best = Infinity
    let bestTri: Tri | null = null
    for (let x = Math.floor((px - maxGap) / cell); x <= Math.floor((px + maxGap) / cell); x++)
      for (let y = Math.floor((py - maxGap) / cell); y <= Math.floor((py + maxGap) / cell); y++)
        for (let z = Math.floor((pz - maxGap) / cell); z <= Math.floor((pz + maxGap) / cell); z++) {
          const bucket = grid.get(`${x},${y},${z}`)
          if (!bucket) continue
          for (const i of bucket) {
            const t = tris[i]
            if (!t || t.prim === self) continue
            const e1x = t.bx - t.ax,
              e1y = t.by - t.ay,
              e1z = t.bz - t.az
            const e2x = t.cx - t.ax,
              e2y = t.cy - t.ay,
              e2z = t.cz - t.az
            const hx = dy * e2z - dz * e2y,
              hy = dz * e2x - dx * e2z,
              hz = dx * e2y - dy * e2x
            const det = e1x * hx + e1y * hy + e1z * hz
            if (Math.abs(det) < 1e-14) continue
            const inv = 1 / det
            const sx = px - t.ax,
              sy = py - t.ay,
              sz = pz - t.az
            const u = inv * (sx * hx + sy * hy + sz * hz)
            if (u < 0 || u > 1) continue
            const qx = sy * e1z - sz * e1y,
              qy = sz * e1x - sx * e1z,
              qz = sx * e1y - sy * e1x
            const v = inv * (dx * qx + dy * qy + dz * qz)
            if (v < 0 || u + v > 1) continue
            const hit = inv * (e2x * qx + e2y * qy + e2z * qz)
            if (hit > 1e-7 && hit < best && hit <= maxGap) {
              best = hit
              bestTri = t
            }
          }
        }
    return bestTri ? { distance: best, tri: bestTri } : null
  }

  const byPrimitive = new Map<number, number[]>()
  tris.forEach((t, i) => {
    const bucket = byPrimitive.get(t.prim)
    if (bucket) bucket.push(i)
    else byPrimitive.set(t.prim, [i])
  })

  const median = (values: number[]): number => {
    if (!values.length) return Number.NaN
    const sorted = values.slice().sort((a, b) => a - b)
    return sorted[Math.floor(sorted.length / 2)] ?? Number.NaN
  }

  const readings: PrimitiveReading[] = []
  for (const [primIndex, list] of byPrimitive) {
    const step = Math.max(1, Math.floor(list.length / SAMPLES_PER_PRIMITIVE))
    let samples = 0,
      back = 0,
      front = 0
    const gaps: number[] = []
    const alignments: number[] = []
    const supporters = new Map<number, number>()
    for (let i = 0; i < list.length; i += step) {
      const at = list[i]
      const t = at === undefined ? undefined : tris[at]
      if (!t) continue
      samples++
      const px = (t.ax + t.bx + t.cx) / 3,
        py = (t.ay + t.by + t.cy) / 3,
        pz = (t.az + t.bz + t.cz) / 3
      const behind = cast(px, py, pz, -t.nx, -t.ny, -t.nz, primIndex)
      if (behind) {
        const dot = t.nx * behind.tri.nx + t.ny * behind.tri.ny + t.nz * behind.tri.nz
        if (dot >= PAIRING_ALIGNMENT) {
          back++
          gaps.push(behind.distance / mm)
          alignments.push(dot)
          supporters.set(behind.tri.prim, (supporters.get(behind.tri.prim) ?? 0) + 1)
        }
      }
      const ahead = cast(px, py, pz, t.nx, t.ny, t.nz, primIndex)
      if (ahead) {
        const dot = t.nx * ahead.tri.nx + t.ny * ahead.tri.ny + t.nz * ahead.tri.nz
        if (dot >= PAIRING_ALIGNMENT) front++
      }
    }
    const info = meta[primIndex]
    if (!info) continue
    const layeredFraction = samples ? (back + front) / samples : 0
    const frontness = back + front > 0 ? back / (back + front) : 0
    const metrics: OverlayMetrics = {
      layeredFraction,
      frontness,
      gapMm: median(gaps),
      alignment: median(alignments),
    }
    const top = [...supporters.entries()].sort((a, b) => b[1] - a[1])[0]
    readings.push({
      index: primIndex,
      ...info,
      ...metrics,
      supportPrimitive: top ? (meta[top[0]]?.materialName ?? null) : null,
      supportMeshIndex: top ? (meta[top[0]]?.meshIndex ?? null) : null,
      supportPrimitiveIndex: top ? (meta[top[0]]?.primitiveIndex ?? null) : null,
      verdict: classifyOverlay(metrics),
    })
  }
  return readings.sort((a, b) => a.index - b.index)
}
