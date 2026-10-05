import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * `public/_headers` (polish audit X12, 2026-10-04): how long a browser may keep the website's
 * static files. Workers Static Assets applies it before the Worker runs, so nothing in Next
 * can see or test it at runtime — this test reads the file itself.
 *
 * The failure it exists to catch is the measured one: every static file shipped as
 * `max-age=0, must-revalidate`, a returning visitor re-asked the server about the font, the
 * answer came back after the `font-display: optional` window, and Chrome drew Arial instead.
 */
const PUBLIC = join(__dirname, '..', 'public')
const FILE = join(PUBLIC, '_headers')

/** `_headers` as `{ path, headers }` rules: a path line, then indented `Name: value` lines. */
function parseHeadersFile(text: string): { path: string; headers: Record<string, string> }[] {
  const rules: { path: string; headers: Record<string, string> }[] = []
  for (const raw of text.split('\n')) {
    if (raw.trim() === '' || raw.trimStart().startsWith('#')) continue
    if (!/^\s/.test(raw)) {
      rules.push({ path: raw.trim(), headers: {} })
      continue
    }
    const rule = rules.at(-1)
    const colon = raw.indexOf(':')
    if (!rule || colon === -1) throw new Error(`a header line with no rule above it: ${raw}`)
    rule.headers[raw.slice(0, colon).trim().toLowerCase()] = raw.slice(colon + 1).trim()
  }
  return rules
}

const rules = parseHeadersFile(readFileSync(FILE, 'utf8'))

describe('public/_headers', () => {
  it('lets browsers keep the content-hashed build output for a year', () => {
    const next = rules.find((rule) => rule.path === '/_next/static/*')
    expect(next?.headers['cache-control']).toBe('public, max-age=31536000, immutable')
  })

  it('has no catch-all rule, which would be COMBINED with every other rule', () => {
    // Matching rules are joined with a comma, so a `/*` Cache-Control would ship two
    // contradictory values on every file (.claude/rules/viewer-headers.md).
    expect(rules.map((rule) => rule.path)).not.toContain('/*')
  })

  it('never makes a page cacheable: only static folders are listed', () => {
    for (const rule of rules) {
      expect(rule.path, `${rule.path} is not a folder rule`).toMatch(/^\/[a-z_]+\/(?:static\/)?\*$/)
    }
  })

  it('names only folders that exist, so a renamed folder fails here instead of going stale', () => {
    for (const rule of rules) {
      if (rule.path === '/_next/static/*') continue
      const folder = rule.path.slice(1, -2)
      expect(existsSync(join(PUBLIC, folder)), `public/${folder}/ is missing`).toBe(true)
    }
  })

  it('reads a planted catch-all as a catch-all (negative control for the parser)', () => {
    const planted = parseHeadersFile('/*\n  Cache-Control: no-store\n/a/*\n  X: y\n')
    expect(planted.map((rule) => rule.path)).toEqual(['/*', '/a/*'])
    expect(planted[0]?.headers['cache-control']).toBe('no-store')
  })
})
