/**
 * Move every UV set into 0..1 so the quantizer will take it (fix plan Rank 11; audit
 * CT-08, F1-10, GEO-01).
 *
 * THE DEFECT, MEASURED. glTF-Transform's `quantize()` — which `meshopt()` runs for us —
 * refuses any TEXCOORD accessor outside 0..1 and says so only in a log line nobody reads
 * (`Skipping TEXCOORD_0; out of [0,1] range`). CLO writes UVs in PATTERN space: a fabric
 * panel spans −206..206 pattern units, and a print is authored at u 0..1, v −1..0 with a
 * `KHR_texture_transform` offset of (0, 1) that flips it back. So on the 2026-09-03
 * masters **every one** of the skinsuit's 178 and the bib's 49 UV sets stayed a 32-bit
 * float while positions were 16-bit and normals 8-bit: 1.15 MB of the skinsuit's 2.46 MB
 * of geometry, 2.40 MB of the bib's 4.19 MB — the largest single thing in each file.
 *
 * WHAT THIS DOES. For each group of pieces that must agree (see below) it takes the union
 * of their UV ranges, rewrites the coordinates as `q = (uv − min) / range` — inside 0..1
 * by construction — and folds the inverse into the material's `KHR_texture_transform`,
 * composed with whatever CLO already put there:
 *
 *     CLO samples   T(uv) = offset + R(rotation) · (scale ⊙ uv)          (spec: T·R·S)
 *     we store      uv    = min + range ⊙ q
 *     so            T(uv) = [offset + R·(scale ⊙ min)] + R·((scale ⊙ range) ⊙ q)
 *
 * Every texel is sampled from exactly the same place; the only loss is the quantizer's,
 * and that is why `UV_QUANTIZE_BITS` is 16. gltfpack does the same by default
 * ("KHR_texture_transform … used by default when textures are present, unless disabled
 * via -noq or -vtf"), and glTF-Transform's own tracker proposes it (issue #335: quantize,
 * add the transform, merge any existing offset/scale).
 *
 * WHY A GROUP AND NOT A PIECE. The transform lives on the MATERIAL's texture slots and
 * the coordinates live on the PRIMITIVE, so a material drawn by thirty panels (the bib's
 * `cotton_interlock_190gsm`, thirty pieces, five colourways each) needs one transform
 * that suits all thirty, and a UV accessor shared by two pieces needs one remap. Pieces
 * linked by any material — the default AND every `KHR_materials_variants` mapping, the
 * trap missed twice on 2026-08-27 — or by an accessor are remapped together over the
 * union of their ranges. A print sits in a group of its own (range 1.000); a fabric
 * group can be 413 pattern units wide.
 *
 * PRECISION, THE NUMBERS THAT CHOSE 16 BITS. Error in pattern units is range / 2^bits;
 * on the picture it is that times CLO's own scale times the texture's pixels. The bib's
 * widest fabric group, 413 units at scale 0.015 on a 2048 px weave: 12 bits → 3.1 px,
 * 16 bits → 0.19 px. A print (range 1, scale 1, 2048 px): 12 bits → 0.5 px, 16 → 0.03 px.
 * Sixteen is sub-pixel everywhere in the catalogue; twelve is not. Chosen by rendering,
 * not by file size — see the Rank 11 record in tools/asset-pipeline/CLAUDE.md.
 *
 * ⚠️ AFTER THIS PASS, A RAW UV SPAN MEANS NOTHING. Every accessor spans ≤ 1, so anything
 * that told a print (span 1) from a panel (span 300) by the accessor's own min/max —
 * `findArtworkTexturesByGeometry` and everything built on it — would read every panel
 * as a print. The remap is therefore recorded on the primitive's extras (`uvRemap`), and
 * `uvSpanInPatternSpace` puts the span back into pattern units. Read spans through it.
 *
 * ⚠️ `composeMaterials: false` IS THE NEGATIVE CONTROL, NOT AN OPTION. It rewrites the
 * coordinates and leaves the materials alone, which samples every texture from the wrong
 * place; the browser test renders it to prove the compare step can see a wrong UV at all.
 */
import {
  Accessor,
  type Document,
  type Material,
  type Primitive,
  type Transform,
} from '@gltf-transform/core'
import {
  KHRTextureTransform,
  type MappingList,
  type Transform as TextureTransform,
} from '@gltf-transform/extensions'
import { createTransform, listTextureInfoByMaterial } from '@gltf-transform/functions'

