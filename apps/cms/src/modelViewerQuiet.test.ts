import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * VA-10 (visual audit, 2026-10-02): the 3D library prints its own debugging in the visitor's
 * console. `@google/model-viewer` 4.3.1 calls `console.log` nine times in its own source
 * ("[$updateSource] BAILING OUT EARLY!", "IntersectionObserver fired!" and the like), and a garment
 * page printed six of them on every visit. The fix is a pnpm patch (`pnpm-workspace.yaml`,
 * `patches/`), not a bundler rule: it reaches the website's Turbopack build, the garment pages' Vite
 * build and the render harness at once, and a frozen install refuses to run if the entry goes
 * missing (ERR_PNPM_LOCKFILE_CONFIG_MISMATCH).
 *
 * This file guards the three ways it can go quietly wrong: the patch is not applied to the library
 * that is installed; the patch grows beyond the nine `console.log` lines (the library's warnings and
 * errors are its real problem reports and must stay); or the website build, which is what visitors
 * download, carries one of the messages anyway.
 *
 * What would have to break for these to fail: a `pnpm install` that did not apply the patch, a
 * model-viewer upgrade that still prints (or a patch left behind for a library that no longer does),
 * a patch that also removes a warning, or a bundle that did not come from the patched package.
 *
 * ⚠️ IF A FUTURE model-viewer STOPS PRINTING THESE, delete the `patchedDependencies` entry, the patch
 * file, and this file. Re-making the patch for a new version that still prints is in
 * docs/DEPENDENCY-HOLDS.md.
 */

const CMS_ROOT = join(import.meta.dirname, '..')
const REPO_ROOT = join(CMS_ROOT, '..', '..')
const BUILD = join(CMS_ROOT, '.next')
const REQUIRE_BUILD = process.env.REQUIRE_BUILD_ARTIFACTS === '1'
const HAS_BUILD = existsSync(join(BUILD, 'BUILD_ID'))

type Manifest = { version?: string; dependencies?: Record<string, string> }
const read = (path: string) => readFileSync(path, 'utf8')
const manifest = (path: string) => JSON.parse(read(path)) as Manifest

const PACKAGE = '@google/model-viewer'
const VERSION = manifest(join(CMS_ROOT, 'package.json')).dependencies?.[PACKAGE] ?? ''
const PATCH_FILE = join(REPO_ROOT, 'patches', `@google__model-viewer@${VERSION}.patch`)
const installed = dirname(createRequire(import.meta.url).resolve(`${PACKAGE}/package.json`))

/** One fragment of each of the library's nine messages, as they read in the built code. */
const MESSAGES = [
  '[onExtraModelChanged]',
  'IntersectionObserver fired!',
  '[$updateSource] called!',
  'BAILING OUT EARLY',
  'Attempting to present in AR with WebXR',
  'Attempting to present in AR with Scene Viewer',
  'Attempting to present in AR with Quick Look',
  'could not acquire 2d context',
  '[processInput] Setting goalPosition.y',
]

/** Text only the library's own warning carries: proof that a bundle holds the library at all. */
const LIBRARY_WARNING = 'Error while trying to present in AR with WebXR'

/** Which of the nine messages a piece of built code says. */
const messagesIn = (text: string) => MESSAGES.filter((message) => text.includes(message))

/** 1-based numbers of the lines that call `console.log` (the shape of every call the library makes). */
const consoleLogLines = (source: string) =>
  source
    .split('\n')
    .map((line, index) => (/\bconsole\.log\s*\(/.test(line) ? index + 1 : 0))
    .filter(Boolean)

/** Every `.js` file under a folder, skipping the folders named in `skip`. */
function scripts(dir: string, skip: string[] = []): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return skip.includes(entry.name) ? [] : scripts(path, skip)
    return entry.name.endsWith('.js') ? [path] : []
  })
}

/** The patch's own lines, split into what it takes out and what it puts in. */
function patchLines() {
  const lines = read(PATCH_FILE).split('\n')
  return {
    removed: lines.filter((line) => line.startsWith('-') && !line.startsWith('---')),
    added: lines.filter((line) => line.startsWith('+') && !line.startsWith('+++')),
    files: lines.filter((line) => line.startsWith('+++ b/')).map((line) => line.slice(6)),
  }
}

