import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { containerRowName, imageDigest, rowId } from '../../../scripts/shrink-image-moved.mjs'

/**
 * deploy-shrink's drift check: the image digest the shrink container runs, read before the deploy
 * and after it (scripts/shrink-image-moved.mjs says why a digest and not LAST MODIFIED). The
 * shapes below are what wrangler 4.148.0 printed on 2026-10-14: `containers list` holds another
 * project's container as well, and `containers info` names the image by registry path + digest.
 */

const ROOT = join(import.meta.dirname, '..', '..', '..')
const SCRIPT = join(ROOT, 'scripts', 'shrink-image-moved.mjs')
const NAME = 'run-apparel-viewer-shrink-shrinkcontainer'
const OUR_ID = 'a03e733d-5495-48b5-9f97-33bf5ee5cf6b'
const OTHER_ID = 'a035ce80-5b53-4103-99ac-d46893049b90'
// The digests of 2026-10-14: f686a27f was put back after 1734cac9's deploy set da9c0c00.
const OLD = `sha256:f686a27f6e0d29a456c7293b7ec2ee5dc43a3349182fead2e3bdd8b6ed90ae9a`
const NEW = `sha256:da9c0c004121f6a83c5636790e77aef9c01dc1d4d30db9c2419bf4f235133476`
const THIRD = `sha256:07a7723763ecdddeeef01e79ca5011f2b9fda435bafdc5663af3004896eae6e5`

function table({ withOurs = true } = {}) {
  const rule =
    '├──────────────────────────────────────┼───────────────────────────────────────────┼───────┼────────────────┼────────────────────────────────┤'
  return [
    '┌──────────────────────────────────────┬───────────────────────────────────────────┬───────┬────────────────┬────────────────────────────────┐',
    '│ ID                                   │ NAME                                      │ STATE │ LIVE INSTANCES │ LAST MODIFIED                  │',
    rule,
    `│ ${OTHER_ID} │ other-project-runner                      │ ready │ 1              │ 2026-10-12T09:10:40.199000064Z │`,
    ...(withOurs
      ? [rule, `│ ${OUR_ID} │ ${NAME} │ ready │ 1              │ 2026-10-14T08:07:29.857999872Z │`]
      : []),
    '└──────────────────────────────────────┴───────────────────────────────────────────┴───────┴────────────────┴────────────────────────────────┘',
  ].join('\n')
}

function info(digest: string) {
  return JSON.stringify(
    {
      id: OUR_ID,
      updated_at: '2026-10-14T09:11:57.216999936Z',
      name: NAME,
      version: 92,
      configuration: {
        image: `registry.cloudflare.com/0123456789abcdef0123456789abcdef/${NAME}@${digest}`,
        instance_type: 'standard-4',
      },
    },
    null,
    4,
  )
}

describe('which row is the shrink container', () => {
  it('is named from apps/shrink/wrangler.jsonc, so a rename there cannot leave the check reading nothing', () => {
    const config = readFileSync(join(ROOT, 'apps', 'shrink', 'wrangler.jsonc'), 'utf8')
    const worker = config.match(/^\s*"name":\s*"([^"]+)"/m)?.[1]
    const className = config.match(/"containers":\s*\[\s*\{[^}]*"class_name":\s*"([^"]+)"/)?.[1]
    expect(worker).toBeDefined()
    expect(className).toBeDefined()
    expect(containerRowName(worker as string, className as string)).toBe(NAME)
  })

  it('is the name both ci.yml steps pass to the check', () => {
    const ci = readFileSync(join(ROOT, '.github', 'workflows', 'ci.yml'), 'utf8')
    expect(ci).toContain(`shrink-image-moved.mjs current --name ${NAME})`)
    expect(ci).toContain(`name=${NAME}\n`)
  })

  it('takes the ID from this row, never from another container on the account', () => {
    expect(rowId(table(), NAME)).toBe(OUR_ID)
    expect(rowId(table({ withOurs: false }), NAME)).toBeNull()
  })
})

describe('reading the image', () => {
  it('reads the digest and drops the registry path, which carries the account ID', () => {
    expect(imageDigest(info(NEW))).toBe(NEW)
  })

  it('reads it with wrangler banner text around the record', () => {
    expect(imageDigest(`\n ⛅️ wrangler 4.148.0\n────────\n${info(NEW)}\n`)).toBe(NEW)
  })

  it('is null, not a guess, when there is no record, no image, or no digest', () => {
    expect(imageDigest('wrangler printed no record')).toBeNull()
    expect(imageDigest('{"configuration":{}}')).toBeNull()
    expect(
      imageDigest(`{"configuration":{"image":"registry.cloudflare.com/x/${NAME}:latest"}}`),
    ).toBeNull()
  })
})

