/** Types for `process-local-lib.mjs`, so `apps/cms/src/processLocal.test.ts` is typed. */

export function defaultScratchRoot(env: Record<string, string | undefined>, home: string): string

export function pipelineOutputReason(gltf: {
  asset?: { generator?: unknown; copyright?: unknown }
}): string | null

export const PIPELINE_PACKAGES: readonly string[]

export function versionMismatches(
  installed: Record<string, string | null>,
  lock: { packages?: Record<string, { version?: string }> },
): string[]

export function pickSingle(names: string[], extension: string): { name: string } | { error: string }

export function squashName(value: unknown): string

export function modelKeyFor(slug: string, now: Date): string

export function sourceReferenceFor(input: {
  zipName: string
  zipBytes: number
  sha256: string
  commit: string
  now: Date
}): string

export function withNamePlan<
  C extends { variantId: string; name: string; slug: string; confidence: 'high' | 'low' },
>(
  fileColours: C[],
  plan:
    | { colours?: Array<{ variantId?: unknown; displayName?: unknown; slug?: unknown }> }
    | undefined,
): { colours: C[] } | { error: string }
