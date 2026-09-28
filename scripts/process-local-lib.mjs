/**
 * The pure decisions behind `scripts/process-local.mjs`, kept apart so they are tested
 * (`apps/cms/src/processLocal.test.ts`) without a 1.8 GB export, a network or an API key.
 *
 * Every function here guards the one rule that script exists to keep: a garment processed
 * on the owner's Mac must be byte-for-byte what the Cloudflare robot would have made from
 * the SAME raw CLO export (owner decision 2026-09-27: process locally, $0 container cost).
 */

/**
 * Is this glTF already pipeline output rather than a raw CLO export?
 *
 * ⚠️ A SECOND PASS SILENTLY DROPS ARTWORK PROTECTION (root CLAUDE.md, 🔴). The
 * `guard-pipeline-input` hook refuses it on the CLI; this script calls the pipeline as a
 * library, where no hook can see it, so it must refuse by itself. The pipeline stamps
 * `asset.copyright` "© RUN Apparel…" and glTF-Transform writes its own generator; a raw
 * CLO 2025.2 export carries `CLO Standalone OnlineAuth 2025.2.236` (census 2026-09-27,
 * 43 of 43 exports) and neither mark.
 *
 * @param {{ asset?: { generator?: unknown, copyright?: unknown } }} gltf
 * @returns {string | null} why it is refused, or null for a raw export
 */
export function pipelineOutputReason(gltf) {
  const generator = String(gltf?.asset?.generator ?? '')
  const copyright = String(gltf?.asset?.copyright ?? '')
  if (/RUN Apparel/i.test(copyright)) return `its copyright reads "${copyright}"`
  if (/glTF-Transform/i.test(generator)) return `its generator is "${generator}"`
  return null
}

/**
 * The pipeline dependencies whose versions decide the output bytes. The container installs
 * them from `tools/asset-pipeline/package-lock.json` (npm, read only by the Dockerfile), the
 * Mac from `pnpm-lock.yaml`, and nothing keeps the two in step — so they are compared on
 * every run rather than trusted (plan R7).
 */
export const PIPELINE_PACKAGES = [
  '@gltf-transform/core',
  '@gltf-transform/extensions',
  '@gltf-transform/functions',
  'draco3dgltf',
  'gltf-validator',
  'ktx2-encoder',
  'meshoptimizer',
  'sharp',
]

/**
 * @param {Record<string, string | null>} installed name -> version found on this Mac
 * @param {{ packages?: Record<string, { version?: string }> }} lock the container's lockfile
 * @returns {string[]} one line per package that differs or is missing; empty when all match
 */
export function versionMismatches(installed, lock) {
  const problems = []
  for (const name of PIPELINE_PACKAGES) {
    const expected = lock?.packages?.[`node_modules/${name}`]?.version ?? null
    const actual = installed[name] ?? null
    if (expected === null) problems.push(`${name}: not in the container's lockfile`)
    else if (actual === null)
      problems.push(`${name}: not installed here (container has ${expected})`)
    else if (actual !== expected)
      problems.push(`${name}: ${actual} here, ${expected} in the container`)
  }
  return problems
}

/**
 * The one file of a kind in a garment folder, or why there is not exactly one. A folder
 * with two zips is a question for the owner, never a guess.
 *
 * @param {string[]} names file names in the folder
 * @param {string} extension e.g. '.zip'
 * @returns {{ name: string } | { error: string }}
 */
export function pickSingle(names, extension) {
  const matches = names.filter(
    (n) => n.toLowerCase().endsWith(extension) && !n.startsWith('.') && !n.startsWith('__MACOSX'),
  )
  if (matches.length === 1) return { name: matches[0] }
  if (matches.length === 0) return { error: `no ${extension} file` }
  return {
    error: `${matches.length} ${extension} files (${matches.join(', ')}) — which one is ambiguous`,
  }
}

