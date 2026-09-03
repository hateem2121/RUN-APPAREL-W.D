import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { Document, type Material, type Mesh } from '@gltf-transform/core'
import { KHRTextureTransform } from '@gltf-transform/extensions'
import sharp from 'sharp'
import { createIO } from './io'

/**
 * Placeholder seed assets for product N001. Real products replace these
 * with pipeline-processed CLO exports and CLO poster renders — the shapes
 * here only exist so the system is demonstrable end-to-end.
 */
export interface PlaceholderColourway {
  slug: string
  displayName: string
  variantId: string
  /** Garment body colour (sRGB hex). */
  body: string
  /** Collar/trim colour (sRGB hex). */
  trim: string
  /**
   * Printed-ink tint for this colourway (sRGB hex).
   *
   * ⚠️ WITHOUT THIS THE FIXTURE COULD NOT EXHIBIT THE COLOURWAY BUG, AND DID NOT.
   * Every colourway used to build byte-identical decal materials, so `dedup()`
   * (the first transform in `buildTransformChain`) merged them into ONE shared
   * material bound as each primitive's default — eager, always reachable.
   * Measured 2026-08-27: fixture **6 MASK decals, 6 eager, 0 lazy**; the live
   * garment **26 MASK, 6 eager, 20 lazy**. A viewer fix that reached only the
   * arriving colourway therefore passed every test while four of five colourways
   * flickered in production.
   *
   * Real CLO exports tint each colourway's ink — the live garment's `Teamwear
   * Logo` carries `[0.42, 0.71, 0.79]` on one colourway and `[0.08, 0.02, 0.02]`
   * on another — which is exactly what keeps `dedup()` from merging them and puts
   * them behind `KHR_materials_variants`, where model-viewer loads them lazily.
   *
   * Alpha is deliberately left at 1: glTF effective alpha is
   * `factor.a * texel.a`, so a factor below 1 would move every artwork alpha
   * measurement in `PLACEHOLDER_ARTWORK` and can make MASK discard a whole
   * material.
   */
  ink: string
}

export const PLACEHOLDER_PRODUCT_CODE = 'N001'

/**
 * FIVE colourways, with production's slugs — changed 2026-08-31, and the count is
 * the point.
 *
 * ⚠️ THIS FIXTURE COULD NOT EXHIBIT A FIVE-COLOURWAY BUG, AND THE LIVE GARMENT HAS
 * FIVE. It carried navy / black / crimson while production ships
 * wine / blush / butter / lime / black, so:
 *
 *   - `apps/viewer/e2e/serve.mjs` mapped five slugs onto THREE variant ids
 *     (blush, butter and lime all resolved to N001-CRIMSON). A swap that reached
 *     the 4th or 5th variant was untestable, which is exactly the shape of the
 *     2026-08-27 production bug where model-viewer built only the ARRIVING
 *     colourway's materials and four of five colourways flickered.
 *   - FOUR OF THE FIVE POSTER URLS 404'd. serve.mjs builds
 *     `n001-<slug>-poster.webp` from ITS slugs; only `black` existed on disk. The
 *     retired-colourway fallback pointed at `wine`'s poster, so that path served a
 *     404 too. Nothing failed, because nothing asserted the poster loaded.
 *
 * ⚠️ `navy` IS DELIBERATELY GONE and must stay gone. `a11y.spec.ts:163` visits
 * `/n001/navy` precisely because it is NOT a real colourway — that is how it reaches
 * the retired-colourway notice. Re-adding it silently turns that test into a second
 * scan of a healthy page.
 *
 * ⚠️ `butter` at #FDFDC8 is the near-white body that `.colourway-tab__swatch` draws
 * its inset ring for. Without a near-white colourway no test can exhibit that class
 * of bug, which shipped once already.
 *
 * ⚠️ EVERY `ink` MUST STAY DISTINCT. Identical ink lets `dedup()` merge the decal
 * materials into one shared, eagerly-loaded material, and the lazy
 * `KHR_materials_variants` path — the one production actually uses — stops being
 * exercised at all. See the `ink` field docs above.
 */
