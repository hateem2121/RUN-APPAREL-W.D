import { stat } from 'node:fs/promises'
import type { Primitive } from '@gltf-transform/core'
import type { MappingList } from '@gltf-transform/extensions'
import { createIO } from './io'

/** Warn when a production GLB is heavier than this — QR scans are mobile-first. */
export const SIZE_WARNING_BYTES = 8 * 1024 * 1024

export interface GlbReport {
  file: string
  bytes: number
  /** KHR_materials_variants names actually bound to primitives — what <model-viewer> will report as availableVariants. */
  variants: string[]
  meshCount: number
  primitiveCount: number
  materialCount: number
  textureCount: number
  warnings: string[]
}

export interface VariantCheck {
  ok: boolean
  missing: string[]
  extra: string[]
}

/**
 * Inspect a GLB the same way <model-viewer>'s scenegraph does: the variant
 * list is collected from primitive-level mappings, not just the root array,
 * so unbound variants can never pass QA.
 */
export async function inspectGlb(file: string): Promise<GlbReport> {
  const io = await createIO()
  const document = await io.read(file)
  const root = document.getRoot()

  const variants = new Set<string>()
  const primitives: Primitive[] = root.listMeshes().flatMap((m) => m.listPrimitives())
  for (const prim of primitives) {
    const mappingList = prim.getExtension<MappingList>('KHR_materials_variants')
    if (!mappingList) continue
    for (const mapping of mappingList.listMappings()) {
      for (const variant of mapping.listVariants()) {
        const name = variant.getName()
        if (name) variants.add(name)
      }
    }
  }

  const { size } = await stat(file)
  const warnings: string[] = []
  if (size > SIZE_WARNING_BYTES) {
    warnings.push(
      `File is ${(size / 1024 / 1024).toFixed(1)} MB (> ${SIZE_WARNING_BYTES / 1024 / 1024} MB) — heavy for mobile QR-scan loads. Consider optimising (and evaluate Draco case-by-case).`,
    )
  }
  if (primitives.length === 0) warnings.push('No mesh primitives found.')

  return {
    file,
    bytes: size,
    variants: [...variants].sort(),
    meshCount: root.listMeshes().length,
    primitiveCount: primitives.length,
    materialCount: root.listMaterials().length,
    textureCount: root.listTextures().length,
    warnings,
  }
}

/** Compare bound variants against the CMS colourway variantId list. Order-insensitive, exact set match. */
export function checkVariants(report: GlbReport, expected: string[]): VariantCheck {
  const have = new Set(report.variants)
  const want = new Set(expected)
  const missing = expected.filter((v) => !have.has(v)).sort()
  const extra = report.variants.filter((v) => !want.has(v)).sort()
  return { ok: missing.length === 0 && extra.length === 0, missing, extra }
}