describe('the installed model-viewer prints nothing of its own (VA-10)', () => {
  it('has no console.log call in its lib/ source: the pnpm patch is applied', () => {
    const calls = scripts(join(installed, 'lib'), ['test']).flatMap((file) =>
      consoleLogLines(read(file)).map((line) => `${file.slice(installed.length + 1)}:${line}`),
    )
    expect(
      calls,
      `${PACKAGE}@${VERSION} still prints through console.log. Run \`pnpm install\`; if the ` +
        'patchedDependencies entry in pnpm-workspace.yaml was removed on purpose, delete this file too.',
    ).toEqual([])
  })

  it('is the version the patch was made for', () => {
    expect(manifest(join(installed, 'package.json')).version).toBe(VERSION)
  })

  it('the scan sees every call the patch removes: it is not blind to the real source lines', () => {
    // The removed lines are the library's own text, copied out by pnpm, so this is the scan run on
    // the unpatched library: the control that says an empty result above means something.
    const { removed } = patchLines()
    expect(removed, 'the patch removes the nine console.log statements').toHaveLength(9)
    for (const line of removed) expect(consoleLogLines(line.slice(1)), line).toHaveLength(1)
    for (const fragment of MESSAGES) {
      expect(
        removed.some((line) => line.includes(fragment)),
        `no line the patch removes says "${fragment}"`,
      ).toBe(true)
    }
  })

  it("does not take the library's warnings and errors for noise", () => {
    expect(consoleLogLines("console.warn('No AR Mode can be activated.')")).toEqual([])
    expect(consoleLogLines('console.error(error)')).toEqual([])
    expect(consoleLogLines("  console.log('x')")).toEqual([1])
  })
})

describe('the patch is registered, and does one thing (VA-10)', () => {
  it('is named in pnpm-workspace.yaml for the version both apps pin, and its file is there', () => {
    const workspace = read(join(REPO_ROOT, 'pnpm-workspace.yaml'))
    const entry = `'${PACKAGE}@${VERSION}': patches/@google__model-viewer@${VERSION}.patch`
    expect(workspace, 'patchedDependencies names no patch for this version').toContain(entry)
    expect(existsSync(PATCH_FILE), `${PATCH_FILE} is missing`).toBe(true)
    // Both apps use the one version, so one patch covers both.
    const viewer = manifest(join(REPO_ROOT, 'apps', 'viewer', 'package.json'))
    expect(viewer.dependencies?.[PACKAGE]).toBe(VERSION)
  })

  it('takes out console.log lines and nothing else, in the library source only', () => {
    // The library's console.warn and console.error are real problem reports (a failed AR hand-off,
    // a missing material): a patch that quietly widened would lose them.
    const { removed, added, files } = patchLines()
    expect(
      removed.every((line) => /^-\s*console\.log\(/.test(line)),
      removed.join('\n'),
    ).toBe(true)
    expect(added, 'one comment in place of each removed line').toHaveLength(removed.length)
    expect(
      added.every((line) => /^\+\s*\/\/ /.test(line)),
      added.join('\n'),
    ).toBe(true)
    expect(
      files.every((file) => file.startsWith('lib/')),
      files.join('\n'),
    ).toBe(true)
  })
})

describe('the website build carries none of the nine messages (VA-10)', () => {
  const built = () => [...scripts(join(BUILD, 'static')), ...scripts(join(BUILD, 'server'))]

  it('a CI step that forgot to build cannot pass this file', () => {
    expect(REQUIRE_BUILD && !HAS_BUILD, 'REQUIRE_BUILD_ARTIFACTS=1 but no .next/BUILD_ID').toBe(
      false,
    )
  })

  it('finds a message in code that has one, and none in the patched comment: the scan can see', () => {
    expect(messagesIn('a();console.log("[$updateSource] BAILING OUT EARLY!");b()')).toEqual([
      'BAILING OUT EARLY',
    ])
    expect(messagesIn('a();/* debug output removed */b()')).toEqual([])
  })

  it.skipIf(!HAS_BUILD && !REQUIRE_BUILD)(
    'holds the library, so a clean scan below means something',
    () => {
      const holding = built().filter((file) => read(file).includes(LIBRARY_WARNING))
      expect(
        holding.length,
        'no built file holds model-viewer: the scan reads nothing',
      ).toBeGreaterThan(0)
    },
  )

  it.skipIf(!HAS_BUILD && !REQUIRE_BUILD)(
    'has none of the nine messages in any script a visitor or the server runs',
    () => {
      const found = built().flatMap((file) =>
        messagesIn(read(file)).map((message) => `${file.slice(BUILD.length + 1)}: ${message}`),
      )
      expect(found, 'the website build prints the library debugging again').toEqual([])
    },
  )
})