export const PLACEHOLDER_COLOURWAYS: PlaceholderColourway[] = [
  {
    slug: 'wine',
    displayName: 'Wine',
    variantId: 'N001-WINE',
    body: '#825353',
    trim: '#5E3A3A',
    ink: '#FBE7EA',
  },
  {
    slug: 'blush',
    displayName: 'Blush',
    variantId: 'N001-BLUSH',
    body: '#F7CDCD',
    trim: '#D9A5A5',
    ink: '#4A2530',
  },
  {
    slug: 'butter',
    displayName: 'Butter',
    variantId: 'N001-BUTTER',
    body: '#FDFDC8',
    trim: '#D8D89A',
    ink: '#3A3A18',
  },
  {
    slug: 'lime',
    displayName: 'Lime',
    variantId: 'N001-LIME',
    body: '#D6F26B',
    trim: '#A6C24A',
    ink: '#23300C',
  },
  {
    slug: 'black',
    displayName: 'Black',
    variantId: 'N001-BLACK',
    body: '#262727',
    trim: '#3A3B3F',
    ink: '#D8DADF',
  },
]

function srgbToLinear(channel: number): number {
  const c = channel / 255
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

function hexToLinearFactor(hex: string): [number, number, number, number] {
  const value = hex.replace('#', '')
  const r = parseInt(value.slice(0, 2), 16)
  const g = parseInt(value.slice(2, 4), 16)
  const b = parseInt(value.slice(4, 6), 16)
  return [srgbToLinear(r), srgbToLinear(g), srgbToLinear(b), 1]
}

interface BoxSpec {
  w: number
  h: number
  d: number
  cx: number
  cy: number
  cz: number
}

/**
 * A printed chest graphic, as a PNG with a hard alpha cutout.
 *
 * WHY THE PLACEHOLDERS CARRY ONE. Until this existed, every fixture in the repo
 * was four untextured boxes, so the entire artwork path — UV weighting, texture
 * classification, alpha-mode resolution — had nothing to act on and 177 green
 * tests said nothing about it. The graphic is deliberately high-contrast and
 * saturated, because that is what lossy WebP's 4:2:0 chroma bleeds, and it sits
 * on a SECOND UV set, because that is where CLO's "Apply Graphic" puts prints
 * and where decimation used to protect nothing.
 */
function decalSvg(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="256" viewBox="0 0 512 256">
  <rect width="512" height="256" fill="none"/>
  <text x="256" y="150" text-anchor="middle" font-family="monospace" font-size="96" font-weight="bold" letter-spacing="6" fill="#F5F2EC">RUN</text>
  <rect x="96" y="180" width="320" height="10" fill="#E2483C"/>
  <circle cx="256" cy="62" r="26" fill="none" stroke="#F5F2EC" stroke-width="8"/>
</svg>`
}

/**
 * The five artwork materials the real N001 export carries, by measured alpha.
 *
 * WHY FIVE AND NOT ONE. Until 2026-08-05 each seeded colourway carried exactly
 * one artwork material: a clean binary cutout. The shape that actually broke
 * production — `THE EXTRA MILE (Slogan)`, 3.58% mid, classified `graded` and
 * sent down the "sheer fabric" branch — existed nowhere in the seeded chain, so
 * the gate that blocks five BLEND materials had never once been exercised
 * against five of anything. That is the repo's recurring failure: the fixture
 * could not exhibit the production shape.
 *
 * Proportions are the measured ones. Dimensions are scaled down but keep each
 * texture's ASPECT RATIO, because `isArtworkTexture` uses aspect ≥ 3 as one of
 * its three signals and the Slogan is 16:1 — reshaping it to a square would
 * change how it is classified and quietly weaken the fixture.
 *
 * Measured 2026-08-05 from `cycling-all-colours-optimized-3.glb`; the source
 * table is in docs/OPEN-ISSUE-ARTWORK.md.
 */
export interface PlaceholderArtwork {
  name: string
  width: number
  height: number
  /** Fraction of pixels at alpha <= 8. */
  transparent: number
  /** Fraction strictly between the extremes — what the thresholds turn on. */
  mid: number
}

export const PLACEHOLDER_ARTWORK: PlaceholderArtwork[] = [
  // The one that broke production. `graded` (3.58% > BINARY_MID_FRACTION 0.02),
  // rescued only by CUTOUT_MID_FRACTION inside solidifyMaterials. 16:1.
  { name: 'THE EXTRA MILE (Slogan)', width: 972, height: 61, transparent: 0.6638, mid: 0.0358 },
  { name: 'RUN LOGO', width: 508, height: 138, transparent: 0.6701, mid: 0.009 },
  { name: 'Teamwear Logo', width: 456, height: 322, transparent: 0.559, mid: 0.0041 },
  { name: 'TEAM WEAR FRONT LABEL', width: 512, height: 228, transparent: 0.1877, mid: 0.0053 },
  // 0.00% transparent: reaches MASK via the `character === 'binary'` branch and
  // would FAIL the cutout test outright. Keeps a material in the fixture that
  // CUTOUT_MIN_TRANSPARENT would reject, which is the shape that constant exists
  // to catch.
  { name: 'Zipper 3_TapeFabric', width: 137, height: 288, transparent: 0, mid: 0.0067 },
]

/**
 * An alpha channel with the given proportions, laid out in horizontal bands.
 *
 * `profileAlpha` counts pixels and does not care where they sit, so bands are
 * the cheapest arrangement that reproduces a measured distribution exactly. RGB
 * is a flat mid-grey: the alpha is the whole point of this image.
 */
async function artworkAlphaImage(spec: PlaceholderArtwork): Promise<Uint8Array> {
  const { width, height } = spec
  const total = width * height
  const transparentPixels = Math.round(total * spec.transparent)
  const midPixels = Math.round(total * spec.mid)

  const raw = Buffer.alloc(total * 4)
  for (let i = 0; i < total; i++) {
    raw[i * 4] = 232
    raw[i * 4 + 1] = 72
    raw[i * 4 + 2] = 60
    // 0 → transparent, 128 → mid (and below alphaCutoff 0.5, so a MASK that
    // should not have happened deletes it), 255 → opaque.
    raw[i * 4 + 3] = i < transparentPixels ? 0 : i < transparentPixels + midPixels ? 128 : 255
  }
  return new Uint8Array(
    await sharp(raw, { raw: { width, height, channels: 4 } })
      .png()
      .toBuffer(),
  )
}

/**
 * The fabric is mapped the way CLO maps it: in PATTERN-SPACE units, far outside 0..1,
 * with the picture's repeat expressed by a `KHR_texture_transform` on the material.
 * Measured on the 2026-09-03 masters: a skinsuit panel spans −137..164, the bib's
 * −206..206, and every fabric slot carries a transform of scale ~0.015. Until 2026-09-03
 * this fixture mapped each face to the unit square, so the quantizer took every UV set
 * and the seeded garment could never show what production does — every real UV set
 * shipped as 32-bit floats (audit CT-08, fix plan Rank 11). "If production compresses,
 * seed compressed": each face now spans −20..20 units and the weave repeats through
 * the transform, so the seeded file exercises the remap, the composition and the
 * 16-bit storage in every browser the e2e suite runs.
 */
export const PLACEHOLDER_PATTERN_UNITS = 40
/** The CLO-style transform on the fabric: one weave repeat every 8 pattern units. */
export const PLACEHOLDER_FABRIC_TRANSFORM = {
  offset: [0.25, 0.75] as [number, number],
  scale: [1 / 8, 1 / 8] as [number, number],
}

/**
 * The fabric's pictures, sized the way CLO exports them (fix plan Rank 13, audit HE-05):
 * a 4608² weave — past the 4096 cap, so `--max-texture` has something to do on this
 * fixture — and a 2304² normal map, past the 2048 data cap, so `--data-max-texture` does
 * too. Until 2026-09-03 the seeded fabric carried no picture at all and half the shipped
 * preset acted on nothing. Both are two-tone or slow gradients so the PNGs stay small,
 * both are busier than CONSTANT_TEXTURE_MAX_STDEV so the fold pass keeps them, and both
 * are built once per process because every colourway shares them.
 */
export const PLACEHOLDER_WEAVE_PX = 4608
export const PLACEHOLDER_NORMAL_PX = 2304

let weavePromise: Promise<Uint8Array> | null = null
let normalPromise: Promise<Uint8Array> | null = null

/**
 * A two-tone weave in 144-px cells (255 and 228, stdev ~13). ⚠️ COARSE ON PURPOSE: the
 * fold pass judges "constant" on a 256-px thumbnail (texture-fold.ts `channelStats`), and
 * a 4-px checker at this size averages to one flat grey there — measured 2026-09-03, the
 * fold quietly removed the fixture's weave and every texture-cap assertion went blind.
 * A real weave has structure that survives a thumbnail; this one must too.
 */
export const PLACEHOLDER_WEAVE_CELL_PX = PLACEHOLDER_WEAVE_PX / 32
function weaveImage(): Promise<Uint8Array> {
  weavePromise ??= (async () => {
    const size = PLACEHOLDER_WEAVE_PX
    const cell = PLACEHOLDER_WEAVE_CELL_PX
    const raw = Buffer.alloc(size * size * 3)
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 3
        const dark = (Math.floor(x / cell) + Math.floor(y / cell)) % 2 === 0
        raw[i] = raw[i + 1] = raw[i + 2] = dark ? 228 : 255
      }
    }
    return new Uint8Array(
      await sharp(raw, { raw: { width: size, height: size, channels: 3 } })
        .png({ compressionLevel: 9 })
        .toBuffer(),
    )
  })()
  return weavePromise
}

/** A slow-gradient normal map (R and G sway ±20 around 128, B 255): busy enough to keep, cheap to store. */
function normalImage(): Promise<Uint8Array> {
  normalPromise ??= (async () => {
    const size = PLACEHOLDER_NORMAL_PX
    const raw = Buffer.alloc(size * size * 3)
    for (let y = 0; y < size; y++) {
      const g = Math.round(128 + 20 * Math.sin(y / 40))
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 3
        raw[i] = Math.round(128 + 20 * Math.sin(x / 40))
        raw[i + 1] = g
        raw[i + 2] = 255
      }
    }
    return new Uint8Array(
      await sharp(raw, { raw: { width: size, height: size, channels: 3 } })
        .png({ compressionLevel: 9 })
        .toBuffer(),
    )
  })()
  return normalPromise
}

/** UVs for a box: every face gets the full 0–1 square, matching BOX_FACES corner order. */
const FACE_UV: [number, number][] = [
  [0, 1],
  [1, 1],
  [1, 0],
  [0, 0],
]

const BOX_FACES: { n: [number, number, number]; corners: [number, number, number][] }[] = [
  {
    n: [0, 0, 1],
    corners: [
      [-1, -1, 1],
      [1, -1, 1],
      [1, 1, 1],
      [-1, 1, 1],
    ],
  },
  {
    n: [0, 0, -1],
    corners: [
      [1, -1, -1],
      [-1, -1, -1],
      [-1, 1, -1],
      [1, 1, -1],
    ],
  },
  {
    n: [1, 0, 0],
    corners: [
      [1, -1, 1],
      [1, -1, -1],
      [1, 1, -1],
      [1, 1, 1],
    ],
  },
  {
    n: [-1, 0, 0],
    corners: [
      [-1, -1, -1],
      [-1, -1, 1],
      [-1, 1, 1],
      [-1, 1, -1],
    ],
  },
  {
    n: [0, 1, 0],
    corners: [
      [-1, 1, 1],
      [1, 1, 1],
      [1, 1, -1],
      [-1, 1, -1],
    ],
  },
  {
    n: [0, -1, 0],
    corners: [
      [-1, -1, -1],
      [1, -1, -1],
      [1, -1, 1],
      [-1, -1, 1],
    ],
  },
]

function addBoxPrimitive(document: Document, mesh: Mesh, material: Material, spec: BoxSpec): void {
  const buffer = document.getRoot().listBuffers()[0] ?? document.createBuffer()
  const positions: number[] = []
  const normals: number[] = []
  const uvs: number[] = []
  const indices: number[] = []

  for (const face of BOX_FACES) {
    const start = positions.length / 3
    for (const [corner, [ux, uy, uz]] of face.corners.entries()) {
      positions.push(
        spec.cx + (ux * spec.w) / 2,
        spec.cy + (uy * spec.h) / 2,
        spec.cz + (uz * spec.d) / 2,
      )
      normals.push(...face.n)
      const [fu, fv] = FACE_UV[corner] as [number, number]
      uvs.push(
        fu * PLACEHOLDER_PATTERN_UNITS - PLACEHOLDER_PATTERN_UNITS / 2,
        fv * PLACEHOLDER_PATTERN_UNITS - PLACEHOLDER_PATTERN_UNITS / 2,
      )
    }
    indices.push(start, start + 1, start + 2, start, start + 2, start + 3)
  }

  const position = document
    .createAccessor()
    .setType('VEC3')
    .setArray(new Float32Array(positions))
    .setBuffer(buffer)
  const normal = document
    .createAccessor()
    .setType('VEC3')
    .setArray(new Float32Array(normals))
    .setBuffer(buffer)
  // Fabric UVs. Without these the simplifier's attribute-aware path bails on
  // every primitive and --uv-weight is silently inert, which is exactly the
  // failure the seeded fixtures used to hide.
  const uv = document
    .createAccessor()
    .setType('VEC2')
    .setArray(new Float32Array(uvs))
    .setBuffer(buffer)
  const index = document
    .createAccessor()
    .setType('SCALAR')
    .setArray(new Uint16Array(indices))
    .setBuffer(buffer)

  mesh.addPrimitive(
    document
      .createPrimitive()
      .setAttribute('POSITION', position)
      .setAttribute('NORMAL', normal)
      .setAttribute('TEXCOORD_0', uv)
      .setIndices(index)
      .setMaterial(material),
  )
}

/**
 * A flat quad carrying the printed graphic, sitting just off the torso's front
 * face — which is how CLO exports an applied graphic, and why coplanar surfaces
 * are a hazard for this pipeline at all.
 *
 * The quad carries TEXCOORD_0 *and* TEXCOORD_1, and its material samples
 * TEXCOORD_1. That combination is the fixture for H4: before the simplifier
 * weighted every UV set, artwork here was decimated with no protection.
 */
/** Where a print sits on the tee: which face, where on it, and how far proud of it. */
export interface DecalPlacement {
  face: 'front' | 'back' | 'left' | 'right'
  /** Centre along the face's own horizontal axis: x on the torso, z on a sleeve. */
  along: number
  y: number
  /** Distance in front of the face, so stacked prints stay distinct (hazard H6). */
  proud: number
  w: number
  h: number
}

/** The torso's front/back face sits at ±d/2 of the torso box; a sleeve's outer face at cx ± w/2. */
const TORSO_FACE = 0.065
const SLEEVE_OUTER = 0.46

/**
 * The six prints, SPREAD over the garment (fix plan Rank 13, audit HR-4). Until
 * 2026-09-03 every one was a 0.26×0.13 quad on the chest, stacked 0.5 mm apart, so the
 * front print hid the other five and destroying any of them changed no render. Each now
 * has a face of its own — chest, hem, back, both sleeves — sized to its picture.
 */
export const PLACEHOLDER_DECAL_PLACEMENTS: Record<string, DecalPlacement> = {
  'chest-graphic': { face: 'front', along: 0, y: 0.06, proud: 0.002, w: 0.26, h: 0.13 },
  'THE EXTRA MILE (Slogan)': { face: 'front', along: 0, y: -0.14, proud: 0.0025, w: 0.3, h: 0.02 },
  'RUN LOGO': { face: 'back', along: 0, y: 0.12, proud: 0.002, w: 0.2, h: 0.055 },
  'Teamwear Logo': { face: 'left', along: 0, y: 0.2, proud: 0.002, w: 0.09, h: 0.064 },
  'TEAM WEAR FRONT LABEL': { face: 'back', along: 0, y: -0.22, proud: 0.0025, w: 0.12, h: 0.053 },
  'Zipper 3_TapeFabric': { face: 'right', along: 0, y: 0.18, proud: 0.002, w: 0.03, h: 0.063 },
}

/** The quad's corners and normal for a placement, wound counter-clockwise as seen from outside. */
export function decalCorners(p: DecalPlacement): {
  positions: number[]
  normal: [number, number, number]
} {
  const corners: [number, number][] = [
    [-p.w / 2, -p.h / 2],
    [p.w / 2, -p.h / 2],
    [p.w / 2, p.h / 2],
    [-p.w / 2, p.h / 2],
  ]
  const positions: number[] = []
  let normal: [number, number, number] = [0, 0, 1]
  for (const [u, v] of corners) {
    switch (p.face) {
      case 'front':
        positions.push(p.along + u, p.y + v, TORSO_FACE + p.proud)
        normal = [0, 0, 1]
        break
      case 'back':
        // Seen from −z, +x is to the viewer's left: mirror u to keep the winding outward.
        positions.push(p.along - u, p.y + v, -TORSO_FACE - p.proud)
        normal = [0, 0, -1]
        break
      case 'left':
        // Seen from −x looking +x, +z is to the viewer's right.
        positions.push(-SLEEVE_OUTER - p.proud, p.y + v, p.along + u)
        normal = [-1, 0, 0]
        break
      case 'right':
        positions.push(SLEEVE_OUTER + p.proud, p.y + v, p.along - u)
        normal = [1, 0, 0]
        break
    }
  }
  return { positions, normal }
}

function addDecalPrimitive(
  document: Document,
  mesh: Mesh,
  material: Material,
  placement: DecalPlacement,
): void {
  const buffer = document.getRoot().listBuffers()[0] ?? document.createBuffer()
  const { positions: corners, normal } = decalCorners(placement)
  const positions = new Float32Array(corners)
  const normals = new Float32Array([...normal, ...normal, ...normal, ...normal])
  const uv = () => new Float32Array([0, 1, 1, 1, 1, 0, 0, 0])

  // Narrowed to ArrayBuffer: the default `Float32Array` now widens to
  // ArrayBufferLike, which setArray rejects because it could be shared.
  const accessor = (type: 'VEC3' | 'VEC2', array: Float32Array<ArrayBuffer>) =>
    document.createAccessor().setType(type).setArray(array).setBuffer(buffer)

  mesh.addPrimitive(
    document
      .createPrimitive()
      .setAttribute('POSITION', accessor('VEC3', positions))
      .setAttribute('NORMAL', accessor('VEC3', normals))
      // Both sets carry the same coordinates; what matters is that the material
      // samples the SECOND one, exactly as a CLO "Apply Graphic" export does.
      .setAttribute('TEXCOORD_0', accessor('VEC2', uv()))
      .setAttribute('TEXCOORD_1', accessor('VEC2', uv()))
      .setIndices(
        document
          .createAccessor()
          .setType('SCALAR')
          .setArray(new Uint16Array([0, 1, 2, 0, 2, 3]))
          .setBuffer(buffer),
      )
      .setMaterial(material),
  )
}

/**
 * Build one stylised placeholder tee GLB for a colourway. Primitive order
 * (torso, sleeve L, sleeve R, collar) is identical across colourways, which
 * is exactly the property real CLO exports must have for variant merging.
 */
export async function buildPlaceholderTee(colourway: PlaceholderColourway): Promise<Document> {
  const document = new Document()
  document.createBuffer()

  // A weave on the body, tiled through a CLO-style transform over pattern-space UVs
  // (see PLACEHOLDER_PATTERN_UNITS). Near-white so the factor still decides the
  // colour, and busier than CONSTANT_TEXTURE_MAX_STDEV so the fold pass keeps it.
  const weaveTexture = document
    .createTexture('fabric-weave')
    .setImage(await weaveImage())
    .setMimeType('image/png')
  const normalTexture = document
    .createTexture('fabric-normal')
    .setImage(await normalImage())
    .setMimeType('image/png')
  const body = document
    .createMaterial(`${colourway.variantId}-BODY`)
    .setBaseColorTexture(weaveTexture)
    .setNormalTexture(normalTexture)
    .setBaseColorFactor(hexToLinearFactor(colourway.body))
    .setRoughnessFactor(0.85)
    .setMetallicFactor(0)
    .setDoubleSided(true)
  body
    .getBaseColorTextureInfo()
    ?.setExtension(
      KHRTextureTransform.EXTENSION_NAME,
      document
        .createExtension(KHRTextureTransform)
        .createTransform()
        .setOffset(PLACEHOLDER_FABRIC_TRANSFORM.offset)
        .setScale(PLACEHOLDER_FABRIC_TRANSFORM.scale),
    )
  const trim = document
    .createMaterial(`${colourway.variantId}-TRIM`)
    .setBaseColorFactor(hexToLinearFactor(colourway.trim))
    .setRoughnessFactor(0.8)
    .setMetallicFactor(0)
    .setDoubleSided(true)

  // The printed graphic. alphaMode BLEND with a hard cutout is precisely the
  // combination the pipeline has to resolve correctly: forcing it OPAQUE fills
  // the cutout in, and leaving it BLEND sorts badly in <model-viewer>. The
  // pipeline should land on MASK.
  const decalImage = await sharp(Buffer.from(decalSvg())).png().toBuffer()
  const decalTexture = document
    .createTexture('chest-graphic')
    .setImage(new Uint8Array(decalImage))
    .setMimeType('image/png')
  const decal = document
    .createMaterial(`${colourway.variantId}-GRAPHIC`)
    .setBaseColorTexture(decalTexture)
    // Per-colourway ink, so dedup cannot merge this with the other colourways'
    // copies — see `ink` on PlaceholderColourway for why that matters.
    .setBaseColorFactor(hexToLinearFactor(colourway.ink))
    .setAlphaMode('BLEND')
    .setRoughnessFactor(0.6)
    .setMetallicFactor(0)
  decal.getBaseColorTextureInfo()?.setTexCoord(1)

  // The five real artwork profiles, each on its own quad and its own second UV
  // set — the combination the gate refuses when any one of them ends on BLEND.
  // All start on BLEND because that is how CLO exports them; resolving all five
  // to MASK/0.5 is what the pipeline has to get right.
  const artworkMaterials: Material[] = []
  for (const spec of PLACEHOLDER_ARTWORK) {
    const texture = document
      .createTexture(spec.name)
      .setImage(await artworkAlphaImage(spec))
      .setMimeType('image/png')
    const material = document
      .createMaterial(`${colourway.variantId}-${spec.name}`)
      .setBaseColorTexture(texture)
      .setBaseColorFactor(hexToLinearFactor(colourway.ink))
      .setAlphaMode('BLEND')
      .setRoughnessFactor(0.6)
      .setMetallicFactor(0)
    material.getBaseColorTextureInfo()?.setTexCoord(1)
    artworkMaterials.push(material)
  }

  const mesh = document.createMesh('garment')
  addBoxPrimitive(document, mesh, body, { w: 0.52, h: 0.66, d: 0.13, cx: 0, cy: 0, cz: 0 })
  addBoxPrimitive(document, mesh, body, { w: 0.2, h: 0.24, d: 0.12, cx: -0.36, cy: 0.18, cz: 0 })
  addBoxPrimitive(document, mesh, body, { w: 0.2, h: 0.24, d: 0.12, cx: 0.36, cy: 0.18, cz: 0 })
  addBoxPrimitive(document, mesh, trim, { w: 0.18, h: 0.045, d: 0.135, cx: 0, cy: 0.335, cz: 0 })
  // Just proud of the torso's front face, as CLO exports one; the artwork quads each
  // on their own face (PLACEHOLDER_DECAL_PLACEMENTS), a little proud of it — coplanar-ish
  // with the cloth, the z-fighting hazard H6 is about — without being coincident.
  addDecalPrimitive(document, mesh, decal, PLACEHOLDER_DECAL_PLACEMENTS['chest-graphic']!)
  for (const [index, material] of artworkMaterials.entries()) {
    const spec = PLACEHOLDER_ARTWORK[index]!
    addDecalPrimitive(document, mesh, material, PLACEHOLDER_DECAL_PLACEMENTS[spec.name]!)
  }

  const scene = document.createScene('Scene')
  scene.addChild(document.createNode('garment').setMesh(mesh))

  // Thread, as CLO exports it: its own `Topstitch_*` mesh of very many small triangles
  // under a flat material (fix plan Rank 13, audit HE-05), so `--stitch` — half of every
  // shipped preset — has something to decimate on this fixture. 1,200 triangles along
  // the front hem; a real export is 99.97% of this.
  const stitchMesh = document.createMesh('Topstitch_1')
  addTopstitchPrimitive(
    document,
    stitchMesh,
    document
      .createMaterial('Default Topstitch')
      .setBaseColorFactor([0.35, 0.35, 0.35, 1])
      .setRoughnessFactor(0.9)
      .setMetallicFactor(0),
  )
  scene.addChild(document.createNode('Topstitch_1').setMesh(stitchMesh))
  return document
}

/** Triangles in the fixture's stitch band; the `--stitch` budget must have something to bind on. */
export const PLACEHOLDER_STITCH_TRIANGLES = 1200

function addTopstitchPrimitive(document: Document, mesh: Mesh, material: Material): void {
  const buffer = document.getRoot().listBuffers()[0] ?? document.createBuffer()
  const segments = PLACEHOLDER_STITCH_TRIANGLES / 2
  const x0 = -0.24
  const x1 = 0.24
  const y = -0.31
  const width = 0.004
  const z = TORSO_FACE + 0.0005
  const positions: number[] = []
  const normals: number[] = []
  const uvs: number[] = []
  const indices: number[] = []
  for (let i = 0; i <= segments; i++) {
    const t = i / segments
    const x = x0 + (x1 - x0) * t
    positions.push(x, y - width / 2, z, x, y + width / 2, z)
    normals.push(0, 0, 1, 0, 0, 1)
    uvs.push(t, 0, t, 1)
    if (i < segments) {
      const a = i * 2
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
    }
  }
  const accessor = (type: 'VEC3' | 'VEC2', array: Float32Array<ArrayBuffer>) =>
    document.createAccessor().setType(type).setArray(array).setBuffer(buffer)
  mesh.addPrimitive(
    document
      .createPrimitive()
      .setAttribute('POSITION', accessor('VEC3', new Float32Array(positions)))
      .setAttribute('NORMAL', accessor('VEC3', new Float32Array(normals)))
      .setAttribute('TEXCOORD_0', accessor('VEC2', new Float32Array(uvs)))
      .setIndices(
        document
          .createAccessor()
          .setType('SCALAR')
          .setArray(new Uint16Array(indices))
          .setBuffer(buffer),
      )
      .setMaterial(material),
  )
}

const TEE_SILHOUETTE_PATH =
  'M540 470 L430 500 L330 560 L370 700 L470 650 L470 1050 L730 1050 L730 650 ' +
  'L830 700 L870 560 L770 500 L660 470 Q600 540 540 470 Z'

function posterSvg(colourway: PlaceholderColourway): string {
  const gridLines: string[] = []
  for (let x = 0; x <= 1200; x += 48) {
    gridLines.push(`<line x1="${x}" y1="0" x2="${x}" y2="1500"/>`)
  }
  for (let y = 0; y <= 1500; y += 48) {
    gridLines.push(`<line x1="0" y1="${y}" x2="1200" y2="${y}"/>`)
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1500" viewBox="0 0 1200 1500">
  <rect width="1200" height="1500" fill="#F1EFEA"/>
  <g stroke="#1D1F1A" stroke-opacity="0.05" stroke-width="1">${gridLines.join('')}</g>
  <path d="${TEE_SILHOUETTE_PATH}" fill="${colourway.body}"/>
  <path d="M540 470 L660 470 Q600 540 540 470 Z" fill="${colourway.trim}"/>
  <text x="80" y="1400" font-family="monospace" font-size="34" letter-spacing="4" fill="#63665B">[ ${PLACEHOLDER_PRODUCT_CODE} / ${colourway.displayName.toUpperCase()} ]</text>
  <text x="80" y="1448" font-family="monospace" font-size="24" letter-spacing="3" fill="#63665B">RUN APPAREL — 3D PRODUCT REFERENCE</text>
</svg>`
}

export interface PlaceholderOutput {
  glbFiles: string[]
  posterFiles: string[]
}

/** Generate raw per-colourway GLBs (simulating CLO exports) + poster images. */
export async function generatePlaceholders(outDir: string): Promise<PlaceholderOutput> {
  const io = await createIO()
  await mkdir(outDir, { recursive: true })
  const glbFiles: string[] = []
  const posterFiles: string[] = []

  for (const colourway of PLACEHOLDER_COLOURWAYS) {
    const glbFile = join(outDir, `n001-${colourway.slug}.glb`)
    await io.write(glbFile, await buildPlaceholderTee(colourway))
    glbFiles.push(glbFile)

    const svg = Buffer.from(posterSvg(colourway))
    const webpFile = join(outDir, `n001-${colourway.slug}-poster.webp`)
    const pngFile = join(outDir, `n001-${colourway.slug}-poster.png`)
    await sharp(svg).webp({ quality: 82 }).toFile(webpFile)
    await sharp(svg).png().toFile(pngFile)
    posterFiles.push(webpFile, pngFile)
  }

  await writeFile(
    join(outDir, 'README.txt'),
    'Placeholder seed assets generated by @run-apparel/asset-pipeline.\n' +
      'Replace with pipeline-processed CLO exports before production use.\n',
  )
  return { glbFiles, posterFiles }
}
