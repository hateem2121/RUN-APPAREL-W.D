#!/usr/bin/env node
/**
 * Generate a CycloneDX 1.6 SBOM (Software Bill of Materials — a machine-readable
 * inventory of every dependency and its licence) and enforce a licence policy.
 *
 * WHY THIS, AND WHY NOT GitHub'S BUILT-IN. `actions/attest-build-provenance` and
 * CodeQL both want a public repository or a paid tier; this repo is private and the
 * project's entire budget is $5/month, already spent on Cloudflare Workers Paid for
 * the shrink Containers. So the supply-chain evidence has to be something the repo
 * produces itself.
 *
 * NO NEW DEPENDENCY. Adding an SBOM generator to fix a supply-chain gap would mean
 * trusting one more package to audit the packages — and `pnpm-workspace.yaml`'s
 * 24-hour `minimumReleaseAge` exists precisely because a freshly-published dependency
 * is the risk. This reads `pnpm licenses list --json`, which pnpm already computes
 * from the lockfile it already resolved.
 *
 * TWO OUTPUTS, and the second is the one with teeth:
 *
 *   1. sbom.cdx.json — the inventory. Uploaded as a 90-day CI artifact, so when the
 *      next npm compromise is announced the question "were we running that version
 *      on the day?" has an answer that does not depend on the lockfile's git history
 *      still being readable.
 *   2. A LICENCE GATE. This is a private, commercial B2B product. A strong-copyleft
 *      dependency (AGPL, SSPL, GPL) reaching runtime is a legal problem, not a style
 *      one, and it arrives the same way every other supply-chain problem does — as a
 *      transitive nobody chose. Measured 2026-08-13: 932 distinct packages, 1,067
 *      components (a package pinned at two versions is two components, because "which
 *      version were we running" is the question), 22 licences, zero denied. The gate
 *      starts clean.
 */

import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'

/**
 * Licences that must never appear. Strong copyleft and source-available licences
 * whose obligations a proprietary hosted product cannot meet.
 *
 * NOT on this list, deliberately, with the packages that make it matter:
 *   MPL-2.0            file-level copyleft; using the library unmodified is fine.
 *                      (axe-core, lightningcss — both build/test-time here anyway.)
 *   LGPL-3.0-or-later  @img/sharp-libvips-darwin-arm64, a platform binary sharp
 *                      links. LGPL permits this; it is also a build-time optional
 *                      dependency and never reaches the Workers.
 *   FSL-1.1-MIT        @sentry/cli. Source-available with a non-compete, and it
 *                      converts to MIT after two years. It is a CLI that uploads
 *                      source maps at build time; nothing ships.
 * Each of those was read rather than waved through. Add to the deny list only what
 * the product genuinely cannot carry.
 */
export const DENIED_LICENCE_PATTERNS = [
  /\bAGPL\b/i,
  /\bSSPL\b/i,
  // GPL but NOT LGPL — the negative lookbehind is what keeps @img/sharp-libvips out
  // of the deny list. Without it this rule would fail the build on a platform binary
  // whose licence is entirely compatible.
  /(?<!L)\bGPL-[23]/i,
  /\bBUSL\b/i,
  /Commons[- ]Clause/i,
]

/** @param {string} licence */
export function isDenied(licence) {
  return DENIED_LICENCE_PATTERNS.some((pattern) => pattern.test(licence))
}

/**
 * Convert pnpm's licence report into CycloneDX 1.6 components.
 *
 * Pure — takes the parsed report, returns the document — so the shape can be tested
 * without running pnpm. `serialNumber` and `timestamp` are injected rather than
 * generated here, so two runs on the same tree produce byte-identical output apart
 * from those two fields; a diffable SBOM is far more useful than a fresh one.
 *
 * @param {Record<string, {name: string, versions: string[], license?: string, homepage?: string, description?: string}[]>} report
 * @param {{ timestamp: string, serialNumber: string }} meta
 */
export function toCycloneDx(report, meta) {
  const components = []

  for (const [licence, packages] of Object.entries(report)) {
    for (const pkg of packages) {
      for (const version of pkg.versions) {
        components.push({
          type: 'library',
          name: pkg.name,
          version,
          // Package URL — the identifier vulnerability scanners match on.
          purl: `pkg:npm/${pkg.name.replace('@', '%40')}@${version}`,
          licenses: [{ license: { name: licence } }],
          ...(pkg.description ? { description: pkg.description } : {}),
          ...(pkg.homepage ? { externalReferences: [{ type: 'website', url: pkg.homepage }] } : {}),
        })
      }
    }
  }

  components.sort((a, b) => a.purl.localeCompare(b.purl))

  return {
    bomFormat: 'CycloneDX',
    specVersion: '1.6',
    serialNumber: meta.serialNumber,
    version: 1,
    metadata: {
      timestamp: meta.timestamp,
      component: {
        type: 'application',
        name: 'run-apparel-viewer-monorepo',
        version: '1.0.0',
      },
    },
    components,
  }
}

/**
 * @param {ReturnType<typeof toCycloneDx>} sbom
 * @returns {{ denied: string[], byLicence: Map<string, number> }}
 */
export function auditLicences(sbom) {
  const denied = []
  const byLicence = new Map()

  for (const component of sbom.components) {
    const licence = component.licenses?.[0]?.license?.name ?? 'UNKNOWN'
    byLicence.set(licence, (byLicence.get(licence) ?? 0) + 1)
    if (isDenied(licence)) denied.push(`${component.name}@${component.version} — ${licence}`)
  }

  return { denied, byLicence }
}

function main() {
  const out = process.argv[2] ?? 'sbom.cdx.json'

  const raw = execFileSync('npx', ['--yes', 'pnpm@10.33.0', 'licenses', 'list', '--json'], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'ignore'],
  })

  const sbom = toCycloneDx(JSON.parse(raw), {
    // Deterministic apart from these two. SOURCE_DATE_EPOCH is honoured so a
    // reproducible build can pin them.
    timestamp: new Date(
      Number(process.env.SOURCE_DATE_EPOCH ?? Date.now() / 1000) * 1000,
    ).toISOString(),
    serialNumber: `urn:uuid:${process.env.SBOM_UUID ?? '00000000-0000-4000-8000-000000000000'}`,
  })

  writeFileSync(out, `${JSON.stringify(sbom, null, 2)}\n`)

  const { denied, byLicence } = auditLicences(sbom)
  console.log(`[sbom] ${sbom.components.length} components → ${out}`)
  for (const [licence, count] of [...byLicence].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(count).padStart(4)}  ${licence}`)
  }

  if (denied.length > 0) {
    console.error('\n::error::Denied licence(s) found in the dependency tree:')
    for (const entry of denied) console.error(`::error::  ${entry}`)
    console.error(
      '\nThis is a private commercial product. A strong-copyleft dependency is a legal\n' +
        'problem, not a style one. Remove it, or — if its obligations genuinely can be\n' +
        "met — add it to DENIED_LICENCE_PATTERNS' documented exceptions with the reason.\n",
    )
    process.exit(1)
  }
  console.log('[sbom] licence policy passed.')
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  main()
}
