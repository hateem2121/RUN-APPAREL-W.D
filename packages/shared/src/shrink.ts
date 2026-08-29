/**
 * The contract between the CMS raw-upload inbox and the shrink service.
 *
 * This used to be two hand-copied interfaces with a "Must match …" comment on
 * each. It is one type here so a change on either side is a compile error rather
 * than a queue message that silently loses a field.
 */

/**
 * How hard the auto-shrinker should push, chosen per upload by the owner.
 *
 * The point of exposing this is that the alternative is a container rebuild:
 * the pipeline source is baked into the image, so before this existed, changing
 * a simplify setting meant Docker + `wrangler deploy` + several minutes. Now a
 * garment that came back too heavy or too soft is just re-uploaded at a
 * different level.
 */
/**
 * `'small'` was REMOVED on 2026-08-05 after being measured, not theorised.
 *
 * A six-run sweep from the raw N001 export rendered the chest wordmark at every
 * level. At `small` (`--simplify-error 0.002`) the word MILE is visibly breaking
 * apart, and at 0.005 it is destroyed — yet **every run passed all three blocking
 * gates**, because those gates test `alphaMode`, which decimation does not
 * change. See docs/OPEN-ISSUE-ARTWORK.md → "the three gates do NOT catch
 * decimation damage", with the contact sheet at
 * docs/images/2026-08-05-size-vs-wordmark.png.
 *
 * So the option shipped damage to the one thing the product exists to show, with
 * nothing anywhere able to say so. An option whose only honest instruction is
 * "pick this and then check by eye whether it wrecked your logo" is not an
 * option; it is a trap. Removed rather than re-tuned.
 *
 * Re-tuning would also buy very little now. `balanced` was moved onto the measured
 * frontier the same day — 0.001, the loosest budget whose rendered output was
 * checked logo-by-logo — and 0.002 is the very next run in the sweep, the one where
 * MILE starts breaking apart. Any safe value below `balanced` lands in that narrow
 * gap, and two options a megabyte or two apart are not two options.
 *
 * Note this reasoning is contingent on where `balanced` sits. It was first written
 * against a `balanced` of 0.0005, where it was simply false: 0.001 is safe and was
 * 10.7 MB smaller. If `balanced` is ever tightened again, re-measure before
 * repeating the claim.
 *
 * Old rows carrying `'small'` still parse: `shrinkFlagsFor` falls through to the
 * balanced flags, which are strictly safer than what those rows asked for.
 */
export type ShrinkDetailLevel = 'fidelity' | 'balanced'

export const SHRINK_DETAIL_LEVELS: readonly {
  value: ShrinkDetailLevel
  label: string
}[] = [
  { value: 'balanced', label: 'Balanced (recommended)' },
  { value: 'fidelity', label: 'Highest quality — bigger file' },
]

export const DEFAULT_SHRINK_DETAIL: ShrinkDetailLevel = 'balanced'

/** Message enqueued on `glb-shrink` for the shrink Worker. */
export interface ShrinkJobMessage {
  rawUploadId: number | string
  filename: string
  prefix: string | null
  /** Absent on messages enqueued before this field existed — treat as the default. */
  detail?: ShrinkDetailLevel
  /**
   * The product this garment is for, so the worker can write the colour names it
   * found inside the file back onto that product. Those names are what the
   * "Which colour in your CLO file is this?" dropdown offers — the mechanism that
   * removed the requirement to name colourways `N001-NAVY` inside CLO 3D.
   *
   * Optional: the upload's "Target product" field is optional, and messages
   * enqueued before this existed do not carry it. Absent simply means the owner
   * attaches the result by hand, exactly as before.
   */
  targetProductId?: number | string | null
}

/**
 * Pipeline CLI flags for a detail level, passed through to `parseOptimizeArgs`
 * inside the container so the CLI and the auto-shrinker stay one code path.
 *
 * STARTING VALUES — tune against a real garment and update here.
 * Rationale for the shape of them:
 *   - Geometry, not texture, is what makes a CLO export huge (measured: textures
 *     were 2.1 MB in every variant of the 373 MB export), so `--simplify` and the
 *     error budget are the only levers that matter.
 *   - `--uv-weight` feeds TEXCOORD_0 into the simplifier's error metric
 *     (meshoptimizer `simplifyWithAttributes`), which is what protects printed
 *     graphics. Because UV distortion is now *inside* the budget, the budget
 *     itself can be looser than the 0.0001 needed when it was not — that older
 *     setting only stayed safe by also locking every mesh border, which is what
 *     inflated the result to 58 MB / 6.0 M triangles.
 *   - `ratio` is a target, not a promise: the simplifier stops early when the
 *     error budget binds. Lowering `--simplify` alone therefore does nothing once
 *     the budget is the binding constraint — raise the budget instead.
 */
