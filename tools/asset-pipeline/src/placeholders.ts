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
}

export const PLACEHOLDER_PRODUCT_CODE = 'N001'

export const PLACEHOLDER_COLOURWAYS: PlaceholderColourway[] = [
  { slug: 'navy', displayName: 'Navy', variantId: 'N001-NAVY', body: '#22314E', trim: '#18233A' },
  { slug: 'black', displayName: 'Black', variantId: 'N001-BLACK', body: '#17181A', trim: '#2A2B2F' },
  { slug: 'crimson', displayName: 'Crimson', variantId: 'N001-CRIMSON', body: '#8C1F2F', trim: '#5E1520' },
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

const BOX_FACES: { n: [number, number, number]; corners: [number, number, number][] }[] = [
  { n: [0, 0, 1], corners: [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]] },
  { n: [0, 0, -1], corners: [[1, -1, -1], [-1, -1, -1], [-1, 1, -1], [1, 1, -1]] },
  { n: [1, 0, 0], corners: [[1, -1, 1], [1, -1, -1], [1, 1, -1], [1, 1, 1]] },
  { n: [-1, 0, 0], corners: [[-1, -1, -1], [-1, -1, 1], [-1, 1, 1], [-1, 1, -1]] },
  { n: [0, 1, 0], corners: [[-1, 1, 1], [1, 1, 1], [1, 1, -1], [-1, 1, -1]] },
  { n: [0, -1, 0], corners: [[-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1]] },
]

function addBoxPrimitive(document: Document, mesh: Mesh, material: Material, spec: BoxSpec): void {
  const buffer = document.getRoot().listBuffers()[0] ?? document.createBuffer()
  const positions: number[] = []
  const normals: number[] = []
  const indices: number[] = []

  for (const face of BOX_FACES) {
    const start = positions.length / 3
    for (const [ux, uy, uz] of face.corners) {
      positions.push(
        spec.cx + (ux * spec.w) / 2,
        spec.cy + (uy * spec.h) / 2,
        spec.cz + (uz * spec.d) / 2,
      )
      normals.push(...face.n)
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
      .setIndices(index)
      .setMaterial(material),
  )
}

/**
 * Build one stylised placeholder tee GLB for a colourway. Primitive order
 * (torso, sleeve L, sleeve R, collar) is identical across colourways, which
 * is exactly the property real CLO exports must have for variant merging.
 */
export function buildPlaceholderTee(colourway: PlaceholderColourway): Document {
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

  const mesh = document.createMesh('garment')
  addBoxPrimitive(document, mesh, body, { w: 0.52, h: 0.66, d: 0.13, cx: 0, cy: 0, cz: 0 })
  addBoxPrimitive(document, mesh, body, { w: 0.2, h: 0.24, d: 0.12, cx: -0.36, cy: 0.18, cz: 0 })
  addBoxPrimitive(document, mesh, body, { w: 0.2, h: 0.24, d: 0.12, cx: 0.36, cy: 0.18, cz: 0 })
  addBoxPrimitive(document, mesh, trim, { w: 0.18, h: 0.045, d: 0.135, cx: 0, cy: 0.335, cz: 0 })

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
    await io.write(glbFile, buildPlaceholderTee(colourway))
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
