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

/** The two halves of `--<name>: light-dark(<light>, <dark>)`. */
function pairToken(name: string): { light: string; dark: string } {
  const match = tokens.match(
    new RegExp(
      `--${name}:\\s*light-dark\\(\\s*(#[0-9a-fA-F]{3,8})\\s*,\\s*(#[0-9a-fA-F]{3,8})\\s*\\)`,
    ),
  )
  if (!match) throw new Error(`--${name} is no longer a light-dark() pair in tokens.css`)
  return { light: match[1]!.toLowerCase(), dark: match[2]!.toLowerCase() }
}

/**
 * A phone, as the status-area strip in notch.css defines one (VA-50). Read from notch.css, so
 * the tags and the strip cannot disagree about what a phone is.
 */
const notch = readFileSync(join(uiStyles, 'notch.css'), 'utf8')
const PHONE = notch.match(/@media (\([^{]*\)) \{\s*\.notch-strip \{/)?.[1] ?? 'missing'

/** Every theme-color tag, in document order: [media, content]. */
function themeColorTags(source: string): [string, string][] {
  return [...source.matchAll(/<meta name="theme-color" media="([^"]*)" content="([^"]*)"/g)].map(
    (m) => [m[1]!, m[2]!.toLowerCase()],
  )
}

describe('theme-color', () => {
  it('declares the phone colours first, then the page colours, one per scheme', () => {
    // The first tag whose media matches wins (the HTML standard; what Chrome implements),
    // and a phone matches both its own tag and the page's — so the phone tags come first.
    expect(PHONE).toBe('(width < 720px) and (hover: none)')
    expect(themeColorTags(html).map(([media]) => media)).toEqual([
      `(prefers-color-scheme: light) and ${PHONE}`,
      `(prefers-color-scheme: dark) and ${PHONE}`,
      '(prefers-color-scheme: light)',
      '(prefers-color-scheme: dark)',
    ])
  })

  it('matches the tokens: --bg for the page, the bar colour on phones', () => {
    const bg = pairToken('bg')
    const ink = tokens.match(/--ink:\s*(#[0-9a-fA-F]{3,8});/)?.[1]?.toLowerCase()
    // --notch-bg is light-dark(var(--ink), var(--raised)), as notch.css says.
    expect(notch).toMatch(/--notch-bg: light-dark\(var\(--ink\), var\(--raised\)\)/)
    expect(themeColorTags(html).map(([, content]) => content)).toEqual([
      ink,
      pairToken('raised').dark,
      bg.light,
      bg.dark,
    ])
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
    // TWO since 2026-10-08: this one, and the analytics beacon's loader (classic, so Vite keeps
    // it in the page; packages/shared/src/analyticsBeacon.ts), which gen-headers hashes as it
    // hashes this. The sync still belongs in the THEME script, never a third.
    const blocks = [...html.matchAll(/<script\s*>([\s\S]*?)<\/script\s*>/gi)].map((m) => m[1] ?? '')
    expect(blocks, 'a third inline script would add a third CSP hash').toHaveLength(2)
    const theme = blocks.filter((body) => !body.includes('static.cloudflareinsights.com'))
    expect(theme, 'exactly one inline script is the theme script').toHaveLength(1)
    expect(theme[0]).toContain('meta[name="theme-color"]')
    expect(html).toContain('meta[name="theme-color"]')
    // The script's own copies of the colours, light then dark, page then phone (VA-50) —
    // the same values as the tags, so an explicit choice paints what the OS would have.
    const [phoneLight, phoneDark, pageLight, pageDark] = themeColorTags(html).map(([, c]) => c)
    const picks = [...html.matchAll(/stored === 'light' \? '(#[0-9a-fA-F]+)' : '(#[0-9a-fA-F]+)'/g)]
    expect(picks.map((m) => [m[1]!.toLowerCase(), m[2]!.toLowerCase()])).toEqual([
      [pageLight, pageDark],
      [phoneLight, phoneDark],
    ])
    // It recolours and never rewrites `media`: the phone tags must keep matching phones only.
    expect(html).not.toMatch(/removeAttribute\('media'\)|setAttribute\('media'/)
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