/**
 * Reduce decorative topstitch on its own budget, ahead of `--simplify`.
 *
 * Measured 2026-08-21 on a 1,313,979,936-byte Cycling-Bib export: **99.97% of its
 * 33,964,432 triangles was `Topstitch_*` and 0.03% was the garment** (`Cloth_mesh`,
 * 11,128 triangles, carrying all 116 artwork materials). One budget cannot serve
 * both, which is why `--simplify` alone bottomed out at 57.4 MB.
 *
 * 0.0005 is TIGHT on purpose and is the real dial. It self-limits — asked to keep
 * 3% it kept 3.99% and stopped rather than damage the cord. A 20x looser 0.01,
 * plus a second decimation pass, is what produced a frayed, spiky result the owner
 * rejected on sight.
 *
 * Safe alongside `--simplify`: `optimize.ts` passes `skipMeshes` to the general
 * decimator whenever this ran, so thread is never cut twice. `--simplify` is kept
 * for garments whose OWN mesh is heavy — this export's was not, but the next one
 * may be.
 *
 * ⚠️ Judge any change here on a 4-7deg macro crop of a seam. At the default 18deg
 * `crop-chest` view a ruined cord is indistinguishable from an intact one; that is
 * how the frayed version was first reported as "identical".
 */
/**
 * Codec and texture policy. All four numbers were measured on the same export and
 * judged on rendered crops, not on file size.
 *
 * ⛔ **`--meshopt`, NOT `--draco`, and this is not a preference — DRACO MODELS DO
 * NOT LOAD ON THE LIVE VIEWER.** Reproduced twice in production 2026-08-21: a draco
 * X-MILO PRO BIB rendered nothing and fell back to its poster, with the console
 * showing model-viewer fetching the decoder from `www.gstatic.com`, which the CSP
 * correctly blocks. On a fresh live page `ModelViewerElement.dracoDecoderLocation`
 * reads the **gstatic default**, while `meshoptDecoderLocation` correctly reads
 * `/meshopt_decoder.js`.
 *
 * ⚠️ The cause is NOT the obvious one and is still open. `Stage.tsx` sets all four
 * values on the CLASS (not an instance — the local is misleadingly named `element`),
 * the deployed bundle provably contains
 * `n.meshoptDecoderLocation=…,n.minimumRenderScale=…,n.dracoDecoderLocation=…`, none
 * of those assignments throws when replayed live, the `/draco/*` files are served
 * 200, and the setter demonstrably works when called by hand. So the code is right,
 * shipped, and somehow not in effect. **Do not "fix" it by re-ordering those lines
 * and shipping — verify on the live page that `dracoDecoderLocation` is `/draco/`
 * after a cold load before trusting any change.**
 *
 * The measured draco win was real (20.6 MB vs 31.0 MB, and FASTER: 908 ms vs
 * 1168 ms at 4x CPU throttle) and is worth reclaiming once the viewer is fixed —
 * but a model nobody can load is worth nothing. The shipped X-MILO PRO BIB is the
 * meshopt build at 33.1 MB.
 *
 * Historic note kept because it is what led here: on paper `--draco` is smaller AND
 * faster, which inverts this repo's older assumption. Matched builds differing only in codec, model-viewer over localhost,
 * CPU-throttled via CDP, median of 3 — 4x throttle: meshopt 31.0 MB / 1168 ms vs
 * draco 20.6 MB / 908 ms; 6x: 1672 ms vs 1259 ms. The extra ~10 MB costs more to
 * fetch and upload than meshopt's faster decode saves. The viewer already
 * self-hosts a Draco decoder (`apps/viewer/public/draco/`) and its CSP already
 * allows `wasm-unsafe-eval`, so this needs no viewer change.
 *
 * `--max-texture 4096`: the all-over halftone print is 4952x7014 and is `BLEND`,
 * so `isArtworkTexture` classifies it as sheer FABRIC and it took the 2048 cap —
 * squashing it to 29% and turning round dots into blocky squares. Raising the
 * general cap is the safe lever; widening the artwork classifier is not, because
 * it also feeds `findArtworkAlphaProblems`, which throws and saves nothing.
 *
 * `--data-max-texture 2048`: normal/ORM maps were 9.63 MB against the artwork's
 * 7.03 MB purely from running at colour-map resolution. Halving is invisible;
 * quartering was tried and refused (it flattens fabric weave for 1 MB).
 *
 * `--quality 75` (from 82): 0.00% of pixels differ by more than 8/255. Artwork is
 * untouched — it has its own `--artwork-quality`, still 95.
 *
 * Net on that export: 1,253 MB -> 20.6 MB, with logos, slogan, halftone, thread
 * cord and all five colourways verified against the uncompressed original.
 */