/** Letters and digits only, lower case: how a folder name and a product name are compared. */
export function squashName(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

/**
 * The upload key the finished model is named from. `suggestedFilename()` (the robot's own,
 * apps/shrink/container/report.ts) turns `r-atw-2026-09-27.glb` into
 * `r-atw-2026-09-27-optimized.glb`: the slug says which garment, the date guarantees a URL
 * no cache has ever seen — the same guarantee `ingest-local-glb.mjs` gives the robot.
 *
 * @param {string} slug a product slug such as `r-atw`
 * @param {Date} now
 */
export function modelKeyFor(slug, now) {
  if (!/^[a-z0-9-]+$/.test(slug)) throw new Error(`not a product slug: ${slug}`)
  return `${slug}-${now.toISOString().slice(0, 10)}.glb`
}

/**
 * The admin-only provenance note on the Media doc: which export, when, from which commit.
 * Deliberately NO folder path: the owner's folder name is theirs, and this field needs
 * only enough to find the export again.
 *
 * @param {{ zipName: string, zipBytes: number, sha256: string, commit: string, now: Date }} input
 */
export function sourceReferenceFor({ zipName, zipBytes, sha256, commit, now }) {
  return (
    `Processed on the owner's Mac ${now.toISOString().slice(0, 10)} by scripts/process-local.mjs ` +
    `at commit ${commit.slice(0, 12)} from CLO export "${zipName}" (${zipBytes} bytes zipped, ` +
    `raw GLB sha256 ${sha256.slice(0, 16)}…).`
  )
}

/**
 * The owner's chosen colour names, applied BEFORE the colour import runs.
 *
 * WHY. The import (`buildImportedRow`, packages/shared/src/importColours.ts) writes the
 * sampler's name AND SLUG for every high-confidence colour, and a slug is never changed
 * afterwards: it becomes the web address on a printed QR tag, and `publish-garment.mjs` only
 * fills a BLANK one. On 2026-09-27 the sampler read THE KINETIC MATRIX JACKET's yellow, pink,
 * teal, lime and orange colourways as "Black #000000", all at high confidence — so without
 * this the jacket's five permanent addresses would have been black, black-2 … black-5. The
 * owner delegated the colour words ("you choose"), so the choice lives in the committed
 * `scripts/colourway-names.json` and is in place before anything is written.
 *
 * No plan → the robot's colours, untouched. A plan must name exactly the file's colours,
 * each once, with a unique web-address slug; anything else is refused, never half-applied.
 * The HEX stays the one measured off the file; only the words come from the plan.
 *
 * @param {Array<{ variantId: string, hex: string, name: string, slug: string, deltaE: number, confidence: 'high' | 'low' }>} fileColours
 * @param {{ colours?: Array<{ variantId?: unknown, displayName?: unknown, slug?: unknown }> } | undefined} plan
 */
export function withNamePlan(fileColours, plan) {
  if (!plan) return { colours: fileColours }
  const planned = Array.isArray(plan.colours) ? plan.colours : []
  const byVariant = new Map()
  for (const entry of planned) {
    const variantId = String(entry?.variantId ?? '')
    if (byVariant.has(variantId)) return { error: `the plan names "${variantId}" twice` }
    byVariant.set(variantId, entry)
  }
  const fileIds = new Set(fileColours.map((c) => c.variantId))
  const missing = [...fileIds].filter((id) => !byVariant.has(id))
  const extra = [...byVariant.keys()].filter((id) => !fileIds.has(id))
  if (missing.length || extra.length) {
    return {
      error:
        `the plan does not match the file's colours` +
        (missing.length ? ` — missing ${missing.join(', ')}` : '') +
        (extra.length ? ` — not in the file: ${extra.join(', ')}` : ''),
    }
  }
  const seen = new Set()
  const colours = []
  for (const colour of fileColours) {
    const entry = byVariant.get(colour.variantId)
    const name = String(entry.displayName ?? '').trim()
    const slug = String(entry.slug ?? '')
    if (!name) return { error: `"${colour.variantId}" has no name in the plan` }
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug))
      return { error: `"${slug}" (${colour.variantId}) is not a web-address word` }
    if (seen.has(slug)) return { error: `the slug "${slug}" is used twice` }
    seen.add(slug)
    colours.push({ ...colour, name, slug, confidence: 'high' })
  }
  return { colours }
}
