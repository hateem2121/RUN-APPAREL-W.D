/**
 * Uppercase product code, e.g. "N001" or "RX-PS".
 *
 * ⚠️ THE HYPHEN WAS ADDED 2026-08-17, and it makes one thing ambiguous on
 * purpose. The owner wanted to type a code like "RX-PS" and the field refused
 * outright, with a message that read as though the character were dangerous.
 *
 * A hyphen is a SEPARATOR here, never a free character: leading, trailing and
 * doubled hyphens all stay invalid, so a code always reads as groups joined by
 * single hyphens.
 *
 * WHAT IT COSTS. Variant IDs are `${productCode}-${COLOUR}`, so `RX-PS` + `NAVY`
 * and `RX` + `PS-NAVY` both spell `RX-PS-NAVY`. That is safe here and the safety
 * is structural rather than lucky: a variant ID is only ever VALIDATED against a
 * product code already in hand, or COMPOSED from one. Verified by grep across
 * apps/, packages/ and tools/ that nothing splits a variant ID on `-` to recover
 * either half. `variants.test.ts` pins that pair; if something ever needs to
 * parse one back, it will fail there rather than in production.
 *
 * Lowercase stays invalid, which is about STORAGE rather than about typing:
 * `apps/cms/src/collections/Products.ts` uppercases what the owner types in a
 * beforeValidate hook, so `rx-ps` is accepted from a human and stored as
 * `RX-PS`. Allowing mixed case here would let two codes differ only by case,
 * collide on the unique index, and read as different codes to a person.
 */
const PRODUCT_CODE_PATTERN = /^[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*$/

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