/**
 * A stub `pnpm` on PATH stands in for `pnpm --filter … exec wrangler containers list|info`. Each
 * `list` call is one READ and takes the next entry of the plan (the last one repeats):
 *   old/new/third  the container runs that image
 *   fail           `containers list` fails      infofail  `containers info` fails
 *   none           this container's row is missing from the list
 * `sleep` is a no-op stub, so the 20 s and 240 s waits cost nothing.
 */
function harness(plan: string[]) {
  const dir = mkdtempSync(join(tmpdir(), 'drift-'))
  const bin = join(dir, 'bin')
  mkdirSync(bin)
  writeFileSync(join(dir, 'table'), table())
  writeFileSync(join(dir, 'table-none'), table({ withOurs: false }))
  writeFileSync(join(dir, 'old'), info(OLD))
  writeFileSync(join(dir, 'new'), info(NEW))
  writeFileSync(join(dir, 'third'), info(THIRD))
  writeFileSync(join(dir, 'reads'), '')
  writeFileSync(
    join(bin, 'pnpm'),
    [
      '#!/usr/bin/env bash',
      `cd "${dir}"`,
      'cmd=$6',
      'if [ "$cmd" = list ]; then echo read >> reads; fi',
      'n=$(wc -l < reads | tr -d " ")',
      `plan=(${plan.join(' ')})`,
      // biome-ignore lint/suspicious/noTemplateCurlyInString: bash array syntax for the stub, not a template
      'last=$(( ${#plan[@]} - 1 )); i=$(( n - 1 < last ? n - 1 : last ))',
      // biome-ignore lint/suspicious/noTemplateCurlyInString: bash array syntax for the stub, not a template
      'step=${plan[$i]}',
      'if [ "$cmd" = list ]; then',
      '  if [ "$step" = fail ]; then echo "✘ [ERROR] A request to the Cloudflare API failed." >&2; exit 1; fi',
      '  if [ "$step" = none ]; then cat table-none; else cat table; fi',
      '  exit 0',
      'fi',
      `if [ "$7" != "${OUR_ID}" ]; then echo "info asked for the wrong container: $7" >&2; exit 1; fi`,
      'if [ "$step" = infofail ]; then echo "✘ [ERROR] A request to the Cloudflare API failed." >&2; exit 1; fi',
      'cat "$step"',
    ].join('\n'),
    { mode: 0o755 },
  )
  writeFileSync(join(bin, 'sleep'), '#!/usr/bin/env bash\nexit 0\n', { mode: 0o755 })
  const env = { ...process.env, PATH: `${bin}:${process.env.PATH}` }
  const reads = () => readFileSync(join(dir, 'reads'), 'utf8').split('\n').filter(Boolean).length
  return { dir, env, reads }
}

describe('the command the workflow runs', { timeout: 30_000 }, () => {
  function current(plan: string[]) {
    const h = harness(plan)
    const r = spawnSync('node', [SCRIPT, 'current', '--name', NAME], {
      encoding: 'utf8',
      env: h.env,
    })
    return { status: r.status, stdout: r.stdout.trim() }
  }

  it('prints only the digest, so no account ID reaches a public log', () => {
    expect(current(['new'])).toEqual({ status: 0, stdout: NEW })
  })

  it('exits 3 when either wrangler read fails, and 2 when the row is missing', () => {
    expect(current(['fail']).status).toBe(3)
    expect(current(['infofail']).status).toBe(3)
    expect(current(['none']).status).toBe(2)
  })

  it('exits 2 when used without a container name', () => {
    expect(spawnSync('node', [SCRIPT, 'current'], { encoding: 'utf8' }).status).toBe(2)
  })
})

/**
 * Both steps, read out of ci.yml and run the way GitHub runs them: `bash -e {0}` (printed at the
 * top of every step's log). On 1734cac9 (issue #179) a step simulated without `-e` passed and
 * then stopped on its first non-zero line in CI.
 */
