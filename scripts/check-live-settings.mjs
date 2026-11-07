#!/usr/bin/env node
/**
 * Live settings the notes rely on, compared with what the notes say.
 *
 *   node scripts/check-live-settings.mjs github   # GITHUB_TOKEN (security-events: read)
 *   node scripts/check-live-settings.mjs r2       # CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID
 *
 * WHY (2026-11-07). Two gaps found that day had sat open for weeks while the notes described
 * the opposite. The `production` environment had NO branch rule from the repository's
 * re-creation on 2026-09-10 — `.github/CLAUDE.md` still described the org-era restriction —
 * so a job on any branch could read the Cloudflare keys. And `run-private` kept every database
 * dump forever: its one expiry rule covered the other site's `backups/` prefix, not ours (319
 * dumps, 3.08 GB). Settings decided by a name or a prefix do not fail loudly; they stop
 * applying. `required-checks.yml` already compared one setting (the ruleset's checks) daily;
 * this extends that to the others. Each EXPECTED value below cites where it was decided.
 *
 * EXIT CODES, as scripts/check-required-checks.mjs: a failed READ never looks like drift.
 *   0  every setting matches — or a read failed (network, 5xx, refused): ::warning::
 *   1  a setting differs: ::error:: names it, with the live and expected values
 *   2  bad arguments
 */
import { realpathSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

const REPOSITORY = 'hateem2121/RUN-APPAREL-W.D'

/** What the notes say. Change a value here only together with the note that decided it. */
export const EXPECTED = {
  github: {
    // .github/CLAUDE.md, "Since 2026-11-07 … lets ONLY `main` use its six secrets".
    'production environment: branch policy': 'custom',
    'production environment: allowed branches': ['main'],
    // .github/CLAUDE.md: default setup at the EXTENDED suite since 2026-10-01 (owner).
    'code scanning: state': 'configured',
    'code scanning: query suite': 'extended',
    'code scanning: covers workflows': true,
    'code scanning: covers JS/TS': true,
  },
  r2: {
    // docs/BACKUP-RESTORE.md, "The R2 copies EXPIRE (owner decision, 2026-11-07)".
    'run-private: viewer-db-nightly-30d': 'run-apparel-viewer-db/ after 30 days',
    'run-private: viewer-db-predeploy-14d': 'run-apparel-viewer-db/pre-deploy/ after 14 days',
  },
}

/**
 * Every key in `expected` whose live value differs (deep, order-sensitive for arrays).
 * A key missing from `live` is a difference too: a setting that could not be read on a
 * SUCCESSFUL answer is not the expected one.
 * @param {Record<string, unknown>} live
 * @param {Record<string, unknown>} expected
 * @returns {{key: string, live: unknown, expected: unknown}[]}
 */
export function compareSettings(live, expected) {
  return Object.entries(expected)
    .filter(([key, want]) => JSON.stringify(live[key]) !== JSON.stringify(want))
    .map(([key, want]) => ({ key, live: key in live ? live[key] : '(absent)', expected: want }))
}

/** GitHub's answers → the flat shape EXPECTED.github uses. */
export function githubSettings({ environment, branchPolicies, codeScanning }) {
  const p = environment?.deployment_branch_policy
  const languages = codeScanning?.languages ?? []
  return {
    'production environment: branch policy': !p
      ? 'none (any branch)'
      : p.custom_branch_policies
        ? 'custom'
        : p.protected_branches
          ? 'protected branches'
          : 'unknown',
    'production environment: allowed branches': (branchPolicies?.branch_policies ?? [])
      .map((b) => (b.type === 'tag' ? `tag:${b.name}` : b.name))
      .sort(),
    'code scanning: state': codeScanning?.state,
    'code scanning: query suite': codeScanning?.query_suite,
    'code scanning: covers workflows': languages.includes('actions'),
    'code scanning: covers JS/TS': languages.includes('javascript-typescript'),
  }
}

/** Cloudflare's lifecycle answer → the flat shape EXPECTED.r2 uses (only our two rules). */
export function r2Settings(lifecycle) {
  const out = {}
  for (const rule of lifecycle?.rules ?? []) {
    if (!rule.id?.startsWith('viewer-db-')) continue
    const days = rule.deleteObjectsTransition?.condition?.maxAge
    const prefix = rule.conditions?.prefix ?? ''
    const state = rule.enabled === false ? ' (DISABLED)' : ''
    out[`run-private: ${rule.id}`] =
      typeof days === 'number'
        ? `${prefix} after ${Math.round(days / 86_400)} days${state}`
        : `${prefix} (no expiry)${state}`
  }
  return out
}

/**
 * A failed read, described WITHOUT the URL: the R2 address carries the Cloudflare account id from
 * the environment, and a public repository's Actions logs are public (.github/CLAUDE.md; CodeQL
 * "clear-text logging of sensitive information", PR #341). Only a fixed label and the status go out.
 */
class ReadError extends Error {}

async function getJson(url, headers, label) {
  const res = await fetch(url, { headers })
  if (!res.ok) throw new ReadError(`HTTP ${res.status} from ${label}`)
  return res.json()
}

async function readGithub() {
  const token = process.env.GITHUB_TOKEN
  const headers = {
    accept: 'application/vnd.github+json',
    ...(token ? { authorization: `Bearer ${token}` } : {}),
  }
  const api = `https://api.github.com/repos/${REPOSITORY}`
  const [environment, branchPolicies, codeScanning] = await Promise.all([
    getJson(`${api}/environments/production`, headers, 'the production environment'),
    getJson(
      `${api}/environments/production/deployment-branch-policies`,
      headers,
      'its branch policies',
    ),
    getJson(`${api}/code-scanning/default-setup`, headers, 'code scanning'),
  ])
  return githubSettings({ environment, branchPolicies, codeScanning })
}

async function readR2() {
  const { CLOUDFLARE_API_TOKEN: token, CLOUDFLARE_ACCOUNT_ID: account } = process.env
  if (!token || !account)
    throw new ReadError('CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID are not set')
  const body = await getJson(
    `https://api.cloudflare.com/client/v4/accounts/${account}/r2/buckets/run-private/lifecycle`,
    {
      authorization: `Bearer ${token}`,
    },
    "run-private's lifecycle rules",
  )
  return r2Settings(body.result)
}

async function main(argv) {
  const which = argv[0]
  if (which !== 'github' && which !== 'r2') {
    console.error('usage: node scripts/check-live-settings.mjs github|r2')
    return 2
  }
  let live
  try {
    live = which === 'github' ? await readGithub() : await readR2()
  } catch (err) {
    console.log(
      // Only our own ReadError text is printed; anything else (a network error) by its name alone.
      `::warning::could not read the live ${which} settings, so nothing was compared: ${err instanceof ReadError ? err.message : `${err?.name ?? 'Error'} (network)`}`,
    )
    return 0
  }
  const diffs = compareSettings(live, EXPECTED[which])
  for (const [key, want] of Object.entries(EXPECTED[which])) {
    const bad = diffs.some((d) => d.key === key)
    console.log(
      `${bad ? '✗' : '✓'} ${key}: ${JSON.stringify(live[key] ?? '(absent)')}${bad ? `  — notes say ${JSON.stringify(want)}` : ''}`,
    )
  }
  for (const d of diffs) {
    console.log(
      `::error::${d.key} is ${JSON.stringify(d.live)}, but the notes say ${JSON.stringify(d.expected)}. Fix the setting, or the note and EXPECTED together.`,
    )
  }
  return diffs.length ? 1 : 0
}

if (process.argv[1] && pathToFileURL(realpathSync(process.argv[1])).href === import.meta.url) {
  process.exitCode = await main(process.argv.slice(2))
}
