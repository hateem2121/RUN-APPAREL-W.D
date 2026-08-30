import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * The runbook's emergency commands must name things that actually exist.
 *
 * WHY THIS IS DIFFERENT FROM claudeMd.test.ts. That guard checks cited PATHS resolve.
 * This checks the two things a rollback command can get wrong that a path check
 * cannot see: the WORKER NAME (`--name run-apparel-viewer-site`) and the pinned
 * WRANGLER VERSION. Neither is a path, and both are copy-pasted verbatim by a person
 * who is, by definition, in the middle of an outage and not in a position to debug the
 * instructions.
 *
 * IT FOUND ONE ON THE DAY IT WAS WRITTEN. `docs/RUNBOOK.md` pinned every rollback
 * command to `npx wrangler@4.114.0` — the version the section was verified against on
 * 2026-08-08 — while the repo had since moved to 4.122.0 (the deliberate bump that
 * carries the workers-types peer warning). Stale but harmless is the good case;
 * "verified against" a version nobody runs any more is exactly how a documented
 * command quietly stops matching its tool's flags.
 *
 * A renamed Worker is the worse case and the one that motivated the name check:
 * `wrangler rollback --name <wrong>` does not roll anything back, and its error is
 * about a missing script, not about the runbook.
 */

const REPO_ROOT = join(import.meta.dirname, '..', '..', '..')
const read = (rel: string) => readFileSync(join(REPO_ROOT, rel), 'utf8')

/** Worker names, taken from the wrangler configs rather than restated here. */
const workerNames = (): string[] =>
  ['apps/viewer', 'apps/cms', 'apps/shrink', 'infra/apex-404']
    .map((app) => read(`${app}/wrangler.jsonc`))
    // The first top-level "name" in each config is the Worker's own; later ones are
    // binding names (e.g. the container binding in apps/shrink).
    .map((source) => source.match(/^\s*"name":\s*"([^"]+)"/m)?.[1])
    .filter((name): name is string => Boolean(name))

const installedWrangler = (): string => {
  const pkg = JSON.parse(read('apps/viewer/package.json')) as {
    devDependencies: Record<string, string>
  }
  return pkg.devDependencies.wrangler as string
}

describe('RUNBOOK emergency commands', () => {
  const runbook = read('docs/RUNBOOK.md')

  it('names all four Workers exactly as their wrangler configs do', () => {
    const names = workerNames()
    expect(names, 'expected to read four Worker names from the configs').toHaveLength(4)

    const missing = names.filter((name) => !runbook.includes(name))
    expect(
      missing,
      'A Worker exists that the rollback runbook never names — so there is no written ' +
        'way to roll it back.',
    ).toEqual([])
  })

  /**
   * Two places now print a `npx wrangler@x.y.z rollback` command: the runbook, and
   * ci.yml's deploy summary (which repeats the command into the run page, because
   * during an incident nobody opens a 1,493-line runbook). A second copy of the truth
   * is a second thing that decays — the same reason claudeMd.test.ts counts traps
   * across split memory files — so both are checked here against one source.
   */
  it.each([
    ['docs/RUNBOOK.md', 'docs/RUNBOOK.md'],
    ['ci.yml deploy summary', '.github/workflows/ci.yml'],
  ])('pins every `npx wrangler@…` command in %s to the installed version', (_label, file) => {
    const installed = installedWrangler()
    const cited = [...read(file).matchAll(/npx wrangler@([0-9]+\.[0-9]+\.[0-9]+)/g)].map(
      (m) => m[1],
    )

    expect(cited.length, `${file} should contain pinned wrangler commands`).toBeGreaterThan(0)

    const stale = [...new Set(cited)].filter((version) => version !== installed)
    expect(
      stale,
      `${file} pins wrangler ${stale.join(', ')} but this repo installs ${installed}. ` +
        'These are commands someone pastes during an outage.',
    ).toEqual([])
  })

  it('states which wrangler version the rollback section was verified against, matching the pin', () => {
    const claim = runbook.match(/pinned wrangler \*\*([0-9]+\.[0-9]+\.[0-9]+)\*\*/)?.[1]

    expect(claim, 'the rollback section should say what it was verified against').toBeDefined()
    expect(claim).toBe(installedWrangler())
  })

  it('still documents the rollback procedure at all', () => {
    // A crude but load-bearing presence check: this section did not exist before
    // 2026-08-08, and its absence is what the scorecard scored 68/100 for.
    expect(runbook).toContain('Undoing a bad deploy')
    expect(runbook).toMatch(/wrangler@[0-9.]+ rollback/)
  })
})