function step(title: string): string {
  const lines = readFileSync(join(ROOT, '.github', 'workflows', 'ci.yml'), 'utf8').split('\n')
  const start = lines.indexOf(`      - name: ${title}`)
  const run = lines.findIndex((l, i) => i > start && /^ {8}run: \|$/.test(l))
  if (start === -1 || run === -1) throw new Error(`ci.yml has no step "${title}" with a run: block`)
  const body: string[] = []
  for (const line of lines.slice(run + 1)) {
    if (line.trim() === '') {
      body.push('')
      continue
    }
    if (!line.startsWith(' '.repeat(10))) break
    body.push(line.slice(10))
  }
  return body.join('\n')
}

function runStep(title: string, plan: string[], extraEnv: Record<string, string> = {}) {
  const h = harness(plan)
  const script = join(h.dir, 'step.sh')
  const output = join(h.dir, 'github-output')
  writeFileSync(script, step(title))
  writeFileSync(output, '')
  const r = spawnSync('bash', ['-e', script], {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...h.env, GITHUB_OUTPUT: output, ...extraEnv },
  })
  return {
    status: r.status,
    out: r.stdout + r.stderr,
    reads: h.reads(),
    outputs: readFileSync(output, 'utf8'),
  }
}

describe('ci.yml: recording the image before the deploy, under bash -e', {
  timeout: 30_000,
}, () => {
  const RECORD = 'Record the container image before deploy'

  it('records the digest', () => {
    const r = runStep(RECORD, ['old'])
    expect(r.outputs).toBe(`image=${OLD}\ncode=0\n`)
    expect(r.status).toBe(0)
  })

  it('never fails the job, so a failed read cannot block the deploy', () => {
    const r = runStep(RECORD, ['fail'])
    expect(r.outputs).toBe('image=\ncode=3\n')
    expect(r.status).toBe(0)
  })
})

describe('ci.yml: the drift check after the deploy, under bash -e', { timeout: 30_000 }, () => {
  const DRIFT = 'Assert the container image actually moved (drift check)'
  const drift = (plan: string[], before = OLD, code = '0') =>
    runStep(DRIFT, plan, { IMAGE_BEFORE: before, BEFORE_CODE: code })

  it('passes when the image changes and is still the new one 4 minutes later', () => {
    const r = drift(['new'])
    expect(r.out).toContain(`Image after this deploy: ${NEW} (read 1)`)
    expect(r.out).toContain(`Still ${NEW} 4 minutes later.`)
    expect(r.reads).toBe(2)
    expect(r.status).toBe(0)
  })

  it('waits for Cloudflare: the old image on the first read, the new one on the second', () => {
    const r = drift(['old', 'new'])
    expect(r.out).toContain('(read 2)')
    expect(r.status).toBe(0)
  })

  it('fails after nine reads when the image never changes', () => {
    const r = drift(['old'])
    expect(r.reads).toBe(9)
    expect(r.out).toContain('did NOT move')
    expect(r.status).toBe(1)
  })

  it('fails when the old image is put back after the deploy (1734cac9: da9c0c00 back to f686a27f)', () => {
    const r = drift(['new', 'old'])
    expect(r.out).toContain('went BACK')
    expect(r.status).toBe(1)
  })

  it('retries failed reads, and passes when a later read shows the new image', () => {
    expect(drift(['fail', 'infofail', 'new']).status).toBe(0)
  })

  it('fails, naming the read and not the image, when wrangler fails all nine times', () => {
    const r = drift(['fail'])
    expect(r.reads).toBe(9)
    expect(r.out).toContain('wrangler failed on all 9 reads')
    expect(r.status).toBe(1)
  })

  it('fails by name when the image before the deploy was never read', () => {
    const r = drift(['new'], '', '3')
    expect(r.out).toContain('could not be read (exit 3)')
    expect(r.reads).toBe(0)
    expect(r.status).toBe(1)
  })

  it('warns and passes when the container had no image before (a first deploy)', () => {
    const r = drift(['new'], '', '2')
    expect(r.out).toContain('drift NOT verified')
    expect(r.status).toBe(0)
  })

  it('warns and passes when the row disappears from the list', () => {
    const r = drift(['none'])
    expect(r.out).toContain('drift NOT verified')
    expect(r.status).toBe(0)
  })

  it('warns, without failing, when the read 4 minutes later fails', () => {
    const r = drift(['new', 'fail'])
    expect(r.out).toContain('swap back was NOT checked')
    expect(r.status).toBe(0)
  })

  it('warns, without failing, when 4 minutes later it shows a third image (another deploy)', () => {
    const r = drift(['new', 'third'])
    expect(r.out).toContain('changed again')
    expect(r.status).toBe(0)
  })
})
