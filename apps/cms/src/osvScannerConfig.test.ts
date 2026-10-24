import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/*
 * osv-scanner.toml and audit-ci.jsonc must excuse the SAME advisories (2026-10-24).
 *
 * OpenSSF Scorecard v5.6.0 (#240) began reading pnpm-lock.yaml and found 12 advisories; the
 * public grade fell from 6.8 to 6.0. Nine were fixed by override. The three left have no
 * fixed release and were already excused by audit-ci, which gates the deploy and scopes each
 * excuse to the Lighthouse paths it names. osv-scanner.toml excuses an advisory on EVERY
 * path, so it must never excuse one the deploy gate does not, or the public grade would hide
 * a risk the gate still sees. And an entry audit-ci drops (its parent moved to a fixed
 * release) must leave the toml too, or the toml keeps hiding an advisory for nothing.
 */
const REPO_ROOT = join(import.meta.dirname, '..', '..', '..')

/** The advisory ids in an osv-scanner.toml, with each entry's reason. */
function ignoredVulns(toml: string): { id: string; reason: string }[] {
  return toml
    .split(/^\[\[IgnoredVulns\]\]\s*$/m)
    .slice(1)
    .map((block) => ({
      id: block.match(/^id\s*=\s*"([^"]+)"/m)?.[1] ?? '',
      reason: block.match(/^reason\s*=\s*"([^"]*)"/m)?.[1] ?? '',
    }))
}

/** The distinct advisory ids audit-ci.jsonc allowlists (each entry is "<id>|<path>"). */
function allowlistedIds(jsonc: string): string[] {
  const list = jsonc.match(/"allowlist"\s*:\s*\[([\s\S]*?)\]/)?.[1] ?? ''
  const entries = [...list.matchAll(/^\s*"([^"]+)"/gm)].map((m) => m[1])
  return [...new Set(entries.map((entry) => entry.split('|')[0]))].sort()
}

const toml = readFileSync(join(REPO_ROOT, 'osv-scanner.toml'), 'utf8')
const jsonc = readFileSync(join(REPO_ROOT, 'audit-ci.jsonc'), 'utf8')

describe('osv-scanner.toml', () => {
  it('excuses exactly the advisories audit-ci excuses, no more and no fewer', () => {
    const excused = ignoredVulns(toml)
      .map((entry) => entry.id)
      .sort()
    expect(excused).toEqual(allowlistedIds(jsonc))
    // Read 2026-10-24: two extract-zip advisories and zod 3. A changed count is a decision.
    expect(excused).toHaveLength(3)
  })

  it('gives every exception a reason that names where audit-ci scopes it', () => {
    for (const { id, reason } of ignoredVulns(toml)) {
      expect(id, 'an entry has no id').toMatch(/^GHSA-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}$/)
      expect(reason.length, `${id} has no reason`).toBeGreaterThan(40)
      expect(reason, `${id} does not point to audit-ci.jsonc`).toContain('audit-ci.jsonc')
    }
  })

  // Negative controls: the comparison must see both kinds of drift, not only pass the good case.
  it('a toml that excuses one advisory MORE than audit-ci is caught', () => {
    const extra = `${toml}\n[[IgnoredVulns]]\nid = "GHSA-aaaa-bbbb-cccc"\nreason = "x"\n`
    expect(
      ignoredVulns(extra)
        .map((entry) => entry.id)
        .sort(),
    ).not.toEqual(allowlistedIds(jsonc))
  })

  it('an audit-ci entry removed without removing it from the toml is caught', () => {
    const fewer = jsonc.replace(/^\s*"GHSA-mrhx-c7xc-m3w5\|[^"]*",?\s*$/gm, '')
    expect(allowlistedIds(fewer)).not.toContain('GHSA-mrhx-c7xc-m3w5')
    expect(
      ignoredVulns(toml)
        .map((entry) => entry.id)
        .sort(),
    ).not.toEqual(allowlistedIds(fewer))
  })
})
