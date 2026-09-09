import type { Document, Transform } from '@gltf-transform/core'

/**
 * Remove CLO's internal design database from the document root, and stamp ownership.
 *
 * ⚠️ EVERY LIVE GARMENT SHIPPED THIS UNTIL 2026-09-05, and no audit had found it.
 * Measured by ranged GET on all eleven published models: each carries a root
 * `extras.MetaData` object — invisible on the page, read by no renderer, downloaded
 * by everyone. 433.9 KB across the catalogue; on `r-aj` it is 134,605 bytes, a third
 * of that file's entire JSON chunk.
 *
 * What is in it, quoted from the live `rxps` and `r-aj` files:
 *
 *   - **Fabric physics.** `{"PhysicalPropertyName":…,"Stretch-Warp":…,
 *     "Bending-Weft":…,"Shear":…,"Density":…,"FrictionCoefficient":…}` — four
 *     fabrics per garment. Real values are deliberately NOT quoted here: this
 *     repository is public, and reproducing the leak in the module that exists to
 *     prevent it would be self-defeating.
 *     A competitor loads these into their own CLO library and gets a garment that
 *     drapes identically.
 *   - **Supplier fabric codes**, as PBRMaterial names: `SUPPLIER_DOBBY_A`,
 *     `SUPPLIER_MFX_B`, `SUPPLIER_PSP_C`. The public page says "88% Nylon / 12%
 *     Spandex".
 *   - **Coloro dye references** — `COLORO_REDACTED` — pointing at the physical
 *     colour specification.
 *   - **Pattern construction.** `SeamLinePairList`, 1,576 seams across the eleven,
 *     pairing panel indices to vertex runs. That is how the garment is built.
 *   - **62 absolute Windows paths**, all `D:/New File/<GARMENT>/...`, including
 *     internal working names that differ from the published ones.
 *
 * None of it is exploitable and none is visible to a visitor. It is a commercial
 * confidentiality leak on a URL with no auth, no referrer check and a one-year
 * cache — and it is the half that makes a stolen model genuinely valuable. Nothing
 * stops a browser-delivered model being copied; what this controls is what the copy
 * is worth.
 *
 * ⚠️ `prune({ keepExtras: false })` IS NOT THIS, AND WOULD CAUSE A SECOND BUG.
 * The 2026-09-05 audit first prescribed exactly that, and it was wrong twice over.
 * In `@gltf-transform/functions` 4.4.2, `keepExtras` only decides whether an
 * *otherwise-unreferenced* property survives BECAUSE it carries extras — `treeShake`
 * is never called on Root, so root extras are untouched either way. Flipping it
 * fixes nothing, and it starts disposing properties this project depends on:
 * material-level `extras.depthBias`, written by overlay-annotate.ts and read in the
 * browser through three.js `material.userData` by
 * `apps/viewer/src/lib/decal-depth-bias.ts` to stop printed decals z-fighting.
 * Measured: 10 of 50 materials on `r-afp` carry it. **Both `prune()` calls keep
 * `keepExtras: true`.**
 *
 * ⚠️ ROOT ONLY. A recursive extras strip would take `depthBias` with it and
 * silently reintroduce the flicker — the failure `decal-depth-bias.ts` describes as
 * "no error, no exception, just the flicker quietly returning". This function
 * touches `document.getRoot()` and nothing else, and `strip-root-extras.test.ts`
 * asserts material and primitive extras survive.
 *
 * Nothing in this repo reads root extras: a grep across `tools/`, `apps/`,
 * `scripts/` and `packages/` finds consumers only at material level (`depthBias`)
 * and primitive level (`uv-remap`).
 */

/** What the shipped files should say about who owns them. */
export const ASSET_COPYRIGHT = '© RUN Apparel. All rights reserved.'

export interface StripRootExtrasResult {
  /** Bytes of root `extras` JSON removed. 0 when there were none. */
  removedBytes: number
  /** Top-level keys that were present, e.g. `['MetaData']`. */
  removedKeys: string[]
  /** Whether a copyright string was written. */
  copyrightSet: boolean
}

export interface StripRootExtrasOptions {
  /** Overrides `ASSET_COPYRIGHT`. Pass `null` to leave `asset.copyright` alone. */
  copyright?: string | null
  onResult?: (result: StripRootExtrasResult) => void
}

/**
 * A glTF-Transform transform. Safe to run on a document with no root extras — it
 * reports zero and changes nothing, which is what every already-clean garment does.
 */
export function stripRootExtras(options: StripRootExtrasOptions = {}): Transform {
  return (document: Document): void => {
    const root = document.getRoot()
    const extras = root.getExtras() as Record<string, unknown> | undefined

    const removedKeys = extras ? Object.keys(extras) : []
    // Measured on the serialised form, because that is what ships. `JSON.stringify`
    // of an empty object is 2 bytes, which would report a saving that is not one.
    const removedBytes = removedKeys.length > 0 ? JSON.stringify(extras).length : 0
    if (removedKeys.length > 0) root.setExtras({})

    const copyright = options.copyright === undefined ? ASSET_COPYRIGHT : options.copyright
    let copyrightSet = false
    if (copyright !== null && copyright.length > 0) {
      // Never overwrite a copyright somebody deliberately set — the absence is the
      // defect, not the value. Measured 2026-09-05: absent on all eleven.
      const asset = root.getAsset()
      if (!asset.copyright) {
        asset.copyright = copyright
        copyrightSet = true
      }
    }

    options.onResult?.({ removedBytes, removedKeys, copyrightSet })
  }
}
