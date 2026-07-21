/**
 * Publish-gating rules for Products — extracted as a pure function so the
 * security-critical invariants are unit-testable without a database. The
 * Products.beforeChange hook is a thin adapter that resolves the fields, loads
 * the product's colourways, and calls this.
 */

export interface PublishGateInput {
  id: unknown
  status: string | undefined
  productCode: string | undefined
  variantMode: string | undefined
  glbAsset: unknown
  variantsVerified: unknown
  defaultColourway: unknown
}

export interface GateColourway {
  id: unknown
  variantId: unknown
  active: boolean
  isDefault: boolean
  glbAsset: unknown
}

/**
 * Throw a human-readable Error if the product may NOT be published given its
 * fields and ALL of its colourways (active + inactive). A no-op for non-
 * published saves. Pure — no DB access.
 */
export function assertPublishable(input: PublishGateInput, colourways: GateColourway[]): void {
  if (input.status !== 'published') return

  if (!input.id) {
    throw new Error(
      'Save this product as a draft first, add its colourways, then set it to Published. ' +
        'Publishing checks need the product to exist before its colourways can be verified.',
    )
  }

  if (!input.defaultColourway) {
    throw new Error('A published product needs a default colourway. Select one before publishing.')
  }

  if (input.variantMode === 'single-glb-variants') {
    if (!input.glbAsset) {
      throw new Error(
        'Published "single GLB with variants" products need a merged production GLB. Upload the pipeline-processed GLB, or switch to "separate GLB per colourway".',
      )
    }
    if (!input.variantsVerified) {
      throw new Error(
        'Tick "Variants verified" after confirming availableVariants matches every colourway variantId (pnpm pipeline validate). Required before publishing in single-GLB mode.',
      )
    }
  }

  const active = colourways.filter((c) => c.active)
  if (active.length === 0) {
    throw new Error('A published product needs at least one active colourway.')
  }

  const defaults = active.filter((c) => c.isDefault)
  if (defaults.length !== 1) {
    throw new Error(
      `A published product must have exactly one default active colourway (found ${defaults.length}). Fix the colourways before publishing.`,
    )
  }

  const defaultId =
    typeof input.defaultColourway === 'object'
      ? (input.defaultColourway as { id?: unknown })?.id
      : input.defaultColourway
  if (defaults[0]!.id !== defaultId) {
    throw new Error('The product’s "default colourway" must be the colourway marked as active default.')
  }

  if (input.variantMode === 'separate-glb-per-colour') {
    const missing = active.filter((c) => !c.glbAsset)
    if (missing.length > 0) {
      throw new Error(
        `In "separate GLB per colourway" mode every active colourway needs its own GLB. Missing: ${missing
          .map((c) => c.variantId)
          .join(', ')}.`,
      )
    }
  }

  for (const colourway of colourways) {
    if (input.productCode && !String(colourway.variantId).startsWith(`${input.productCode}-`)) {
      throw new Error(
        `Colourway ${colourway.variantId} does not start with the product code ${input.productCode}-.`,
      )
    }
  }
}
