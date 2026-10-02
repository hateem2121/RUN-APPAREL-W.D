import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { parseAst } from 'vite'
import { describe, expect, it } from 'vitest'
// @ts-expect-error — plain .mjs beside the tested code, as sw.mjs is.
import {
  isModelViewerModule,
  MODEL_VIEWER_MODULES,
  quietModelViewer,
  stripConsoleLog,
} from './quietModelViewer.mjs'

/**
 * VA-10 (visual audit, 2026-10-02): `@google/model-viewer` prints its own debugging, and the
 * production build now overwrites those `console.log` calls in that package's modules only.
 * What can go wrong is quiet in every direction: a call left behind (the visitor's console is
 * noisy again), a call too many removed (the site's own diagnostics, or a warning the library
 * means), or the code changed so that a source map no longer fits. These are the cases that could
 * fool it, and then the installed library file itself. The BUILT chunk is checked in
 * `preload.test.ts`, which CI runs after a real build.
 */

const strip = (code: string) => stripConsoleLog(code) as { code: string; removed: number }
const parses = (code: string) => {
  parseAst(code, { lang: 'js' })
  return true
}

describe('stripConsoleLog', () => {
  it('overwrites a console.log statement and leaves every other console call alone', () => {
    const source = [
      'function f(x) {',
      "  console.log('a', x);",
      "  console.warn('real problem');",
      "  console.error('also real');",
      "  console.debug('d');",
      "  console.info('i');",
      '}',
    ].join('\n')
    const { code, removed } = strip(source)
    expect(removed).toBe(1)
    expect(code).not.toContain('console.log')
    expect(code).toContain("console.warn('real problem')")
    expect(code).toContain("console.error('also real')")
    expect(code).toContain("console.debug('d')")
    expect(code).toContain("console.info('i')")
    expect(parses(code)).toBe(true)
  })

  it('keeps every offset: same length, same lines, nothing after it moves', () => {
    // The shape of the real calls: a multi-line template literal with ${…} holes.
    const source = `const before = 1;
console.log(\`[$updateSource] called! \\nsrc: \${this.src}
  loaded: \${this.loaded}\`);
const after = 'x';`
    const { code } = strip(source)
    expect(code.length).toBe(source.length)
    expect(code.split('\n').length).toBe(source.split('\n').length)
    expect(code.indexOf("const after = 'x';")).toBe(source.indexOf("const after = 'x';"))
    expect(code.split('\n')[0]).toBe('const before = 1;')
    expect(parses(code)).toBe(true)
  })

  it('finds the right text after multi-byte characters (offsets are UTF-16, not bytes)', () => {
    const source = "// 日本語 ✓ café — naïve\nconsole.log('x');\nconst kept = 'console.warn';"
    const { code, removed } = strip(source)
    expect(removed).toBe(1)
    expect(code.length).toBe(source.length)
    expect(code).toContain("const kept = 'console.warn';")
    expect(code).toContain('// 日本語 ✓ café — naïve')
    expect(code).not.toContain('console.log')
  })

  it('stays valid where a call is the whole body of an if/else, an arrow or a sequence', () => {
    const source = [
      'if (a) console.log(1); else b();',
      'const g = () => console.log(2);',
      'ok && console.log(3);',
      'const s = (console.log(4), 5);',
    ].join('\n')
    const { code, removed } = strip(source)
    expect(removed).toBe(4)
    expect(parses(code)).toBe(true)
    expect(code).not.toContain('console.log')
    expect(code).toContain('else b();')
  })

  it('handles the optional forms and a call inside another call', () => {
    const source = 'console?.log(1);\nconsole.log?.(2);\nconsole.log(console.log(3));'
    const { code, removed } = strip(source)
    expect(removed).toBe(3)
    expect(parses(code)).toBe(true)
    expect(code).not.toContain('console')
  })

  it('does not touch the words inside a string, a comment, or another object', () => {
    const source = [
      "const s = 'console.log(1)';",
      '// console.log(2)',
      '/* console.log(3) */',
      'logger.log(4);',
      'window.console.log(5);',
      "console['log'](6);",
    ].join('\n')
    const { code, removed } = strip(source)
    expect(removed).toBe(0)
    expect(code).toBe(source)
  })

  it('skips the parse for a file that never says it', () => {
    const never = () => {
      throw new Error('parsed a file with no console.log in it')
    }
    expect(stripConsoleLog('const a = 1', never)).toEqual({ code: 'const a = 1', removed: 0 })
  })
})

