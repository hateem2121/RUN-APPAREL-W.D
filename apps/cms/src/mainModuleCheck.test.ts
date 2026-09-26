import { spawnSync } from 'node:child_process'
import {
  type Dirent,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'

/**
 * "Am I the script that was run?" must survive a path with a space in it.
 *
 * ⚠️ `import.meta.url === \`file://${process.argv[1]}\`` IS FALSE IN SUCH A FOLDER, AND THE
 * SCRIPT THEN EXITS 0 HAVING DONE NOTHING. `import.meta.url` is a URL, so a space arrives as
 * `%20`, while `process.argv[1]` is a plain path. Measured 2026-09-25: `check-coverage.mjs`
 * copied into `with space/scripts/` printed nothing and exited 0 — a coverage gate reporting
 * success without reading a single number. 23 scripts carried the pattern, among them three
 * CI gates (coverage, lockfile sync, docs index). Found as a Minor in PR #28's final review,
 * which named two of them.
 *
 * ⚠️ `pathToFileURL(process.argv[1]).href` — the form the review suggested, and the one five
 * scripts already used (sixteen, all converted) — FIXES THE SPACE AND NOT A SYMLINK. Node gives `import.meta.url` the
 * REAL path, and on this Mac `os.tmpdir()` is under `/var`, a link to `/private/var`: the
 * second test below failed that way on its first run. Comparing real paths covers both.
 * `import.meta.main` would too, but only from Node 24.2, and `engines` allows any 24 — where it
 * is `undefined`, and the script would skip main() silently all over again.
 *
 * The second test runs both forms in a real folder with a space, reached through a real
 * symlink wherever the OS puts one, so the reason for this file is proven every run.
 */

const REPO_ROOT = join(import.meta.dirname, '..', '..', '..')
// biome-ignore lint/suspicious/noTemplateCurlyInString: the literal source text this guard searches for
const FRAGILE = 'import.meta.url === `file://${process.argv[1]}`'
/** Survives the space, not a symlink — see above. Banned for the same silent exit 0. */
const SYMLINK_BLIND = 'import.meta.url === pathToFileURL(process.argv[1]).href'
const ROBUST = 'import.meta.filename === realpathSync(process.argv[1])'

/** Directories that hold runnable Node entry points. node_modules and build output never do. */
const SCRIPT_DIRS = [
  'scripts',
  'apps/cms/scripts',
  'apps/viewer/scripts',
  'tools/asset-pipeline/scripts',
]

function scriptFiles(): string[] {
  const out: string[] = []
  const step = (dir: string) => {
    let entries: Dirent[]
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        if (entry.name !== 'node_modules') step(full)
      } else if (/\.(mjs|js|ts)$/.test(entry.name)) out.push(full)
    }
  }
  for (const dir of SCRIPT_DIRS) step(join(REPO_ROOT, dir))
  return out
}

const scratch: string[] = []
afterAll(() => {
  for (const dir of scratch) rmSync(dir, { recursive: true, force: true })
})

describe('entry-point checks survive a path with a space', () => {
  it('no script compares import.meta.url with a file URL built from argv', () => {
    const files = scriptFiles()
    // Not vacuous: the walk has to reach the scripts this guard exists for.
    expect(files.length).toBeGreaterThan(50)
    const offenders = files
      .filter((file) => {
        const text = readFileSync(file, 'utf8')
        return text.includes(FRAGILE) || text.includes(SYMLINK_BLIND)
      })
      .map((file) => file.slice(REPO_ROOT.length + 1))
    expect(
      offenders,
      'use import.meta.filename === realpathSync(process.argv[1]) — see this file',
    ).toEqual([])
  })

  it('in a folder with a space, the fragile form skips main() and the robust form runs it', () => {
    const source = readFileSync(join(REPO_ROOT, 'scripts', 'check-coverage.mjs'), 'utf8')
    expect(source).toContain(ROBUST)
    const root = mkdtempSync(join(tmpdir(), 'main check '))
    scratch.push(root)
    mkdirSync(join(root, 'scripts'))
    const run = (text: string) => {
      const file = join(root, 'scripts', 'check-coverage.mjs')
      writeFileSync(file, text)
      return spawnSync(process.execPath, [file], { cwd: root, encoding: 'utf8' })
    }

    // The gate, as committed: no coverage exists in this empty folder, so it must say so.
    const robust = run(source)
    expect(robust.status).toBe(1)
    expect(robust.stdout + robust.stderr).toMatch(/coverage-summary\.json/)

    // The control, the old line planted back: silent success, the defect this file guards.
    const fragile = run(source.replace(ROBUST, FRAGILE))
    expect(fragile.status).toBe(0)
    expect(fragile.stdout + fragile.stderr).toBe('')
  })
})
