import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'

// apps/cms/src/ → the repository root, where scripts/backup-r2.mjs resolves its imports.
const REPO = fileURLToPath(new URL('../../..', import.meta.url))

/** Runs `code` as an ES module in plain Node, with no vitest resolver in the way. */
function plainNode(code: string, cwd: string) {
  return spawnSync(process.execPath, ['--input-type=module', '-e', code], {
    cwd,
    encoding: 'utf8',
  })
}

describe('plain Node, the way scripts/backup-r2.mjs runs every night', () => {
  it('loads infra/apex-404/index.js and still finds both PDFs', () => {
    const result = plainNode(
      "const { FILES } = await import('./infra/apex-404/index.js'); console.log(JSON.stringify(Object.keys(FILES)))",
      REPO,
    )
    expect(result.status, result.stderr).toBe(0)
    expect(JSON.parse(result.stdout.trim())).toEqual(['/catalogue', '/profile'])
  })

  const scratch = mkdtempSync(join(tmpdir(), 'apex-plain-node-'))
  afterAll(() => rmSync(scratch, { recursive: true, force: true }))

  // The negative control, run both ways: the same harness must see the failure it guards.
  it('tells a .js specifier for a .ts file (refused) from the .ts form (loads)', () => {
    writeFileSync(join(scratch, 'shared.ts'), "export const zone: string = 'Asia/Karachi'\n")
    const refused = plainNode("await import('./shared.js')", scratch)
    expect(refused.status).not.toBe(0)
    expect(refused.stderr).toContain('ERR_MODULE_NOT_FOUND')
    const loaded = plainNode(
      "const { zone } = await import('./shared.ts'); console.log(zone)",
      scratch,
    )
    expect(loaded.status, loaded.stderr).toBe(0)
    expect(loaded.stdout.trim()).toBe('Asia/Karachi')
  })
})
