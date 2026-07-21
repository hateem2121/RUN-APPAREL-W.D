/** Uppercase product code, e.g. "N001". */
const PRODUCT_CODE_PATTERN = /^[A-Z][A-Z0-9]*$/

/** Structured colourway variant ID, e.g. "N001-NAVY". */
const VARIANT_ID_PATTERN = /^[A-Z][A-Z0-9]*-[A-Z0-9]+(?:-[A-Z0-9]+)*$/

export function isValidProductCode(value: string): boolean {
  return PRODUCT_CODE_PATTERN.test(value)
}

/**
 * A variant ID must start with its parent product code plus a hyphen
 * (CMS validation rule; also the KHR_materials_variants name contract).
 */
export function isValidVariantId(variantId: string, productCode: string): boolean {
  return (
    isValidProductCode(productCode) &&
    VARIANT_ID_PATTERN.test(variantId) &&
    variantId.startsWith(`${productCode}-`)
  )
}

/** Derive the canonical variant ID for a colourway slug, e.g. ("N001","navy") -> "N001-NAVY". */
export function buildVariantId(productCode: string, colourSlug: string): string {
  // Collapse runs of non-alphanumerics to a single hyphen, then strip any
  // leading/trailing hyphens so a sloppy slug (" navy!", "--forest--") still
  // yields a valid variant ID rather than one isValidVariantId would reject.
  const colour = colourSlug
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return `${productCode}-${colour}`
}
