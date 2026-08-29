/**
 * Which of three buckets a MATERIAL name falls into, for the metalness fix.
 *
 * WHY MATERIAL NAMES AND NOT TEXTURE NAMES. Measured 2026-08-26 across all 28 raw
 * CLO exports: **0 of 5,048 images carry a name or URI**, while every material is
 * named. Any classifier reading a texture name is silently inert on a real CLO
 * file. This has already cost two attempts — see tools/asset-pipeline/CLAUDE.md
 * and the note on `isArtworkMaterialByName` in texture-artwork.ts.
 *
 * WHY A THIRD WORD LIST. This repo deliberately keeps three already, and merging
 * them has been tried and reverted:
 *   - `ARTWORK_NAME` (texture-artwork.ts) includes `text` and `type`, so
 *     `Textile_Cotton` and `Polyester_Textured` classify as artwork. For a
 *     TEXTURE name that is harmless; here it would exempt real fabric from the
 *     metalness fix.
 *   - `TRIM_NAME` (variant-colour.ts) includes `trim`, `thread`, `stitch` and
 *     `label`. It answers "which surface names this colourway", not "is this
 *     metal". Reusing it would sweep `Trim_*` into a bucket the owner explicitly
 *     asked to leave alone.
 *
 * THE THIRD BUCKET IS A REAL OUTPUT, NOT A LEFTOVER. Owner decision, 2026-08-26:
 * the 20 `Trim_*` materials on ENDURANCE TRACKSUIT and Training Trouser sit at
 * metallic 1.0 / roughness 0.1 and could legitimately be metal trim OR fabric
 * binding. They are REPORTED on every run and never rewritten. Do not "tidy" this
 * by adding `trim` to HARDWARE or FABRIC without a rendered crop: both garments
 * are texture-heavy, so a wrong guess is visible across a whole panel.
 */
export type MaterialClass = 'hardware' | 'fabric' | 'unclassified'

/**
 * Token boundary. `\b` is NOT usable: `_` is a word character, so `\bslider`
 * would not match `Zipper_Slider` — the single most important real name this has
 * to catch. Same reasoning as `ARTWORK_MATERIAL_NAME` in texture-artwork.ts.
 */
const BOUNDARY_START = '(^|[^a-z])'
const BOUNDARY_END = '([^a-z]|$)'

/**
 * Garment hardware. Metal is CORRECT here.
 *
 * MEASURED 2026-08-26 by running this classifier over every material name in all 28
 * raw exports — not by reading it. Of the 6,666 materials, **515 are metallic with
 * no `metallicRoughnessTexture` to override them**, and this bucket takes **440** of
 * those. The remaining 75 split 55 fabric / 20 unclassified, which closes the 515
 * exactly.
 *
 * ⚠️ The design document said 35 fabric, and its own arithmetic gave it away:
 * 515 − 440 = 75, but 35 + 20 = 55. The 35 counted distinct NAMES. Training Trouser
 * carries 20 distinct names across 40 materials, five of them repeating once per
 * colourway. Corrected there on 2026-08-26.
 */
const HARDWARE = new RegExp(
  `${BOUNDARY_START}(zipper|zip|slider|puller|stopper|topstopper|bottomstopper|button|snap|rivet|buckle|hook|eyelet|grommet|dring|люверсы)${BOUNDARY_END}`,
  'i',
)

/**
 * Cloth and printed artwork. Metal is WRONG here; these are the 55 offenders'
 * family. Artwork words are included because a printed decal is no more metal
 * than the cloth under it.
 */
const FABRIC = new RegExp(
  `${BOUNDARY_START}(fabric|cloth|textile|cotton|nylon|polyester|jersey|fleece|terry|canvas|mesh|knit|woven|denim|twill|satin|lycra|spandex|elastane|rib|poplin|chiffon|velvet|wool|linen|logo|print|graphic|artwork|label|decal|badge|emblem|wordmark)${BOUNDARY_END}`,
  'i',
)

/**
 * Split CamelCase into separate tokens before matching.
 *
 * ⚠️ WITHOUT THIS THE WHOLE CLASSIFIER IS HALF-BLIND, AND IT WAS. CLO writes
 * compound names with no separator — `TapeFabric`, `TopStopper`, `BottomStopper` —
 * so `fabric` in `Zipper 1_TapeFabric_3583` is preceded by the `e` of "Tape".
 * `BOUNDARY_START` rejects that, and the material classified as pure hardware: the
 * zipper's woven tape would have been pinned at metallic 1.0 by the very function
 * written to stop that happening. Measured by running the regex, not by reading it.
 *
 * This is the third time a name-based check in this pipeline has looked correct and
 * done nothing on real CLO data — see `isArtworkMaterialByName` in
 * texture-artwork.ts (0 of 5,048 textures carry a name) and the two attempts before
 * it. The lesson is the same one: run it against real names.
 *
 * Inserting a space at each lower-to-upper transition is safe for the cases the
 * boundary rule exists to reject, because those are all-lowercase continuations:
 * `Buttonhole` and `Cottontail` have no transition and still do not match.
 */
function splitCamelCase(name: string): string {
  return name.replace(/([a-z0-9])([A-Z])/g, '$1 $2')
}

/**
 * Classify a material name.
 *
 * ⚠️ A NAME CARRYING BOTH IS AMBIGUOUS AND IS REPORTED, NOT RESOLVED BY ORDERING.
 * An earlier draft of this file said "hardware wins ties", on the reasoning that a
 * zipper's slider is metal whatever else the name mentions. That is wrong on a
 * real name from the catalogue: `Zipper 1_TapeFabric_3583` is the woven TAPE a
 * zipper's teeth are sewn onto — fabric — and "hardware wins" would have pinned it
 * at metallic 1.0 permanently, which is the exact defect this module exists to fix,
 * reintroduced by the fix itself.
 *
 * Deciding it the other way is no better: `Zipper_Slider_*` would then be forced to
 * metallic 0 and a real metal slider would go flat. There is no ordering that is
 * right for both, so neither is chosen. This is the same rule the owner set for the
 * 20 `Trim_*` materials on 2026-08-26 — when the name cannot say, report it and let
 * a human look. Caught by writing the test before the implementation.
 */
export function classifyMaterialName(name: string): MaterialClass {
  const n = splitCamelCase(name || '')
  const hardware = HARDWARE.test(n)
  const fabric = FABRIC.test(n)
  if (hardware && fabric) return 'unclassified'
  if (hardware) return 'hardware'
  if (fabric) return 'fabric'
  return 'unclassified'
}
