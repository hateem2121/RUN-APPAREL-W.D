import { Script } from 'node:vm'
import { describe, expect, it } from 'vitest'
// @ts-expect-error — plain .mjs beside the tested code, as csp.mjs is.
import {
  CACHE_PREFIX,
  serviceWorkerSource,
  serviceWorkerVersion,
  shellFromBundle,
  swSourceHasNoBacktick,
  UNHASHED_SHELL,
} from './sw.mjs'

/**
 * A bundle shaped like the real one: an entry that statically imports react and the
 * rolldown runtime, and DYNAMICALLY imports model-viewer. The dynamic edge is the
 * whole point of the fixture — see the `.glb` and model-viewer assertions below.
 */
function bundle() {
  return {
    'assets/index-AAAA.js': {
      type: 'chunk',
      isEntry: true,
      fileName: 'assets/index-AAAA.js',
      imports: ['assets/react-BBBB.js', 'assets/rolldown-runtime-CCCC.js'],
      dynamicImports: ['assets/model-viewer-DDDD.js'],
      viteMetadata: { importedCss: new Set(['assets/index-EEEE.css']) },
    },
    'assets/react-BBBB.js': {
      type: 'chunk',
      fileName: 'assets/react-BBBB.js',
      imports: ['assets/rolldown-runtime-CCCC.js'],
    },
    'assets/rolldown-runtime-CCCC.js': {
      type: 'chunk',
      fileName: 'assets/rolldown-runtime-CCCC.js',
      imports: [],
    },
    'assets/model-viewer-DDDD.js': {
      type: 'chunk',
      fileName: 'assets/model-viewer-DDDD.js',
      imports: [],
    },
    'assets/archivo-FFFF.woff2': { type: 'asset', fileName: 'assets/archivo-FFFF.woff2' },
  }
}

describe('shellFromBundle', () => {
  it('walks the entry chunk and takes its stylesheet', () => {
    const shell = shellFromBundle(bundle())
    expect(shell).toContain('/assets/index-AAAA.js')
    expect(shell).toContain('/assets/react-BBBB.js')
    expect(shell).toContain('/assets/rolldown-runtime-CCCC.js')
    expect(shell).toContain('/assets/index-EEEE.css')
  })

  it('caches "/" and not "/index.html"', () => {
    // A navigation requests `/`. Storing the literal `/index.html` would cache a
    // document no navigation ever asks for by that name, so the offline fallback
    // would miss while looking successful.
    const shell = shellFromBundle(bundle())
    expect(shell).toContain('/')
    expect(shell).not.toContain('/index.html')
  })

  it('carries the two immutable runtime files the decision record names', () => {
    const shell = shellFromBundle(bundle())
    for (const path of UNHASHED_SHELL) expect(shell).toContain(path)
  })

  /**
   * ⚠️ THE ASSERTION THIS MODULE EXISTS TO EARN.
   *
   * `docs/DECISION-OFFLINE-SCOPE.md` is a recorded owner decision that the 53.69 MB
   * of garments are NOT precached, for four measured reasons. Without this, a later
   * "let's make it work offline properly" reaches a trade-show phone as 53.69 MB of
   * background download, and nothing else in the repo would notice.
   */
  it('NEVER includes a garment, and never the 1.0 MB renderer', () => {
    const shell = shellFromBundle(bundle())
    expect(shell.filter((path) => path.endsWith('.glb'))).toEqual([])
    expect(
      shell.filter((path) => path.includes('model-viewer')),
      'model-viewer is a DYNAMIC import so a visitor who never renders 3D never pays for it',
    ).toEqual([])
  })

  it('does not follow dynamic imports even when they are reachable statically too', () => {
    // NEGATIVE CONTROL on the traversal itself: make the same chunk a STATIC import
    // and it must now appear. Without this, `shellFromBundle` returning a fixed list
    // would pass the assertion above while measuring nothing.
    const withStatic = bundle()
    withStatic['assets/index-AAAA.js'].imports.push('assets/model-viewer-DDDD.js')
    expect(shellFromBundle(withStatic)).toContain('/assets/model-viewer-DDDD.js')
  })

  it('refuses a bundle with no entry rather than emitting an empty shell', () => {
    expect(() => shellFromBundle({})).toThrow(/no entry chunk/)
  })
})