/**
 * Below this raw-export size, a garment is processed at the HIGHEST quality automatically.
 *
 * MEASURED, not chosen. The risk of raising quality is the output breaching
 * GLB_HARD_MAX_BYTES (40 MB), so the threshold is set where that is comfortably
 * impossible. Both figures are from real garments on 2026-08-29:
 *
 *   AERO-TECH WINDBREAKER   16.19 MB raw  ->  3.39 MB at fidelity   (8.5% of the ceiling)
 *   Minecut Motion          45.59 MB raw  ->  5.76 MB at fidelity  (14.4% of the ceiling)
 *
 * So a 45 MB export lands at a SEVENTH of the limit. 50 MB keeps a large margin over the
 * biggest garment measured, while excluding the old-settings exports that are the actual
 * risk — those run 90 MB to 1.25 GB and land at 67-83% of the ceiling even on the lower
 * setting.
 *
 * ⚠️ RAW SIZE IS A PROXY, and the thing it proxies is topstitch. A new-settings export
 * carries none (0% of triangles) and comes out small; an old one is ~92% topstitch. If
 * the catalogue ever contains a small export that is nonetheless geometry-heavy, this
 * threshold is the number to re-measure — do not raise it on reasoning alone.
 */
export const AUTO_FIDELITY_MAX_RAW_BYTES = 50 * 1024 * 1024

/**
 * Pick the detail level for an upload, given what the owner selected and how big the raw
 * export is.
 *
 * ⚠️ THIS ONLY EVER UPGRADES. That is what makes it safe to apply on top of a stored
 * choice. The CMS field carries `defaultValue: DEFAULT_SHRINK_DETAIL`, so a stored
 * 'balanced' is indistinguishable from "the owner never touched it" — there is no way to
 * honour an explicit Balanced without also refusing to help everyone who left the
 * default. Upgrading resolves that safely: nobody selects a lower setting HOPING for
 * worse artwork, and on a garment this small the cost is a few hundred kilobytes.
 * Anything already at 'fidelity' is returned unchanged, and a garment over the threshold
 * keeps exactly what it was given.
 *
 * Returns the level to use. `rawBytes` of 0 or undefined means "size unknown", which is
 * treated as too big to upgrade — failing safe rather than guessing.
 */
export function autoDetailFor(
  selected: ShrinkDetailLevel | undefined,
  rawBytes: number | undefined,
): ShrinkDetailLevel {
  const level = selected ?? DEFAULT_SHRINK_DETAIL
  if (level === 'fidelity') return level
  if (!rawBytes || !Number.isFinite(rawBytes) || rawBytes <= 0) return level
  return rawBytes <= AUTO_FIDELITY_MAX_RAW_BYTES ? 'fidelity' : level
}

export function shrinkFlagsFor(detail: ShrinkDetailLevel = DEFAULT_SHRINK_DETAIL): string[] {
  switch (detail) {
    case 'fidelity':
      return [
        '--stitch',
        '0.03',
        '--stitch-error',
        '0.0005',
        '--simplify',
        '0.05',
        '--simplify-error',
        '0.0002',
        '--uv-weight',
        '2',
        '--meshopt',
        '--max-texture',
        '4096',
        '--data-max-texture',
        '2048',
        '--quality',
        '75',
      ]
    // Also the fall-through for a stored `'small'`, which no longer exists as a
    // choice. Landing those rows on balanced is deliberate: it is strictly less
    // aggressive than what they asked for, so a re-run can only improve them.
    //
    // 0.001 (was 0.0005 until 2026-08-05) is the loosest budget whose OUTPUT was
    // rendered and compared logo-by-logo against the file it replaced: mean |Δ| of
    // 0.06/255 on the chest wordmark, 0.11% of pixels differing by more than 8/255.
    // It took the N001 model from 37.7 MB to 27.0 MB — restoring 13 MB of headroom
    // under GLB_HARD_MAX_BYTES, which mattered because `small` had been the escape
    // hatch and is now gone. Pinned by a test in shrink.test.ts; the value's only
    // evidence is docs/images/2026-08-05-A-vs-C-all-logos.png, because no gate in
    // this system can see decimation damage.
    default:
      return [
        '--stitch',
        '0.03',
        '--stitch-error',
        '0.0005',
        '--simplify',
        '0.05',
        '--simplify-error',
        '0.001',
        '--uv-weight',
        '1',
        '--meshopt',
        '--max-texture',
        '4096',
        '--data-max-texture',
        '2048',
        '--quality',
        '75',
      ]
  }
}

/**
 * Plain-language advice shown when a shrunk file is still over the Media ceiling.
 *
 * There is deliberately no smaller Detail level to send the owner to any more.
 * The one that existed reached that size by damaging the printed artwork, which
 * is the product — so "make it smaller" is not a setting this system can honestly
 * offer, and the real lever is the export. Saying so plainly beats a suggestion
 * that trades a visible failure for an invisible one.
 */
export function nextDetailAdvice(_detail: ShrinkDetailLevel = DEFAULT_SHRINK_DETAIL): string {
  return 'This garment is too heavy even at the safest settings. It needs to be re-exported from CLO at a lower mesh density — reducing it further here would damage the printed graphics, which is why the old “Smallest file” option was removed on 2026-08-05.'
}