/** Storage precision for every UV set once it is inside 0..1 — see the header. */
export const UV_QUANTIZE_BITS = 16

/** The extras key on a primitive that records how its UV sets were moved. */
export const UV_REMAP_EXTRA = 'uvRemap'

/** How one UV set was moved: `original = offset + scale ⊙ stored`. */
export interface UvRemapRecord {
  offset: [number, number]
  scale: [number, number]
}

export interface UvRemapResult {
  /** Pieces whose UV sets were moved into 0..1. */
  primitives: number
  /** UV accessors rewritten; a shared accessor counts once. */
  accessors: number
  /** Groups of pieces that had to share one transform. */
  groups: number
  /** Texture slots whose KHR_texture_transform was written or composed. */
  transforms: number
  /** UV sets already inside 0..1, left exactly as they were. */
  alreadyInRange: number
  /** Groups left as floats, each with its reason. */
  skipped: string[]
  /** The widest range folded, in pattern units — the quantizer's worst case. */
  widestRange: number
}

/** The offset / rotation / scale triple of a KHR_texture_transform. */
export interface TextureTransformValues {
  offset: [number, number]
  rotation: number
  scale: [number, number]
}

const IDENTITY: TextureTransformValues = { offset: [0, 0], rotation: 0, scale: [1, 1] }

const UV_SEMANTIC = /^TEXCOORD_(\d+)$/

/**
 * Sample a KHR_texture_transform exactly as the spec's shader does:
 * `matrix = translation * rotation * scale`, rotation counter-clockwise.
 */
export function applyTextureTransform(
  t: TextureTransformValues,
  uv: readonly [number, number],
): [number, number] {
  const cos = Math.cos(t.rotation)
  const sin = Math.sin(t.rotation)
  const x = t.scale[0] * uv[0]
  const y = t.scale[1] * uv[1]
  return [t.offset[0] + cos * x - sin * y, t.offset[1] + sin * x + cos * y]
}

/**
 * The transform that samples the same texel from the STORED coordinate as `existing`
 * sampled from the original one, given `original = remap.offset + remap.scale ⊙ stored`.
 */
export function composeTextureTransform(
  existing: TextureTransformValues | null,
  remap: UvRemapRecord,
): TextureTransformValues {
  const base = existing ?? IDENTITY
  const cos = Math.cos(base.rotation)
  const sin = Math.sin(base.rotation)
  const x = base.scale[0] * remap.offset[0]
  const y = base.scale[1] * remap.offset[1]
  return {
    offset: [base.offset[0] + cos * x - sin * y, base.offset[1] + sin * x + cos * y],
    rotation: base.rotation,
    scale: [base.scale[0] * remap.scale[0], base.scale[1] * remap.scale[1]],
  }
}

/** The default material and every colourway mapping of a primitive. */
export function materialsOf(prim: Primitive): Material[] {
  const out: Material[] = []
  const base = prim.getMaterial()
  if (base) out.push(base)
  const list = prim.getExtension<MappingList>('KHR_materials_variants')
  if (list) {
    for (const mapping of list.listMappings()) {
      const material = mapping.getMaterial()
      if (material && !out.includes(material)) out.push(material)
    }
  }
  return out
}

function uvSemantics(prim: Primitive): string[] {
  return prim.listSemantics().filter((s) => UV_SEMANTIC.test(s))
}

/** The remap recorded on a primitive for one UV set, or null when it was never moved. */
export function uvRemapOf(prim: Primitive, semantic: string): UvRemapRecord | null {
  const extras = prim.getExtras() as Record<string, unknown>
  const records = extras[UV_REMAP_EXTRA]
  if (!records || typeof records !== 'object') return null
  const record = (records as Record<string, unknown>)[semantic]
  if (!record || typeof record !== 'object') return null
  const { offset, scale } = record as { offset?: unknown; scale?: unknown }
  const pair = (v: unknown): [number, number] | null =>
    Array.isArray(v) &&
    v.length === 2 &&
    v.every((n) => typeof n === 'number' && Number.isFinite(n))
      ? [v[0] as number, v[1] as number]
      : null
  const o = pair(offset)
  const s = pair(scale)
  return o && s ? { offset: o, scale: s } : null
}

