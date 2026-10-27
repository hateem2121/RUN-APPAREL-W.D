import { readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DYNAMIC_SEGMENT_PARENTS } from '../tapStore.mjs'

/**
 * Two facts the tap store (tapStore.mjs) rests on, read from the route folders themselves.
 *
 * 1. NO INTERCEPTING ROUTES. Next.js deletes `next-url` from a request before drawing it on any
 *    route that cannot be intercepted ("it won't affect the response", base-server.js
 *    setVaryHeader, 16.4.3), so tapDrawRequest leaves it out and one copy serves every start page.
 *    An intercepting folder — `(.)x`, `(..)x`, `(...)x` — makes the answer depend on the start
 *    page. Add one and the store must key on `next-url` again: see the faster-taps spec, "Facts".
 * 2. THE DYNAMIC ROUTES stateTreeFor refuses. It builds a static segment for every path part; a
 *    `[slug]` folder is sent as a different shape, so its parent must be on the list.
 */
const APP = join(import.meta.dirname, 'app')

function folders(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((entry) => [join(dir, entry.name), ...folders(join(dir, entry.name))])
}

describe('route folders the tap store depends on', () => {
  const all = folders(APP).map((path) => relative(APP, path))

  it('has no intercepting route (the store would have to key on the start page)', () => {
    const intercepting = all.filter((path) =>
      path.split('/').some((part) => /^\(\.{1,3}\)/.test(part)),
    )
    expect(intercepting, 'see the faster-taps spec, "Facts": an intercepting route').toEqual([])
  })

  it('lists every website folder that holds a dynamic segment', () => {
    const parents = all
      .filter((path) => path.startsWith('(frontend)/') && /\/\[[^\]]+\]$/.test(path))
      .map((path) => path.split('/').at(-2))
      .sort()
    expect(parents).toEqual([...DYNAMIC_SEGMENT_PARENTS].sort())
  })
})