describe('serviceWorkerVersion', () => {
  it('changes when a hashed filename changes', () => {
    const a = serviceWorkerVersion(['/assets/index-AAAA.js'])
    const b = serviceWorkerVersion(['/assets/index-ZZZZ.js'])
    expect(a).not.toBe(b)
  })

  /**
   * ⚠️ The reason the version hashes CONTENT and not just names.
   *
   * `/meshopt_decoder.js` and `/env/studio-soft.hdr` are immutable but NOT
   * content-hashed — `dist/_headers` says so in its own comment. If the version
   * ignored their bytes, a decoder bump would leave the service worker
   * byte-identical, so the browser would never re-install it and the stale decoder
   * would be served from cache forever. A cache that cannot be invalidated is worse
   * than no cache.
   */
  it('changes when an UNHASHED file changes, with the same filename', () => {
    const shell = ['/meshopt_decoder.js']
    const before = serviceWorkerVersion(shell, { '/meshopt_decoder.js': 'v1' })
    const after = serviceWorkerVersion(shell, { '/meshopt_decoder.js': 'v2' })
    expect(after, 'a decoder bump must invalidate the cache').not.toBe(before)
  })

  it('is stable for identical input, so an unchanged build does not churn the cache', () => {
    const shell = ['/assets/index-AAAA.js', '/meshopt_decoder.js']
    const contents = { '/meshopt_decoder.js': 'same' }
    expect(serviceWorkerVersion(shell, contents)).toBe(serviceWorkerVersion(shell, contents))
    // Order must not matter — the caller sorts, but the hash must not depend on it.
    expect(serviceWorkerVersion([...shell].reverse(), contents)).toBe(
      serviceWorkerVersion(shell, contents),
    )
  })
})

describe('serviceWorkerSource', () => {
  const source = () =>
    serviceWorkerSource({ shell: shellFromBundle(bundle()), version: 'abc123' }) as string

  it('contains no backtick', () => {
    // It is emitted from a template literal in sw.mjs, so one backtick inside would
    // end that literal early — and the resulting error names something else
    // entirely. Recorded against review-server.ts in the pipeline's CLAUDE.md.
    expect(swSourceHasNoBacktick(source())).toBe(true)
  })

  /**
   * ⚠️ NETWORK-FIRST FOR NAVIGATIONS, asserted rather than reviewed.
   *
   * Reason 4 of docs/DECISION-OFFLINE-SCOPE.md: `shouldReturnNotFound()` and the
   * `no-transform` handling live in the Cloudflare Worker. Serving a navigation from
   * cache returns 200 without reaching the edge, silently regressing the 404
   * semantics for humans while crawlers stay correct — the hardest kind of bug to
   * see. A cache-first navigation would be measurably faster and wrong.
   */
  it('answers navigations from the network first, with cache only as a fallback', () => {
    const text = source()
    const navigation = text.slice(text.indexOf("request.mode === 'navigate'"))
    const fetchAt = navigation.indexOf('fetch(request)')
    const cacheAt = navigation.indexOf('caches.match')
    expect(fetchAt, 'the navigation branch must call fetch').toBeGreaterThanOrEqual(0)
    expect(cacheAt, 'the navigation branch must have a cache fallback').toBeGreaterThan(fetchAt)
    expect(navigation).toContain('.catch(')
  })

  it('ignores cross-origin requests, which is where every garment and payload lives', () => {
    expect(source()).toContain('url.origin !== self.location.origin')
  })

  it('refuses a .glb even same-origin', () => {
    expect(source()).toContain(".endsWith('.glb')")
  })

  it('only handles GET', () => {
    expect(source()).toContain("request.method !== 'GET'")
  })

  it('deletes its own older caches and no one else’s', () => {
    const text = source()
    expect(text).toContain(`key.startsWith(${JSON.stringify(CACHE_PREFIX)})`)
    expect(text).toContain('key !== CACHE')
  })

  it('stores only complete same-origin 200s', () => {
    // A cached opaque or 206 response is replayed forever as a broken asset.
    const text = source()
    expect(text).toContain('response.ok')
    expect(text).toContain("response.type === 'basic'")
  })

  it('bakes the version in, so a changed shell re-installs the worker', () => {
    const a = serviceWorkerSource({ shell: ['/'], version: 'aaa' }) as string
    const b = serviceWorkerSource({ shell: ['/'], version: 'bbb' }) as string
    expect(a).not.toBe(b)
  })

  it('is valid JavaScript', () => {
    // Cheapest possible guard against the backtick class of defect and against a
    // stray interpolation: compile it. `new vm.Script` parses without running —
    // deliberately not `new Function`, which is the same check through an
    // eval-shaped API that static analysis is right to flag.
    expect(() => new Script(source())).not.toThrow()
  })
})
