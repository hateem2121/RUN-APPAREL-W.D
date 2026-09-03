/**
 * The three verdicts the Worker used to make INLINE about a finished file (fix plan
 * Rank 13, audit Q-01): too big to publish, printed artwork decimated without its UVs,
 * and artwork that came out see-through. Each is a pure function of the container's
 * report, returning the sentence the owner reads or null; index.ts throws it as a
 * PermanentJobError, because the same input would produce the same verdict on a retry.
 *
 * Extracted so they are covered: index.ts cannot load under plain vitest
 * (`@cloudflare/containers` imports `cloudflare:workers`), and its exclusion from the
 * coverage floor was justified by "every decision is delegated" — which these three
 * made untrue. Same move as specGate.ts and queueDecisions.ts.
 */
import {
  GLB_HARD_MAX_BYTES,
  type ShrinkDetailLevel,
  formatMb,
  nextDetailAdvice,
} from '@run-apparel/shared'

/** The size verdict: the CMS enforces the same ceiling, but with a bare 400 and no advice. */
export function sizeRefusal(sizeBytes: number, detail: ShrinkDetailLevel): string | null {
  if (!(sizeBytes > GLB_HARD_MAX_BYTES)) return null
  return (
    `The shrunk model is ${formatMb(sizeBytes)}, over the ${formatMb(GLB_HARD_MAX_BYTES)} limit for ` +
    `published media, so it was not saved. ${nextDetailAdvice(detail)}`
  )
}

/**
 * Structural, not a guess: these primitives were decimated with texture coordinates
 * outside the error metric, so their UVs were free to smear. N001 shipped exactly that
 * on 2026-07-29 and a human noticed the wordmark had holes in it.
 */
export function artworkRefusal(artworkAtRisk: readonly string[] | undefined): string | null {
  if (!artworkAtRisk?.length) return null
  return (
    `The printed artwork on ${artworkAtRisk.join(', ')} was damaged while shrinking this file, so it was not saved. ` +
    'Re-upload it with the Detail setting on “Highest quality — bigger file”. ' +
    'If that still fails, the artwork on those parts needs its own UV map in CLO.'
  )
}

/** A hard-edged, opaque print left on BLEND, or a MASK whose cutoff drifted off 0.5. */
export function alphaRefusal(
  problems: readonly { material: string; problem: 'blend' | 'cutoff' }[] | undefined,
): string | null {
  if (!problems?.length) return null
  const blend = problems.filter((p) => p.problem === 'blend').map((p) => p.material)
  const cutoff = problems.filter((p) => p.problem === 'cutoff').map((p) => p.material)
  return (
    (blend.length > 0
      ? `The printed artwork on ${blend.join(', ')} came out see-through: a hard-edged, fully opaque print was left ` +
        'blended, which the pipeline’s own opaque step should have cut out. '
      : `The cut-out threshold on ${cutoff.join(', ')} is wrong, which thins or fattens the lettering. `) +
    'The file was not saved. This is a pipeline fault, not an export problem — re-exporting will not ' +
    'change it; report it. (Soft-edged or deliberately translucent prints no longer refuse a garment; ' +
    'they are listed in the report instead.)'
  )
}

/**
 * The dead-texture repair, judged (fix plan Rank 13, audit HG-06). The reader strips a
 * texture reference that points at no picture so six of 28 exports can be read at all;
 * measured, every one of those was a `metallicRoughnessTexture` on a material already at
 * metallic 0 — harmless. A missing COLOUR or emissive map is different: that picture IS
 * the garment, and a file that renders without it renders the wrong garment. Refuse
 * that, permanently — the same export gives the same hole on a retry.
 */
export const COLOUR_SLOTS = ['baseColorTexture', 'emissiveTexture'] as const

export function repairRefusal(
  repair: { referencesRemoved: number; slots: readonly string[] } | undefined,
): string | null {
  if (!repair?.referencesRemoved) return null
  const colour = repair.slots.filter((slot) => (COLOUR_SLOTS as readonly string[]).includes(slot))
  if (colour.length === 0) return null
  return (
    `A colour picture this export refers to is missing from the file (${colour.join(', ')}): the pipeline can ` +
    'hide a missing shading map, but a missing colour map is the garment’s own picture, so the file was not ' +
    'saved. Re-export from CLO with its textures included.'
  )
}
