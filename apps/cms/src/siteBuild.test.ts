import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { SITE_BUILD_PATTERN as WORKER_PATTERN } from '../pageCache.mjs'
import {
  ASSETS_DIR,
  BUILD_ID_FILE,
  SITE_BUILD_PATTERN,
  SITE_SOURCE_PATHS,
  builtFileNames,
  siteBuildKey,
  siteBuildKeyOf,
  siteSourceBuildId,
} from '../siteBuild.mjs'

/*
 * The website build's fingerprint (siteBuild.mjs, 4 Nov 2026). What would have to break in
 * production for these to fail: a kept page served from a build whose script files differ (the
 * fingerprint not changing when it must), or every deploy still emptying the store (it changing
 * when it must not).
 */

/** A fake `git` answering from a table: `rev-parse HEAD:<path>` -> id, `status` -> porcelain text. */
function fakeGit(ids: Record<string, string>, status = '') {
  return (args: string[]): string => {
    if (args[0] === 'status') return status
    if (args[0] === 'rev-parse') {
      const path = (args[1] ?? '').replace(/^HEAD:/, '')
      const id = ids[path]
      if (id === undefined) throw new Error(`fatal: path '${path}' does not exist in 'HEAD'`)
      return id
    }
    throw new Error(`unexpected git ${args.join(' ')}`)
  }
}

const IDS = Object.fromEntries(SITE_SOURCE_PATHS.map((path, i) => [path, `${i}`.padStart(40, 'a')]))

describe('siteSourceBuildId', () => {
  it('is the same for the same source, in the shape Next accepts as a build ID', () => {
    const one = siteSourceBuildId(fakeGit(IDS))
    expect(one).toMatch(/^site-[0-9a-f]{20}$/)
    expect(siteSourceBuildId(fakeGit({ ...IDS }))).toBe(one)
  })

  it('changes when any one source path changes (negative control, every path)', () => {
    const base = siteSourceBuildId(fakeGit(IDS))
    for (const path of SITE_SOURCE_PATHS) {
      const changed = siteSourceBuildId(fakeGit({ ...IDS, [path]: 'f'.repeat(40) }))
      expect(changed, `${path} changed but the fingerprint did not`).not.toBe(base)
    }
  })

  it('refuses uncommitted code: HEAD would describe something other than what is built', () => {
    expect(siteSourceBuildId(fakeGit(IDS, ' M apps/cms/worker.mjs'))).toBeNull()
  })

  it('gives null, never a guess, when git cannot answer', () => {
    const { 'packages/ui': _gone, ...missing } = IDS
    expect(siteSourceBuildId(fakeGit(missing))).toBeNull()
    expect(
      siteSourceBuildId(() => {
        throw new Error('git: command not found')
      }),
    ).toBeNull()
  })

  it('answers from the real repository with a fingerprint or null', () => {
    const real = siteSourceBuildId()
    expect(real === null || /^site-[0-9a-f]{20}$/.test(real)).toBe(true)
  })
})

describe('siteBuildKey', () => {
  const ID = `site-${'1'.repeat(20)}`

  it('adds the built file names, so two builds naming their files differently never share pages', () => {
    const key = siteBuildKey(ID, ['chunks/a.js', 'chunks/b.css'])
    expect(key).toMatch(SITE_BUILD_PATTERN)
    expect(siteBuildKey(ID, ['chunks/a.js', 'chunks/b.css'])).toBe(key)
    expect(siteBuildKey(ID, ['chunks/a.js', 'chunks/c.css'])).not.toBe(key)
  })

  it('gives null for Next’s random build ID, so the Worker keys by the deploy as before', () => {
    expect(siteBuildKey('0PYAjWjFlx-bFG2t47pBp', ['a.js'])).toBeNull()
    expect(siteBuildKey('', ['a.js'])).toBeNull()
  })

  it('reads the key off a build’s output, with the names in a fixed order', () => {
    const dir = mkdtempSync(join(tmpdir(), 'site-build-'))
    const write = (path: string, text: string) => {
      mkdirSync(dirname(join(dir, path)), { recursive: true })
      writeFileSync(join(dir, path), text)
    }
    expect(siteBuildKeyOf(dir), 'no build yet').toBeNull()
    write(BUILD_ID_FILE, `${ID}\n`)
    write(`${ASSETS_DIR}/chunks/b.js`, 'b')
    write(`${ASSETS_DIR}/chunks/a.js`, 'a')
    write(`${ASSETS_DIR}/media/font.woff2`, 'f')
    expect(builtFileNames(join(dir, ASSETS_DIR))).toEqual([
      'chunks/a.js',
      'chunks/b.js',
      'media/font.woff2',
    ])
    expect(siteBuildKeyOf(dir)).toBe(
      siteBuildKey(ID, ['chunks/a.js', 'chunks/b.js', 'media/font.woff2']),
    )
  })
})

describe('where the fingerprint is used', () => {
  it('the Worker accepts exactly the shape the build makes', () => {
    expect(WORKER_PATTERN.source).toBe(SITE_BUILD_PATTERN.source)
  })

  it('names every workspace package the website imports', () => {
    const cms = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf8'))
    const workspace = Object.entries({ ...cms.dependencies, ...cms.devDependencies })
      .filter(([, version]) => String(version).startsWith('workspace:'))
      .map(([name]) => `packages/${name.replace('@run-apparel/', '')}`)
    expect(workspace.length).toBeGreaterThan(0)
    for (const path of workspace) expect(SITE_SOURCE_PATHS).toContain(path)
  })

  it('Next takes it as the build ID, and the deploy hands the key to the Worker', () => {
    const config = readFileSync(join(__dirname, '../next.config.mjs'), 'utf8')
    expect(config).toMatch(/generateBuildId: \(\) => siteSourceBuildId\(\)/)
    const cms = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf8'))
    expect(cms.scripts.deploy).toMatch(
      /opennextjs-cloudflare deploy .*--var "\$\(node siteBuild\.mjs\)"/,
    )
  })
})
