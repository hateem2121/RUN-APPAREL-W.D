import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { Document, type Material, type Mesh } from '@gltf-transform/core'
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
      uvs.push(...(FACE_UV[corner] as [number, number]))
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
function addDecalPrimitive(document: Document, mesh: Mesh, material: Material, z: number): void {
  const buffer = document.getRoot().listBuffers()[0] ?? document.createBuffer()
  const w = 0.26
  const h = 0.13
  const y = 0.06
  const positions = new Float32Array([
    -w / 2,
    y - h / 2,
    z,
    w / 2,
    y - h / 2,
    z,
    w / 2,
    y + h / 2,
    z,
    -w / 2,
    y + h / 2,
    z,
  ])
  const normals = new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1])
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

  const body = document
    .createMaterial(`${colourway.variantId}-BODY`)
    .setBaseColorFactor(hexToLinearFactor(colourway.body))
    .setRoughnessFactor(0.85)
    .setMetallicFactor(0)
    .setDoubleSided(true)
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
  // Just proud of the torso's front face (d/2 = 0.065), as CLO exports one.
  addDecalPrimitive(document, mesh, decal, 0.067)
  // Each artwork quad a little further out, so they are coplanar-ish with the
  // torso and with each other — the z-fighting hazard H6 is about — without
  // being exactly coincident.
  artworkMaterials.forEach((material, index) => {
    addDecalPrimitive(document, mesh, material, 0.068 + index * 0.0005)
  })

  const node = document.createNode('garment').setMesh(mesh)
  document.createScene('Scene').addChild(node)
  return document
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
