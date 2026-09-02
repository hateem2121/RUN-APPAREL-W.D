import type { GlbDescription, GlbFamily } from './describe'

/**
 * Choose compression flags for the family a raw export actually belongs to.
 *
 * `shrinkFlagsFor` returns one hardcoded list for every garment and justifies it
 * with: "Geometry, not texture, is what makes a CLO export huge (measured: textures
 * were 2.1 MB in every variant of the 373 MB export)". That was true of the ONE
 * garment it was measured on. Measured 2026-08-26 across all 28 raw exports, it is
 * false for 15 of them: X-MILO CORE OVERSIZE carries 1,022.7 MB of textures against
 * 55.3 MB of geometry, and the run still spends its budget as though geometry were
 * the cost, then compresses the textures to fit.
 *
 * ⚠️ WHAT THE DESIGN DOCUMENT GOT WRONG. It proposed dropping `--simplify` for the
 * whole texture family, "there is nothing to gain". Measured both ways: dropping it
 * costs **+0.0%** on `women athlatic dress` — a byte-identical file, 9,980 triangles
 * — and **+13%** on X-MILO, 80.2 MB against 71.0 MB, because that garment still
 * carries 1.77 M triangles despite being 95% textures by size. Triangle count
 * decides geometry; texture fraction decides textures. So the geometry flags are
 * left exactly as they are for everybody, and only the TEXTURE budget moves.
 *
 * ⚠️ AND THE ARTWORK IS NOT THE COST. Verified by comparing the textures directly:
 * X-MILO's artwork textures are BYTE-IDENTICAL between the two settings — 3169x476
 * at 29.3 KB in each, along with every other small texture. Only the 4096x3195
 * fabric atlases are downsampled. An earlier reading of a macro crop concluded the
 * lettering was damaged; it was not, and the letterforms appeared in that difference
 * image only because the CLOTH around each stroke changed and outlined them.
 *
 * WHERE THIS RUNS. The Worker calls `shrinkFlagsFor` before the raw file has been
 * downloaded — it has an R2 key and nothing else — and `packages/shared` is
 * lint-forbidden from importing `node:*`, so it can never read a file. The Container
 * downloads the file and imports this package by relative path.
 *
 * ⚠️ EVERYTHING THIS ADDS IS A LITERAL IN THIS FILE. `container/server.ts` records
 * that what kept the flag path safe was "upstream — shrinkFlagsFor returns hardcoded
 * literals chosen by a two-value enum", NOT the filter that looked like it was doing
 * the work. This function is now part of that upstream and must never interpolate a
 * value or pass a caller's token into a position `parseOptimizeArgs` could read as
 * the input path.
 */

/**
 * The texture budget for a texture-heavy garment. HARDCODED, and chosen by the
 * calibration sweep in docs/GARMENT-CATALOGUE-BASELINE.md — not by argument, and
 * not by tuning against file size, which is exactly how a setting that protected
 * artwork LESS once shipped as "Smallest file".
 *
 * Measured on X-MILO: 71.0 MB (over the 40 MB ceiling, unpublishable) -> 24.8 MB,
 * with the artwork untouched. The cost is fabric weave detail, 0.03% of pixels
 * different at normal viewing distance and visible only at a 5-degree macro crop.
 * Artwork keeps its own higher cap and quality, so fabric pays and graphics do not.
 */
const TEXTURE_FAMILY_FLAGS: readonly string[] = [
  '--max-texture',
  '2048',
  '--data-max-texture',
  '1024',
  '--quality',
  '70',
  '--artwork-quality',
  '95',
]

/** Flags TEXTURE_FAMILY_FLAGS sets, so a re-run replaces rather than duplicates them. */
const TEXTURE_FAMILY_KEYS = new Set(TEXTURE_FAMILY_FLAGS.filter((t) => t.startsWith('--')))

