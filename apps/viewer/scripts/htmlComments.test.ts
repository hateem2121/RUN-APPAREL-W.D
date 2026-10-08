import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { stripHtmlComments } from './htmlComments.mjs'

/**
 * The built `index.html` carries no developer notes (2026-10-08; `htmlComments.mjs` has why).
 */
describe('stripHtmlComments', () => {
  it('removes every comment, single- and multi-line, and keeps everything else', () => {
    const html =
      '<head><!-- why --><title>T</title>\n<!--\n  long\n  note\n--><meta name="a"></head>'
    expect(stripHtmlComments(html)).toBe('<head><title>T</title>\n<meta name="a"></head>')
  })

  it('leaves no comment that one pass would have joined back together', () => {
    // Removing the inner comment joins "<!-" and "- x -->" into a fresh comment; one replace
    // would leave it behind, which is the case `stripUntilStable` exists for.
    expect(stripHtmlComments('a<!-<!-- inner -->- x -->b')).toBe('ab')
  })

  it('does not touch an inline script', () => {
    const script = '<script type="module">if(a){b()}</script>'
    expect(stripHtmlComments(`<!-- note -->${script}`)).toBe(script)
  })
})

const BUILT = join(import.meta.dirname, '..', 'dist', 'index.html')

describe.skipIf(!existsSync(BUILT))('the built index.html', () => {
  it('carries no developer note, and still carries both inline scripts', () => {
    const html = readFileSync(BUILT, 'utf8')
    expect(html).not.toContain('<!--')
    expect(html).toContain('theme-color')
    expect(html).toContain('static.cloudflareinsights.com/beacon.min.js?token=')
  })
})