/**
 * The largest span of a UV set, in either axis, in PATTERN units — what the accessor
 * spanned before this pass moved it, or spans now if it never was. Null without the set.
 *
 * Reads the decoded range, never the raw integers: on a quantized accessor `getMin()`
 * returns int16 counts (the 6 km camera of Rank 9), `getMinNormalized()` the values.
 */
export function uvSpanInPatternSpace(prim: Primitive, semantic = 'TEXCOORD_0'): number | null {
  const uv = prim.getAttribute(semantic)
  if (!uv) return null
  const min = uv.getMinNormalized([]) as number[]
  const max = uv.getMaxNormalized([]) as number[]
  const remap = uvRemapOf(prim, semantic)
  const scale = remap?.scale ?? [1, 1]
  const du = ((max[0] ?? 0) - (min[0] ?? 0)) * Math.abs(scale[0])
  const dv = ((max[1] ?? 0) - (min[1] ?? 0)) * Math.abs(scale[1])
  return Math.max(du, dv)
}

interface Range {
  min: [number, number]
  max: [number, number]
}

function inUnitRange(r: Range): boolean {
  return r.min[0] >= 0 && r.min[1] >= 0 && r.max[0] <= 1 && r.max[1] <= 1
}

function widen(into: Range | undefined, min: number[], max: number[]): Range {
  const r = into ?? { min: [Infinity, Infinity], max: [-Infinity, -Infinity] }
  r.min[0] = Math.min(r.min[0], min[0] ?? 0)
  r.min[1] = Math.min(r.min[1], min[1] ?? 0)
  r.max[0] = Math.max(r.max[0], max[0] ?? 0)
  r.max[1] = Math.max(r.max[1], max[1] ?? 0)
  return r
}

function groupName(members: Primitive[]): string {
  const names = new Set<string>()
  for (const prim of members)
    for (const m of materialsOf(prim)) names.add(m.getName() || '(unnamed)')
  const list = [...names]
  return list.length > 3 ? `${list.slice(0, 3).join(', ')} +${list.length - 3}` : list.join(', ')
}

export interface UvRemapOptions {
  onResult?: (result: UvRemapResult) => void
  /** NEGATIVE CONTROL ONLY — see the header. Default true. */
  composeMaterials?: boolean
}