/**
 * Refine a base flag list for one garment's family.
 *
 * `geometry` and `mixed` are returned BYTE-IDENTICAL: twelve garments plus Mantra
 * Ray must not move at all, and identical by construction is a stronger guarantee
 * than verified afterwards.
 */
export function refineFlagsForFamily(flags: readonly string[], family: GlbFamily): string[] {
  if (family !== 'texture') return [...flags]

  const kept: string[] = []
  for (let i = 0; i < flags.length; i++) {
    const token = flags[i]!
    // Drop the flag AND the value it carries. Leaving the value behind would strand
    // a bare token that parseOptimizeArgs reads as the input path.
    if (TEXTURE_FAMILY_KEYS.has(token)) {
      i++
      continue
    }
    kept.push(token)
  }
  return [...kept, ...TEXTURE_FAMILY_FLAGS]
}

/**
 * Below this many triangles a raw export is NOT decimated at all — `--simplify` and
 * its budget are dropped; textures, the topstitch pass and the codec still apply.
 *
 * WHY. `shrinkFlagsFor` was written for exports of millions of triangles (N001 10.6 M,
 * the Cycling-Bib 34.0 M), where decimation is what makes the file publishable. The
 * owner's finished garments are two orders of magnitude smaller, and on those the
 * general decimator buys almost nothing and costs the print: on ARISAN BRA (97,850
 * triangles) it saved 0.42 MB of a 40 MB budget and tore holes in the brush panels
 * (audit F1-02); on the Training Trouser (366,084) it shredded the chevrons while every
 * gate passed (A-01); on Minecut it pushed decimated print triangles behind the cloth,
 * which read as white holes (A-04).
 *
 * MEASURED 2026-09-02 (scripts/robot-flags.mjs --json, every garment on this machine):
 *   FIXED GLBs: ARISAN 97,850 · WOMEN ZIP-UP VEST 135,535 · APEX 207,659 · ARMOR 209,406
 *               AERO 266,585 · Minecut 299,002 · AGGRESSOR JERSEY 444,764
 *   old exports: Mantra Ray 149,179 · Training Trouser 366,084 · X-Milo 693,500
 *                N001 10,616,491 · Cycling-Bib 33,964,432
 * 500,000 keeps every finished garment and the two small old exports whole, and still
 * decimates X-Milo and the two big exports — where prints are protected by
 * `decimateArtwork: false` in simplify-textured.ts anyway. A garment at 500k
 * triangles is roughly 6–8 MB of meshopt geometry: far from the 40 MB ceiling, and
 * the size gate still stands behind this rule.
 */
export const SMALL_EXPORT_MAX_TRIANGLES = 500_000

/** The flags dropped, with their values, when an export is small. */
const GENERAL_DECIMATION_KEYS = new Set(['--simplify', '--simplify-error', '--uv-weight'])

/**
 * Drop general decimation for a small export. Returns a new array; unchanged (but
 * still copied) at or above the threshold or when the file could not be read — a
 * readout failure must never silently alter a garment's compression.
 */
export function refineFlagsForSize(flags: readonly string[], triangles: number | null): string[] {
  if (triangles === null || !(triangles < SMALL_EXPORT_MAX_TRIANGLES)) return [...flags]
  const kept: string[] = []
  for (let i = 0; i < flags.length; i++) {
    const token = flags[i]!
    if (GENERAL_DECIMATION_KEYS.has(token)) {
      i++
      continue
    }
    kept.push(token)
  }
  return kept
}

/**
 * Everything the container does to the Worker's flags once it can see the file:
 * the family refinement, then the small-export rule. `describeGlb` reads only the
 * JSON chunk, so both cost milliseconds. A description carrying `error` refines to
 * 'mixed' (unchanged) and keeps decimation — the failure direction that cannot
 * silently change a garment.
 */
export function refineFlags(flags: readonly string[], description: GlbDescription): string[] {
  const family = description.error ? 'mixed' : description.family
  const triangles = description.error ? null : description.triangles
  return refineFlagsForSize(refineFlagsForFamily(flags, family), triangles)
}
