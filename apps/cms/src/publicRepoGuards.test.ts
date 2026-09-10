import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * Guards that exist because this repository is PUBLIC — added 2026-09-10, the day after
 * it went public.
 *
 * ⚠️ TWO THINGS WERE SAFE ONLY WHILE NOBODY OUTSIDE COULD READ THE REPOSITORY.
 *
 * 1. ARTIFACTS. On a public repository any signed-in GitHub account can download a
 *    workflow artifact. `nightly-backup.yml` uploaded the production D1 dump — user
 *    password hashes and encrypted API keys — and `ci.yml` uploaded another before every
 *    migration. Nothing under `backups/` may now be uploaded unless it is an
 *    age-encrypted `.age` file.
 * 2. CACHES. A job holding the production environment must not restore a pnpm store that
 *    an earlier job, holding no secrets, saved: anything that ran during that earlier
 *    install could plant code the privileged job then executes. That is the shape of
 *    TanStack's 2026-05-11 compromise, and setup-node's own README advises disabling
 *    automatic caching for workflows with elevated privileges.
 *
 * Both checks read the workflow TEXT with comments stripped, as auditGuards.test.ts's
 * FA-S-06 does, because the workflows explain these very lines at length in comments.
 * Each check carries a negative control, and each has an "is it vacuous?" assertion.
 */

const WORKFLOWS = fileURLToPath(new URL('../../../.github/workflows/', import.meta.url))

function stripComments(text: string): string {
  return text.replace(/^\s*#.*$/gm, '')
}

function workflows(): Array<{ file: string; text: string }> {
  return readdirSync(WORKFLOWS)
    .filter((file) => file.endsWith('.yml') || file.endsWith('.yaml'))
    .map((file) => ({ file, text: stripComments(readFileSync(`${WORKFLOWS}${file}`, 'utf8')) }))
}

/** The jobs of one workflow, keyed by job id. Job ids sit two spaces in, under `jobs:`. */
function jobs(workflow: string): Map<string, string> {
  const result = new Map<string, string>()
  const start = workflow.search(/^jobs:\s*$/m)
  if (start === -1) return result
  const body = workflow.slice(start)
  const headers = [...body.matchAll(/^ {2}([A-Za-z0-9_-]+):\s*$/gm)]
  headers.forEach((header, index) => {
    const from = header.index ?? 0
    const to = headers[index + 1]?.index ?? body.length
    result.set(header[1] ?? '', body.slice(from, to))
  })
  return result
}

const holdsProduction = (job: string) => /^\s+environment:/m.test(job)
const installsPackages = (job: string) => /uses:\s*actions\/setup-node@/.test(job)

/** Every way a production job could restore a cache, named by job id. */
function cachedProductionJobs(workflow: string): string[] {
  const found: string[] = []
  for (const [id, job] of jobs(workflow)) {
    if (!holdsProduction(job)) continue
    if (/uses:\s*actions\/cache[/@]/.test(job)) found.push(`${id}: uses actions/cache`)
    if (!installsPackages(job)) continue
    if (!/^\s+cache:\s*''\s*$/m.test(job)) found.push(`${id}: setup-node without cache: ''`)
    if (!/^\s+package-manager-cache:\s*false\s*$/m.test(job)) {
      found.push(`${id}: setup-node without package-manager-cache: false`)
    }
  }
  return found
}

/** Every upload-artifact `path:` that reaches into backups/ without being an `.age` file. */
function plaintextBackupUploads(workflow: string): string[] {
  const found: string[] = []
  for (const step of workflow.split(/\n(?= {6}- )/)) {
    if (!/uses:\s*actions\/upload-artifact@/.test(step)) continue
    for (const match of step.matchAll(/^\s+path:\s*(.+)$/gm)) {
      const path = (match[1] ?? '').trim()
      if (path.includes('backups/') && !path.endsWith('.age')) found.push(path)
    }
  }
  return found
}

describe('public repository — backups never leave as plaintext artifacts', () => {
  it('no workflow uploads anything under backups/ unless it is age-encrypted', () => {
    const offenders = workflows().flatMap(({ file, text }) =>
      plaintextBackupUploads(text).map((path) => `${file}: ${path}`),
    )
    expect(
      offenders,
      'a plaintext backup artifact is downloadable by every GitHub account',
    ).toEqual([])
  })

  it('and the encrypted uploads really exist, so the check above is not passing vacuously', () => {
    const nightly = workflows().find(({ file }) => file === 'nightly-backup.yml')?.text ?? ''
    expect(nightly).toMatch(/path:\s*backups\/d1\/\*\.sql\.age\s*$/m)
    expect(nightly).toMatch(/path:\s*backups\/r2-mirror\.tar\.age\s*$/m)
  })

  it('NEGATIVE CONTROL: a plaintext dump upload is caught', () => {
    const bad = [
      'jobs:',
      '  backup:',
      '    steps:',
      `      - uses: actions/upload-artifact@${'a'.repeat(40)}`,
      '        with:',
      '          path: backups/d1/*.sql',
      '',
    ].join('\n')
    expect(plaintextBackupUploads(bad)).toEqual(['backups/d1/*.sql'])
  })
})

describe('public repository — jobs holding production never restore a cache', () => {
  it('every job with the production environment installs without a restored cache', () => {
    const offenders = workflows().flatMap(({ file, text }) =>
      cachedProductionJobs(text).map((problem) => `${file}: ${problem}`),
    )
    expect(offenders).toEqual([])
  })

  it('and such jobs exist, so the check above is not passing vacuously', () => {
    const count = workflows().reduce(
      (total, { text }) =>
        total +
        [...jobs(text).values()].filter((job) => holdsProduction(job) && installsPackages(job))
          .length,
      0,
    )
    expect(
      count,
      'ci.yml deploy, deploy-shrink, nightly-backup and diagnostics-digest',
    ).toBeGreaterThanOrEqual(4)
  })

  it('NEGATIVE CONTROL: a production job that restores the pnpm cache is caught', () => {
    const bad = [
      'jobs:',
      '  deploy:',
      '    environment: production',
      '    steps:',
      `      - uses: actions/setup-node@${'b'.repeat(40)}`,
      '        with:',
      '          cache: pnpm',
      '',
    ].join('\n')
    expect(cachedProductionJobs(bad)).toEqual([
      "deploy: setup-node without cache: ''",
      'deploy: setup-node without package-manager-cache: false',
    ])
  })
})
