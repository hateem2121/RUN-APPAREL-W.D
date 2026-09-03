#!/usr/bin/env node
/**
 * Build a garment that ACTUALLY z-fights: a cloth panel with an opaque printed layer
 * a hair in front of it — the p001 geometry (0.001 mm) the repo records as destroyed
 * by the defect. The seeded placeholder does not fight (its decals sit 0.169 mm off,
 * like the live skinsuit), so nothing on disk could show the depth-bias instruments
 * doing anything. The 2026-09 audit built this to measure HR-2; it is kept so the
 * harness can be proven to SEE the bias, both ways, whenever the instruments change.
 *
 * Usage (from tools/asset-pipeline):
 *   npx tsx scripts/make-zfight-fixture.mjs <out.glb> [gap-mm, default 0.001]
 * Then:
 *   npx tsx src/cli.ts overlays <out.glb> --out <dir>        # writes the depthBias record
 *   npx tsx src/cli.ts render <plain> --out a; render <annotated> --out b; compare a b
 */
import { Document, NodeIO } from '@gltf-transform/core'

const out = process.argv[2]
if (!out) {
  console.error('usage: make-zfight-fixture.mjs <out.glb> [gap-mm]')
  process.exit(2)
}
const gapMm = Number(process.argv[3] ?? 0.001)
const doc = new Document()
doc.createBuffer()
const scene = doc.createScene()

function quad(name, z, half, colour, alphaMode = 'OPAQUE') {
  const positions = new Float32Array([
    -half,
    -half,
    z,
    half,
    -half,
    z,
    half,
    half,
    z,
    -half,
    -half,
    z,
    half,
    half,
    z,
    -half,
    half,
    z,
  ])
  const normals = new Float32Array(Array.from({ length: 6 }, () => [0, 0, 1]).flat())
  const material = doc
    .createMaterial(name)
    .setAlphaMode(alphaMode)
    .setBaseColorFactor(colour)
    .setDoubleSided(true)
    .setMetallicFactor(0)
    .setRoughnessFactor(0.8)
  const primitive = doc
    .createPrimitive()
    .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(positions))
    .setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(normals))
    .setMaterial(material)
  scene.addChild(doc.createNode(name).setMesh(doc.createMesh(name).addPrimitive(primitive)))
}

// A 0.5 m cloth panel, and a 0.25 m print stacked on it at the given gap.
quad('Cloth_Panel', 0, 0.25, [0.1, 0.1, 0.12, 1])
quad('Material_Graphic', gapMm / 1000, 0.125, [0.95, 0.95, 0.95, 1])

await new NodeIO().write(out, doc)
console.log(`wrote ${out}: cloth panel + opaque print ${gapMm} mm in front`)
