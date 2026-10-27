import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * The website draws every page and every tap without reading the visitor's request (review of
 * 27 Oct). The shared stores (worker.mjs, tapStore.mjs) keep ONE copy of a page and of its tap data
 * for every visitor, keyed on the address and the router headers only. If a page read a request
 * header on the server, the copy drawn for one visitor would be served to the next: the colour-scheme
 * hint (`Sec-CH-Prefers-Color-Scheme`, which the site's Vary names) would hand a dark page to a light
 * screen. The browser test for dark mode (e2e/intentPrefetch.spec.ts) runs on `next start`, with no
 * store and no clean drawing, so it cannot fail that way; this holds the rule in the source instead.
 *
 * Route handlers (`route.ts`, the form posts) are left out: they answer one visitor and are never
 * kept.
 */
const SRC = import.meta.dirname
const WEBSITE = [
  join(SRC, 'app', '(frontend)'),
  join(SRC, 'app', 'not-found.tsx'),
  join(SRC, 'components', 'site'),
  join(SRC, 'lib'),
]

/** What a drawing must never do: read the request through Next, or name the colour-scheme hint. */
function readsTheRequest(source: string): string | null {
  if (/from\s+['"]next\/headers['"]|require\(\s*['"]next\/headers['"]\s*\)/.test(source))
    return "imports 'next/headers'"
  if (/sec-ch-prefers-color-scheme/i.test(source)) return 'names the colour-scheme hint'
  return null
}

function sources(path: string): string[] {
  if (statSync(path).isFile()) return [path]
  return readdirSync(path).flatMap((name) => sources(join(path, name)))
}

describe('the website reads nothing of the visitor’s request while drawing', () => {
  it('no page, component or library under the website imports next/headers or names the hint', () => {
    const files = WEBSITE.flatMap(sources).filter(
      (file) =>
        /\.(tsx?|mjs)$/.test(file) && !/\.test\.tsx?$/.test(file) && !/route\.ts$/.test(file),
    )
    expect(files.length, 'the website source was not found').toBeGreaterThan(50)
    const found = files.flatMap((file) => {
      const why = readsTheRequest(readFileSync(file, 'utf8'))
      return why ? [`${relative(SRC, file)}: ${why}`] : []
    })
    expect(found).toEqual([])
  })

  // Negative control: the check finds each way a drawing could start depending on the visitor.
  it.each([
    ["import { headers } from 'next/headers'", "imports 'next/headers'"],
    ['import { cookies } from "next/headers"', "imports 'next/headers'"],
    ["const h = require('next/headers')", "imports 'next/headers'"],
    ["(await headers()).get('Sec-CH-Prefers-Color-Scheme')", 'names the colour-scheme hint'],
  ])('finds %s', (source, why) => {
    expect(readsTheRequest(source)).toBe(why)
  })

  it('leaves the browser’s own colour query alone', () => {
    expect(readsTheRequest("matchMedia('(prefers-color-scheme: dark)')")).toBeNull()
  })
})
