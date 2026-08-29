/**
 * Whether the official glTF verdict should refuse a shrunk garment, and what to say.
 *
 * ⚠️ WHY THIS IS A SEPARATE MODULE. The verdict is computed on every garment by
 * `inspectGlb` inside the container, and until 2026-08-29 it was thrown away: the
 * container's report object kept seven neighbouring fields from the same result and
 * dropped this one, `report.ts` never read it, and `ShrinkReport` in the Worker had no
 * such field at all. Both live garments are invalid glTF as a result — 44 errors on the
 * cycling suit, all from a WebP pass that wrote `image/webp` without declaring
 * `EXT_texture_webp`.
 *
 * The obvious fix is a few lines inside `index.ts`. That is also how the OTHER gates
 * are written, and `index.ts` is 760 lines that no test touches — it is excluded from
 * coverage at `vitest.config.ts`, so the package's 100% threshold measures 52 lines and
 * none of the refuse/retry/dead-letter decisions. Adding a fourth unguarded gate there
 * would repeat the exact failure this change exists to close.
 *
 * So the decision lives here, pure and tested, and `index.ts` keeps only the wiring —
 * the same split as `deadLetter.ts` and `containerFailure.ts`, both at 100%.
 */

/** The bounded verdict a container sends. See `ShrinkReport['spec']`. */
export interface SpecVerdict {
  validatorVersion: string
  errors: number
  warnings: number
  /** Optional: wire data, and an older container may omit it while still sending a count. */
  issues?: string[]
}

/** At most this many problems are quoted back. A broken file can carry hundreds. */
export const MAX_QUOTED_ISSUES = 5

/**
 * The refusal message, or `null` to let the job through.
 *
 * ⚠️ FAILS OPEN ON AN ABSENT VERDICT, DELIBERATELY. `spec` is missing from any container
 * image built before 2026-08-29, and treating that as "invalid" would refuse every job
 * the moment this deploys while images roll forward. The artwork gates make the same
 * choice for the same reason. The cost is that an old image silently skips the check,
 * which is the correct trade for a window measured in hours.
 */
export function specRefusal(spec: SpecVerdict | undefined): string | null {
  // Narrowed once, here. Everything below can then use `spec` directly rather than
  // carrying `?.` fallbacks that are unreachable — an absent verdict has already
  // returned, so a "(unknown version)" branch could never execute and would sit
  // permanently uncovered, which is how a threshold starts measuring nothing.
  if (!spec || spec.errors <= 0) return null

  const quoted = (spec.issues ?? []).slice(0, MAX_QUOTED_ISSUES)
  const detail = quoted.length
    ? `\nThe first problems are:\n${quoted.map((i) => `  • ${i}`).join('\n')}`
    : ''

  return (
    `The processed model is not a valid 3D file — ${spec.errors} error${spec.errors === 1 ? '' : 's'} ` +
    `from the official glTF validator (${spec.validatorVersion}), so it was ` +
    'not saved. A web browser would probably still show it, but other 3D software is entitled ' +
    'to refuse it.' +
    detail
  )
}