export function remapUvRanges(options: UvRemapOptions = {}): Transform {
  return createTransform('remapUvRanges', async (document: Document): Promise<void> => {
    const result: UvRemapResult = {
      primitives: 0,
      accessors: 0,
      groups: 0,
      transforms: 0,
      alreadyInRange: 0,
      skipped: [],
      widestRange: 0,
    }
    const prims = document
      .getRoot()
      .listMeshes()
      .flatMap((mesh) => mesh.listPrimitives())

    // Pieces linked by a material (any colourway) or by a shared accessor must move
    // together. Union–find over the primitive list.
    const parent = prims.map((_, i) => i)
    const find = (i: number): number => {
      let node = i
      while (parent[node] !== node) {
        parent[node] = parent[parent[node] as number] as number
        node = parent[node] as number
      }
      return node
    }
    const unite = (a: number, b: number) => {
      parent[find(a)] = find(b)
    }
    const firstByMaterial = new Map<Material, number>()
    const firstByAccessor = new Map<Accessor, number>()
    prims.forEach((prim, i) => {
      for (const material of materialsOf(prim)) {
        const j = firstByMaterial.get(material)
        if (j === undefined) firstByMaterial.set(material, i)
        else unite(i, j)
      }
      for (const semantic of uvSemantics(prim)) {
        const accessor = prim.getAttribute(semantic) as Accessor
        const j = firstByAccessor.get(accessor)
        if (j === undefined) firstByAccessor.set(accessor, i)
        else unite(i, j)
      }
    })
    const groups = new Map<number, Primitive[]>()
    prims.forEach((prim, i) => {
      const root = find(i)
      const members = groups.get(root)
      if (members) members.push(prim)
      else groups.set(root, [prim])
    })

    const extension = document.createExtension(KHRTextureTransform)

    for (const members of groups.values()) {
      const ranges = new Map<string, Range>()
      let blocker: string | null = null
      let sets = 0
      for (const prim of members) {
        if (
          prim
            .listTargets()
            .some((target) => target.listSemantics().some((s) => UV_SEMANTIC.test(s)))
        ) {
          blocker = 'a morph target carries UVs of its own'
        }
        for (const semantic of uvSemantics(prim)) {
          const accessor = prim.getAttribute(semantic) as Accessor
          sets++
          if (
            accessor.getNormalized() ||
            accessor.getComponentType() !== Accessor.ComponentType.FLOAT
          ) {
            blocker = `${semantic} is already quantized`
          } else if (accessor.getType() !== 'VEC2') {
            blocker = `${semantic} is ${accessor.getType()}, not VEC2`
          }
          ranges.set(
            semantic,
            widen(
              ranges.get(semantic),
              accessor.getMinNormalized([]) as number[],
              accessor.getMaxNormalized([]) as number[],
            ),
          )
        }
      }
      if (ranges.size === 0) continue
      const remaps = new Map<string, UvRemapRecord>()
      for (const [semantic, range] of ranges) {
        if (inUnitRange(range)) continue
        const span: [number, number] = [range.max[0] - range.min[0], range.max[1] - range.min[1]]
        remaps.set(semantic, {
          offset: [range.min[0], range.min[1]],
          // A flat axis (every vertex at one v) has no range; scale 1 keeps
          // `offset + 1 × 0` equal to the one value it had.
          scale: [span[0] > 0 ? span[0] : 1, span[1] > 0 ? span[1] : 1],
        })
      }
      if (remaps.size === 0) {
        result.alreadyInRange += sets
        continue
      }
      if (blocker) {
        result.skipped.push(`${groupName(members)}: ${blocker}`)
        continue
      }

      // Coordinates, once per accessor.
      const rewritten = new Set<Accessor>()
      for (const prim of members) {
        for (const [semantic, remap] of remaps) {
          const accessor = prim.getAttribute(semantic)
          if (!accessor || rewritten.has(accessor)) continue
          rewritten.add(accessor)
          const source = accessor.getArray() as Float32Array
          const stored = new Float32Array(source.length)
          for (let i = 0; i < source.length; i += 2) {
            stored[i] = clamp01(((source[i] as number) - remap.offset[0]) / remap.scale[0])
            stored[i + 1] = clamp01(((source[i + 1] as number) - remap.offset[1]) / remap.scale[1])
          }
          accessor.setArray(stored)
          result.accessors++
        }
        const extras = { ...(prim.getExtras() as Record<string, unknown>) }
        const record: Record<string, UvRemapRecord> = {}
        for (const [semantic, remap] of remaps)
          if (prim.getAttribute(semantic)) record[semantic] = remap
        extras[UV_REMAP_EXTRA] = record
        prim.setExtras(extras)
        result.primitives++
      }
      for (const remap of remaps.values()) {
        result.widestRange = Math.max(result.widestRange, remap.scale[0], remap.scale[1])
      }
      result.groups++

      if (options.composeMaterials === false) continue
      // Materials, once each: every texture slot that reads a moved set.
      const materials = new Set<Material>()
      for (const prim of members) for (const material of materialsOf(prim)) materials.add(material)
      for (const material of materials) {
        for (const info of listTextureInfoByMaterial(material)) {
          const existing = info.getExtension<TextureTransform>(KHRTextureTransform.EXTENSION_NAME)
          const set = existing?.getTexCoord() ?? info.getTexCoord()
          const remap = remaps.get(`TEXCOORD_${set}`)
          if (!remap) continue
          const composed = composeTextureTransform(
            existing
              ? {
                  offset: [...existing.getOffset()] as [number, number],
                  rotation: existing.getRotation(),
                  scale: [...existing.getScale()] as [number, number],
                }
              : null,
            remap,
          )
          const transform = existing ?? extension.createTransform()
          transform
            .setOffset(composed.offset)
            .setRotation(composed.rotation)
            .setScale(composed.scale)
          if (!existing) info.setExtension(KHRTextureTransform.EXTENSION_NAME, transform)
          result.transforms++
        }
      }
    }

    options.onResult?.(result)
    if (result.primitives > 0) {
      document
        .getLogger()
        .info(
          `remapUvRanges: ${result.accessors} UV set(s) on ${result.primitives} piece(s) moved into 0..1 ` +
            `in ${result.groups} group(s); ${result.transforms} texture transform(s) composed; ` +
            `widest range ${result.widestRange.toFixed(1)}`,
        )
    }
  })
}

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value
}
