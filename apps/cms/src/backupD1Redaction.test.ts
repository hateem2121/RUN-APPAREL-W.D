import { spawnSync } from 'node:child_process'
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'
import { redactPresignedUrls } from '../../../scripts/backup-d1.mjs'

/**
 * `wrangler d1 export --remote` prints a presigned link to the WHOLE dump, valid for
 * an hour, and on 2026-09-11 the public repository's first nightly-backup run printed
 * it into a log anyone can read. See the warning in `scripts/backup-d1.mjs`.
 *
 * The link has wrangler 4.122.0's real shape with placeholder values, so the secrets
 * gate has nothing to flag.
 */
const LINK =
  'https://ACCOUNT.r2.cloudflarestorage.com/d1-sqlio-outgoing-prod/DATABASE-00001548.sql' +
  '?X-Amz-Expires=3600&X-Amz-Date=20260911T061102Z&X-Amz-Algorithm=AWS4-HMAC-SHA256' +
  '&X-Amz-Credential=EXAMPLE%2F20260911%2Fauto%2Fs3%2Faws4_request&X-Amz-SignedHeaders=host' +
  '&X-Amz-Signature=0000000000000000000000000000000000000000000000000000000000000000'

const WRANGLER_OUTPUT = [
  '├ Exporting SQL to /tmp/run-apparel-viewer-db.sql',
  `You can also download your export from the following URL manually. This link will be valid for one hour: ${LINK}`,
  '🌀 Downloaded to /tmp/run-apparel-viewer-db.sql successfully!',
].join('\n')

const LEAK = /X-Amz-|r2\.cloudflarestorage\.com/i
const SCRIPT = fileURLToPath(new URL('../../../scripts/backup-d1.mjs', import.meta.url))

describe('redactPresignedUrls', () => {
  it('starts from output that really carries a usable link (negative control)', () => {
    expect(WRANGLER_OUTPUT).toMatch(LEAK)
    expect(WRANGLER_OUTPUT).toContain('X-Amz-Signature=')
  })

  it('removes the link and keeps every line around it', () => {
    const shown = redactPresignedUrls(WRANGLER_OUTPUT)
    expect(shown).not.toMatch(LEAK)
    expect(shown).toContain('Exporting SQL to /tmp/run-apparel-viewer-db.sql')
    expect(shown).toContain('Downloaded to /tmp/run-apparel-viewer-db.sql successfully!')
    expect(shown).toContain('link hidden')
  })

  it('scrubs a signature and credential that arrive without the rest of the URL', () => {
    const shown = redactPresignedUrls('&X-Amz-Credential=EXAMPLE%2Fs3\n&X-Amz-Signature=00ff11')
    expect(shown).not.toContain('EXAMPLE')
    expect(shown).not.toContain('00ff11')
  })

  it('leaves an ordinary link alone, so a real error stays readable', () => {
    const text = 'See https://developers.cloudflare.com/d1/ for help'
    expect(redactPresignedUrls(text)).toBe(text)
  })
})

describe('scripts/backup-d1.mjs never prints the link', () => {
  // `pnpm` is the first runner the script tries, so a fake one on PATH stands in for
  // wrangler. It prints the real-shaped output on stdout AND stderr, then exits as told.
  const bin = mkdtempSync(join(tmpdir(), 'fake-wrangler-'))
  const fake = join(bin, 'pnpm')
  afterAll(() => rmSync(bin, { recursive: true, force: true }))

  const writeFake = (exitCode: number) => {
    writeFileSync(
      fake,
      `#!/bin/sh\ncat <<'OUT'\n${WRANGLER_OUTPUT}\nOUT\ncat >&2 <<'OUT'\n${WRANGLER_OUTPUT}\nOUT\nexit ${exitCode}\n`,
    )
    chmodSync(fake, 0o755)
  }

  const runScript = () =>
    spawnSync(process.execPath, [SCRIPT, '--local', '--stamp=redaction-test'], {
      encoding: 'utf8',
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
    })

  it('uses a fake runner that itself prints the link (negative control)', () => {
    writeFake(0)
    const direct = spawnSync(fake, [], { encoding: 'utf8' })
    expect(`${direct.stdout}${direct.stderr}`).toMatch(LEAK)
  })

  it.each([
    ['a successful export', 0, 0],
    ['a failed export', 1, 1],
  ])('hides it on %s, and still shows the rest of the output', (_label, runnerExit, scriptExit) => {
    writeFake(runnerExit)
    const run = runScript()
    const shown = `${run.stdout}${run.stderr}`
    expect(shown).toContain('Downloaded to /tmp/run-apparel-viewer-db.sql successfully!')
    expect(shown).not.toMatch(LEAK)
    expect(run.status).toBe(scriptExit)
  })
})
