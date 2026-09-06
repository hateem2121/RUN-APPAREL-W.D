/**
 * Types for `live-products.mjs`, so a TypeScript test can import it.
 *
 * ⚠️ WHY A `.d.ts` RATHER THAN `allowJs`. `apps/cms` sets `allowJs: true` and gets
 * this module as `any`, which is why its `liveProducts.test.ts` typechecked while
 * the viewer's new sitemap and og-card tests did not (TS7016). Turning `allowJs` on
 * for the viewer would fix the error and hand three test files an untyped `any` —
 * exactly the shape that lets a renamed field pass typecheck and fail at runtime.
 *
 * Declaring it properly types BOTH packages, and means adding a field to a row is a
 * two-file change that TypeScript enforces rather than a silent one.
 */

export interface LiveProduct {
  /** URL segment, printed on the physical QR tag. Never invent one. */
  slug: string
  /** The product's FIRST colourway row in the CMS — equals `colourways[0]`. */
  colourway: string
  /**
   * Every active colourway slug, in CMS row order.
   *
   * Added 2026-09-05 so the sitemap and the link-preview manifest can be derived
   * and checked. Before it, each row carried one colourway and nothing offline
   * could know the 55 live URLs — which is how `public/sitemap.xml` came to list
   * 10 URLs for 2 products while 11 were live.
   */
  colourways: string[]
  /** As printed on the tag, e.g. `R-XPS`. */
  productCode: string
}

export declare const LIVE_PRODUCTS: LiveProduct[]
export declare const DEFAULT_PRODUCT: LiveProduct
export declare function isGatedProduct(slug: string): boolean
export declare function squashCode(code: string): string
