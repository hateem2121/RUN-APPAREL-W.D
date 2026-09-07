import { describe, expect, it } from 'vitest'
import { isGatedProduct, LIVE_PRODUCTS, squashCode } from '../../../scripts/live-products.mjs'

/**
 * WHY THIS FILE EXISTS.
 *
 * `scripts/live-products.mjs` is the single list every post-deploy gate iterates. On
 * 2026-08-30 an audit found it covered one of two live products. On **2026-09-04 it
 * covered two of eleven** — nine garments were published in a single session and the
 * list was not widened, so `smoke-live-products.mjs` reported
 * "all 2 live products serve a real, fetchable model" while nine served nothing anyone
 * checked. Both times the list narrowed silently and every gate stayed green.
 *
 * Nothing offline can know what the CMS has published, so this cannot assert the list is
 * COMPLETE. What it can do is pin the shape the gates depend on, and prove the guard that
 * now stops a twelfth garment going live ungated actually rejects.
 */
describe('live products', () => {
  it('carries every product published as of 2026-09-07', () => {
    // Measured from the PUBLIC endpoint — the visitor's own truth, not the CMS admin API,
    // which reported `published: 0` because REST returns the draft version.
    //
    // Went 11 -> 16 on 2026-09-07: r-cch, r-gtd, r-au, r-ect and r-et, from the five CLO
    // exports dated that day. The list is widened in the SAME change that publishes them,
    // which is what `publish-garment.mjs` now refuses to let anyone skip.
    expect(LIVE_PRODUCTS.map((p) => p.slug).sort()).toEqual(
      [
        'r-afp',
        'r-aj',
        'r-ajm',
        'r-asb',
        'r-atj',
        'r-atw',
        'r-au',
        'r-cch',
        'r-css',
        'r-ect',
        'r-et',
        'r-gtd',
        'r-mm',
        'r-wzu',
        'r-xmp',
        'rxps',
      ].sort(),
    )
  })

  it('keeps rxps first, because three single-product checks resolve to it', () => {
    // smoke-viewer-payload, smoke-viewer-preview and apex-probe all read DEFAULT_PRODUCT,
    // which is LIVE_PRODUCTS[0]. Reordering this list silently re-points their baselines.
    expect(LIVE_PRODUCTS[0]?.slug).toBe('rxps')
  })

  it('gives every row a colourway and a product code', () => {
    for (const p of LIVE_PRODUCTS) {
      expect(p.colourway, `${p.slug} has no colourway`).toMatch(/^[a-z0-9-]+$/)
      expect(p.productCode, `${p.slug} has no product code`).toMatch(/^[A-Z0-9-]+$/)
      // The gates build URLs from these two. A trailing space or an uppercase letter in a
      // slug is a 404 at the only moment it matters — after a deploy.
      expect(p.slug).toBe(p.slug.trim().toLowerCase())
    }
  })

  it('has no duplicate slug or product code', () => {
    const slugs = LIVE_PRODUCTS.map((p) => p.slug)
    const codes = LIVE_PRODUCTS.map((p) => squashCode(p.productCode))
    expect(new Set(slugs).size).toBe(slugs.length)
    expect(new Set(codes).size).toBe(codes.length)
  })

  describe('isGatedProduct — the guard publish-garment.mjs refuses on', () => {
    it('accepts a product the gates cover', () => {
      expect(isGatedProduct('r-asb')).toBe(true)
    })

    // THE NEGATIVE CONTROL. Without this the guard could be `() => true` and every
    // assertion above would still pass — which is precisely how the nine garments went
    // live unwatched.
    //
    // ⚠️ IT USED TO NAME `r-au`, AND `r-au` WENT LIVE ON 2026-09-07. A control pinned to a
    // real draft product expires the day that product is published: the test then fails for
    // a reason that has nothing to do with the guard, and the tempting fix is to swap in
    // another draft and start the same clock again. So the premise is now ASSERTED rather
    // than assumed — the slug is proven absent from LIVE_PRODUCTS first, and only then is
    // the guard asked about it. That cannot rot, and it still fails loudly if the guard is
    // ever replaced by `() => true`.
    it('rejects a product the gates do NOT cover', () => {
      const absent = 'r-not-a-live-product'
      expect(
        LIVE_PRODUCTS.some((p) => p.slug === absent),
        `the control slug "${absent}" is in LIVE_PRODUCTS — pick one that is not`,
      ).toBe(false)
      expect(isGatedProduct(absent)).toBe(false)
      expect(isGatedProduct('')).toBe(false)
    })
  })
})