describe('isModelViewerModule', () => {
  const pnpm =
    '/repo/node_modules/.pnpm/@google+model-viewer@4.3.1_three@0.183.2/node_modules/@google/model-viewer/lib/model-viewer-base.js'

  it('matches the package’s JavaScript in the pnpm and the flat layout, on any OS path style', () => {
    expect(isModelViewerModule(pnpm)).toBe(true)
    expect(isModelViewerModule('/repo/node_modules/@google/model-viewer/lib/features/ar.js')).toBe(
      true,
    )
    expect(
      isModelViewerModule('C:\\repo\\node_modules\\@google\\model-viewer\\lib\\features\\ar.js'),
    ).toBe(true)
    expect(isModelViewerModule(`${pnpm}?v=1`)).toBe(true)
  })

  it('does not match three.js, the site’s own code, a file that is not JavaScript, or a near miss', () => {
    expect(isModelViewerModule('/repo/node_modules/three/build/three.core.js')).toBe(false)
    expect(isModelViewerModule('/repo/apps/viewer/src/components/Stage.tsx')).toBe(false)
    expect(isModelViewerModule('/repo/apps/viewer/src/model-viewer-notes.js')).toBe(false)
    expect(isModelViewerModule(pnpm.replace(/\.js$/, '.d.ts'))).toBe(false)
    expect(isModelViewerModule(pnpm.replace(/\.js$/, '.js.map'))).toBe(false)
    expect(isModelViewerModule('/repo/node_modules/@google/model-viewer-extras/index.js')).toBe(
      false,
    )
    expect(MODEL_VIEWER_MODULES.test('/repo/node_modules/@google/other/lib/x.js')).toBe(false)
  })
})

describe('the plugin', () => {
  const plugin = quietModelViewer() as {
    apply: string
    transform: {
      filter: { id: RegExp }
      handler: (code: string, id: string) => { code: string; map: null } | null
    }
  }
  const id = '/repo/node_modules/@google/model-viewer/lib/x.js'

  it('is a build-only transform with a filter, and says its map is unchanged', () => {
    expect(plugin.apply).toBe('build')
    expect(plugin.transform.filter.id).toBe(MODEL_VIEWER_MODULES)
    const result = plugin.transform.handler("console.log('a');", id)
    expect(result?.map).toBeNull()
    expect(result?.code).not.toContain('console.log')
  })

  it('returns nothing for a file it has nothing to do with', () => {
    expect(plugin.transform.handler("console.log('a');", '/repo/apps/viewer/src/x.ts')).toBeNull()
    expect(plugin.transform.handler('const a = 1;', id)).toBeNull()
  })
})

describe('the installed library (a negative control against the real thing)', () => {
  const require = createRequire(import.meta.url)
  const root = dirname(require.resolve('@google/model-viewer/package.json'))
  const base = readFileSync(join(root, 'lib', 'model-viewer-base.js'), 'utf8')
  const count = (text: string, pattern: RegExp) => (text.match(pattern) ?? []).length

  it('still prints what the audit saw — if this fails, the plugin has nothing left to do', () => {
    expect(
      base,
      'model-viewer no longer prints "[$updateSource] BAILING OUT EARLY!" — delete ' +
        'scripts/quietModelViewer.mjs and its line in vite.config.ts',
    ).toContain('BAILING OUT EARLY')
  })

  it('has every console.log removed, its warnings kept, and its shape unchanged', () => {
    const { code, removed } = strip(base)
    expect(removed).toBeGreaterThanOrEqual(4)
    expect(code).not.toContain('BAILING OUT EARLY')
    expect(code).not.toContain('[$updateSource] called!')
    expect(code).not.toMatch(/console\.log\s*\(/)
    // The library's real reports survive, one for one.
    expect(count(code, /console\.warn\(/g)).toBe(count(base, /console\.warn\(/g))
    expect(count(code, /console\.error\(/g)).toBe(count(base, /console\.error\(/g))
    expect(code.length).toBe(base.length)
    expect(code.split('\n').length).toBe(base.split('\n').length)
    expect(parses(code)).toBe(true)
  })
})
