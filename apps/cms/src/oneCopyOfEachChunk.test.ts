import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  chunkFolders,
  duplicateGroups,
  isStub,
  MIN_BYTES,
  stubFor,
  withoutSourceMapLine,
} from '../scripts/one-copy-of-each-chunk.mjs'

/**
 * One copy of each server chunk (scripts/one-copy-of-each-chunk.mjs, 21 Nov 2026).
 *
 * WHAT THE BUILD DID. The site's Worker is one 29.2 MB file, and esbuild's size report for it
 * showed one 2.3 MB chunk five times: three copies byte-identical apart from the 13-byte
 * `sourceMappingURL` comment on the last line, and two more identical to each other the same
 * way. 6.9 MB of 29.2 MB was the same bytes again.
 *
 * What would have to break for these to fail: a chunk that is only SIMILAR gets redirected (two
 * different programs would then be one), or a redirected chunk no longer hands the runtime the
 * list of modules it asked for.
 */
const body = (marker: string) => `module.exports=[${marker},()=>{/*${'x'.repeat(MIN_BYTES)}*/}];`
const chunk = (file: string, marker: string) => ({
  file,
  text: `${body(marker)}\n\n//# sourceMappingURL=${file.split('/').pop()}.map`,
})

describe('which chunks are the same', () => {
  it('copies that differ only in their source map comment are one group; the first by name stays', () => {
    const groups = duplicateGroups([
      chunk('/c/_b.js', '1'),
      chunk('/c/_a.js', '1'),
      chunk('/c/ssr/_z.js', '1'),
    ])
    expect(groups).toHaveLength(1)
    expect(groups[0]?.first).toBe('/c/_a.js')
    expect(groups[0]?.copies).toEqual(['/c/_b.js', '/c/ssr/_z.js'])
  })

  it('negative control: one different character, and nothing is a copy of anything', () => {
    // The page-side and server-side builds of the same code are this case: similar, not the same.
    expect(duplicateGroups([chunk('/c/_a.js', '1'), chunk('/c/_b.js', '2')])).toEqual([])
  })

  it('the source map comment is the only thing set aside', () => {
    const a = chunk('/c/_a.js', '1').text
    expect(withoutSourceMapLine(a)).toBe(body('1'))
    // A comment anywhere else is code, and stays part of the comparison.
    const inside = `//# sourceMappingURL=x.map\n${body('1')}`
    expect(withoutSourceMapLine(inside)).toBe(inside)
  })

  it('small chunks, other shapes and earlier stubs are left alone', () => {
    const small = { file: '/c/s1.js', text: 'module.exports=[1,()=>{}];' }
    const small2 = { ...small, file: '/c/s2.js' }
    expect(duplicateGroups([small, small2])).toEqual([])
    const other = (file: string) => ({ file, text: `exports.x=1;/*${'x'.repeat(MIN_BYTES)}*/` })
    expect(duplicateGroups([other('/c/o1.js'), other('/c/o2.js')])).toEqual([])
    const stub = (file: string) => ({ file, text: stubFor(file, '/c/_a.js') })
    expect(duplicateGroups([stub('/c/_b.js'), stub('/c/_c.js')])).toEqual([])
  })
})

describe('what a copy becomes', () => {
  it('a relative path Node resolves, from the same folder or a nested one', () => {
    expect(stubFor('/c/_b.js', '/c/_a.js')).toBe('module.exports=require("./_a.js");\n')
    expect(stubFor('/c/ssr/_b.js', '/c/_a.js')).toBe('module.exports=require("../_a.js");\n')
    expect(stubFor('/c/_b.js', '/c/ssr/_a.js')).toBe('module.exports=require("./ssr/_a.js");\n')
    expect(isStub(stubFor('/c/_b.js', '/c/_a.js'))).toBe(true)
    expect(isStub(body('1'))).toBe(false)
  })

  it('both places a build leaves chunks in are handled, each by itself', () => {
    const folders = chunkFolders('/repo/apps/cms')
    expect(folders).toEqual([
      '/repo/apps/cms/.next/server/chunks',
      '/repo/apps/cms/.next/standalone/apps/cms/.next/server/chunks',
    ])
  })
})

/**
 * The runtime's side of it, with real files and Node's own `require`: Turbopack loads a chunk
 * with `require(path)` and walks the list it gets back, installing each module only if that id
 * is not installed yet ([turbopack]_runtime.js, loadRuntimeChunkPath and
 * installCompressedModuleFactories, read 21 Nov 2026).
 */
describe('a redirected chunk, loaded the way the runtime loads it', () => {
  let dir = ''
  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true })
  })

  it('hands back the very list of modules the first copy holds', () => {
    dir = mkdtempSync(join(tmpdir(), 'one-copy-'))
    mkdirSync(join(dir, 'ssr'))
    const first = join(dir, '_a.js')
    const copy = join(dir, 'ssr', '_b.js')
    writeFileSync(first, 'module.exports=[101,function(){return "payload"},202,function(){}];')
    writeFileSync(copy, stubFor(copy, first))
    const load = createRequire(join(dir, 'runtime.js'))
    const fromFirst = load(first)
    const fromCopy = load(copy)
    expect(fromCopy).toBe(fromFirst)
    expect(fromCopy[0]).toBe(101)
    expect(fromCopy[1]()).toBe('payload')
    expect(readFileSync(copy, 'utf8').length).toBeLessThan(60)
  })
})

describe('where it runs', () => {
  it('the build script runs it straight after `next build`, so every build is de-duplicated', () => {
    const pkg = JSON.parse(readFileSync(join(import.meta.dirname, '..', 'package.json'), 'utf8'))
    expect(pkg.scripts.build).toBe(
      'NODE_ENV=production next build && node scripts/one-copy-of-each-chunk.mjs',
    )
  })
})
