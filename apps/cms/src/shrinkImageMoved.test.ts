import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  containerRowName,
  imageVerdict,
  lastModifiedEpoch,
} from '../../../scripts/shrink-image-moved.mjs'

/**
 * scripts/shrink-image-moved.mjs decides whether deploy-shrink's image moved. The table below
 * has the shape `wrangler containers list` printed on 2026-10-14, when the inline check failed
 * a good deploy (issue #177): this container's row still said 2026-10-13 one minute after the
 * deploy, another project's row sits in the same table, and the stamps carry nanoseconds.
 */

const ROOT = join(import.meta.dirname, '..', '..', '..')
const SCRIPT = join(ROOT, 'scripts', 'shrink-image-moved.mjs')

function table(shrinkStamp: string, otherStamp = '2026-10-12T09:10:40.199000064Z') {
  return [
    '┌──────┬──────────────────────────────────────────┬───────┬────────────────┬────────────────────────────────┐',
    '│ ID   │ NAME                                     │ STATE │ LIVE INSTANCES │ LAST MODIFIED                  │',
    '├──────┼──────────────────────────────────────────┼───────┼────────────────┼────────────────────────────────┤',
    `│ a1   │ other-project-runner                     │ ready │ 1              │ ${otherStamp} │`,
    '├──────┼──────────────────────────────────────────┼───────┼────────────────┼────────────────────────────────┤',
    `│ a2   │ run-apparel-viewer-shrink-shrinkcontainer │ ready │ 1              │ ${shrinkStamp} │`,
    '└──────┴──────────────────────────────────────────┴───────┴────────────────┴────────────────────────────────┘',
  ].join('\n')
}

const NAME = 'run-apparel-viewer-shrink-shrinkcontainer'
// 2026-10-14T06:43:22Z, when deploy-shrink began on 727174aa.
const RUN_BEGAN = Date.parse('2026-10-14T06:43:22Z') / 1000

describe('which row is the shrink container', () => {
  it('is named from apps/shrink/wrangler.jsonc, so a rename there cannot leave the check reading nothing', () => {
    const config = readFileSync(join(ROOT, 'apps', 'shrink', 'wrangler.jsonc'), 'utf8')
    const worker = config.match(/^\s*"name":\s*"([^"]+)"/m)?.[1]
    const className = config.match(/"containers":\s*\[\s*\{[^}]*"class_name":\s*"([^"]+)"/)?.[1]
    expect(worker).toBeDefined()
    expect(className).toBeDefined()
    expect(containerRowName(worker as string, className as string)).toBe(NAME)
  })

  it('is the name ci.yml passes to the check', () => {
    const ci = readFileSync(join(ROOT, '.github', 'workflows', 'ci.yml'), 'utf8')
    expect(ci).toContain(`shrink-image-moved.mjs --name ${NAME} --before`)
  })
})

describe('reading the row', () => {
  it('reads nanosecond stamps', () => {
    expect(lastModifiedEpoch(table('2026-10-14T06:44:26.468999936Z'), NAME)).toBe(
      Date.parse('2026-10-14T06:44:26Z') / 1000,
    )
  })

  it('reads this row only, never another container on the account', () => {
    // The inline check took the newest stamp in the table: the other row here is newer and
    // would have passed a stale shrink image.
    const t = table('2026-10-13T06:19:24.000000000Z', '2026-10-14T07:00:00.000000000Z')
    expect(imageVerdict(t, NAME, RUN_BEGAN).verdict).toBe('old')
  })

  it('is unknown, not moved, when the row is missing', () => {
    expect(imageVerdict(table('2026-10-14T06:44:26Z'), 'some-other-name', RUN_BEGAN)).toEqual({
      verdict: 'unknown',
      modified: null,
    })
  })
})

describe('the verdict, both ways (the 727174aa deploy)', () => {
  it('is old one minute after the deploy, when the row still showed the day before', () => {
    expect(imageVerdict(table('2026-10-13T06:19:24.000000000Z'), NAME, RUN_BEGAN).verdict).toBe(
      'old',
    )
  })

  it('is moved once the row shows the new image', () => {
    expect(imageVerdict(table('2026-10-14T06:44:26.468999936Z'), NAME, RUN_BEGAN).verdict).toBe(
      'moved',
    )
  })
})

describe('the command the workflow runs', () => {
  function run(input: string, ...args: string[]) {
    return spawnSync('node', [SCRIPT, ...args], { input, encoding: 'utf8' })
  }

  it('exits 0 when the image moved, 1 when it did not, 2 when it cannot tell', () => {
    const before = ['--name', NAME, '--before', String(RUN_BEGAN)]
    expect(run(table('2026-10-14T06:44:26.468999936Z'), ...before).status).toBe(0)
    expect(run(table('2026-10-13T06:19:24.000000000Z'), ...before).status).toBe(1)
    expect(run('wrangler printed no table', ...before).status).toBe(2)
    expect(run('', '--name', NAME).status).toBe(2)
  })
})
