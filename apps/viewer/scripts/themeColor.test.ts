import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Pins the mobile browser chrome to the design tokens.
 *
 * N6, 2026-08-18. No `theme-color` existed anywhere in the viewer, so the strip
 * around a phone's clock and battery stayed a default grey while this page ships a
 * light/dark toggle and sets `color-scheme` in six places.
 *
 * WHY THIS TEST EXISTS AT ALL. `<meta>` cannot read a CSS custom property, so the
 * two colours are necessarily DUPLICATED out of `packages/ui/src/tokens.css`. A
 * duplicate with nothing watching it is the drift this repo has paid for twice
 * (docs/DESIGN.md is written FROM the tokens for exactly this reason). This
 * asserts the two copies against each other, so changing `--bg` without changing
 * the tags fails here rather than shipping a mismatched browser bar.
 *
 * Asserted against the SOURCE index.html, following og.test.ts: the tags are
 * authored there and a build cannot change them.
 */
const viewerRoot = join(import.meta.dirname, '..')
// tokens.css and base.css moved to packages/ui on 2026-09-04 so apps/cms renders
// from the same design system. This file is under apps/viewer/scripts/.
const uiStyles = join(viewerRoot, '..', '..', 'packages', 'ui', 'src')
const html = readFileSync(join(viewerRoot, 'index.html'), 'utf8')
const tokens = readFileSync(join(uiStyles, 'tokens.css'), 'utf8')

/** The two halves of `--bg: light-dark(<light>, <dark>)`. */
function backgroundTokens(): { light: string; dark: string } {
  const match = tokens.match(
    /--bg:\s*light-dark\(\s*(#[0-9a-fA-F]{3,8})\s*,\s*(#[0-9a-fA-F]{3,8})\s*\)/,
  )
  if (!match) throw new Error('--bg is no longer a light-dark() pair in tokens.css')
  return { light: match[1]!.toLowerCase(), dark: match[2]!.toLowerCase() }
}

describe('theme-color', () => {
  it('declares one tag per colour scheme', () => {
    expect(html).toMatch(/<meta name="theme-color" media="\(prefers-color-scheme: light\)"/)
    expect(html).toMatch(/<meta name="theme-color" media="\(prefers-color-scheme: dark\)"/)
  })

  it('matches --bg in tokens.css, which is the source of truth', () => {
    const { light, dark } = backgroundTokens()
    const tags = [
      ...html.matchAll(
        /<meta name="theme-color" media="\(prefers-color-scheme: (light|dark)\)" content="(#[0-9a-fA-F]{3,8})"/g,
      ),
    ]
    expect(tags, 'expected exactly two theme-color tags').toHaveLength(2)

    const byScheme = Object.fromEntries(tags.map((m) => [m[1]!, m[2]!.toLowerCase()]))
    expect(byScheme.light, 'light theme-color has drifted from --bg').toBe(light)
    expect(byScheme.dark, 'dark theme-color has drifted from --bg').toBe(dark)
  })

  it('keeps the explicit toggle in step, inside the EXISTING inline script', () => {
    // The media attribute follows the OS preference and cannot see `data-theme`.
    // The sync must live in the one inline script that already exists: the CSP is
    // hash-based with no unsafe-inline for scripts, so a second <script> block is
    // a second hash for gen-headers to carry.
    // A bare `<script>` is an inline block; every other script tag here carries
    // attributes (`type="module" src=...`), so counting the literal is exact.
    // `<script` + optional whitespace + `>` — an inline block carries no attributes,
    // so the attributed tags (type="module" src=...) still do not match. Case-
    // insensitive and whitespace-tolerant because `<SCRIPT>` and `<script >` are the
    // same tag to a browser and were invisible to the old literal, which means a
    // second inline block could have been added without this count moving
    // (CodeQL js/bad-tag-filter).
    const inlineScripts = [...html.matchAll(/<script\s*>/gi)]
    expect(inlineScripts, 'a second inline script would add a second CSP hash').toHaveLength(1)
    expect(html).toContain('meta[name="theme-color"]')
  })
})

describe('tap highlight', () => {
  it('is set deliberately rather than inherited', () => {
    // N7. The platform default is an opaque grey flash on every tap, on a product
    // whose primary device is a phone reached by scanning a QR tag.
    const base = readFileSync(join(uiStyles, 'base.css'), 'utf8')
    expect(base).toMatch(/-webkit-tap-highlight-color:\s*\S+/)
  })
})
